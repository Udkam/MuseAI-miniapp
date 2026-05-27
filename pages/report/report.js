const tourStore = require('../../store/tour')

Page({
  data: {
    persona: null,
    reportTitle: '',
    stats: {
      halls: 1,
      exhibits: 3,
      messages: 5,
      duration: '42 分钟',
    },
    highlights: [
      '你在出土文物陈列区停留时间最长',
      '共提问 5 次，深度探讨了人面鱼纹盆',
      '获得「考古新星」成就徽章',
    ],
    isReady: false,
  },

  onLoad: function () {
    var state = tourStore.getTourState()
    var LABELS = { A: '考古队长', B: '半坡原住民', C: '历史老师' }
    var TITLES = { A: '你的半坡考古报告', B: '半坡一日穿越体验', C: '半坡游学荣誉证书' }
    var p = state.persona || 'A'
    this.setData({
      persona: LABELS[p] || LABELS.A,
      reportTitle: TITLES[p] || TITLES.A,
      isReady: true,
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
