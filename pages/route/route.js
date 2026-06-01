const api = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')

var HALLS = banpoHalls.HALLS_MAP

var PERSONA_ROUTES = {
  student: {
    label: '研学记录路线',
    tagline: '先建立观察框架，再整理成可复盘笔记',
    totalMin: 90,
    steps: [
      {
        hallId: 'site',
        min: 35,
        reason: '先看遗址空间。房屋、墓葬和公共空间最适合作为研学记录的第一组证据。',
        focus: '记录空间布局和关键遗迹',
      },
      {
        hallId: 'basic',
        min: 35,
        reason: '再看核心器物。陶器、石器和骨器能补充生产生活与技术能力的材料。',
        focus: '把展品用途写成笔记要点',
      },
      {
        hallId: 'education',
        min: 20,
        reason: '最后在教研空间整理问题，把看到的材料转化成可汇报的证据链。',
        focus: '形成自己的问题和小结',
      },
    ],
  },
  A: {
    label: '考古研究路线',
    tagline: '从证据出发，建立可解释的历史图景',
    totalMin: 110,
    steps: [
      {
        hallId: 'basic',
        min: 50,
        reason: '先看核心展品。人面鱼纹彩陶盆、尖底瓶、石器工具都是推理半坡社会的证据入口。',
        focus: '关注器物纹饰与制作工艺',
      },
      {
        hallId: 'site',
        min: 35,
        reason: '带着文物线索再看遗址，房屋、墓葬、作坊和灶台能验证刚才的推论。',
        focus: '测量与记录建筑结构细节',
      },
      {
        hallId: 'kiln',
        min: 25,
        reason: '用陶窑补上生产链条：器物不是自然出现的，而是由材料、火候和流程制造出来的。',
        focus: '观察制陶流程与烧成证据',
      },
    ],
  },
  artifact: {
    label: '器物观察路线',
    tagline: '从材料、器形、纹饰和痕迹理解文物',
    totalMin: 90,
    steps: [
      {
        hallId: 'basic',
        min: 40,
        reason: '器物研究员先看成品。材料、器形、纹样和使用痕迹能提示制作与使用选择。',
        focus: '观察材料、纹饰、器形和痕迹',
      },
      {
        hallId: 'kiln',
        min: 30,
        reason: '再看陶窑。只有看到窑炉和火候，才能理解陶器为什么能成型。',
        focus: '理解制坯、干燥和烧成流程',
      },
      {
        hallId: 'workshop',
        min: 20,
        reason: '最后进入工坊，把观察转化成手作经验。',
        focus: '用体验反推制作难点',
      },
    ],
  },
  historian: {
    label: '历史追问路线',
    tagline: '从半坡出发，追问史前社会和今天的关系',
    totalMin: 100,
    steps: [
      {
        hallId: 'site',
        min: 40,
        reason: '先看遗址整体。房屋、墓葬、壕沟和作坊的相对位置，是追问社会组织的重要材料。',
        focus: '从空间关系提出历史问题',
      },
      {
        hallId: 'basic',
        min: 40,
        reason: '再看器物差异。工具、装饰品和陶器能补充生活分工、审美和身份表达的线索。',
        focus: '比较器物背后的社会含义',
      },
      {
        hallId: 'education',
        min: 20,
        reason: '最后把观察整理成问题，继续讨论半坡为何重要、它与今天有什么关系。',
        focus: '形成自己的历史追问',
      },
    ],
  },
}
PERSONA_ROUTES.B = PERSONA_ROUTES.student
PERSONA_ROUTES.C = PERSONA_ROUTES.historian
PERSONA_ROUTES.D = PERSONA_ROUTES.artifact
PERSONA_ROUTES.default = PERSONA_ROUTES.student
PERSONA_ROUTES.resident = PERSONA_ROUTES.student
PERSONA_ROUTES.community = PERSONA_ROUTES.historian
PERSONA_ROUTES.artisan = PERSONA_ROUTES.artifact

function _personaKey(state) {
  return state.personaId || state.persona || 'student'
}

function _getVisitedHalls(state) {
  var seen = {}
  var visited = []
  function pushHall(hall) {
    var slug = banpoHalls.normalizeHallToSlug(hall)
    if (slug && !seen[slug]) {
      seen[slug] = true
      visited.push(slug)
    }
  }
  ;(state.visitedHalls || []).forEach(pushHall)
  ;(state.pendingEvents || []).forEach(function (ev) {
    if (ev.event_type === 'hall_enter' && ev.hall) pushHall(ev.hall)
  })
  return visited
}

