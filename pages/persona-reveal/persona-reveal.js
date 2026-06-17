const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var PERSONA_MAP = {
  A: {
    key:    'A',
    label:  '考古研究员',
    icon:   'search',
    title:  '你是 考古研究员',
    desc:   '你习惯先看证据，再提出解释。器物、遗迹、展签和空间关系，都是你建立判断的材料。',
    aiDesc: '我会优先说明证据来源、推理过程和不确定性，帮助你把观察整理成可靠的研究线索。',
    color:  '#A85732',
    routeTips: [
      { title: '找证据' },
      { title: '回现场' },
      { title: '辨推断' },
    ],
  },
  B: {
    key:    'B',
    label:  '研学记录员',
    icon:   'note',
    title:  '你是 研学记录员',
    desc:   '你希望参观结束后能说清楚自己看到了什么、为什么重要，以及还想继续追问什么。',
    aiDesc: '我会把展厅内容拆成观察任务、笔记要点和简短小结，方便你复盘、讨论或写研学报告。',
    color:  '#55766B',
    routeTips: [
      { title: '领任务' },
      { title: '记证据' },
      { title: '成笔记' },
    ],
  },
  C: {
    key:    'C',
    label:  '历史追问者',
    icon:   'compass',
    title:  '你是 历史追问者',
    desc:   '你关心半坡为什么重要，也关心史前生活如何影响我们理解文明、共同体和今天的公共生活。',
    aiDesc: '我会把半坡放进更大的历史脉络里，用问题带你比较证据、形成自己的解释，而不是只给标准答案。',
    color:  '#456A8A',
    routeTips: [
      { title: '看聚落' },
      { title: '问社会' },
      { title: '连今天' },
    ],
  },
  D: {
    key:    'D',
    label:  '器物研究员',
    icon:   'vessel',
    title:  '你是 器物研究员',
    desc:   '你会先看材料、器形、纹饰、制作痕迹和使用痕迹，从细节里理解技术和审美选择。',
    aiDesc: '我会聚焦器物细读，把“好看”“有用”“难做”拆成可以观察和验证的证据。',
    color:  '#B06B3C',
    routeTips: [
      { title: '看形制' },
      { title: '追工艺' },
      { title: '辨用途' },
    ],
  },
}

Page({
  data: {
    persona:        null,
    hasEntryProfile: false,
    focusTitle:     '',
    guideModeTitle: '',
    routeTips:      [],
    entering:       false,
  },

  // Non-reactive navigation guard (no render → no flicker).
  _navigating: false,

  onLoad: function (options) {
    var state = tourStore.getTourState()
    var p     = options.persona || state.personaId || state.persona || 'B'
    if (!PERSONA_MAP[p]) p = 'B'

    var info = PERSONA_MAP[p] || PERSONA_MAP.B

    this.setData({
      persona: info,
      hasEntryProfile: !!(state.focusTitle || state.guideModeTitle),
      focusTitle: state.focusTitle || '',
      guideModeTitle: state.guideModeTitle || '',
      routeTips: info.routeTips || [],
    })
  },

  goHall: function () {
    if (this._navigating) return
    this._navigating = true
    var self  = this
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken

    // Personalized users see their planned route before choosing a hall.
    // Quick-start visitors bypass this page and enter the hall picker directly.
    var _navigate = function () {
      wx.redirectTo({ url: '/pages/route/route' })
    }

    if (!id) {
      _navigate()
      return
    }

    // Fire-and-forget the status update; navigate immediately so the button
    // never shows a lingering spinner while waiting on the network.
    api.tourApi.updateSession(id, { status: 'opening' }, token)
      .catch(function (err) {
        console.warn('[persona-reveal] updateSession error (background):', err)
      })
    _navigate()
  },
})
