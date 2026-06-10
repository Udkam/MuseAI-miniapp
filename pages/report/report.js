const api       = require('../../api/index')
const tourStore = require('../../store/tour')
const chatStore = require('../../store/chat')
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
  if (id === 'A' || id === 'B' || id === 'C' || id === 'D') return id
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

function recordDedupeKey(parts) {
  return (parts || [])
    .map(function (item) { return stripMarkdown(item || '') })
    .join('|')
    .replace(/\s+/g, '')
    .slice(0, 260)
}

function eventClientKey(event, fallbackParts) {
  var meta = event && event.metadata ? event.metadata : {}
  return meta.client_event_id || recordDedupeKey(fallbackParts)
}

var VISITED_HALL_EVENT_TYPES = {
  exhibit_question: true,
  assistant_answer: true,
  exhibit_view: true,
  exhibit_deep_dive: true,
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
    if (!VISITED_HALL_EVENT_TYPES[type]) return
    var meta = event.metadata || {}
    if (event.hall) eventHalls.push(event.hall)
    if (meta.hall) eventHalls.push(meta.hall)
    if (meta.hall_slug) eventHalls.push(meta.hall_slug)
    if (meta.hallSlug) eventHalls.push(meta.hallSlug)
  })
  var halls = backendHalls.concat(eventHalls)
  return unique(halls.map(hallSlug))
}

function collectQuestions(events) {
  var seen = {}
  var out = []
  events.forEach(function (event) {
    var type = event.event_type || event.eventType
    if (type !== 'exhibit_question') return
    var meta = event.metadata || {}
    var question = meta.message || meta.question || ''
    if (!question) return
    var key = eventClientKey(event, [type, event.hall || meta.hall || '', question])
    if (seen[key]) return
    seen[key] = true
    out.push(question)
  })
  return out
}