function _buildSteps(personaKey, visitedHalls) {
  var config = PERSONA_ROUTES[personaKey] || PERSONA_ROUTES.B
  var visited = visitedHalls || []
  var currentIdx = -1

  for (var i = 0; i < config.steps.length; i++) {
    var hall = HALLS[config.steps[i].hallId]
    if (hall && visited.indexOf(hall.backendSlug) === -1) {
      currentIdx = i
      break
    }
  }

  return config.steps.map(function (step, idx) {
    var hall = HALLS[step.hallId]
    var hallSlug = hall ? hall.backendSlug : banpoHalls.normalizeHallToSlug(step.hallId)
    var isVisited = visited.indexOf(hallSlug) !== -1
    var isCurrent = idx === currentIdx
    var status = isVisited ? 'visited' : (isCurrent ? 'current' : 'upcoming')
    return {
      order: idx + 1,
      hallId: step.hallId,
      hallSlug: hallSlug,
      name: hall ? hall.name : banpoHalls.getHallDisplayName(hallSlug),
      highlights: hall ? hall.highlights : [],
      duration: '约 ' + step.min + ' 分钟',
      reason: step.reason,
      focus: step.focus,
      isVisited: isVisited,
      isCurrent: isCurrent,
      status: status,
    }
  })
}

function _buildFloorItems(steps) {
  var statusMap = {}
  steps.forEach(function (s) { statusMap[s.hallId || s.hallSlug] = s.status })
  var items = steps.slice(0, 3).map(function (step) {
    var hall = HALLS[step.hallId] || banpoHalls.getHallBySlug(step.hallSlug)
    var id = step.hallId || step.hallSlug
    return {
      id: id,
      short: hall ? hall.short : String(step.name || '').slice(0, 2),
      status: statusMap[id] || 'upcoming',
    }
  })
  while (items.length < 3) {
    items.push({ id: 'placeholder-' + items.length, short: '待定', status: 'upcoming' })
  }
  return items
}

function _isValidRoutePayload(route) {
  return !!(
    route &&
    Array.isArray(route.steps) &&
    route.steps.length >= 2 &&
    route.steps.length <= 5
  )
}

function _buildStepsFromCuratorRoute(route, visitedHalls) {
  var visited = visitedHalls || []
  var rawSteps = Array.isArray(route.steps) ? route.steps : []
  var currentIdx = -1

  for (var i = 0; i < rawSteps.length; i++) {
    var rawSlug = rawSteps[i].hall_slug || rawSteps[i].hallSlug || rawSteps[i].hall || rawSteps[i].hall_name
    var slug = banpoHalls.normalizeHallToSlug(rawSlug)
    if (slug && visited.indexOf(slug) === -1) {
      currentIdx = i
      break
    }
  }

  return rawSteps.map(function (raw, idx) {
    var rawSlug = raw.hall_slug || raw.hallSlug || raw.hall || raw.hall_name
    var slug = banpoHalls.normalizeHallToSlug(rawSlug)
    var hall = banpoHalls.getHallBySlug(slug)
    if (!hall) console.warn('[route] unknown curator hall slug:', rawSlug)

    var isVisited = visited.indexOf(slug) !== -1
    var isCurrent = idx === currentIdx
    var status = isVisited ? 'visited' : (isCurrent ? 'current' : 'upcoming')
    var estimated = Number(raw.estimated_minutes || raw.estimatedMinutes || 0)
    var questions = Array.isArray(raw.suggested_questions)
      ? raw.suggested_questions
      : (Array.isArray(raw.suggestedQuestions) ? raw.suggestedQuestions : [])

    return {
      order: Number(raw.order || idx + 1),
      hallId: hall ? hall.id : slug,
      hallSlug: slug,
      name: raw.hall_name || raw.hallName || (hall ? hall.name : banpoHalls.getHallDisplayName(slug)),
      title: raw.title || '',
      highlights: hall ? hall.highlights : questions,
      duration: '约 ' + (estimated || 20) + ' 分钟',
      estimatedMinutes: estimated || 20,
      reason: raw.reason || '',
      focus: raw.focus || '',
      suggestedQuestions: questions,
      isVisited: isVisited,
      isCurrent: isCurrent,
      status: status,
    }
  })
}

function _timeBudgetMinutes(state, fallbackMinutes) {
  var map = {
    quick: 30,
    dialogue: 60,
    research: 90,
    notebook: 60,
    '30': 30,
    '60': 60,
    '90': 90,
  }
  return map[state.timeBudget] || fallbackMinutes || 60
}

function _preferredHallNames(state) {
  return (state.preferredHallOrder || banpoHalls.DEFAULT_ORDER).map(function (id) {
    var hall = banpoHalls.getHall(id)
    return hall ? hall.name : id
  })
}

function _buildCuratorInterests(state, config) {
  var personaDef = tourStore.getPersonaDef ? tourStore.getPersonaDef() : null
  var backendPersona = tourStore.getBackendPersona ? tourStore.getBackendPersona() : (state.persona || 'B')
  var interests = [
    'persona=' + backendPersona,
    'persona_label=' + ((personaDef && personaDef.name) || config.label),
    'route_style=' + config.label,
  ]

  if (state.focusTitle) interests.push('focus=' + state.focusTitle)
  if (state.focusPrompt) interests.push('focus_prompt=' + state.focusPrompt)
  if (state.intentText) interests.push('intent=' + state.intentText)
  if (state.assumptionText) interests.push('assumption=' + state.assumptionText)
  if (state.guideModeTitle) interests.push('guide_mode=' + state.guideModeTitle)
  if (state.guideModePrompt) interests.push('guide_mode_prompt=' + state.guideModePrompt)
  if (state.currentHall) interests.push('current_hall=' + banpoHalls.getHallDisplayName(state.currentHall))
  interests.push('available_halls=' + _preferredHallNames(state).join(' / '))
  return interests
}

