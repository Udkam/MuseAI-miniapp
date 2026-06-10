var tourStore = require('../../store/tour')
var api       = require('../../api/index')

Page({
  data: {
    hasTourSession: false,
    resumeHallName: '',
    aiConversationCount: 0,
    starting:       false,  // debounce goQuickStart
  },

  onShow: function () {
    var state = tourStore.getTourState()
    var canResume = tourStore.hasResumableTourSession(0)
    this.setData({
      hasTourSession: canResume,
      resumeHallName: canResume ? (tourStore.getCurrentHallDisplayName() || '展厅选择') : '',
      aiConversationCount: state.aiConversationCount || 0,
    })
  },

  goOnboarding: function () {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  // Skip all onboarding: use the default persona and create a backend session.
  goQuickStart: function () {
    if (this.data.starting) return
    var self = this
    self.setData({ starting: true })

    tourStore.setStylePrefs({ answerLength: 'balanced', depth: 'standard', terminology: 'plain' })
    tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'D', personaId: 'default' })
    tourStore.setOnboardingExtras({
      intentText:         '',
      preferredHallOrder: ['basic', 'site', 'kiln'],
      timeBudget:         null,
      focusId:            'default',
      focusTitle:         '默认参观',
      focusPrompt:        '请按普通游客第一次参观的节奏，先建立整体印象，再给出最值得看的重点。',
      assumptionText:     '先不下判断，跟证据走',
      guideModeId:        'default',
      guideModeTitle:     '默认体验',
      guideModePrompt:    '用户是直接开始的游客，请用清晰、友好、不过度学术的方式讲重点。',
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
    if (!tourStore.hasResumableTourSession(0)) {
      this.setData({ hasTourSession: false })
      wx.showToast({ title: '当前没有可继续的导览', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/hall/hall' })
  },
})
