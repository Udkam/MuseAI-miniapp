const assert = require('assert')

const storage = {}
global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : ''
  },
  setStorageSync: function (key, value) {
    storage[key] = value
  },
  removeStorageSync: function (key) {
    delete storage[key]
  },
  request: function () {},
  showLoading: function () {},
  hideLoading: function () {},
  showToast: function () {},
}

var reportPage = null
global.Page = function (config) {
  reportPage = config
}

const tourStore = require('../store/tour')
const chatStore = require('../store/chat')
require('../pages/report/report')

function resetTour() {
  tourStore.clearTour()
  chatStore.resetChat()
  tourStore.createLocalTourState({
    interestType: 'B',
    persona: 'B',
    assumption: 'A',
    personaId: 'B',
  })
}

function hallNames(experience) {
  return experience.visitedHallCards.map(function (card) { return card.name })
}

assert.ok(reportPage && reportPage._buildExperience, 'report page should expose _buildExperience through Page config')

resetTour()
tourStore.updateTourState({
  currentHall: 'prehistoric-workshop',
  visitedHalls: ['prehistoric-workshop'],
})
var mixedEvents = [
  { event_type: 'hall_enter', hall: 'basic-exhibition-hall', metadata: {} },
  {
    event_type: 'exhibit_question',
    hall: 'prehistoric-workshop',
    metadata: { message: '这里适合怎么做研学记录？' },
  },
]
var mixedExperience = reportPage._buildExperience({}, mixedEvents, false)
assert.deepStrictEqual(
  hallNames(mixedExperience),
  ['史前工坊'],
  'report should ignore hall_enter and count only halls with question/answer activity'
)

resetTour()
tourStore.updateTourState({ currentHall: 'prehistoric-workshop' })
var fallbackExperience = reportPage._buildExperience({}, [
  { event_type: 'exhibit_question', hall: 'basic-exhibition-hall', metadata: { message: '这是什么？' } },
], false)
assert.deepStrictEqual(
  hallNames(fallbackExperience),
  ['基本陈列展厅'],
  'report should count a hall once the visitor asks a question there'
)

var backendNoteExperience = reportPage._buildExperience({
  record_notes: [
    { question: '围绕：半坡的石器用途', point: '石器磨损和穿孔痕迹说明工具已有明确分工。' },
  ],
}, [], false)
assert.deepStrictEqual(
  backendNoteExperience.recordNotes,
  [
    { question: '围绕：半坡的石器用途', point: '石器磨损和穿孔痕迹说明工具已有明确分工。' },
  ],
  'report should use backend record_notes when local chat/events are unavailable'
)

resetTour()
tourStore.addTourEvent({ eventType: 'exhibit_question', hall: 'prehistoric-workshop' })
assert.deepStrictEqual(
  tourStore.getTourState().visitedHalls,
  ['prehistoric-workshop'],
  'question events should update local visitedHalls for report fallback'
)
tourStore.addTourEvent({ eventType: 'hall_enter', hall: 'basic-exhibition-hall' })
assert.deepStrictEqual(
  tourStore.getTourState().visitedHalls,
  ['prehistoric-workshop'],
  'hall_enter should not append to question-derived visitedHalls'
)

resetTour()
tourStore.updateTourState({ currentHall: 'basic-exhibition-hall' })
var eventSummaryExperience = reportPage._buildExperience({}, [
  {
    event_type: 'exhibit_question',
    hall: 'basic-exhibition-hall',
    metadata: { client_event_id: 'q1', message: '这些出土文物反映了半坡先民怎样的生活？' },
  },
  {
    event_type: 'assistant_answer',
    hall: 'basic-exhibition-hall',
    metadata: {
      client_event_id: 'a1',
      question: '这些出土文物反映了半坡先民怎样的生活？',
      answer: '这些出土文物说明半坡先民已经形成了稳定的定居、生产和日常生活方式。',
    },
  },
  {
    event_type: 'exhibit_question',
    hall: 'basic-exhibition-hall',
    metadata: { client_event_id: 'q2', message: '半坡的石器和骨器是做什么用的？' },
  },
  {
    event_type: 'assistant_answer',
    hall: 'basic-exhibition-hall',
    metadata: {
      client_event_id: 'a2',
      question: '半坡的石器和骨器是做什么用的？',
      answer: '石器、骨器和工具可用于加工食物、制作器物，也能帮助判断生产分工。',
    },
  },
], false)
assert.strictEqual(
  eventSummaryExperience.recordNotes.length,
  1,
  'event Q&A should be summarized into one narrative note'
)
assert.strictEqual(
  eventSummaryExperience.recordNotes[0].question,
  '游览记录摘要',
  'record summary should be a narrative report title'
)
assert.ok(
  eventSummaryExperience.recordNotes[0].point.indexOf('文物类型') >= 0
    && eventSummaryExperience.recordNotes[0].point.indexOf('石器骨器用途') >= 0,
  'record summary should include both question topics as focus keywords'
)
assert.ok(
  eventSummaryExperience.recordNotes[0].point.indexOf('回答中可提炼为：') >= 0,
  'record summary should integrate answer knowledge'
)
assert.ok(
  eventSummaryExperience.recordNotes[0].point.length <= 300,
  'record summary should stay within 300 characters'
)
assert.ok(
  eventSummaryExperience.recordNotes[0].point.indexOf('以') !== 0
    && eventSummaryExperience.recordNotes[0].point.indexOf('你提出的问题包括') < 0,
  'record summary should avoid the old perspective/question-list template'
)

resetTour()
tourStore.updateTourState({ currentHall: 'basic-exhibition-hall' })
chatStore.setMessages([
  { role: 'user', content: '这些出土文物反映了半坡先民怎样的生活？' },
  { role: 'assistant', content: '这些出土文物说明半坡先民已经形成了稳定的定居、生产和日常生活方式。' },
])
var backendPreferredExperience = reportPage._buildExperience({
  record_notes: [
    {
      question: '游览记录摘要',
      point: '以研学记录员的视角看，本次游览主要围绕基本陈列展厅展开，关注点落在日常生活。你提出的问题包括“这些出土文物反映了半坡先民怎样的生活”。从回答内容看，最值得保留的复盘线索是：这些出土文物说明半坡先民已经形成了稳定的定居、生产和日常生活方式。这段记录更像一份研学笔记：它把展厅见闻整理成后续还能复盘的学习线索，也帮助你把“看过什么”转成“为什么这样判断”。',
    },
  ],
}, [], false)
assert.deepStrictEqual(
  backendPreferredExperience.recordNotes,
  [
    {
      question: '游览记录摘要',
      point: '本次问答集中在文物类型、半坡生活方式。回答中可提炼为：出土文物反映定居、生产和日常生活方式。这些线索可继续回到展品、展签和遗迹位置核对。',
    },
  ],
  'old backend record_notes should be rewritten into the compact summary style'
)

resetTour()
var duplicateQuestionExperience = reportPage._buildExperience({}, [
  {
    event_type: 'exhibit_question',
    hall: 'basic-exhibition-hall',
    metadata: { client_event_id: 'same-question', message: '半坡的石器和骨器是做什么用的？' },
  },
  {
    event_type: 'exhibit_question',
    hall: 'basic-exhibition-hall',
    metadata: { client_event_id: 'same-question', message: '半坡的石器和骨器是做什么用的？' },
  },
], false)
assert.strictEqual(
  duplicateQuestionExperience.questionCount,
  1,
  'duplicate question events should only count once in local report stats'
)

console.log('report stat checks passed')
