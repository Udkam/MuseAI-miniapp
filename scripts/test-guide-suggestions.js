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
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'cached-session'
storage[storageUtil.KEYS.TOUR_SESSION_TOKEN] = 'cached-token'
storage[storageUtil.KEYS.TOUR_STYLE_PREFS] = { answerLength: 'detailed', depth: 'deep', terminology: 'professional', enabled: true }
assert.strictEqual(storageUtil.ensureTourCacheSchema(), true, 'cache schema migration should run once')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_SESSION_ID], undefined, 'cache migration should clear old session')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_STYLE_PREFS], undefined, 'cache migration should clear old style prefs')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION], storageUtil.TOUR_CACHE_SCHEMA_VERSION, 'cache migration should persist schema version')
assert.strictEqual(storageUtil.ensureTourCacheSchema(), false, 'cache schema migration should be idempotent')

resetStorage()
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'legacy-session'
storage[storageUtil.KEYS.TOUR_SESSION_TOKEN] = 'legacy-token'
reloadTourStore()
assert.strictEqual(tourStore.getTourState().sessionId, null, 'legacy session cache should be ignored')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_SESSION_ID], undefined, 'legacy session cache should be cleared')

resetStorage()
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'fresh-session'
storage[storageUtil.KEYS.TOUR_SESSION_TOKEN] = 'fresh-token'
storage[storageUtil.KEYS.TOUR_SESSION_CREATED_AT] = Date.now()
storage[storageUtil.KEYS.TOUR_SESSION_SCHEMA_VERSION] = storageUtil.TOUR_SESSION_SCHEMA_VERSION
storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION] = storageUtil.TOUR_CACHE_SCHEMA_VERSION
reloadTourStore()
assert.strictEqual(tourStore.getTourState().sessionId, 'fresh-session', 'fresh session cache should hydrate')
assert.strictEqual(tourStore.getTourHeader()['X-Session-Token'], 'fresh-token', 'fresh session token should hydrate')
assert.strictEqual(tourStore.hasResumableTourSession(), false, 'fresh session without enough AI turns should not show resume entry')
storage[storageUtil.KEYS.TOUR_AI_CONVERSATION_COUNT] = 5
reloadTourStore()
assert.strictEqual(tourStore.hasResumableTourSession(), true, 'session with five AI turns should show resume entry')

resetStorage()
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'expired-session'
storage[storageUtil.KEYS.TOUR_SESSION_TOKEN] = 'expired-token'
storage[storageUtil.KEYS.TOUR_SESSION_CREATED_AT] = Date.now() - 13 * 60 * 60 * 1000
storage[storageUtil.KEYS.TOUR_SESSION_SCHEMA_VERSION] = storageUtil.TOUR_SESSION_SCHEMA_VERSION
storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION] = storageUtil.TOUR_CACHE_SCHEMA_VERSION
reloadTourStore()
assert.strictEqual(tourStore.getTourState().sessionId, null, 'expired session cache should be ignored')

resetStorage()
reloadTourStore()

const HALLS = [
  '基本陈列展厅',
  '遗址保护大厅',
  '陶窑展厅',
  '史前工坊',
  '半坡姑娘雕塑',
  '教研中心',
  '牡丹园',
  '临展厅一',
  '临展厅二',
]
const PRIMARY_HALLS = HALLS.slice(0, 9)
const HALL_SLUGS = [
  'basic-exhibition-hall',
  'site-protection-hall',
  'kiln-hall',
  'prehistoric-workshop',
  'banpo-girl-sculpture',
  'education-center',
  'peony-garden',
  'temporary-hall-1',
  'temporary-hall-2',
]
const PERSONAS = ['default', 'A', 'B', 'C', 'D']
const PRIMARY_PERSONAS = ['A', 'B', 'C', 'D']
const HALL_MODE_FORBIDDEN = ['这件', '它', '这个展品', '该展品', '此展品', '彩陶盆上的']

function resetTour(personaId, hall) {
  tourStore.clearTour()
  tourStore.updateTourState({
    personaId: personaId,
    persona: ['A', 'B', 'C', 'D'].indexOf(personaId) >= 0 ? personaId : 'B',
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

      if (hall === '临展厅一' || hall === '临展厅二') {
        assert.ok(
          prompt.indexOf('现场') >= 0 || prompt.indexOf('当期') >= 0 || prompt.indexOf('临展') >= 0,
          hall + ' / ' + personaId + ' temporary-hall prompt should acknowledge onsite/current-exhibition limits: ' + prompt
        )
        assert.strictEqual(prompt.indexOf('农耕工具包'), -1, hall + ' temporary prompt should not imply fixed exhibits')
      }

      const built = tourStore.buildStyledPrompt(prompt, { recentMessages: null })
      assert.ok(
        built.indexOf('用户当前正在参观的展厅是：' + hall) >= 0,
        hall + ' / ' + personaId + ' styled prompt should retain current hall context'
      )
    })
  })
})

