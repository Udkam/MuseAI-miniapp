var MOCK_ROUTE = [
  {
    order: 1,
    hall: '半坡聚落复原区',
    icon: '🏘️',
    highlights: ['半穴居建筑复原', '公共广场', '围栏与壕沟'],
    duration: '约 30 分钟',
  },
  {
    order: 2,
    hall: '出土文物陈列区',
    icon: '🏺',
    highlights: ['人面鱼纹盆', '尖底瓶', '骨针与石器'],
    duration: '约 45 分钟',
  },
  {
    order: 3,
    hall: '专题文化展区',
    icon: '📖',
    highlights: ['仰韶文化起源', '考古发掘历程', '半坡文化影响'],
    duration: '约 20 分钟',
  },
]

Page({
  data: {
    route: MOCK_ROUTE,
    totalTime: '约 1.5 小时',
  },

  startTour: function () {
    wx.navigateTo({ url: '/pages/hall/hall' })
  },
})
