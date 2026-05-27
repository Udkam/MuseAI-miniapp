const tourStore = require('../../store/tour')

var PERSONA_MAP = {
  A: {
    key: 'A',
    label: '考古队长',
    icon: '🏺',
    title: '你是 考古队长',
    desc: '目光锐利，善于从细节中读出历史的密码。你会带着探索精神深挖每一件器物背后的故事，让半坡遗址在你眼中变成一部立体的考古报告。',
    color: '#C4845A',
  },
  B: {
    key: 'B',
    label: '半坡原住民',
    icon: '🌾',
    title: '你是 半坡原住民',
    desc: '天生共情，能把自己代入六千年前的日常生活。炊烟、陶罐、窖穴——这些对你来说不是文物，而是邻居家的故事。',
    color: '#7A9B6E',
  },
  C: {
    key: 'C',
    label: '历史老师',
    icon: '📜',
    title: '你是 历史老师',
    desc: '系统思维，善于将碎片化信息编织成完整的历史图景。你的参观将成为一堂生动的历史课，每个展品都是一个知识节点。',
    color: '#6B8CAE',
  },
}

Page({
  data: {
    persona: null,
  },

  onLoad: function (options) {
    var p = options.persona || 'A'
    var info = PERSONA_MAP[p] || PERSONA_MAP.A
    tourStore.createLocalTourState({ persona: p })
    this.setData({ persona: info })
  },

  goHall: function () {
    wx.navigateTo({ url: '/pages/hall/hall' })
  },
})