PRIMARY_HALLS.forEach(function (hall) {
  PRIMARY_PERSONAS.forEach(function (personaId) {
    resetTour(personaId, hall)
    const suggestions = askSuggestions(tourStore.generateGuideSuggestions({
      currentHall: hall,
      currentExhibit: null,
      exhibits: [],
    }))
    assert.ok(suggestions.length >= 2, 'primary mode audit should expose suggestions: ' + hall + ' / ' + personaId)
    suggestions.forEach(function (item) {
      const context = tourStore.buildClientContext(item.payload.prompt, { recentMessages: null })
      assert.ok(context.indexOf('当前展厅：' + hall) >= 0, 'client context should include current hall: ' + hall)
      assert.ok(context.indexOf('身份只决定观察角度和语气，不是固定回答模板') >= 0, 'client context should prevent fixed style template')
      assert.ok(context.length <= 1200, 'client context should stay compact')
      assert.strictEqual(context.indexOf('[格式约束]'), -1, 'client context should not duplicate backend format prompt')
      if (hall === '临展厅一' || hall === '临展厅二') {
        assert.ok(context.indexOf('不要编造当期展品') >= 0, hall + ' context should prevent temporary-hall hallucination')
      }
    })
  })
})

resetTour('default', '基本陈列展厅')
const exhibit = {
  id: 'ceramic-1',
  name: '人面网纹彩陶盆',
  category: '彩陶',
  hall: 'basic-exhibition-hall',
  hallDisplay: '基本陈列展厅',
}
tourStore.setCurrentExhibit(exhibit)
const rawExhibitSuggestions = tourStore.generateGuideSuggestions({
  currentHall: '基本陈列展厅',
  currentExhibit: exhibit,
  exhibits: [{ id: 'other-1', name: '鹿纹彩陶盆', importance: 8 }],
})
const exhibitSuggestions = askSuggestions(rawExhibitSuggestions)
assert.strictEqual(
  rawExhibitSuggestions.some(function (item) {
    return item.title === '返回列表' || item.actionType === 'navigate_back'
  }),
  false,
  'exhibit-mode suggestions should not contain a return-to-list action'
)

assert.ok(
  exhibitSuggestions.some(function (item) {
    return item.payload.prompt.indexOf('人面网纹彩陶盆') >= 0
  }),
  'exhibit-mode ceramic prompt should name the selected exhibit'
)

resetTour('B', '遗址保护大厅')
const siteObject = {
  id: 'local-site-1',
  name: '地面圆形房屋遗迹',
  category: '遗址遗存',
  hall: 'site-protection-hall',
  hallDisplay: '遗址保护大厅',
}
tourStore.setCurrentExhibit(siteObject)
const siteSuggestions = askSuggestions(tourStore.generateGuideSuggestions({
  currentHall: '遗址保护大厅',
  currentExhibit: tourStore.getCurrentExhibit(),
  exhibits: [],
}))
assert.ok(siteSuggestions.length >= 3, 'site object should expose neutral discussion suggestions')
siteSuggestions.forEach(function (item) {
  assert.strictEqual(item.payload.prompt.indexOf('这件展品'), -1, 'site-object prompt should not call an object 展品')
  assert.strictEqual(item.payload.prompt.indexOf('这件器物'), -1, 'site-object prompt should not call a site relic 器物')
})
assert.ok(
  siteSuggestions.some(function (item) {
    return item.payload.prompt.indexOf('遗存') >= 0 || item.payload.prompt.indexOf('聚落') >= 0 || item.payload.prompt.indexOf('空间') >= 0
  }),
  'site-object prompt should use relic/site language'
)
const sitePrompt = tourStore.buildStyledPrompt('这个说明什么？', { recentMessages: null })
assert.ok(sitePrompt.indexOf('[当前讨论对象上下文') >= 0, 'styled prompt should use neutral object context')
assert.ok(sitePrompt.indexOf('对象类型是：遗迹') >= 0, 'styled prompt should infer site object kind')

resetTour('D', HALLS[0])
tourStore.setOnboardingExtras({
  focusTitle: '器物细节观察',
  focusPrompt: '请优先从材料、器形、纹饰和工艺解释问题。',
  assumptionText: '先不下判断，跟证据走',
  guideModeTitle: '研学记录模式',
  guideModePrompt: '回答中给出观察任务和笔记小结。',
  intentText: '我想知道鱼纹为什么出现',
})
const profiledPrompt = tourStore.buildStyledPrompt('这说明什么？', { recentMessages: null })
assert.ok(profiledPrompt.indexOf('[入场问卷上下文]') >= 0, 'styled prompt should include onboarding profile block')
assert.ok(profiledPrompt.indexOf('器物细节观察') >= 0, 'styled prompt should include focus title')
assert.ok(profiledPrompt.indexOf('鱼纹为什么出现') >= 0, 'styled prompt should include user-written intent')
assert.ok(profiledPrompt.indexOf('先不下判断，跟证据走') >= 0, 'styled prompt should include initial assumption')
assert.ok(profiledPrompt.indexOf('不要用"好的"') >= 0, 'styled prompt should forbid filler openings')
assert.ok(profiledPrompt.indexOf('需要解释含义时用自然连接句') >= 0, 'styled prompt should prefer natural analysis connectors')
assert.ok(profiledPrompt.indexOf('不要写“我的分析”“说明了什么”') >= 0, 'styled prompt should forbid old explanation headings')
assert.strictEqual(profiledPrompt.indexOf('为什么重要，但'), -1, 'styled prompt should not steer answers toward 为什么重要')
assert.strictEqual(profiledPrompt.indexOf('下一步建议观察'), -1, 'styled prompt should not steer answers toward next-step template')

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