function _trimPlanText(text) {
  var plan = String(text || '').replace(/\n{3,}/g, '\n\n').trim()
  return plan.length > 260 ? plan.slice(0, 260) + '...' : plan
}

Page({
  data: {
    steps: [],
    floorItems: [],
    totalDesc: '',
    personaLabel: '',
    tagline: '',
    stepsCount: 0,
    routeSource: 'local',
    routeSourceLabel: '本地推荐路线',
    planSummary: '',
    planning: false,
    loaded: false,
  },

  _planSeq: 0,
  _lastPlanKey: '',

  onLoad: function () {
    this._refresh()
  },

  onShow: function () {
    this._refresh()
  },

  _refresh: function () {
    var state = tourStore.getTourState()
    var personaKey = _personaKey(state)
    var visitedHalls = _getVisitedHalls(state)
    var config = PERSONA_ROUTES[personaKey] || PERSONA_ROUTES.B
    var steps = _buildSteps(personaKey, visitedHalls)
    var floorItems = _buildFloorItems(steps)
    var planKey = JSON.stringify({
      sessionId: state.sessionId || '',
      persona: personaKey,
      timeBudget: state.timeBudget || '',
      visited: visitedHalls,
      focus: state.focusTitle || '',
      intent: state.intentText || '',
    })
    var shouldPlan = planKey !== this._lastPlanKey
    this._lastPlanKey = planKey

    this.setData({
      steps: steps,
      stepsCount: steps.length,
      floorItems: floorItems,
      totalDesc: '约 ' + _timeBudgetMinutes(state, config.totalMin) + ' 分钟',
      personaLabel: config.label,
      tagline: config.tagline,
      routeSource: shouldPlan ? 'local' : this.data.routeSource,
      routeSourceLabel: shouldPlan ? '本地推荐路线' : this.data.routeSourceLabel,
      planSummary: shouldPlan ? config.tagline : this.data.planSummary,
      planning: shouldPlan,
      loaded: true,
    })

    if (shouldPlan) this._loadCuratorPlan(state, config)
  },

  _loadCuratorPlan: function (state, config) {
    var self = this
    var seq = ++self._planSeq
    var availableTime = _timeBudgetMinutes(state, config.totalMin)
    var interests = _buildCuratorInterests(state, config)
    var personaDef = tourStore.getPersonaDef ? tourStore.getPersonaDef() : null
    var backendPersona = tourStore.getBackendPersona ? tourStore.getBackendPersona() : (state.persona || 'B')

    api.curatorApi.planTour({
      availableTime: availableTime,
      interests: interests,
      persona: backendPersona,
      personaId: state.personaId,
      personaLabel: (personaDef && personaDef.name) || config.label,
      timeBudget: state.timeBudget,
      focusTitle: state.focusTitle,
      focusPrompt: state.focusPrompt,
      assumptionText: state.assumptionText,
      guideModeTitle: state.guideModeTitle,
      guideModePrompt: state.guideModePrompt,
      intentText: state.intentText,
      currentHall: state.currentHall,
      preferredHallOrder: state.preferredHallOrder || banpoHalls.DEFAULT_ORDER,
    }).then(function (res) {
      if (seq !== self._planSeq) return
      var data = res && res.ok && res.data ? res.data : null
      var plan = data ? data.plan : ''
      var route = data ? data.route : null
      if (_isValidRoutePayload(route)) {
        var visitedHalls = _getVisitedHalls(tourStore.getTourState())
        var routeSteps = _buildStepsFromCuratorRoute(route, visitedHalls)
        self.setData({
          steps: routeSteps,
          stepsCount: routeSteps.length,
          floorItems: _buildFloorItems(routeSteps),
          totalDesc: '约 ' + (route.total_minutes || availableTime) + ' 分钟',
          personaLabel: route.theme || config.label,
          tagline: route.summary || config.tagline,
          routeSource: 'curator',
          routeSourceLabel: 'AI 策展路线',
          planSummary: route.summary || _trimPlanText(plan),
          planning: false,
        })
        return
      }
      if (plan) {
        self.setData({
          routeSource: 'hybrid',
          routeSourceLabel: 'AI 说明 + 本地路线',
          planSummary: _trimPlanText(plan),
          planning: false,
        })
        return
      }
      if (!plan) {
        self.setData({ planning: false, routeSource: 'local', routeSourceLabel: '本地推荐路线' })
        return
      }
    }).catch(function (err) {
      if (seq !== self._planSeq) return
      console.warn('[route] curator plan fallback:', err)
      self.setData({ planning: false, routeSource: 'local', routeSourceLabel: '本地推荐路线' })
    })
  },

  startTour: function () {
    wx.redirectTo({ url: '/pages/hall/hall' })
  },
})
