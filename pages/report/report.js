const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')

var RADAR_LABELS = {
  civilization_resonance: '文明线索',
  imagination_breadth:    '问题意识',
  history_collection:     '证据整理',
  life_experience:        '生活理解',
  ceramic_aesthetics:     '器物观察',
}

var FALLBACK_RADAR = [
  { label: '文明线索', value: 1, barWidth: 33 },
  { label: '问题意识', value: 1, barWidth: 33 },
  { label: '证据整理', value: 1, barWidth: 33 },
  { label: '生活理解', value: 1, barWidth: 33 },
  { label: '器物观察', value: 1, barWidth: 33 },
]

var REFLECTION_TOPIC_LABELS = {
  craft:      '器物工艺',
  settlement: '聚落空间',
  social:     '社会组织',
  spiritual:  '精神文化',
  life:       '日常生活',
  evidence:   '证据推理',
}

var PERSONA_INITIAL_FOCUS = {
  A: { key: 'evidence', text: '先看证据和推理过程' },
  B: { key: 'evidence', text: '把观察整理成可复盘的研学记录' },
  C: { key: 'social', text: '追问半坡与更大的历史问题' },
  D: { key: 'craft', text: '从器物材料、器形、纹饰和工艺进入半坡' },
  default: { key: 'evidence', text: '跟着现场证据形成判断' },
}

var TOPIC_KEYWORDS = {
  craft:      ['陶', '器', '工艺', '纹', '材料', '制作', '烧制', '陶窑', '尖底瓶', '彩陶', '石器', '骨器', '工具', '器形', '用途', '痕迹'],
  settlement: ['聚落', '房屋', '半地穴', '壕沟', '遗址', '空间', '布局', '作坊', '灶', '墓葬', '居住', '保护大厅'],
  social:     ['社会', '组织', '分工', '规则', '共同体', '协作', '等级', '贫富', '身份', '公共', '权力', '资源', '秩序'],
  spiritual:  ['精神', '信仰', '仪式', '审美', '象征', '人面', '鱼纹', '图案', '纹饰', '祭祀', '观念'],
  life:       ['生活', '吃', '食物', '农业', '农耕', '居住', '日常', '生存', '采集', '狩猎', '儿童', '家庭'],
  evidence:   ['证据', '推断', '不确定', '考古', '展签', '材料', '判断', '线索', '地层', '出土', '遗存'],
}

var HALL_TOPIC_WEIGHTS = {
  'basic-exhibition-hall': { craft: 1, life: 1, evidence: 1 },
  'site-protection-hall':  { settlement: 2, social: 1, evidence: 1 },
  'kiln-hall':             { craft: 2, evidence: 1 },
  'prehistoric-workshop':  { craft: 1, life: 1 },
  'education-center':      { evidence: 2 },
  'banpo-girl-sculpture':  { spiritual: 1, social: 1 },
  'peony-garden':          { life: 1 },
  'pottery-spirit-hall':   { craft: 2, spiritual: 1 },
  'site-archaeology-hall': { settlement: 2, social: 1 },
  'civilization-spark-hall': { evidence: 1, spiritual: 1 },
}

var HALL_NOTES = {
  'basic-exhibition-hall': '建立对半坡生活、器物和生产方式的基础认识。',
  'site-protection-hall': '把房屋、墓葬、壕沟等遗迹放回真实聚落空间中理解。',
  'temporary-hall-1': '临展内容需以现场展签为准，可记录当期主题和策展线索。',
  'temporary-hall-2': '临展内容需以现场展签为准，可比较它与基本陈列的差异。',
  'banpo-girl-sculpture': '适合作为半坡人物形象和公共记忆的观察点。',
  'prehistoric-workshop': '把工具、材料和手作体验转化成可复盘的学习记录。',
  'education-center': '适合整理问题清单、研学笔记和后续汇报结构。',
  'peony-garden': '作为休整与复盘空间，适合整理刚才的问题。',
  'kiln-hall': '从陶窑、烧成痕迹和制陶流程理解工艺链条。',
}

