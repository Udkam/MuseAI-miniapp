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
require('../pages/report/report')

function resetTour() {
  tourStore.clearTour()
  tourStore.createLocalTourState({
    interestType: 'B',
    persona: 'B',
    assumption: 'A',
    personaId: 'student',
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
    { question: '围绕：半坡的石器用途', point: '石器磨损和穿孔痕迹说明工具已有明确分工' },
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

console.log('report stat checks passed')
