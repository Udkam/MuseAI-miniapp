const tourStore = require('../../store/tour')

// Physical hall definitions (fixed positions in the museum)
var HALLS = {
  settlement: {
    id:         'settlement',
    name:       '半坡聚落复原区',
    short:      '聚落',
    highlights: ['半穴居建筑复原', '公共广场遗址', '围栏与壕沟'],
    hallKey:    '半坡聚落复原区',
  },
  artifacts: {
    id:         'artifacts',
    name:       '出土文物陈列区',
    short:      '文物',
    highlights: ['人面鱼纹盆', '尖底瓶', '骨针与石器'],
    hallKey:    '出土文物陈列区',
  },
  culture: {
    id:         'culture',
    name:       '专题文化展区',
    short:      '专题',
    highlights: ['仰韶文化起源', '考古发掘历程', '半坡文化影响'],
    hallKey:    '专题文化展区',
  },
}

// Persona-driven route order, durations, and AI rationale
var PERSONA_ROUTES = {
  A: {
    label:    '考古队长路线',
    tagline:  '从证据出发，还原完整历史图景',
    totalMin: 110,
    steps: [
      {
        hallId: 'artifacts',
        min:    50,
        reason: '考古队长先看证据。人面鱼纹盆的纹路、尖底瓶的工艺——每件文物都是推理的起点。',
        focus:  '重点关注器物纹饰与制作工艺',
      },
      {
        hallId: 'settlement',
        min:    35,
        reason: '带着文物的认知再看聚落，半穴居的尺寸、壕沟的深度——数据开始有了温度。',
        focus:  '测量与记录建筑结构细节',
      },
      {
        hallId: 'culture',
        min:    25,
        reason: '最后用仰韶文化的宏观框架，把前两区的碎片拼成完整图景。',
        focus:  '梳理文化脉络与考古学史',
      },
    ],
  },
  B: {
    label:    '原住民路线',
    tagline:  '先感受生活，再认识历史',
    totalMin: 90,
    steps: [
      {
        hallId: 'settlement',
        min:    40,
        reason: '原住民的第一站是家园。走进半穴居，想象炊烟、孩子的笑声、夜晚的篝火。',
        focus:  '用感受代替记忆，想象日常生活',
      },
      {
        hallId: 'artifacts',
        min:    30,
        reason: '回到文物区，这次你看到的不是展品，而是邻居用过的碗、阿妈的纺轮。',
        focus:  '把文物与聚落生活场景对应',
      },
      {
        hallId: 'culture',
        min:    20,
        reason: '了解你所生活的这片土地对整个文明的意义——带着骄傲离开。',
        focus:  '感受半坡文化的历史地位',
      },
    ],
  },
  C: {
    label:    '历史老师路线',
    tagline:  '先建框架，再填细节',
    totalMin: 100,
    steps: [
      {
        hallId: 'culture',
        min:    30,
        reason: '历史老师先建框架。仰韶文化的时空坐标、发掘史——框架在，细节才有意义。',
        focus:  '梳理历史背景与文化脉络',
      },
      {
        hallId: 'artifacts',
        min:    40,
        reason: '带着问题看文物：这件器物说明了什么？与其他遗址有何异同？',
        focus:  '比较分析，形成自己的历史判断',
      },
      {
        hallId: 'settlement',
        min:    30,
        reason: '最后用聚落遗址验证推论——空间布局透露的社会组织形式，是最好的结课材料。',
        focus:  '从空间布局推断社会结构',
      },
    ],
  },
}

// Derive visited halls from tourStore state + pending hall_enter events
function _getVisitedHalls(state) {
  var visited = (state.visitedHalls || []).slice()
  var events  = state.pendingEvents || []
  events.forEach(function (ev) {
    if (ev.event_type === 'hall_enter' && ev.hall && visited.indexOf(ev.hall) === -1) {
      visited.push(ev.hall)
    }
  })
  return visited
}

// Build the ordered step array with per-step status
function _buildSteps(personaKey, visitedHalls) {
  var config  = PERSONA_ROUTES[personaKey] || PERSONA_ROUTES.B
  var visited = visitedHalls || []

  // First unvisited step in route order becomes "current recommended"
  var currentIdx = -1
  for (var i = 0; i < config.steps.length; i++) {
    var hKey = HALLS[config.steps[i].hallId].hallKey
    if (visited.indexOf(hKey) === -1) {
      currentIdx = i
      break
    }
  }

  return config.steps.map(function (step, idx) {
    var hall      = HALLS[step.hallId]
    var isVisited = visited.indexOf(hall.hallKey) !== -1
    var isCurrent = idx === currentIdx
    var status    = isVisited ? 'visited' : (isCurrent ? 'current' : 'upcoming')
    return {
      order:      idx + 1,
      hallId:     step.hallId,
      name:       hall.name,
      highlights: hall.highlights,
      duration:   '约 ' + step.min + ' 分钟',
      reason:     step.reason,
      focus:      step.focus,
      isVisited:  isVisited,
      isCurrent:  isCurrent,
      status:     status,
    }
  })
}

// Build floor plan items always in physical museum order (settlement | artifacts | culture)
function _buildFloorItems(steps) {
  var statusMap = {}
  steps.forEach(function (s) { statusMap[s.hallId] = s.status })
  return [
    { id: 'settlement', short: '聚落', status: statusMap.settlement || 'upcoming' },
    { id: 'artifacts',  short: '文物', status: statusMap.artifacts  || 'upcoming' },
    { id: 'culture',    short: '专题', status: statusMap.culture    || 'upcoming' },
  ]
}

Page({
  data: {
    steps:        [],
    floorItems:   [],
    totalDesc:    '',
    personaLabel: '',
    tagline:      '',
    stepsCount:   0,
    loaded:       false,
  },

  onLoad: function () {
    this._refresh()
  },

  onShow: function () {
    // Re-read state on every show so visited halls reflect the latest tour progress
    this._refresh()
  },

  _refresh: function () {
    var state        = tourStore.getTourState()
    var personaKey   = state.persona || 'B'
    var visitedHalls = _getVisitedHalls(state)
    var config       = PERSONA_ROUTES[personaKey] || PERSONA_ROUTES.B
    var steps        = _buildSteps(personaKey, visitedHalls)
    var floorItems   = _buildFloorItems(steps)

    this.setData({
      steps:        steps,
      stepsCount:   steps.length,
      floorItems:   floorItems,
      totalDesc:    '约 ' + config.totalMin + ' 分钟',
      personaLabel: config.label,
      tagline:      config.tagline,
      loaded:       true,
    })
  },

  startTour: function () {
    // Replace route page rather than pushing — prevents page-stack overflow
    // on repeated hall visits (WeChat limit: 10 pages).
    wx.redirectTo({ url: '/pages/hall/hall' })
  },
})
