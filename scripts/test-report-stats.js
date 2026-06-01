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
  ['基本陈列展厅'],
  'report should not count stale local visitedHalls, currentHall, or question.hall when a real hall_enter exists'
)

resetTour()
tourStore.updateTourState({ currentHall: 'prehistoric-workshop' })
var fallbackExperience = reportPage._buildExperience({}, [
  { event_type: 'exhibit_question', hall: 'basic-exhibition-hall', metadata: { message: '这是什么？' } },
], false)
assert.deepStrictEqual(
  hallNames(fallbackExperience),
  ['史前工坊'],
  'report may fall back to currentHall only when there is no explicit visit evidence'
)

resetTour()
tourStore.addTourEvent({ eventType: 'exhibit_question', hall: 'prehistoric-workshop' })
assert.deepStrictEqual(
  tourStore.getTourState().visitedHalls,
  [],
  'non-visit events should not update local visitedHalls'
)
tourStore.addTourEvent({ eventType: 'hall_enter', hall: 'basic-exhibition-hall' })
assert.deepStrictEqual(
  tourStore.getTourState().visitedHalls,
  ['basic-exhibition-hall'],
  'hall_enter should update local visitedHalls'
)

console.log('report stat checks passed')
