const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var PERSONA_MAP = {
  A: {
    key:   'A',
    label: '考古队长',
    icon:  '🏺',
    title: '你是 考古队长',
    desc:  '目光锐利，善于从细节中读出历史的密码。你会带着探索精神深挖每一件器物背后的故事，让半坡遗址在你眼中变成一部立体的考古报告。',
    color: '#C4845A',
  },
  B: {
    key:   'B',
    label: '半坡原住民',
    icon:  '🌾',
    title: '你是 半坡原住民',
    desc:  '天生共情，能把自己代入六千年前的日常生活。炊烟、陶罐、窖穴——这些对你来说不是文物，而是邻居家的故事。',
    color: '#7A9B6E',
  },
  C: {
    key:   'C',
    label: '历史老师',
    icon:  '📜',
    title: '你是 历史老师',
    desc:  '系统思维，善于将碎片化信息编织成完整的历史图景。你的参观将成为一堂生动的历史课，每个展品都是一个知识节点。',
    color: '#6B8CAE',
  },
}

Page({
  data: {
    persona:  null,
    entering: false,
  },

  onLoad: function (options) {
    // 读 URL 参数（onboarding 传来），不重置已有 tourStore 状态
    var p    = options.persona || tourStore.getTourState().persona || 'A'
    var info = PERSONA_MAP[p] || PERSONA_MAP.A
    this.setData({ persona: info })
  },

  goHall: function () {
    if (this.data.entering) return
    var self  = this
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken

    var _navigate = function () {
      wx.navigateTo({ url: '/pages/hall/hall' })
    }

    if (!id) {
      _navigate()
      return
    }

    self.setData({ entering: true })

    api.tourApi.updateSession(id, { status: 'opening' }, token)
      .then(function (res) {
        self.setData({ entering: false })
        if (!res.ok) {
          console.warn('[persona-reveal] updateSession failed:', res.status, res.data)
        }
        _navigate()
      })
      .catch(function (err) {
        self.setData({ entering: false })
        console.warn('[persona-reveal] updateSession error:', err)
        _navigate()
      })
  },
})
