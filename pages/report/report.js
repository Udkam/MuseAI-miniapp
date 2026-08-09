const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const tourSession = require('../../utils/tour-session')
const eventFlush = require('../../utils/event-flush')

const THEME_TITLES = {
  general: '半坡游览报告',
  archaeology: '半坡考古研究报告',
  field_study: '半坡研学记录报告',
  history_inquiry: '半坡历史追问报告',
  artifact_study: '半坡器物观察报告',
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function formatDuration(value) {
  if (value === null || value === undefined || value === '') return '-'
  var n = Number(value)
  if (!isFinite(n)) return '-'
  return Math.max(0, Math.round(n)) + ' 分钟'
}

function unique(list) {
  var seen = {}
  var out = []
  ;(list || []).forEach(function (item) {
    var value = cleanText(item)
    if (!value || seen[value]) return
    seen[value] = true
    out.push(value)
  })
  return out
}

function normalizeBackendRecordNotes(data) {
  var summary = cleanText(data && data.record_summary)
  if (summary) {
    return [{ question: '记录摘要', point: summary }]
  }

  return (Array.isArray(data && data.record_notes) ? data.record_notes : [])
    .map(function (item) {
      return {
        question: cleanText(item && item.question) || '记录摘要',
        point: cleanText(item && item.point),
      }
    })
    .filter(function (item) {
      return !!item.point
    })
    .slice(0, 1)
}

function buildStats(data) {
  var hallCount = unique(data.halls_visited || []).length
  var serverExhibits = Number(data.total_exhibits_viewed || 0)
  var localExhibits = tourStore.getVisitedExhibitCount ? tourStore.getVisitedExhibitCount() : 0
  var exhibitCount = Math.max(
    isFinite(serverExhibits) ? serverExhibits : 0,
    isFinite(localExhibits) ? localExhibits : 0
  )
  return {
    halls:    String(hallCount || 0),
    exhibits: String(exhibitCount || 0),
    messages: data.total_questions != null ? String(data.total_questions) : '0',
    duration: formatDuration(data.total_duration_minutes),
  }
}

var LOW_VALUE_GUIDANCE_PATTERN = /有效互动较少|暂时不生成|无法生成|暂无(?:足够)?(?:互动|信息|内容)|信息不足|测试数据|真实数据|数据接入|后续上线|接口|后端|前端/i

function meaningfulGuidanceText(value) {
  var text = cleanText(value)
  if (!text || LOW_VALUE_GUIDANCE_PATTERN.test(text)) return ''
  return text
}

var GUIDANCE_MAX_LENGTH = 30

function finishGuidanceText(value) {
  var text = cleanText(value).replace(/[，,：:、；;\s]+$/, '')
  if (!text) return ''
  if (/[。！？!?]$/.test(text)) return text
  return text.length < GUIDANCE_MAX_LENGTH ? text + '。' : text
}

// Keep one complete, concrete action. Old multi-card prose is rejected instead
// of being clipped into a vague fragment such as "围绕这个问题".
function compactGuidanceSuggestion(value) {
  var text = meaningfulGuidanceText(value)
  if (!text) return ''
  if (text.length <= GUIDANCE_MAX_LENGTH) return finishGuidanceText(text)
  return ''
}

function buildGuidanceFallback(data) {
  var payload = data || {}
  var questionCount = Math.max(0, Number(payload.total_questions || 0))
  var exhibitCount = Math.max(0, Number(payload.total_exhibits_viewed || 0))
  var suggestion = ''
  if (exhibitCount === 0) {
    suggestion = '先选一件展品，观察材质、纹样或使用痕迹。'
  } else if (questionCount === 0) {
    suggestion = '回到最感兴趣的展品前，从一个可见细节开始提问。'
  } else {
    suggestion = '把最感兴趣的一次回答与展品细节对照核实。'
  }
  return { title: '下一步怎么看', suggestion: suggestion }
}

function normalizeExplorationGuidance(data) {
  var payload = data || {}
  var raw = payload.exploration_guidance
  if (!raw || typeof raw !== 'object') return buildGuidanceFallback(payload)

  var candidates = [raw.next_step || raw.nextStep]
  ;(Array.isArray(raw.actions) ? raw.actions : []).slice(0, 3).forEach(function (action) {
    if (!action || typeof action !== 'object') return
    candidates.push(action.description || action.summary)
    candidates.push(action.question)
  })
  candidates.push(raw.summary)
  for (var i = 0; i < candidates.length; i++) {
    var suggestion = compactGuidanceSuggestion(candidates[i])
    if (suggestion) return { title: '下一步怎么看', suggestion: suggestion }
  }
  return buildGuidanceFallback(payload)
}

function buildHighlights(data) {
  return Array.isArray(data && data.highlights)
    ? data.highlights
      .map(cleanText)
      .filter(function (item) {
        return item && !/到访\s*\d*\s*个?展厅|展厅到访/.test(item)
      })
      .slice(0, 4)
    : []
}

Page({
  data: {
    isLoading: true,
    isReady: false,
    loadError: false,

    persona: '',
    reportTitle: '',
    reportTheme: '',

    stats: {
      halls: '0',
      exhibits: '0',
      messages: '0',
      duration: '-',
    },

    explorationGuidance: null,
    dataNotice: '',
    highlights: [],
    recordNotes: [],
  },

  _reportTimer: null,

  onLoad: function () {
    tourStore.markCurrentPage('pages/report/report')
    tourStore.summarizeStoredHallRecords()
    preload.preloadPages(['/pages/home/home', '/pages/hall/hall'], 120)
    var liveDuration = tourStore.getLiveDurationMinutes ? tourStore.getLiveDurationMinutes() : null
    var loadingStats = Object.assign({}, this.data.stats, {
      duration: formatDuration(liveDuration),
    })
    this.setData({
      persona: tourStore.getPersonaLabel() || '',
      reportTitle: tourStore.getReportThemeTitle() || '半坡游览报告',
      isLoading: true,
      isReady: false,
      loadError: false,
      dataNotice: '',
      stats: loadingStats,
    })

    var self = this
    this._reportTimer = setTimeout(function () {
      self._reportTimer = null
      self._prepareAndGenerate()
    }, 80)
  },

  _prepareAndGenerate: function () {
    var self = this
    return tourSession.ensureTourSession()
      .then(function (ready) {
        if (!ready || !ready.ok || !ready.sessionId) {
          self._applyUnavailable('尚未建立导览会话，无法生成服务器报告。', false)
          return null
        }
        return tourSync.queueSessionSnapshot({ status: 'touring' }, { maxAttempts: 3 })
      })
      .then(function (synced) {
        if (synced === null) return null
        if (!synced || !synced.ok) {
          self._applyUnavailable('游览状态同步失败，请检查网络后重试。', true)
          return null
        }
        var latest = tourStore.getTourState()
        if (!latest.sessionId || !latest.sessionToken) {
          self._applyUnavailable('尚未建立导览会话，无法生成服务器报告。', false)
          return null
        }
        return self._flushThenGenerate(latest.sessionId, latest.sessionToken)
      })
      .catch(function (err) {
        console.warn('[report] session preparation failed:', err)
        self._applyUnavailable('游览状态同步失败，请检查网络后重试。', true)
        return null
      })
  },

  onUnload: function () {
    if (this._reportTimer) {
      clearTimeout(this._reportTimer)
      this._reportTimer = null
    }
  },

  _flushThenGenerate: function (id, token) {
    var self = this

    function generate(notice) {
      wx.showLoading({ title: '正在整理报告…', mask: true })
      return api.tourApi.generateReport(id, token)
        .then(function (genRes) {
          if (genRes && genRes.ok && genRes.data) return genRes
          return api.tourApi.getReport(id, token)
        })
        .then(function (res) {
          wx.hideLoading()
          if (res && res.ok && res.data) {
            self._applyReport(res.data, notice || '')
            return
          }
          self._applyUnavailable('服务器报告暂不可用，请稍后重试。', true)
        })
        .catch(function (err) {
          wx.hideLoading()
          console.error('[report] generate/get error:', err)
          self._applyUnavailable('服务器报告暂不可用，请稍后重试。', true)
        })
    }

    return eventFlush.flushPendingEvents({ sessionId: id, token: token })
      .then(function (result) {
        if (result.ok) {
          return generate('').then(function () { return result })
        }
        console.warn('[report] event batches not fully flushed:', result.status || result.reason)
        self._applyUnavailable('游览记录上传失败，请检查网络后重试。', true)
        return result
      })
      .catch(function (err) {
        console.warn('[report] event batch flush failed:', err)
        self._applyUnavailable('游览记录上传失败，请检查网络后重试。', true)
        return { ok: false, error: err }
      })
  },

  _mapReportData: function (data, notice) {
    var payload = data || {}
    var title = tourStore.getReportThemeTitle()
      || THEME_TITLES[payload.report_theme]
      || '半坡游览报告'

    return {
      isLoading: false,
      isReady: true,
      loadError: false,
      reportTheme: payload.report_theme || '',
      reportTitle: title,
      persona: tourStore.getPersonaLabel() || this.data.persona || '',
      stats: buildStats(payload),
      explorationGuidance: normalizeExplorationGuidance(payload),
      dataNotice: notice || '',
      highlights: buildHighlights(payload),
      recordNotes: normalizeBackendRecordNotes(payload),
    }
  },

  _applyReport: function (data, notice) {
    this.setData(this._mapReportData(data, notice))
  },

  _applyUnavailable: function (message, showToast) {
    if (showToast) {
      wx.showToast({ title: message, icon: 'none', duration: 3000 })
    }
    this.setData({
      isLoading: false,
      isReady: true,
      loadError: true,
      dataNotice: message,
      stats: {
        halls: '0',
        exhibits: '0',
        messages: '0',
        duration: '-',
      },
      explorationGuidance: null,
      highlights: [],
      recordNotes: [],
    })
  },

  goHome: function () {
    // Returning home is navigation, not an implicit "end tour" action. Keep
    // the guest session and full local snapshot so the visitor can resume the
    // same report later and receive the newer backend-authoritative duration.
    wx.reLaunch({ url: '/pages/home/home' })
  },

  continueExploring: function () {
    wx.redirectTo({ url: '/pages/hall/hall' })
  },

})
