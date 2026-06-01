const banpoHalls = require('../../constants/banpo-halls')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER

var HALL_ROUTE_META = {
  basic: {
    minutes: 18,
    reason: '先建立半坡文化的基本印象，了解出土遗物、生活方式和考古发现脉络。',
    focus: '半坡人、石器工具、彩陶与装饰品。',
  },
  site: {
    minutes: 18,
    reason: '再把器物放回真实遗址空间，观察房屋、墓葬、作坊和公共空间。',
    focus: '房屋遗迹、墓葬区、制陶区和聚落边界。',
  },
  kiln: {
    minutes: 14,
    reason: '补上制陶流程，理解陶器从材料、成型到烧制的过程。',
    focus: '陶窑结构、烧成痕迹和制陶工艺。',
  },
  workshop: {
    minutes: 14,
    reason: '用互动体验把抽象技术转化为可感知的操作过程。',
    focus: '手作步骤、材料处理和工艺难点。',
  },
  banpoGirl: {
    minutes: 8,
    reason: '通过公共形象理解半坡遗址如何被今天的人记住和表达。',
    focus: '人物形象、文化象征和观展记忆点。',
  },
  temp1: {
    minutes: 8,
    reason: '临展内容随馆方主题更新，适合用现场展签确认当期信息。',
    focus: '当期主题、展签说明和馆方更新。',
  },
  temp2: {
    minutes: 8,
    reason: '继续查看临时展陈，补充当期策展主题中的另一组材料。',
    focus: '轮换展览、阶段性主题和现场说明。',
  },
  education: {
    minutes: 8,
    reason: '把前面的观察整理成问题、笔记或复盘提纲。',
    focus: '研学问题、讨论线索和活动信息。',
  },
  peony: {
    minutes: 6,
    reason: '作为参观间隙的停留点，放慢节奏并整理刚才的观察。',
    focus: '园林休憩、季节景观和参观节奏。',
  },
}

function _buildFixedSteps() {
  return DEFAULT_ORDER.map(function (id, index) {
    var hall = HALLS_MAP[id]
    var meta = HALL_ROUTE_META[id] || {}
    return {
      order: index + 1,
      hallId: id,
      hallSlug: hall ? hall.backendSlug : banpoHalls.normalizeHallToSlug(id),
      name: hall ? hall.name : banpoHalls.getHallDisplayName(id),
      highlights: hall ? hall.highlights : [],
      duration: '约 ' + (meta.minutes || 10) + ' 分钟',
      estimatedMinutes: meta.minutes || 10,
      reason: meta.reason || (hall ? hall.desc : ''),
      focus: meta.focus || '',
      status: 'upcoming',
      isVisited: false,
      isCurrent: false,
    }
  }).filter(function (step) {
    return !!step.name
  })
}

function _buildFloorItems(steps) {
  var items = steps.slice(0, 3).map(function (step) {
    var hall = HALLS_MAP[step.hallId] || banpoHalls.getHallBySlug(step.hallSlug)
    return {
      id: step.hallId,
      short: hall ? hall.short : String(step.name || '').slice(0, 2),
      status: 'upcoming',
    }
  })
  while (items.length < 3) {
    items.push({ id: 'placeholder-' + items.length, short: '待定', status: 'upcoming' })
  }
  return items
}

function _totalMinutes(steps) {
  return steps.reduce(function (sum, step) {
    return sum + (Number(step.estimatedMinutes) || 0)
  }, 0)
}

Page({
  data: {
    steps: [],
    floorItems: [],
    totalDesc: '',
    personaLabel: '固定顺序',
    tagline: '按展厅顺序浏览；到馆后也可以直接选择现场所在展厅。',
    stepsCount: 0,
    routeSource: 'fixed',
    routeSourceLabel: '固定参观路线',
    planSummary: '',
    routeNotice: '',
    planning: false,
    routeLoading: false,
    aiRoutePending: false,
    loaded: false,
  },

  onLoad: function () {
    this._refresh()
  },

  onShow: function () {
    this._refresh()
  },

  _refresh: function () {
    // Route page is intentionally presentation-only. Do not consume stale
    // visited/current hall cache here, otherwise old sessions can mark halls
    // as visited before the user enters them in the current run.
    var steps = _buildFixedSteps()
    this.setData({
      steps: steps,
      stepsCount: steps.length,
      floorItems: _buildFloorItems(steps),
      totalDesc: '约 ' + _totalMinutes(steps) + ' 分钟',
      personaLabel: '固定顺序',
      tagline: '按展厅顺序浏览；到馆后也可以直接选择现场所在展厅。',
      routeSource: 'fixed',
      routeSourceLabel: '固定参观路线',
      planSummary: '',
      routeNotice: '',
      planning: false,
      routeLoading: false,
      aiRoutePending: false,
      loaded: true,
    })
  },

  startTour: function () {
    wx.redirectTo({ url: '/pages/hall/hall' })
  },
})