var PERSONA_REPORT_COPY = {
  A: {
    title: '半坡考古观察报告',
    tags: ['考古研究员', '证据链', '现场观察'],
    summaryPrefix: '这次记录偏向考古观察：先看遗迹、展厅和可验证材料，再整理能够支撑判断的线索。',
    takeaways: [
      '报告中最有价值的部分，是那些能从遗迹位置、出土材料或展品细节直接回到证据的问题。',
      '半坡不是单件文物的集合，房址、墓葬、工具和器物共同构成了可验证的生活现场。',
    ],
    next: ['如果记录主要集中在一个展厅，结论仍更像局部观察；空间遗迹、器物和生产线索之间的关系还没有完全展开。'],
  },
  B: {
    title: '半坡研学记录报告',
    tags: ['研学记录员', '观察任务', '复盘笔记'],
    summaryPrefix: '这次记录偏向研学整理：展厅到访、提问和观察点会被整理成可复盘的笔记线索。',
    takeaways: [
      '目前的报告价值在于把“看过哪些展厅”和“留下了哪些问题”连在一起，而不是只保留游览顺序。',
      '当提问能落到一件展品、一处遗迹或一个生活场景上，研学记录会更像一份可复查的观察材料。',
    ],
    next: ['如果展品记录为空，报告仍能总结路线和问题，但还缺少可引用的具体材料。'],
  },
  C: {
    title: '半坡历史追问报告',
    tags: ['历史追问者', '文明起源', '公共问题'],
    summaryPrefix: '这次记录偏向历史追问：重点不是把展品逐个看完，而是看半坡社会如何被遗存重新说明。',
    takeaways: [
      '半坡的历史意义会从定居、农业、手工业和公共协作之间显现出来。',
      '当问题从“这是什么”转向“它说明了怎样的共同生活”，报告就开始具有公共史学的线索。',
    ],
    next: ['如果本次主要看器物而少看遗址空间，社会组织和公共生活这一层还会比较薄。'],
  },
  D: {
    title: '半坡器物观察报告',
    tags: ['器物研究员', '材料工艺', '纹饰用途'],
    summaryPrefix: '这次记录偏向器物观察：材料、器形、纹饰、工艺和使用痕迹是报告的主要入口。',
    takeaways: [
      '器物不是孤立的“好看物件”，它们会把制作技术、使用场景和生活需求连在一起。',
      '纹饰、磨损、器形和材料都能成为线索，但它们需要和出土位置、展厅叙事一起理解。',
    ],
    next: ['如果还没有打开具体展品，报告只能停留在展厅层面的器物观察，无法展开单件器物的细节判断。'],
  },
  default: {
    title: '半坡导览总结',
    tags: ['MuseAI 导览', '半坡遗址', '文化观察'],
    summaryPrefix: '这次记录围绕半坡遗址展开，报告会把展厅、问题和具体展项整理为一条游览线索。',
    takeaways: ['当前最清楚的内容，是你实际到访过的展厅和已经留下的提问。'],
    next: ['尚未到访或尚未打开具体展品的部分，会在报告中保持空白，不强行生成结论。'],
  },
}

function normalizePersonaKey(state) {
  var id = state.personaId || state.persona || 'default'
  if (id === 'student' || id === 'resident' || id === 'B') return 'B'
  if (id === 'historian' || id === 'community' || id === 'C') return 'C'
  if (id === 'artifact' || id === 'artisan' || id === 'D') return 'D'
  if (id === 'A') return 'A'
  return 'default'
}

function unique(list) {
  var seen = {}
  var out = []
  list.forEach(function (item) {
    if (!item || seen[item]) return
    seen[item] = true
    out.push(item)
  })
  return out
}

function hallDisplay(value) {
  return value ? banpoHalls.getHallDisplayName(value) : ''
}

function hallSlug(value) {
  return value ? banpoHalls.normalizeHallToSlug(value) : ''
}

function buildRadarBars(scores) {
  var bars = []
  if (scores && typeof scores === 'object') {
    Object.keys(scores).forEach(function (key) {
      var raw = Math.min(3, Math.max(1, Math.round(Number(scores[key])) || 1))
      bars.push({
        label:    RADAR_LABELS[key] || key,
        value:    raw,
        barWidth: Math.round((raw / 3) * 100),
      })
    })
  }
  return bars.length ? bars : FALLBACK_RADAR.slice()
}

function collectHallSlugs(data, events, state) {
  var backendHalls = Array.isArray(data && data.halls_visited) ? data.halls_visited : []
  var eventHalls = []
  events.forEach(function (event) {
    var type = event.event_type || event.eventType
    if ((type === 'hall_enter' || type === 'hall_leave') && event.hall) eventHalls.push(event.hall)
  })
  var halls = backendHalls.concat(eventHalls)
  if (!halls.length && Array.isArray(state.visitedHalls)) halls = halls.concat(state.visitedHalls)
  if (!halls.length && state.currentHall) halls.push(state.currentHall)
  return unique(halls.map(hallSlug))
}

