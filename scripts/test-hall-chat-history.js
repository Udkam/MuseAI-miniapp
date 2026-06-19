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
}

const storageUtil = require('../utils/storage')
let tourStore = require('../store/tour')
const chatStore = require('../store/chat')

function resetStorage() {
  Object.keys(storage).forEach(function (key) { delete storage[key] })
}

function reloadTourStore() {
  delete require.cache[require.resolve('../store/tour')]
  tourStore = require('../store/tour')
}

resetStorage()
tourStore.clearTour()
tourStore.createLocalTourState({
  interestType: 'B',
  persona: 'B',
  assumption: 'A',
  personaId: 'B',
})
tourStore.setTourSession({ sessionId: 'session-1', sessionToken: 'token-1' })
tourStore.updateTourState({ currentHall: 'basic-exhibition-hall' })
assert.strictEqual(
  tourStore.getLastAnsweredHallDisplayName(),
  '',
  'entering a hall without a completed answer should not populate the resume hall name'
)

const messages = [
  { id: 1, role: 'assistant', content: '这里是基本陈列展厅。', ttsStatus: 'idle' },
  { id: 2, role: 'user', content: '石器和骨器是做什么用的？' },
  { id: 3, role: 'assistant', content: '石器、骨器和工具可对应加工、制作和生产分工。', ttsStatus: 'idle' },
]

tourStore.saveCurrentHallChatMessages(messages)
assert.strictEqual(storage[storageUtil.KEYS.TOUR_HALL_CHATS].sessionId, 'session-1')
tourStore.addTourEvent({ eventType: 'assistant_answer', hall: 'peony-garden' })
assert.strictEqual(
  tourStore.getTourState().visitedHalls.indexOf('peony-garden'),
  -1,
  'assistant answer alone should not mark a hall visited'
)
tourStore.addTourEvent({ eventType: 'exhibit_question', hall: 'kiln-hall' })
assert.ok(
  tourStore.getTourState().visitedHalls.indexOf('kiln-hall') >= 0,
  'sent user question should mark a hall visited'
)
tourStore.addTourEvent({ eventType: 'assistant_answer', hall: 'kiln-hall' })
assert.ok(
  tourStore.getTourState().visitedHalls.indexOf('kiln-hall') >= 0,
  'assistant answer should not remove an existing visited mark'
)
assert.ok(
  storage[storageUtil.KEYS.TOUR_VISITED_HALLS].indexOf('kiln-hall') >= 0,
  'visited hall should be persisted'
)
tourStore.addTourEvent({ eventType: 'exhibit_view', hall: 'site-protection-hall', exhibitId: 'exhibit-1' })
assert.ok(
  tourStore.getTourState().visitedHalls.indexOf('site-protection-hall') >= 0,
  'viewing an exhibit should mark its hall visited'
)
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  1,
  'viewing an exhibit should increment the visited exhibit count'
)
tourStore.addTourEvent({ eventType: 'exhibit_view', hall: 'site-protection-hall', exhibitId: 'exhibit-1' })
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  1,
  'viewing the same exhibit again should not duplicate the exhibit count'
)
tourStore.addTourEvent({
  eventType: 'exhibit_view',
  hall: 'site-protection-hall',
  metadata: { exhibit_name: 'local named exhibit' },
})
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  2,
  'local exhibit views without a backend id should count by hall and exhibit name'
)
tourStore.setCurrentExhibit({ id: 'basic-ex-1', name: 'Basic Exhibit', hall: 'basic-exhibition-hall' }, 'basic-exhibition-hall')
tourStore.setCurrentExhibit({ id: 'kiln-ex-1', name: 'Kiln Exhibit', hall: 'kiln-hall' }, 'kiln-hall')
assert.strictEqual(
  tourStore.getCurrentExhibitForHall('basic-exhibition-hall').name,
  'Basic Exhibit',
  'basic hall should keep its own active exhibit context'
)
assert.strictEqual(
  tourStore.getCurrentExhibitForHall('kiln-hall').name,
  'Kiln Exhibit',
  'kiln hall should keep its own active exhibit context'
)
assert.strictEqual(
  tourStore.applyHallExhibitContext('basic-exhibition-hall').name,
  'Basic Exhibit',
  'entering a hall should restore that hall exhibit context'
)
tourStore.clearCurrentExhibit('basic-exhibition-hall')
assert.strictEqual(
  tourStore.getCurrentExhibitForHall('basic-exhibition-hall'),
  null,
  'clearing one hall exhibit context should remove only that hall'
)
assert.strictEqual(
  tourStore.getCurrentExhibitForHall('kiln-hall').name,
  'Kiln Exhibit',
  'clearing one hall exhibit context should not remove another hall'
)
tourStore.setSkipToHallOnReturn({ hall: 'kiln-hall', source: 'test' })
assert.strictEqual(
  tourStore.consumeSkipToHallOnReturn().hall,
  'kiln-hall',
  'skip-to-hall return flag should be consumable by intermediate pages'
)
assert.strictEqual(
  tourStore.consumeSkipToHallOnReturn(),
  null,
  'skip-to-hall return flag should only be consumed once'
)
assert.strictEqual(
  tourStore.getLastAnsweredHallDisplayName(),
  '陶窑展厅',
  'resume hall name should use the latest hall with a completed AI answer'
)

