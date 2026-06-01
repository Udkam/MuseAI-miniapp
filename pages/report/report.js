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
    summaryPrefix: '你的路线更像一次小型田野观察：先确认遗迹和展品事实，再把问题放回证据链。',
    takeaways: [
      '把“看到什么”和“能推断什么”分开记录，后续追问会更准确。',
      '优先保留地层、房址、墓葬和器物使用痕迹这些可验证线索。',
    ],
    next: ['补看一个未到访展厅，验证现有判断是否只来自单一材料。', '选一件器物追问“证据从哪里来”，训练证据链表达。'],
  },
  B: {
    title: '半坡研学记录报告',
    tags: ['研学记录员', '观察任务', '复盘笔记'],
    summaryPrefix: '你的参观已经形成研学笔记的基本骨架：展厅、问题、证据点和下一步复盘方向。',
    takeaways: [
      '每个展厅保留一个关键词和一个问题，最适合整理成研学报告。',
      '把现场观察写成“展品名称 + 看到的细节 + 它说明什么”，比只写感受更有用。',
    ],
    next: ['回到最感兴趣的展厅，补记 3 个可拍照或可抄写的证据点。', '用“我原来以为...现在发现...”写一段研学反思。'],
  },
  C: {
    title: '半坡历史追问报告',
    tags: ['历史追问者', '文明起源', '公共问题'],
    summaryPrefix: '你的提问集中在半坡社会如何组织生活，以及这些遗存怎样进入今天的历史叙事。',
    takeaways: [
      '不要只问“是什么”，继续追问“为什么这样组织”“这对今天理解共同体有什么意义”。',
      '把半坡放进农业、定居、手工业和公共协作的长时段变化中，会更有历史纵深。',
    ],
    next: ['围绕“聚落如何协作”继续看遗址保护大厅或教研中心。', '把一个展品和今天的生活经验做比较，形成公共史学问题。'],
  },
  D: {
    title: '半坡器物观察报告',
    tags: ['器物研究员', '材料工艺', '纹饰用途'],
    summaryPrefix: '你的观察重点适合落在器物本身：材料、器形、纹饰、工艺和使用痕迹。',
    takeaways: [
      '观察器物时先看形状、口沿、底部和表面痕迹，再讨论用途。',
      '纹饰不一定只有审美意义，也可能关联身份、仪式或生活经验，需要谨慎推断。',
    ],
    next: ['选择一件陶器追问“它如何被制作出来”，把材料和工艺连起来。', '比较两件器物的形制差异，判断它们服务的生活场景。'],
  },
  default: {
    title: '半坡导览总结',
    tags: ['MuseAI 导览', '半坡遗址', '文化观察'],
    summaryPrefix: '你已经完成一次以半坡遗址为核心的导览观察。',
    takeaways: ['记录你最想继续追问的问题，会比一次性看完所有内容更有收获。'],
    next: ['选择一个未到访展厅继续探索。', '进入具体展品页，让 MuseAI 围绕一件器物展开讲解。'],
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
    .map(function (event) { return event.metadata && event.metadata.message ? event.metadata.message : '' })
    .filter(Boolean)
}

function collectExhibitNames(events) {
  return unique(events.map(function (event) {
    return event.metadata && event.metadata.exhibit_name ? event.metadata.exhibit_name : ''
  }).filter(Boolean))
}

function buildReviewChecklist(personaKey, hallNames, questions, exhibitNames) {
  var firstHall = hallNames[0] || '下一个展厅'
  var hasQuestion = questions.length > 0
  var hasExhibit = exhibitNames.length > 0
  var common = [
    {
      label: '补一条证据',
      text: hasQuestion
        ? '把你最想继续追问的问题，补上一件展品或一个遗迹细节作为证据。'
        : '在' + firstHall + '选择一个细节，记录“我看到什么，它能说明什么”。',
    },
    {
      label: '打开一件展品',
      text: hasExhibit
        ? '围绕已打开的展项继续追问用途、材料、位置或不确定性。'
        : '进入展品浏览页，选择一件具体展品后再生成报告，展品总结会更完整。',
    },
  ]
  var byPersona = {
    A: { label: '校准推断', text: '把推断写成“证据支持 / 仍不确定”两栏，避免只凭印象下结论。' },
    B: { label: '形成笔记', text: '按“展厅 - 展品 - 观察 - 小结”的格式整理，可直接变成研学记录。' },
    C: { label: '提出追问', text: '把半坡和今天的共同生活、劳动分工或公共空间联系起来，形成一个历史问题。' },
    D: { label: '细看器物', text: '从口沿、底部、纹饰、磨损和烧成痕迹中选两个细节比较。' },
    default: { label: '继续参观', text: '沿 AI 路线再看一个展厅，报告会自动补充到访和提问线索。' },
  }
  return [byPersona[personaKey] || byPersona.default].concat(common)
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
      : '本次还没有留下可复盘的提问，建议在下个展厅主动记录一个问题。'
    var exhibitPart = exhibitNames.length
      ? '你重点打开过 ' + exhibitNames.join('、') + '。'
      : '展品数为 0 通常表示你还没有进入具体展品页，或服务器展品清单尚未完成导入。'

    var journeySummary = copy.summaryPrefix + ' 本次到访：' + hallPart + '。' + questionPart + exhibitPart
    if (focusText) {
      journeySummary += ' 你的入口关注点是“' + focusText + '”，后续报告可继续围绕这个主题补充证据。'
    }

    var questionSummary = questions.length
      ? '本次保留下来的问题可作为后续复盘标题。优先选择最能连接展品细节和历史解释的问题继续追问。'
      : '你还没有形成明确问题。下一步可以用“这个展项说明了什么？”或“证据在哪里？”作为起点。'

    var highlights = []
    if (hallNames.length) highlights.push('到访展厅：' + hallNames.join('、'))
    if (questions.length) highlights.push('已记录问题：' + questions.length + ' 个')
    if (exhibitNames.length) highlights.push('重点展项：' + exhibitNames.join('、'))
    if (!highlights.length) highlights.push('导览刚开始，报告会随着展厅访问和提问逐步丰富。')

    var dataNotice = ''
    if (isLocalFallback) {
      dataNotice = '服务器报告暂不可用，当前内容根据本机游览记录整理。'
    } else if (!exhibitCount) {
      dataNotice = '展品数为 0 不是理想状态：可能是你未进入具体展品页，也可能是服务器展品清单尚未导入。展厅与问答总结仍可使用。'
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
      takeaways: copy.takeaways,
      nextSuggestions: copy.next,
      reviewChecklist: buildReviewChecklist(personaKey, hallNames, questions, exhibitNames),
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
