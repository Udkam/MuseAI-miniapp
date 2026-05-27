var HALLS = [
  {
    id: 'settlement',
    name: '半坡聚落复原区',
    icon: '🏘️',
    desc: '还原六千年前半坡先民的居住场景，半穴居建筑、公共广场与围栏一一呈现。',
  },
  {
    id: 'artifacts',
    name: '出土文物陈列区',
    icon: '🏺',
    desc: '收藏陶器、石器、骨器等珍贵文物，人面鱼纹盆为镇馆之宝。',
  },
  {
    id: 'culture',
    name: '专题文化展区',
    icon: '📖',
    desc: '深度呈现半坡文化的历史地位、考古发掘历程与文化传承。',
  },
]

Page({
  data: {
    halls: HALLS,
  },

  selectHall: function (e) {
    var hall = e.currentTarget.dataset.hall
    wx.navigateTo({
      url: '/pages/tour/tour?hall=' + encodeURIComponent(hall.name) + '&hallId=' + hall.id,
    })
  },
})
