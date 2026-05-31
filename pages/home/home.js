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
    tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'B', personaId: 'default' })
    tourStore.setOnboardingExtras({
      intentText:         '',
      preferredHallOrder: ['settlement', 'artifacts', 'culture'],
      timeBudget:         null,
    })

    var guestId = 'miniapp_guest_' + Date.now()

    api.tourApi.createSession({
      interest_type: 'B',
      persona:       'B',
      assumption:    'B',
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
    var hallName = tourStore.getSavedCurrentHall()
    var url      = '/pages/tour/tour'
    if (hallName) url += '?hall=' + encodeURIComponent(hallName)
    wx.navigateTo({ url: url })
  },
})
