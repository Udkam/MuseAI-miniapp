const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const tourSession = require('../../utils/tour-session')
const hallData = require('../../utils/hall-data')
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

function hallDisplay(slug) {
  return slug ? banpoHalls.getHallDisplayName(slug) : ''
}

function buildVisitedHallCards(halls, hallNameMap) {
  var names = hallNameMap || {}
  return unique(halls || []).map(function (slug) {
    var normalized = banpoHalls.normalizeHallToSlug(slug)
    return {
      name: names[normalized] || hallDisplay(normalized) || slug,
      note: '',
    }
  }).filter(function (item) {
    return !!item.name
  })
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

function normalizeReflection(reflection) {
  if (!reflection || typeof reflection !== 'object') return null
  var initial = cleanText(reflection.initial_assumption)
  var observed = cleanText(reflection.observed_focus)
  var changed = cleanText(reflection.change_summary)
  if (!initial && !observed && !changed) return null
  return {
    initial_assumption: initial,
    observed_focus: observed,
    change_summary: changed,
  }
}

function buildHighlights(data) {
  return Array.isArray(data && data.highlights)
    ? data.highlights.map(cleanText).filter(Boolean).slice(0, 4)
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

    visitedHallCards: [],
    reflection: null,
    dataNotice: '',
    highlights: [],
    recordNotes: [],
  },

  _reportTimer: null,
  _hallNameMap: null,
  _lastVisitedHallSlugs: null,

  onLoad: function () {
    tourStore.markCurrentPage('pages/report/report')
    tourStore.summarizeStoredHallRecords()
    preload.preloadPages(['/pages/home/home', '/pages/hall/hall'], 120)
    preload.preloadImages(preload.HALL_ICON_ASSETS, 160)
    this._loadHallCatalog()
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

  _loadHallCatalog: function () {
    var self = this
    api.tourApi.getHalls().then(function (res) {
      if (!res || !res.ok || !res.data) return
      var list = Array.isArray(res.data)
        ? res.data
        : (res.data.halls || res.data.items || [])
      self._applyHallCatalog(list)
    }).catch(function (err) {
      console.warn('[report] structured hall names unavailable; keeping static fallback', err)
    })
  },

  _applyHallCatalog: function (halls) {
    var names = hallData.buildHallNameMap(halls)
    if (!Object.keys(names).length) return
    this._hallNameMap = names
    if (this._lastVisitedHallSlugs) {
      this.setData({
        visitedHallCards: buildVisitedHallCards(this._lastVisitedHallSlugs, names),
      })
    }
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
    this._lastVisitedHallSlugs = payload.halls_visited || []
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
      visitedHallCards: buildVisitedHallCards(this._lastVisitedHallSlugs, this._hallNameMap),
      reflection: normalizeReflection(payload.reflection),
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
      visitedHallCards: [],
      reflection: null,
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

  shareReport: function () {
    wx.showToast({ title: '分享功能即将上线', icon: 'none' })
  },
})