function collectQuestions(events) {
  return events
    .filter(function (event) { return event.event_type === 'exhibit_question' || event.eventType === 'exhibit_question' })
    .map(function (event) {
      return event.metadata && (event.metadata.message || event.metadata.question)
        ? (event.metadata.message || event.metadata.question)
        : ''
    })
    .filter(Boolean)
}

function collectExhibitNames(events) {
  return unique(events.map(function (event) {
    return event.metadata && event.metadata.exhibit_name ? event.metadata.exhibit_name : ''
  }).filter(Boolean))
}

function buildObservationFindings(personaKey, hallNames, questions, exhibitNames, focusText) {
  var copy = PERSONA_REPORT_COPY[personaKey] || PERSONA_REPORT_COPY.default
  var findings = copy.takeaways.slice(0, 1)
  if (hallNames.length) {
    findings.push('本次已经形成展厅层面的观察范围：' + hallNames.join('、') + '。')
  }
  if (questions.length) {
    findings.push('问题线索中最明确的一条是：“' + questions[0] + '”。')
  }
  if (exhibitNames.length) {
    findings.push('展项层面的材料来自：' + exhibitNames.join('、') + '。')
  }
  if (focusText) {
    findings.push('入口关注点“' + focusText + '”已经成为这份报告的解释角度。')
  }
  if (!hallNames.length && !questions.length && !exhibitNames.length) {
    findings = ['当前记录还停留在导览入口阶段，报告暂时只能保留身份、路线和基础统计。']
  }
  return findings.slice(0, 3)
}

function buildOpenThreads(personaKey, hallSlugs, questions, exhibitNames) {
  var copy = PERSONA_REPORT_COPY[personaKey] || PERSONA_REPORT_COPY.default
  var visited = {}
  hallSlugs.forEach(function (slug) { visited[slug] = true })
  var unvisitedNames = []
  banpoHalls.DEFAULT_ORDER.forEach(function (id) {
    var hall = banpoHalls.getHall(id)
    if (hall && !visited[hall.backendSlug]) unvisitedNames.push(hall.name)
  })

  var threads = []
  if (unvisitedNames.length) {
    threads.push('尚未纳入记录的常设空间包括：' + unvisitedNames.slice(0, 3).join('、') + (unvisitedNames.length > 3 ? '等' : '') + '。这些部分会影响报告对半坡生活系统的完整度。')
  }
  if (!questions.length) {
    threads.push('问题线索暂为空，因此报告无法判断你最在意的是器物、聚落、社会组织还是精神文化。')
  }
  if (!exhibitNames.length) {
    threads.push('具体展项暂为空，因此单件器物的材料、用途和纹饰解释还没有进入报告。')
  }
  if (!threads.length) {
    threads.push('展厅、提问和展项都已有记录，报告已经具备较完整的复盘依据。')
  }
  return threads.concat(copy.next || []).slice(0, 3)
}

function buildReviewChecklist(personaKey, hallNames, questions, exhibitNames) {
  var hasQuestion = questions.length > 0
  var hasExhibit = exhibitNames.length > 0
  return [
    {
      label: '展厅依据',
      text: hallNames.length
        ? '已记录到访：' + hallNames.join('、') + '。'
        : '尚未记录到明确到访展厅，当前报告只能依据入口身份和本机状态整理。',
    },
    {
      label: '提问依据',
      text: hasQuestion
        ? '已保留 ' + questions.length + ' 条提问，报告会优先围绕这些问题整理。'
        : '尚未记录到用户提问，因此问题线索暂为空。',
    },
    {
      label: '展项依据',
      text: hasExhibit
        ? '已打开展项：' + exhibitNames.join('、') + '。'
        : '尚未记录到具体展项浏览，展品层面的总结暂不展开。',
    },
  ]
}

function matchTopics(text) {
  var matched = []
  if (!text) return matched
  Object.keys(TOPIC_KEYWORDS).forEach(function (topic) {
    var keywords = TOPIC_KEYWORDS[topic]
    for (var i = 0; i < keywords.length; i++) {
      if (String(text).indexOf(keywords[i]) >= 0) {
        matched.push(topic)
        return
      }
    }
  })
  return matched
}

