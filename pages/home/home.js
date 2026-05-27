const tourStore = require('../../store/tour')

Page({
  data: {
    hasTourSession: false,
  },

  onShow: function () {
    var state = tourStore.getTourState()
    this.setData({ hasTourSession: !!state.sessionId })
  },

  goOnboarding: function () {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  resumeTour: function () {
    wx.navigateTo({ url: '/pages/tour/tour' })
  },
})