reloadTourStore()
const restored = tourStore.getHallChatMessages('basic-exhibition-hall')
assert.strictEqual(restored.length, 3, 'hall chat should restore after store reload')
assert.strictEqual(restored[1].content, '石器和骨器是做什么用的？')
assert.strictEqual(restored[2].ttsStatus, 'idle', 'assistant messages should restore with idle tts status')
const restoredState = tourStore.getTourState()
assert.ok(
  restoredState.visitedHalls.indexOf('basic-exhibition-hall') >= 0,
  'visited halls should backfill from stored hall chat history after reload'
)
assert.ok(
  restoredState.visitedHalls.indexOf('kiln-hall') >= 0,
  'visited halls should restore from persisted visited list after reload'
)
assert.ok(
  restoredState.visitedHalls.indexOf('site-protection-hall') >= 0,
  'visited halls should restore from exhibit view events after reload'
)
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  2,
  'visited exhibit count should restore after store reload'
)

const notes = tourStore.summarizeStoredHallRecords()
assert.strictEqual(notes.length, 1, 'stored hall chats should produce report notes')
assert.strictEqual(notes[0].hall, 'basic-exhibition-hall')
assert.ok(notes[0].point.indexOf('石器') >= 0 || notes[0].point.indexOf('骨器') >= 0)

tourStore.saveHallChatMessages('site-protection-hall', [
  { id: 11, role: 'assistant', content: '这里是遗址保护大厅。', ttsStatus: 'idle' },
])
storage[storageUtil.KEYS.TOUR_VISITED_HALLS] = ['peony-garden']
reloadTourStore()
assert.strictEqual(
  tourStore.getTourState().visitedHalls.indexOf('peony-garden'),
  -1,
  'stored visited badges should not survive without a user message or exhibit view event'
)

tourStore.createLocalTourState({
  interestType: 'C',
  persona: 'C',
  assumption: 'A',
  personaId: 'C',
})
assert.deepStrictEqual(
  tourStore.getHallChatMessages('basic-exhibition-hall'),
  [],
  'new tour should not inherit previous hall chat history'
)
assert.deepStrictEqual(
  tourStore.getTourState().visitedHalls,
  [],
  'new tour should not inherit previous visited hall badges'
)
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  0,
  'new tour should not inherit previous visited exhibit count'
)
assert.strictEqual(
  tourStore.getCurrentExhibitForHall('kiln-hall'),
  null,
  'new tour should not inherit previous hall exhibit context'
)

chatStore.resetChat()
chatStore.setMessages([
  { id: 101, role: 'assistant', content: '长'.repeat(1400) },
  { id: 102, role: 'user', content: '问'.repeat(1200) },
])
const recent = chatStore.getRecentMessages(2)
assert.strictEqual(recent.length, 2)
assert.ok(recent[0].content.length <= 800, 'assistant history should fit backend max_length')
assert.ok(recent[1].content.length <= 800, 'user history should fit backend max_length')
assert.deepStrictEqual(
  recent.map(function (item) { return item.role }),
  ['assistant', 'user'],
  'history should preserve roles after compaction'
)

console.log('hall chat history checks passed')