function buildLocalReflection(data, events, state, personaKey) {
  var initial = PERSONA_INITIAL_FOCUS[personaKey] || PERSONA_INITIAL_FOCUS.default
  var assumptionText = state.assumptionText || '你选择先跟着现场证据形成判断。'
  var scores = { craft: 0, settlement: 0, social: 0, spiritual: 0, life: 0, evidence: 0 }
  var questionCount = 0
  var deepDiveCount = 0

  ;(events || []).forEach(function (event) {
    var type = event.event_type || event.eventType || ''
    var meta = event.metadata || {}
    var hall = hallSlug(event.hall || '')
    var text = [hall, meta.message || '', meta.question || '', meta.exhibit_name || ''].join(' ')
    var weight = 0.5
    if (type === 'exhibit_question') { questionCount += 1; weight = 3 }
    else if (type === 'exhibit_deep_dive') { deepDiveCount += 1; weight = 3 }
    else if (type === 'exhibit_view') weight = 1
    else if (type === 'hall_enter' || type === 'hall_leave') weight = 0.75

    var hallWeights = HALL_TOPIC_WEIGHTS[hall] || {}
    Object.keys(hallWeights).forEach(function (topic) {
      scores[topic] += hallWeights[topic] * weight
    })
    matchTopics(text).forEach(function (topic) {
      scores[topic] += weight
    })
  })

  var signals = questionCount + deepDiveCount
  if (signals < 2) {
    return {
      initial_assumption: initial.text + '；入场判断是：' + assumptionText,
      observed_focus: '目前只记录到少量提问或深入查看，更多是展厅到访线索。',
      change_summary: '证据不足，暂时不能判断你的关注点是否发生了明显变化。建议再围绕一个展厅或展项提出至少两个问题。',
      confidence: 0.35,
      status: 'insufficient',
    }
  }

  var topTopic = 'evidence'
  Object.keys(scores).forEach(function (topic) {
    if (scores[topic] > scores[topTopic]) topTopic = topic
  })
  var observedLabel = REFLECTION_TOPIC_LABELS[topTopic] || topTopic
  var initialLabel = REFLECTION_TOPIC_LABELS[initial.key] || initial.key
  var totalScore = Object.keys(scores).reduce(function (sum, key) { return sum + scores[key] }, 0) || 1
  var confidence = Math.min(0.92, 0.5 + (scores[topTopic] / totalScore) * 0.3 + Math.min(signals, 6) * 0.03)

  return {
    initial_assumption: initial.text + '；入场判断是：' + assumptionText,
    observed_focus: '你的提问和深入查看主要集中在' + observedLabel + '。',
    change_summary: topTopic === initial.key
      ? '关注点基本保持稳定：你从' + initialLabel + '进入导览，过程中也持续围绕这一方向积累证据。'
      : '关注点出现了转向：你从' + initialLabel + '进入导览，但过程中更频繁地追问' + observedLabel + '，说明新的证据正在改变你的观察重心。',
    confidence: Math.round(confidence * 100) / 100,
    status: topTopic === initial.key ? 'stable' : 'shifted',
  }
}