function collectExhibitNames(events) {
  return unique(events.map(function (event) {
    return event.metadata && event.metadata.exhibit_name ? event.metadata.exhibit_name : ''
  }).filter(Boolean))
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(text, maxLen) {
  var value = stripMarkdown(text)
  if (!value) return ''
  var sentence = value.split(/[。！？；]/)[0] || value
  if (sentence.length < 18 && value.length > sentence.length) {
    sentence = value.slice(0, maxLen || 80)
  }
  if (sentence.length > (maxLen || 80)) sentence = sentence.slice(0, maxLen || 80) + '…'
  return sentence
}

function compactParagraph(text, maxLen) {
  var value = stripMarkdown(text)
  if (!value) return ''
  var limit = maxLen || 260
  if (value.length > limit) return value.slice(0, limit).replace(/[，。；、\s]+$/g, '') + '…'
  return value
}

function addUnique(list, value) {
  var v = String(value || '').trim()
  if (v && list.indexOf(v) === -1) list.push(v)
}

function collectFocusPhrases(questionText, answerText, topicLabel) {
  var text = stripMarkdown([questionText, answerText].join(' '))
  var phrases = []
  if (/石器|骨器|工具|用途/.test(text)) addUnique(phrases, '石器骨器用途')
  if (/文物|类型|展示|展厅/.test(text)) addUnique(phrases, '文物类型')
  if (/动手|体验|技术|制作|步骤/.test(text)) addUnique(phrases, '动手体验与技术理解')
  if (/陶|彩陶|陶器|器形|纹饰|工艺|烧制/.test(text)) addUnique(phrases, '器物工艺')
  if (/房屋|聚落|遗址|壕沟|布局|半地穴/.test(text)) addUnique(phrases, '聚落空间')
  if (/人面|鱼纹|图案|信仰|仪式|观念/.test(text)) addUnique(phrases, '图案与观念')
  if (/生活|先民|日常|生产|定居/.test(text)) addUnique(phrases, '半坡生活方式')
  if (!phrases.length) addUnique(phrases, topicLabel || '证据线索')
  return phrases.slice(0, 4)
}

function collectKnowledgePhrases(answerText, topicLabel) {
  var text = stripMarkdown(answerText)
  var phrases = []
  if (/石器|骨器|工具/.test(text)) addUnique(phrases, '石器、骨器和工具可对应加工、制作与生产分工')
  if (/陶|彩陶|陶器|器形|纹饰|烧制/.test(text)) addUnique(phrases, '陶器可从器形、纹饰和制作痕迹理解用途')
  if (/房屋|聚落|遗址|壕沟|半地穴|布局/.test(text)) addUnique(phrases, '房屋、壕沟等遗迹能说明聚落布局')
  if (/人面|鱼纹|图案|信仰|仪式|观念/.test(text)) addUnique(phrases, '人面鱼纹等图案关联审美、仪式与观念')
  if (/动手|体验|技术|制作|步骤|材料/.test(text)) addUnique(phrases, '动手体验能把材料、步骤和工具关系具体化')
  if (/生活|定居|生产|日常|先民/.test(text)) addUnique(phrases, '出土文物反映定居、生产和日常生活方式')
  if (!phrases.length) addUnique(phrases, (topicLabel || '证据线索') + '需要回到展品、展签和遗迹位置核对')
  return phrases.slice(0, 3)
}

function appendSummarySentence(parts, sentence, maxLen) {
  if (!sentence) return
  var current = parts.join('')
  if ((current + sentence).length <= (maxLen || 300)) parts.push(sentence)
}

function joinSummaryPhrases(phrases) {
  var list = (phrases || []).filter(Boolean)
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return list[0] + '和' + list[1]
  return list.slice(0, -1).join('、') + '和' + list[list.length - 1]
}

function buildRecordSummaryPoint(hallText, questionText, answerText, topicLabel) {
  var focusPhrases = collectFocusPhrases(questionText, answerText, topicLabel)
  var knowledgePhrases = collectKnowledgePhrases(answerText, topicLabel)
  var subject = hallText && hallText !== '半坡遗址' ? hallText + '这段记录' : '这次参观'
  var focusText = joinSummaryPhrases(focusPhrases)
  var knowledgeText = joinSummaryPhrases(knowledgePhrases)
  var parts = []
  appendSummarySentence(parts, subject + '主要留下这些线索：' + knowledgeText + '。', 300)
  appendSummarySentence(parts, '提问中的' + focusText + '，可在展柜、展签和遗迹位置继续核对。', 300)
  return parts.join('')
}

function extractKnowledgePoint(answer) {
  var text = stripMarkdown(answer)
  if (!text) return ''
  var markers = ['说明', '反映', '表明', '意味着', '关键在于', '可以看出', '直接证据']
  var sentences = text.split(/[。！？；]/).map(function (item) { return item.trim() }).filter(Boolean)
  for (var i = 0; i < sentences.length; i++) {
    for (var j = 0; j < markers.length; j++) {
      if (sentences[i].indexOf(markers[j]) >= 0) return compactText(sentences[i], 86)
    }
  }
  return compactText(sentences[0] || text, 86)
}

function collectRecordTerms(question, answer, limit) {
  var text = stripMarkdown([question, answer].join(' '))
  var terms = []
  function add(value) {
    var v = String(value || '').trim()
    if (!v || v.length < 2 || v.length > 14) return
    if (terms.indexOf(v) === -1) terms.push(v)
  }

  ;(String(question || '') + ' ' + String(answer || '')).replace(/《([^》]{2,14})》/g, function (_, item) { add(item); return _ })
  Object.keys(TOPIC_KEYWORDS).forEach(function (topic) {
    TOPIC_KEYWORDS[topic].forEach(function (keyword) {
      if (text.indexOf(keyword) >= 0) add(keyword)
    })
  })
  return terms.slice(0, limit || 4)
}

function inferTopTopicFromText(question, answer, events) {
  var scores = { craft: 0, settlement: 0, social: 0, spiritual: 0, life: 0, evidence: 0 }
  matchTopics([question, answer].join(' ')).forEach(function (topic) { scores[topic] += 3 })
  collectHallSlugs({}, events || [], tourStore.getTourState()).forEach(function (slug) {
    var weights = HALL_TOPIC_WEIGHTS[slug] || {}
    Object.keys(weights).forEach(function (topic) { scores[topic] += weights[topic] })
  })
  var top = 'evidence'
  Object.keys(scores).forEach(function (topic) {
    if (scores[topic] > scores[top]) top = topic
  })
  return top
}

function buildIntegratedRecordNote(question, answer, events) {
  var q = compactText(question, 42)
  var top = inferTopTopicFromText(question, answer, events)
  var topicLabel = REFLECTION_TOPIC_LABELS[top] || '证据线索'
  var terms = collectRecordTerms(question, answer, 4)
  var termText = terms.length ? '围绕' + terms.join('、') + '，' : ''
  var evidence = extractKnowledgePoint(answer)
  var topicCopy = {
    craft: '这条记录把器物形态、制作痕迹和使用场景放在一起，可继续核对它们怎样支持生产与生活判断。',
    settlement: '这条记录把可见遗迹、空间布局和功能推断连在一起，重点是区分现场证据与合理解释。',
    social: '这条记录把分工、协作和公共生活放入讨论，适合继续追问半坡社会如何被遗存说明。',
    spiritual: '这条记录把图案、形象和观念解释联系起来，需要同时保留证据边界和多种可能性。',
    life: '这条记录把食物、居住、劳动和工具联系起来，更适合还原日常生活的具体环节。',
    evidence: '这条记录适合整理为证据链：先说明能直接看到什么，再说明哪些属于推断。',
  }
  var point = termText + (topicCopy[top] || topicCopy.evidence)
  if (evidence) point += ' 其中较清楚的依据是：' + compactText(evidence, 58) + '。'
  return {
    question: '围绕：' + (q || topicLabel),
    point: point,
  }
}

function buildAggregatedRecordNotes(pairs, events) {
  var uniquePairs = []
  var seen = {}
  ;(pairs || []).forEach(function (pair) {
    if (!pair || !pair.question) return
    var slug = pair.hall || tourStore.getTourState().currentHall || ''
    var key = recordDedupeKey([slug, pair.question])
    if (seen[key]) {
      if (!seen[key].answer && pair.answer) seen[key].answer = pair.answer
      return
    }
    var item = {
      question: pair.question,
      answer: pair.answer || '',
      hall: slug,
    }
    seen[key] = item
    uniquePairs.push(item)
  })
  if (!uniquePairs.length) return []

  var hallNames = unique(uniquePairs.map(function (pair) {
    return pair.hall ? hallDisplay(pair.hall) : ''
  }).filter(Boolean))
  var hallText = hallNames.length ? hallNames.join('、') : '半坡遗址'
  var questionText = uniquePairs.map(function (pair) { return pair.question }).filter(Boolean).join(' ')
  var answerText = uniquePairs.map(function (pair) { return pair.answer }).filter(Boolean).join(' ')
  var topic = inferTopTopicFromText(
    questionText,
    answerText,
    events
  )
  var topicLabel = REFLECTION_TOPIC_LABELS[topic] || '证据线索'
  var point = buildRecordSummaryPoint(hallText, questionText, answerText, topicLabel)
  return [{ question: '游览记录摘要', point: point }]
}

function collectEventRecordPairs(events) {
  var seen = {}
  var pairs = []
  ;(events || []).forEach(function (event) {
    var type = event.event_type || event.eventType
    if (type !== 'assistant_answer' && type !== 'exhibit_question') return
    var meta = event.metadata || {}
    var question = meta.question || meta.message || ''
    var answer = type === 'assistant_answer' ? (meta.answer || '') : ''
    if (!question) return
    var hall = hallSlug(event.hall || meta.hall || meta.hall_slug || meta.hallSlug || '')
    var key = recordDedupeKey([hall, question])
    if (seen[key]) {
      if (!seen[key].answer && answer) seen[key].answer = answer
      return
    }
    var item = { question: question, answer: answer, hall: hall }
    seen[key] = item
    pairs.push(item)
  })
  return pairs
}

function inferQuestionRecordPoint(question, events) {
  var q = stripMarkdown(question)
  if (!q) return ''
  var scores = { craft: 0, settlement: 0, social: 0, spiritual: 0, life: 0, evidence: 0 }
  matchTopics(q).forEach(function (topic) { scores[topic] += 3 })
  collectHallSlugs({}, events || [], tourStore.getTourState()).forEach(function (slug) {
    var weights = HALL_TOPIC_WEIGHTS[slug] || {}
    Object.keys(weights).forEach(function (topic) { scores[topic] += weights[topic] })
  })
  var top = 'evidence'
  Object.keys(scores).forEach(function (topic) {
    if (scores[topic] > scores[top]) top = topic
  })
  if (top === 'craft') return '器物工艺线索：记录材料、器形、制作痕迹和使用场景之间的关系。'
  if (top === 'settlement') return '聚落空间线索：记录房址、壕沟、墓葬或作坊如何组织在一起。'
  if (top === 'social') return '社会组织线索：记录分工、协作和公共生活如何被遗存说明。'
  if (top === 'spiritual') return '精神文化线索：记录图案、形象和仪式解释背后的证据边界。'
  if (top === 'life') return '日常生活线索：记录食物、居住、劳动和工具如何相互关联。'
  return '证据整理线索：记录问题对应的展厅、展项和可核对细节。'
}

function buildRecordNotes(messages, questions, events) {
  var pairs = collectEventRecordPairs(events)
  var list = Array.isArray(messages) ? messages : []
  var currentHall = tourStore.getTourState().currentHall || ''
  for (var i = 0; i < list.length; i++) {
    var msg = list[i]
    if (!msg || msg.role !== 'user' || !msg.content) continue
    var answer = ''
    for (var j = i + 1; j < list.length; j++) {
      if (list[j].role === 'assistant' && !list[j].isError && list[j].content) {
        answer = list[j].content
        break
      }
      if (list[j].role === 'user') break
    }
    if (!answer) continue
    pairs.push({ question: msg.content, answer: answer, hall: currentHall })
  }
  var notes = pairs.length ? buildAggregatedRecordNotes(pairs, events) : []

  if (!notes.length && questions.length) {
    var fallbackHall = tourStore.getTourState().currentHall || 'summary'
    notes = buildAggregatedRecordNotes(
      questions.map(function (question) {
        return { question: question, answer: inferQuestionRecordPoint(question, events), hall: fallbackHall }
      }),
      events
    )
  }

  if (!notes.length && events && events.length) {
    var hallSlugs = collectHallSlugs({}, events, tourStore.getTourState())
    notes = hallSlugs.slice(0, 3).map(function (slug) {
      return {
        question: hallDisplay(slug),
        point: HALL_NOTES[slug] || '本次记录已留下该展厅的到访线索。',
      }
    })
  }
  return notes
}

function buildStoredRecordNotes(notes, events) {
  var pairs = []
  ;(Array.isArray(notes) ? notes : []).forEach(function (item) {
    if (!item || !item.point) return
    var hall = item.hall ? hallSlug(item.hall) : ''
    pairs.push({
      question: item.question || '游览记录摘要',
      answer: item.point,
      hall: hall,
    })
  })
  return pairs.length ? buildAggregatedRecordNotes(pairs, events) : []
}

function normalizeRecordNotes(notes) {
  if (!Array.isArray(notes)) return []
  return notes.map(function (item) {
    var rawPoint = stripMarkdown(item && item.point)
    var point = /^以.+视角看/.test(rawPoint) || rawPoint.indexOf('你提出的问题包括') >= 0 || rawPoint.indexOf('从回答内容看') >= 0
      ? buildRecordSummaryPoint('', rawPoint, rawPoint, '证据线索')
      : rawPoint
    // Backend LLM summaries are capped at 400 chars; only re-template clearly
    // over-long (legacy) points so a real summary is preserved verbatim.
    if (point.length > 400) point = buildRecordSummaryPoint('', point, point, '证据线索')
    return {
      question: compactText(item && item.question, 60),
      point: point,
    }
  }).filter(function (item) {
    return item.question && item.point
  })
}

function mergeRecordNotes() {
  var merged = []
  var seen = {}
  var hasSummary = false
  Array.prototype.slice.call(arguments).forEach(function (list) {
    ;(list || []).forEach(function (item) {
      if (!item || !item.question || !item.point) return
      var isSummary = item.question === '游览记录摘要'
      if (isSummary && hasSummary) return
      var key = recordDedupeKey([item.hall || '', item.question, item.point])
      if (seen[key]) return
      seen[key] = true
      if (isSummary) hasSummary = true
      merged.push(item)
    })
  })
  return merged.slice(0, 4)
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
    findings = []
  }
  return findings.slice(0, 3)
}

