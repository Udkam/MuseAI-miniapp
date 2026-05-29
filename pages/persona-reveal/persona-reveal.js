const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var PERSONA_MAP = {
  A: {
    key:    'A',
    label:  '考古队长',
    icon:   '🏺',
    title:  '你是 考古队长',
    desc:   '目光锐利，善于从细节中读出历史的密码。你会带着探索精神深挖每一件器物背后的故事，让半坡遗址在你眼中变成一部立体的考古报告。',
    aiDesc: '我会用证据和数据带你还原历史，遇到学界争议会直说"目前尚无定论"，不会给你模糊的答案。',
    color:  '#C4845A',
  },
  B: {
    key:    'B',
    label:  '半坡原住民',
    icon:   '🌾',
    title:  '你是 半坡原住民',
    desc:   '天生共情，能把自己代入六千年前的日常生活。炊烟、陶罐、窖穴——这些对你来说不是文物，而是邻居家的故事。',
    aiDesc: '我会以第一人称带你穿越，用阿妈、部落、围火这些词讲述我们先民的生活，让你感受而非背诵。',
    color:  '#7A9B6E',
  },
  C: {
    key:    'C',
    label:  '历史老师',
    icon:   '📜',
    title:  '你是 历史老师',
    desc:   '系统思维，善于将碎片化信息编织成完整的历史图景。你的参观将成为一堂生动的历史课，每个展品都是一个知识节点。',
    aiDesc: '我会在每个知识点后抛出一个问题，引导你自己思考，而不是直接给结论——苏格拉底式对话。',
    color:  '#6B8CAE',
  },
}

var ASSUMPTION_HINTS = {
  A: '你认为原始社会平等和谐——游览中 AI 会在某个时刻带你看看半坡社会结构的另一面',
  B: '你觉得原始社会艰苦不堪——AI 也许会发现一些出人意料的"小确幸"证据',
  C: '你认为强弱之分自古皆然——AI 会带你探索半坡合作与分工的真实图景',
}

var HALL_NAMES = {
  settlement: '半坡聚落复原区',
  artifacts:  '出土文物陈列区',
  culture:    '专题文化展区',
}

var HALL_DESCS = {
  settlement: '那里能最直接感受到先民的居住痕迹',
  artifacts:  '珍贵文物集中，人面鱼纹盆是重点',
  culture:    '建立历史框架，理解半坡文化全貌',
}

Page({
  data: {
    persona:        null,
    assumptionHint: '',
    preferredHall:     '',
    preferredHallDesc: '',
    entering:       false,
  },

  onLoad: function (options) {
    var state = tourStore.getTourState()
    var p     = options.persona    || state.persona    || 'A'
    var aKey  = options.assumption || state.assumption || 'A'
    var order = state.preferredHallOrder || ['settlement', 'artifacts', 'culture']

    var info          = PERSONA_MAP[p] || PERSONA_MAP.A
    var hint          = ASSUMPTION_HINTS[aKey] || ASSUMPTION_HINTS.A
    var firstHallId   = order[0] || 'artifacts'
    var preferredHall     = HALL_NAMES[firstHallId] || ''
    var preferredHallDesc = HALL_DESCS[firstHallId]  || ''

    this.setData({ persona: info, assumptionHint: hint, preferredHall: preferredHall, preferredHallDesc: preferredHallDesc })
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
