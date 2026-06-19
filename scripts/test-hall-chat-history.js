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

const messages = [
  { id: 1, role: 'assistant', content: '这里是基本陈列展厅。', ttsStatus: 'idle' },
  { id: 2, role: 'user', content: '石器和骨器是做什么用的？' },
  { id: 3, role: 'assistant', content: '石器、骨器和工具可对应加工、制作和生产分工。', ttsStatus: 'idle' },
]

tourStore.saveCurrentHallChatMessages(messages)
assert.strictEqual(storage[storageUtil.KEYS.TOUR_HALL_CHATS].sessionId, 'session-1')

reloadTourStore()
const restored = tourStore.getHallChatMessages('basic-exhibition-hall')
assert.strictEqual(restored.length, 3, 'hall chat should restore after store reload')
assert.strictEqual(restored[1].content, '石器和骨器是做什么用的？')
assert.strictEqual(restored[2].ttsStatus, 'idle', 'assistant messages should restore with idle tts status')

const notes = tourStore.summarizeStoredHallRecords()
assert.strictEqual(notes.length, 1, 'stored hall chats should produce report notes')
assert.strictEqual(notes[0].hall, 'basic-exhibition-hall')
assert.ok(notes[0].point.indexOf('石器') >= 0 || notes[0].point.indexOf('骨器') >= 0)

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

console.log('hall chat history checks passed')
