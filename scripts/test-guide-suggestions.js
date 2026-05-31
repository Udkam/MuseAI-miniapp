const assert = require('assert')
const fs = require('fs')
const path = require('path')

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

const tourStore = require('../store/tour')

const HALLS = ['出土文物陈列区', '半坡聚落复原区', '专题文化展区']
const HALL_SLUGS = ['pottery-spirit-hall', 'site-archaeology-hall', 'civilization-spark-hall']
const PERSONAS = ['default', 'A', 'B', 'C', 'artisan']
const HALL_MODE_FORBIDDEN = ['这件', '它', '这个展品', '该展品', '此展品', '彩陶盆上的']

function resetTour(personaId, hall) {
  tourStore.clearTour()
  tourStore.updateTourState({
    personaId: personaId,
    persona: ['A', 'B', 'C'].indexOf(personaId) >= 0 ? personaId : 'B',
    assumption: 'A',
    currentHall: hall,
    currentExhibit: null,
  })
}

function askSuggestions(items) {
  return items.filter(function (item) { return item.actionType === 'ask' })
}

HALLS.forEach(function (hall) {
  PERSONAS.forEach(function (personaId) {
    resetTour(personaId, hall)

    const suggestions = tourStore.generateGuideSuggestions({
      currentHall: hall,
      currentExhibit: null,
      exhibits: [
        { id: 'e1', name: '高重要度展品', importance: 9 },
      ],
    })
    const asks = askSuggestions(suggestions)

    assert.ok(asks.length >= 2, hall + ' / ' + personaId + ' should expose at least two ask suggestions')

    const seenPrompts = new Set()
    asks.forEach(function (item) {
      const prompt = item.payload && item.payload.prompt
      assert.ok(prompt, hall + ' / ' + personaId + ' ask suggestion should include prompt')
      HALL_MODE_FORBIDDEN.forEach(function (word) {
        assert.strictEqual(
          prompt.indexOf(word),
          -1,
          hall + ' / ' + personaId + ' hall-mode prompt has exhibit-only wording: ' + prompt
        )
      })
      assert.ok(!seenPrompts.has(prompt), hall + ' / ' + personaId + ' should not duplicate prompt: ' + prompt)
      seenPrompts.add(prompt)

      const built = tourStore.buildStyledPrompt(prompt, { recentMessages: null })
      assert.ok(
        built.indexOf('用户当前正在参观的展厅是：' + hall) >= 0,
        hall + ' / ' + personaId + ' styled prompt should retain current hall context'
      )
    })
  })
})

resetTour('default', '出土文物陈列区')
const exhibit = {
  id: 'ceramic-1',
  name: '人面网纹彩陶盆',
  category: '彩陶',
  hall: 'pottery-spirit-hall',
  hallDisplay: '出土文物陈列区',
}
tourStore.setCurrentExhibit(exhibit)
const exhibitSuggestions = askSuggestions(tourStore.generateGuideSuggestions({
  currentHall: '出土文物陈列区',
  currentExhibit: exhibit,
  exhibits: [{ id: 'other-1', name: '鹿纹彩陶盆', importance: 8 }],
}))

assert.ok(
  exhibitSuggestions.some(function (item) {
    return item.payload.prompt.indexOf('人面网纹彩陶盆') >= 0
  }),
  'exhibit-mode ceramic prompt should name the selected exhibit'
)

const backendTourChat = fs.readFileSync(
  path.join(__dirname, '..', '..', 'backend', 'backend', 'app', 'application', 'tour_chat_service.py'),
  'utf8'
)
HALLS.concat(HALL_SLUGS).forEach(function (hallKey) {
  assert.ok(
    backendTourChat.indexOf('"' + hallKey + '"') >= 0,
    'backend tour system prompt should recognize hall key: ' + hallKey
  )
})

console.log('guide suggestion checks passed:', HALLS.length * PERSONAS.length, 'hall/persona combinations')