function buildOpenThreads(personaKey, hallSlugs, questions, exhibitNames) {
  return []
}

function buildReviewChecklist(personaKey, hallNames, questions, exhibitNames) {
  return []
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
      change_summary: '当前证据还少，关注点变化暂不明显。',
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
    recordNotes: [],
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

    api.tourApi.recordEvents(id, events, token)
      .then(function (res) {
        if (!res || !res.ok) {
          console.warn('[report] flush events returned non-ok, restoring:', res && res.status)
          tourStore.restorePendingEvents(events)
        }
        _generate()
      })
      .catch(function (err) {
        console.warn('[report] flush events failed, restoring:', err)
        tourStore.restorePendingEvents(events)
        _generate()
      })
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
      recordNotes: experience.recordNotes,
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
    var chatMessages = (chatStore.getState().messages || [])
    var questionCount = data.total_questions != null ? Number(data.total_questions) : questions.length
    var exhibitCount = data.total_exhibits_viewed != null ? Number(data.total_exhibits_viewed) : exhibitNames.length
    var hallCount = hallNames.length
    var focusText = state.focusTitle || state.intentText || ''

    var visitedHallCards = hallSlugs.map(function (slug) {
      return { name: hallDisplay(slug), note: HALL_NOTES[slug] || '记录该展厅中的关键展项和现场问题。' }
    })

    var firstHall = hallNames[0] || '半坡遗址'
    var hallPart = hallNames.length > 1 ? hallNames.join('、') : firstHall
    var questionPart = questions.length
      ? '你提出的问题集中在“' + questions[0] + '”等线索上。'
      : ''
    var exhibitPart = exhibitNames.length
      ? '你重点打开过 ' + exhibitNames.join('、') + '。'
      : ''

    var journeySummary = copy.summaryPrefix + (hallNames.length ? ' 本次到访：' + hallPart + '。' : '') + questionPart + exhibitPart
    if (focusText) {
      journeySummary += ' 入口关注点“' + focusText + '”构成了本次报告的解释角度。'
    }

    var questionSummary = questions.length
      ? '本次留下 ' + questions.length + ' 条提问，问题已经开始从“看见什么”转向“这些材料说明什么”。'
      : ''

    var highlights = []
    if (questions.length) highlights.push('已记录问题：' + questions.length + ' 个')
    if (exhibitNames.length) highlights.push('重点展项：' + exhibitNames.join('、'))
    if (!highlights.length) highlights = []

    var storedRecordNotes = buildStoredRecordNotes(tourStore.getRecordSummaryNotes(), events)
    var currentChatRecordNotes = buildRecordNotes(chatMessages, questions, [])
    var localEventRecordNotes = buildRecordNotes([], questions, events)
    var backendRecordNotes = normalizeRecordNotes(data.record_notes)
    // Backend first: when the server produced an LLM record summary it must win
    // the single "游览记录摘要" slot; local keyword templates are offline fallback only.
    var recordNotes = mergeRecordNotes(
      backendRecordNotes,
      storedRecordNotes,
      currentChatRecordNotes,
      localEventRecordNotes
    )

    var dataNotice = ''
    if (isLocalFallback) {
      dataNotice = '服务器报告暂不可用，当前内容根据本机游览记录整理。'
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
      recordNotes: recordNotes,
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
      recordNotes: experience.recordNotes,
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
