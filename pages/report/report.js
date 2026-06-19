const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')

const THEME_TITLES = {
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

function buildVisitedHallCards(halls) {
  return unique(halls || []).map(function (slug) {
    var normalized = banpoHalls.normalizeHallToSlug(slug)
    return {
      name: hallDisplay(normalized) || slug,
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

  onLoad: function () {
    var state = tourStore.getTourState()
    tourStore.summarizeStoredHallRecords()
    preload.preloadPages(['/pages/home/home', '/pages/hall/hall'], 120)
    preload.preloadImages(preload.HALL_ICON_ASSETS, 160)
    this.setData({
      persona: tourStore.getPersonaLabel() || '',
      reportTitle: tourStore.getReportThemeTitle() || '半坡游览报告',
      isLoading: true,
      isReady: false,
      loadError: false,
      dataNotice: '',
    })

    if (!state.sessionId) {
      this._applyUnavailable('尚未建立导览会话，无法生成服务器报告。', false)
      return
    }

    var self = this
    this._reportTimer = setTimeout(function () {
      self._reportTimer = null
      self._flushThenGenerate(state.sessionId, state.sessionToken)
    }, 80)
  },

  onUnload: function () {
    if (this._reportTimer) {
      clearTimeout(this._reportTimer)
      this._reportTimer = null
    }
  },

  _flushThenGenerate: function (id, token) {
    var self = this
    var events = tourStore.drainPendingEvents()

    function generate(notice) {
      wx.showLoading({ title: '正在整理报告…', mask: true })
      api.tourApi.generateReport(id, token)
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

    if (!events.length) {
      generate('')
      return
    }

    api.tourApi.recordEvents(id, events, token)
      .then(function (res) {
        if (!res || !res.ok) {
          tourStore.restorePendingEvents(events)
          self._applyUnavailable('游览记录上传失败，请检查网络后重试。', true)
          return
        }
        generate('')
      })
      .catch(function (err) {
        console.warn('[report] flush events failed, restoring:', err)
        tourStore.restorePendingEvents(events)
        self._applyUnavailable('游览记录上传失败，请检查网络后重试。', true)
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
      visitedHallCards: buildVisitedHallCards(payload.halls_visited || []),
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
    tourStore.clearTour()
    wx.reLaunch({ url: '/pages/home/home' })
  },

  shareReport: function () {
    wx.showToast({ title: '分享功能即将上线', icon: 'none' })
  },
})
