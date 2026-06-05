const api = require('../../api/index')
const tourStore = require('../../store/tour')
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

function _minutesFromBudget(value) {
  if (typeof value === 'number' && value > 0) return value
  var key = String(value || '').trim()
  if (key === 'quick') return 30
  if (key === 'research') return 90
  if (key === 'dialogue' || key === 'notebook') return 60
  return 60
}

function _routeHallIdFromSlug(slug) {
  var hall = banpoHalls.getHallBySlug(slug)
  return hall ? hall.id : String(slug || '')
}

function _normalizeRouteSteps(route) {
  var steps = route && Array.isArray(route.steps) ? route.steps : []
  return steps.map(function (step, index) {
    var slug = banpoHalls.normalizeHallToSlug(step.hall_slug || step.hallSlug || step.hall || step.name)
    var hall = banpoHalls.getHallBySlug(slug)
    var minutes = Number(step.estimated_minutes || step.estimatedMinutes || step.minutes) || 10
    return {
      order: Number(step.order) || index + 1,
      hallId: hall ? hall.id : _routeHallIdFromSlug(slug),
      hallSlug: slug,
      name: step.hall_name || step.hallName || (hall ? hall.name : banpoHalls.getHallDisplayName(slug)),
      highlights: hall ? hall.highlights : [],
      duration: '约 ' + minutes + ' 分钟',
      estimatedMinutes: minutes,
      reason: step.reason || step.title || (hall ? hall.desc : ''),
      focus: step.focus || '',
      status: 'upcoming',
      isVisited: false,
      isCurrent: false,
    }
  }).filter(function (step) {
    return !!step.name
  })
}

function _availableHallSlugs() {
  return DEFAULT_ORDER.map(function (id) {
    var hall = HALLS_MAP[id]
    return hall ? hall.backendSlug : null
  }).filter(Boolean)
}

function _buildPlanPayload() {
  var state = tourStore.getTourState()
  var personaDef = tourStore.getPersonaDef()
  var preferred = Array.isArray(state.preferredHallOrder) && state.preferredHallOrder.length
    ? state.preferredHallOrder
    : DEFAULT_ORDER
  var timeBudget = _minutesFromBudget(state.timeBudget || state.guideModeId)
  var backendPersona = tourStore.getBackendPersona()

  return {
    availableTime: timeBudget,
    persona: backendPersona,
    backendPersona: backendPersona,
    personaId: state.personaId || (personaDef && personaDef.id) || 'default',
    personaLabel: (personaDef && personaDef.name) || tourStore.getPersonaLabel(),
    timeBudget: timeBudget,
    focusTitle: state.focusTitle,
    focusPrompt: state.focusPrompt,
    assumptionText: state.assumptionText,
    guideModeTitle: state.guideModeTitle,
    guideModePrompt: state.guideModePrompt,
    intentText: state.intentText,
    currentHall: state.currentHall,
    preferredHallOrder: preferred,
    availableHalls: _availableHallSlugs(),
    interests: [
      'stage:11',
      'route_source:mini_program',
    ],
  }
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

  _planSeq: 0,
  onLoad: function () {
    this._refresh()
  },

  onShow: function () {
    if (!this.data.loaded) {
      this._refresh()
      return
    }
    if (!this.data.routeLoading) {
      this._requestAiRoute()
    }
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
      personaLabel: '本地兜底',
      tagline: '正在读取后端策展路线；网络不可用时保留这条本地可用路线。',
      routeSource: 'fallback',
      routeSourceLabel: '本地兜底路线',
      planSummary: '先按常设展厅顺序建立半坡遗址整体印象，再根据现场位置选择展厅。',
      routeNotice: 'AI 策展路线加载中',
      planning: false,
      routeLoading: true,
      aiRoutePending: true,
      loaded: true,
    })
    this._requestAiRoute()
  },

  _requestAiRoute: function () {
    var self = this
    var seq = ++this._planSeq
    var payload = _buildPlanPayload()
    console.log('[route] plan request', {
      seq: seq,
      persona: payload.persona,
      timeBudget: payload.timeBudget,
      focusTitle: payload.focusTitle,
      preferredHallOrder: payload.preferredHallOrder,
    })

    api.curatorApi.planTour(payload)
      .then(function (res) {
        if (seq !== self._planSeq) {
          console.log('[route] plan response ignored', { seq: seq, currentSeq: self._planSeq })
          return
        }
        if (!res || !res.ok || !res.data || !res.data.plan) {
          console.warn('[route] plan fallback', { status: res && res.status })
          self.setData({
            routeLoading: false,
            aiRoutePending: false,
            routeNotice: 'AI 路线暂不可用，已保留本地路线',
          })
          return
        }

        var route = res.data.route || {}
        var aiSteps = _normalizeRouteSteps(route)
        var steps = aiSteps.length ? aiSteps : _buildFixedSteps()
        var total = Number(route.total_minutes || res.data.available_time) || _totalMinutes(steps)
        var theme = route.theme || 'AI 策展路线'
        var summary = route.summary || res.data.plan || ''
        console.log('[route] plan response', {
          seq: seq,
          source: route.source || 'curator',
          theme: theme,
          steps: steps.length,
        })
        self.setData({
          steps: steps,
          stepsCount: steps.length,
          floorItems: _buildFloorItems(steps),
          totalDesc: '约 ' + total + ' 分钟',
          personaLabel: theme,
          tagline: summary,
          routeSource: 'curator',
          routeSourceLabel: 'AI 策展路线',
          planSummary: summary,
          routeNotice: '',
          routeLoading: false,
          aiRoutePending: false,
        })
      })
      .catch(function (err) {
        if (seq !== self._planSeq) return
        console.warn('[route] plan fallback', err)
        self.setData({
          routeLoading: false,
          aiRoutePending: false,
          routeNotice: 'AI 路线暂不可用，已保留本地路线',
        })
      })
  },

  startTour: function () {
    wx.redirectTo({ url: '/pages/hall/hall' })
  },
})
