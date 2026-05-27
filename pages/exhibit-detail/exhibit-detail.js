var MOCK_EXHIBITS = {
  '人面鱼纹盆': {
    name: '人面鱼纹盆',
    category: '彩陶',
    period: '距今约6000年',
    hall: '出土文物陈列区',
    desc: '仰韶文化半坡类型彩陶的代表作。陶盆内壁绘有两组人面与鱼纹交错的纹样，人面额头绘鱼纹，嘴角伸出鱼，充满神秘的巫术意味，是研究半坡先民精神世界的重要实物。',
  },
  '尖底瓶': {
    name: '尖底瓶',
    category: '汲水陶器',
    period: '距今约6000年',
    hall: '出土文物陈列区',
    desc: '半坡遗址最具特色的日用陶器之一。尖底设计利用水的浮力自动扶正，是新石器时代先民的巧妙发明，体现了半坡人高超的物理智慧。',
  },
}

var DEFAULT_EXHIBIT = {
  name: '',
  category: '展品',
  period: '新石器时代',
  hall: '半坡遗址',
  desc: '关于此展品的 AI 讲解将在 Phase 6 接入后端后自动生成。',
}

Page({
  data: {
    exhibit: DEFAULT_EXHIBIT,
  },

  onLoad: function (options) {
    var name = options.name ? decodeURIComponent(options.name) : ''
    var exhibit = MOCK_EXHIBITS[name] || Object.assign({}, DEFAULT_EXHIBIT, { name: name || '未知展品' })
    this.setData({ exhibit: exhibit })
    wx.setNavigationBarTitle({ title: exhibit.name || '展品详情' })
  },

  goDeeper: function () {
    var name = this.data.exhibit.name
    wx.navigateTo({
      url: '/pages/tour/tour?exhibit=' + encodeURIComponent(name),
    })
  },

  goNext: function () {
    wx.navigateBack({ delta: 1 })
  },
})
