var tourStore = require('../../store/tour')
var api       = require('../../api/index')

Page({
  data: {
    hasTourSession: false,
    starting:       false,  // debounce goQuickStart
  },

  onShow: function () {
    var state = tourStore.getTourState()
    this.setData({ hasTourSession: !!state.sessionId })
  },

  goOnboarding: function () {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  // Skip all onboarding — use default persona, create a real backend session.
  // This prevents the "请先完成首页问卷" message in tour.js by providing a sessionId.
  goQuickStart: function () {
    if (this.data.starting) return
    var self = this
    self.setData({ starting: true })

    tourStore.setStylePrefs({ answerLength: 'balanced', depth: 'standard', terminology: 'plain' })
    tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'D', personaId: 'student' })
    tourStore.setOnboardingExtras({
      intentText:         '',
      preferredHallOrder: ['site', 'basic', 'education'],
      timeBudget:         null,
      focusId:            'study',
      focusTitle:         '带着任务研学',
      focusPrompt:        '请优先给出观察任务、记录要点和适合研学汇报的清晰小结。',
      assumptionText:     '先不下判断，跟证据走',
      guideModeId:        'notebook',
      guideModeTitle:     '研学记录模式',
      guideModePrompt:    '用户正在做研学记录，请在回答中给出清晰观察任务和可整理成笔记的小结。',
    })

    var guestId = 'miniapp_guest_' + Date.now()

    api.tourApi.createSession({
      interest_type: 'B',
      persona:       'B',
      assumption:    'D',
      guest_id:      guestId,
    }).then(function (res) {
      self.setData({ starting: false })
      if (res.ok) {
        var d = res.data || {}
        tourStore.setTourSession({
          sessionId:    d.id || d.session_id || null,
          sessionToken: d.session_token      || null,
        })
      } else {
        console.warn('[home] goQuickStart createSession failed, proceeding without session:', res.status)
      }
      wx.navigateTo({ url: '/pages/hall/hall' })
    }).catch(function (err) {
      self.setData({ starting: false })
      console.warn('[home] goQuickStart network error, proceeding without session:', err)
      wx.navigateTo({ url: '/pages/hall/hall' })
    })
  },

  resumeTour: function () {
    wx.navigateTo({ url: '/pages/hall/hall' })
  },
})