Page({
  data: {
    isLoading:    true,
    isReady:      false,
    loadError:    false,

    persona:      '',
    reportTitle:  '',
    reportTheme:  '',
    oneLiner:     '',
    identityTags: [],

    stats: {
      halls:    '-',
      exhibits: '-',
      messages: '-',
      duration: '-',
    },

    journeySummary: '',
    visitedHallCards: [],
    questionSummary: '',
    questionSamples: [],
    takeaways: [],
    nextSuggestions: [],
    reviewChecklist: [],
    reflection: null,
    dataNotice: '',

    radarBars: [],
    highlights: [],
  },

  onLoad: function () {
    var self  = this
    var state = tourStore.getTourState()
    var personaKey = normalizePersonaKey(state)
    var copy = PERSONA_REPORT_COPY[personaKey] || PERSONA_REPORT_COPY.default

    self.setData({
      persona:     tourStore.getPersonaLabel() || copy.tags[0],
      reportTitle: tourStore.getReportThemeTitle() || copy.title,
      isLoading:   true,
      isReady:     false,
    })

    var id    = state.sessionId
    var token = state.sessionToken
    if (!id) {
      self._applyFallback(false, state.pendingEvents || [])
      return
    }
    self._flushThenGenerate(id, token)
  },

  _flushThenGenerate: function (id, token) {
    var self   = this
    var events = tourStore.drainPendingEvents()

    var _generate = function () {
      wx.showLoading({ title: '正在整理报告…', mask: true })

      api.tourApi.generateReport(id, token)
        .then(function (genRes) {
          if (genRes.ok && genRes.data && genRes.data.one_liner) {
            return genRes
          }
          return api.tourApi.getReport(id, token)
        })
        .then(function (res) {
          wx.hideLoading()
          if (res && res.ok && res.data) {
            self._applyReport(res.data, events)
          } else {
            self._applyFallback(true, events)
          }
        })
        .catch(function (err) {
          wx.hideLoading()
          console.error('[report] generate/get error:', err)
          self._applyFallback(true, events)
        })
    }

    if (!events.length) {
      _generate()
      return
    }

    // Do not block report generation on analytics/event upload. On weak networks
    // wx.request can hit the 10s timeout, making the report button appear dead.
    api.tourApi.recordEvents(id, events, token)
      .then(function (res) {
        if (!res || !res.ok) {
          console.warn('[report] flush events returned non-ok, restoring:', res && res.status)
          tourStore.restorePendingEvents(events)
        }
      })
      .catch(function (err) {
        console.warn('[report] flush events failed, restoring:', err)
        tourStore.restorePendingEvents(events)
      })
    _generate()
  },

  _applyReport: function (data, localEvents) {
    var events = localEvents || []
    var state = tourStore.getTourState()
    var experience = this._buildExperience(data || {}, events, false)
    var radarBars = buildRadarBars(data.radar_scores)
    var dur = data.total_duration_minutes != null
      ? Math.round(data.total_duration_minutes) + ' 分钟'
      : experience.estimatedDuration

    this.setData({
      isLoading:    false,
      isReady:      true,
      loadError:    false,
      reportTheme:  data.report_theme || '',
      oneLiner:     data.one_liner || experience.oneLiner,
      identityTags: Array.isArray(data.identity_tags) && data.identity_tags.length ? data.identity_tags : experience.identityTags,
      stats: {
        halls:    String(experience.hallCount || 0),
        exhibits: data.total_exhibits_viewed != null ? String(data.total_exhibits_viewed) : String(experience.exhibitCount || 0),
        messages: data.total_questions != null ? String(data.total_questions) : String(experience.questionCount || 0),
        duration: dur,
      },
      journeySummary: experience.journeySummary,
      visitedHallCards: experience.visitedHallCards,
      questionSummary: experience.questionSummary,
      questionSamples: experience.questionSamples,
      takeaways: experience.takeaways,
      nextSuggestions: experience.nextSuggestions,
      reviewChecklist: experience.reviewChecklist,
      reflection: data.reflection || experience.reflection,
      dataNotice: experience.dataNotice,
      radarBars: radarBars,
      highlights: experience.highlights,
      reportTitle: tourStore.getReportThemeTitle() || this.data.reportTitle,
      persona: tourStore.getPersonaLabel() || this.data.persona,
    })
  },

  _buildExperience: function (data, events, isLocalFallback) {
    var state = tourStore.getTourState()
    var personaKey = normalizePersonaKey(state)
    var copy = PERSONA_REPORT_COPY[personaKey] || PERSONA_REPORT_COPY.default
    var hallSlugs = collectHallSlugs(data, events, state)
    var hallNames = unique(hallSlugs.map(hallDisplay).filter(Boolean))
    var questions = collectQuestions(events)
    var exhibitNames = collectExhibitNames(events)
    var questionCount = data.total_questions != null ? Number(data.total_questions) : questions.length
    var exhibitCount = data.total_exhibits_viewed != null ? Number(data.total_exhibits_viewed) : exhibitNames.length
    var hallCount = hallNames.length
    var currentHallName = state.currentHall ? hallDisplay(state.currentHall) : ''
    var focusText = state.focusTitle || state.intentText || ''

    if (!hallNames.length && currentHallName) {
      hallNames.push(currentHallName)
      hallCount = hallNames.length
    }

    var visitedHallCards = hallSlugs.map(function (slug) {
      return { name: hallDisplay(slug), note: HALL_NOTES[slug] || '记录该展厅中的关键展项和现场问题。' }
    })

    var firstHall = hallNames[0] || '半坡遗址'
    var hallPart = hallNames.length > 1 ? hallNames.join('、') : firstHall
    var questionPart = questions.length
      ? '你提出的问题集中在“' + questions[0] + '”等线索上。'
      : '本次没有留下明确提问，报告会更多依赖到访展厅和路线记录。'
    var exhibitPart = exhibitNames.length
      ? '你重点打开过 ' + exhibitNames.join('、') + '。'
      : '当前没有具体展项记录，单件器物层面的判断暂不展开。'

    var journeySummary = copy.summaryPrefix + ' 本次到访：' + hallPart + '。' + questionPart + exhibitPart
    if (focusText) {
      journeySummary += ' 入口关注点“' + focusText + '”构成了本次报告的解释角度。'
    }

    var questionSummary = questions.length
      ? '本次留下 ' + questions.length + ' 条提问，问题已经开始从“看见什么”转向“这些材料说明什么”。'
      : '本次没有记录到明确提问，因此这一栏只保留为空白事实，不替你生成假问题。'

    var highlights = []
    if (hallNames.length) highlights.push('到访展厅：' + hallNames.join('、'))
    if (questions.length) highlights.push('已记录问题：' + questions.length + ' 个')
    if (exhibitNames.length) highlights.push('重点展项：' + exhibitNames.join('、'))
    if (!highlights.length) highlights.push('导览刚开始，报告会随着展厅访问和提问逐步丰富。')

    var dataNotice = ''
    if (isLocalFallback) {
      dataNotice = '服务器报告暂不可用，当前内容根据本机游览记录整理。'
    } else if (!exhibitCount) {
      dataNotice = '展项记录暂为空：本报告主要依据展厅访问和问答整理，暂不展开单件器物统计。'
    }

    return {
      identityTags: Array.isArray(data.identity_tags) && data.identity_tags.length ? data.identity_tags : copy.tags,
      oneLiner: data.one_liner || (hallNames.length ? '这次参观已经从“看过”变成了可复盘的观察记录。' : '从一个问题开始，比匆忙看完更重要。'),
      hallCount: hallCount,
      exhibitCount: exhibitCount,
      questionCount: questionCount,
      estimatedDuration: data.total_duration_minutes != null ? Math.round(data.total_duration_minutes) + ' 分钟' : '-',
      journeySummary: journeySummary,
      visitedHallCards: visitedHallCards,
      questionSummary: questionSummary,
      questionSamples: questions.slice(0, 3),
      takeaways: buildObservationFindings(personaKey, hallNames, questions, exhibitNames, focusText),
      nextSuggestions: buildOpenThreads(personaKey, hallSlugs, questions, exhibitNames),
      reviewChecklist: buildReviewChecklist(personaKey, hallNames, questions, exhibitNames),
      reflection: buildLocalReflection(data, events, state, personaKey),
      dataNotice: dataNotice,
      highlights: highlights,
    }
  },

  _applyFallback: function (showToast, localEvents) {
    if (showToast) {
      wx.showToast({ title: '报告接口暂不可用，已用本地记录整理', icon: 'none', duration: 3000 })
    }
    var experience = this._buildExperience({}, localEvents || [], !!showToast)
    var state = tourStore.getTourState()
    var copy = PERSONA_REPORT_COPY[normalizePersonaKey(state)] || PERSONA_REPORT_COPY.default

    this.setData({
      isLoading:    false,
      isReady:      true,
      loadError:    !!showToast,
      oneLiner:     experience.oneLiner,
      identityTags: experience.identityTags,
      reportTitle:  tourStore.getReportThemeTitle() || copy.title,
      persona:      tourStore.getPersonaLabel() || copy.tags[0],
      stats: {
        halls:    String(experience.hallCount || 0),
        exhibits: String(experience.exhibitCount || 0),
        messages: String(experience.questionCount || 0),
        duration: experience.estimatedDuration,
      },
      journeySummary: experience.journeySummary,
      visitedHallCards: experience.visitedHallCards,
      questionSummary: experience.questionSummary,
      questionSamples: experience.questionSamples,
      takeaways: experience.takeaways,
      nextSuggestions: experience.nextSuggestions,
      reviewChecklist: experience.reviewChecklist,
      reflection: experience.reflection,
      dataNotice: experience.dataNotice,
      radarBars: FALLBACK_RADAR.slice(),
      highlights: experience.highlights,
    })
  },

  goHome: function () {
    tourStore.clearTour()
    wx.reLaunch({ url: '/pages/home/home' })
  },

  shareReport: function () {
    wx.showToast({ title: '分享功能即将上线', icon: 'none' })
  },
})
