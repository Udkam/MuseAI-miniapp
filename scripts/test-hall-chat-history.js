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
const TRUSTED_EXHIBIT_ID = '123e4567-e89b-12d3-a456-426614174000'

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
tourStore.addTourEvent({ eventType: 'exhibit_view', hall: 'site-protection-hall', exhibitId: TRUSTED_EXHIBIT_ID })
assert.ok(
  tourStore.getTourState().visitedHalls.indexOf('site-protection-hall') >= 0,
  'viewing an exhibit should mark its hall visited'
)
assert.strictEqual(
  tourStore.getVisitedExhibitCount(),
  1,
  'viewing an exhibit should increment the visited exhibit count'
)
tourStore.addTourEvent({ eventType: 'exhibit_view', hall: 'site-protection-hall', exhibitId: TRUSTED_EXHIBIT_ID })
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
  1,
  'local exhibit views without a backend id must not count as trusted museum exhibits'
)
tourStore.setCurrentExhibit({ id: 'basic-ex-1', name: 'Basic Exhibit', hall: 'basic-exhibition-hall' }, 'basic-exhibition-hall')
assert.strictEqual(
  tourStore.getCurrentExhibit().name,
  'Basic Exhibit',
  'active exhibit context should be available during the current tour page'
)
tourStore.clearCurrentExhibit()
assert.strictEqual(
  tourStore.getCurrentExhibit(),
  null,
  'leaving the hall or tapping close should clear the active exhibit context'
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
  1,
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
  tourStore.getCurrentExhibit(),
  null,
  'new tour should not inherit previous exhibit discussion context'
)

tourStore.setTourSession({ sessionId: 'hall-isolation-session', sessionToken: 'hall-isolation-token' })
const hallA = 'basic-exhibition-hall'
const hallB = 'kiln-hall'
const hallAMessages = []
const hallBMessages = []
for (let index = 0; index < 35; index++) {
  hallAMessages.push({
    id: 'a-' + index,
    role: index % 2 ? 'user' : 'assistant',
    content: 'A厅消息-' + index,
  })
  hallBMessages.push({
    id: 'b-' + index,
    role: index % 2 ? 'user' : 'assistant',
    content: 'B厅消息-' + index,
  })
}
tourStore.saveHallChatMessages(hallA, hallAMessages)
tourStore.saveHallChatMessages(hallB, hallBMessages)

const restoredHallA = tourStore.getHallChatMessages(hallA)
const restoredHallB = tourStore.getHallChatMessages(hallB)
assert.strictEqual(restoredHallA.length, 30, 'hall A should retain its latest 30 messages')
assert.strictEqual(restoredHallB.length, 30, 'hall B should retain its latest 30 messages')
assert.strictEqual(restoredHallA[0].content, 'A厅消息-5')
assert.strictEqual(restoredHallA[29].content, 'A厅消息-34')
assert.strictEqual(restoredHallB[0].content, 'B厅消息-5')
assert.strictEqual(restoredHallB[29].content, 'B厅消息-34')
assert.ok(restoredHallA.every(function (message) {
  return message.content.indexOf('A厅消息-') === 0
}), 'hall A history must never contain hall B messages')
assert.ok(restoredHallB.every(function (message) {
  return message.content.indexOf('B厅消息-') === 0
}), 'hall B history must never contain hall A messages')

tourStore.updateTourState({ currentHall: hallB })
chatStore.setMessages(tourStore.getHallChatMessages(hallB))
assert.strictEqual(chatStore.getState().messages[0].content, 'B厅消息-5')
tourStore.updateTourState({ currentHall: hallA })
chatStore.setMessages(tourStore.getHallChatMessages(hallA))
assert.strictEqual(chatStore.getState().messages.length, 30, 'returning to hall A should restore the latest 30 messages')
assert.strictEqual(chatStore.getState().messages[0].content, 'A厅消息-5')
assert.strictEqual(chatStore.getState().messages[29].content, 'A厅消息-34')

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

tourStore.setTourSession({ sessionId: 'bounded-history-session', sessionToken: 'bounded-token' })
for (let hallIndex = 0; hallIndex < 11; hallIndex++) {
  const oversized = []
  for (let messageIndex = 0; messageIndex < 35; messageIndex++) {
    oversized.push({
      id: hallIndex + '-' + messageIndex,
      role: messageIndex % 2 ? 'user' : 'assistant',
      content: '历'.repeat(1200) + messageIndex,
      debug: 'must-not-sync',
    })
  }
  tourStore.saveHallChatMessages('dynamic-hall-' + hallIndex, oversized)
}
const boundedPayload = tourStore.getHallChatHistoryPayload()
assert.strictEqual(Object.keys(boundedPayload).length, 9, 'only the nine most recently used halls should be restored')
assert.ok(boundedPayload['dynamic-hall-10'], 'the newest hall history should be retained')
Object.keys(boundedPayload).forEach(function (hall) {
  assert.strictEqual(boundedPayload[hall].length, 30, 'each hall should retain only its latest 30 messages')
  assert.ok(boundedPayload[hall].every(function (message) {
    return message.content.length <= 1000 && Object.keys(message).sort().join(',') === 'content,role'
  }), 'restored messages should be bounded role/content records')
})

console.log('hall chat history checks passed')
