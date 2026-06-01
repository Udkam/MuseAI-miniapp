const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')

// ── Radar score display labels (backend keys → Chinese) ───────────────────────
// Backend: civilization_resonance / imagination_breadth / history_collection /
//          life_experience / ceramic_aesthetics  (1–3 integer scale)
var RADAR_LABELS = {
  civilization_resonance: '文明共鸣',
  imagination_breadth:    '想象广度',
  history_collection:     '历史收藏',
  life_experience:        '生活体验',
  ceramic_aesthetics:     '陶瓷美学',
}

// ── Fallback radar bars (shown when API returns no scores) ────────────────────
var FALLBACK_RADAR = [
  { label: '文明共鸣', value: 2, barWidth: 67 },
  { label: '想象广度', value: 2, barWidth: 67 },
  { label: '生活体验', value: 2, barWidth: 67 },
  { label: '历史收藏', value: 2, barWidth: 67 },
  { label: '陶瓷美学', value: 2, barWidth: 67 },
]

Page({
  data: {
    // Loading / error states
    isLoading:    true,
    isReady:      false,
    loadError:    false,

    // Header (set from local state immediately)
    persona:      '',
    reportTitle:  '',
    reportTheme:  '',

    // Gold quote shown at the top of the report
    oneLiner:     '',

    // Identity chip tags  e.g. ['考古研究员', '文化追寻者']
    identityTags: [],

    // Stats row
    stats: {
      halls:    '-',
      exhibits: '-',
      messages: '-',
      duration: '-',
    },

    // Radar bar chart data  [{ label, value (0–100) }]
    radarBars: [],

    // Highlight bullet points (may be empty)
    highlights: [],
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onLoad: function () {
    var self  = this
    var state = tourStore.getTourState()

    // Set persona labels immediately from local state (no network needed)
    self.setData({
      persona:     tourStore.getPersonaLabel() || '研学记录员',
      reportTitle: tourStore.getReportThemeTitle() || '半坡导览报告',
      isLoading:   true,
      isReady:     false,
    })

    var id    = state.sessionId
    var token = state.sessionToken

    // No active session — show fallback immediately, no spinner
    if (!id) {
      self._applyFallback(false)
      return
    }

    // Flush pending events → generate → get → display
    self._flushThenGenerate(id, token)
  },

  // ── Report generation pipeline ────────────────────────────────────────────

  /**
   * 1. Upload any buffered tour events.
   * 2. POST /tour/sessions/:id/report  (generate)
   * 3. If generate response has full data use it; else GET  /tour/sessions/:id/report
   * 4. Apply to UI, or fall back to local demo on any error.
   */
  _flushThenGenerate: function (id, token) {
    var self   = this
    var events = tourStore.drainPendingEvents()

    var _generate = function () {
      wx.showLoading({ title: '正在生成报告…', mask: true })

      api.tourApi.generateReport(id, token)
        .then(function (genRes) {
          // If generate returned the full report, use it directly
          if (genRes.ok && genRes.data && genRes.data.one_liner) {
            return genRes  // pass through to next .then
          }
          // Otherwise fetch the stored report separately
          return api.tourApi.getReport(id, token)
        })
        .then(function (res) {
          wx.hideLoading()
          if (res && res.ok && res.data) {
            self._applyReport(res.data)
          } else {
            self._applyFallback(true)
          }
        })
        .catch(function (err) {
          wx.hideLoading()
          console.error('[report] generate/get error:', err)
          self._applyFallback(true)
        })
    }

    if (!events.length) {
      _generate()
      return
    }

    // Flush first, then generate regardless of flush outcome
    api.tourApi.recordEvents(id, events, token)
      .then(function () {
        _generate()
      })
      .catch(function (err) {
        console.warn('[report] flush events failed — will still generate:', err)
        tourStore.restorePendingEvents(events)
        _generate()
      })
  },

  // ── Data mappers ──────────────────────────────────────────────────────────

  /**
   * Map the backend report object to page data and setData.
   * @param {object} data  Backend report payload
   */
  _applyReport: function (data) {
    // Convert radar_scores { key: value } → [{ label, value, barWidth }]
    // Backend returns 1–3 integer scale; barWidth scales to 0–100% for display.
    var radarBars = []
    if (data.radar_scores && typeof data.radar_scores === 'object') {
      Object.keys(data.radar_scores).forEach(function (key) {
        var raw = Math.min(3, Math.max(1, Math.round(Number(data.radar_scores[key])) || 1))
        radarBars.push({
          label:    RADAR_LABELS[key] || key,
          value:    raw,
          barWidth: Math.round((raw / 3) * 100),
        })
      })
    }
    if (!radarBars.length) radarBars = FALLBACK_RADAR.slice()

    var dur = data.total_duration_minutes != null
      ? Math.round(data.total_duration_minutes) + ' 分钟'
      : '-'
    var hallsVisited = data.halls_visited
    var hallsCount = '-'
    if (Array.isArray(hallsVisited)) {
      hallsCount = String(hallsVisited.length)
    } else if (hallsVisited != null) {
      hallsCount = String(hallsVisited)
    }
    var hallNames = Array.isArray(hallsVisited)
      ? hallsVisited.map(function (hall) { return banpoHalls.getHallDisplayName(hall) })
      : []

    this.setData({
      isLoading:    false,
      isReady:      true,
      loadError:    false,
      reportTheme:  data.report_theme   || '',
      oneLiner:     data.one_liner      || '',
      identityTags: Array.isArray(data.identity_tags) ? data.identity_tags : [],
      stats: {
        halls:    hallsCount,
        exhibits: data.total_exhibits_viewed != null ? String(data.total_exhibits_viewed) : '-',
        messages: data.total_questions       != null ? String(data.total_questions)       : '-',
        duration: dur,
      },
      radarBars:  radarBars,
      highlights: Array.isArray(data.highlights) && data.highlights.length
        ? data.highlights
        : (hallNames.length ? ['已到访：' + hallNames.join('、')] : []),
    })
  },

  /**
   * Show a local demo report.  Called when the session is missing or the API fails.
   * @param {boolean} showToast  Whether to display an error toast to the user.
   */
  _applyFallback: function (showToast) {
    if (showToast) {
      wx.showToast({ title: '报告生成失败，已使用本地演示报告', icon: 'none', duration: 3000 })
    }
    this.setData({
      isLoading:    false,
      isReady:      true,
      loadError:    !!showToast,
      oneLiner:     '你穿越六千年，与半坡先民的智慧相遇。',
      identityTags: [tourStore.getPersonaLabel() || '探索者', '文化追寻者', '考古爱好者'],
      stats: {
        halls:    '1',
        exhibits: '3',
        messages: '5',
        duration: '42 分钟',
      },
      radarBars: FALLBACK_RADAR.slice(),
      highlights: [
        '你在出土文物陈列区停留时间最长',
        '共提问 5 次，深度探讨了人面鱼纹盆',
        '获得「考古新星」成就徽章',
      ],
    })
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  goHome: function () {
    tourStore.clearTour()
    wx.reLaunch({ url: '/pages/home/home' })
  },

  shareReport: function () {
    wx.showToast({ title: '分享功能即将上线', icon: 'none' })
  },
})
