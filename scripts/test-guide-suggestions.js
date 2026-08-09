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
storage.auth_token = 'legacy-auth-token'
storage.user = { id: 'legacy-user' }
storage.user_role = 'visitor'
assert.strictEqual(storageUtil.ensureTourCacheSchema(), true, 'cache schema migration should run once')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_SESSION_ID], undefined, 'cache migration should clear old session')
assert.strictEqual(storage[storageUtil.KEYS.TOUR_STYLE_PREFS], undefined, 'cache migration should clear old style prefs')
storageUtil.LEGACY_AUTH_KEYS.forEach(function (key) {
  assert.strictEqual(storage[key], undefined, 'cache initialization should remove legacy auth key: ' + key)
})
assert.strictEqual(storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION], storageUtil.TOUR_CACHE_SCHEMA_VERSION, 'cache migration should persist schema version')
storage.auth_token = 'returned-legacy-auth-token'
storage.user = { id: 'returned-legacy-user' }
storage.user_role = 'admin'
assert.strictEqual(storageUtil.ensureTourCacheSchema(), false, 'cache schema migration should be idempotent')
storageUtil.LEGACY_AUTH_KEYS.forEach(function (key) {
  assert.strictEqual(storage[key], undefined, 'current cache schema must still remove legacy auth key: ' + key)
})

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
assert.strictEqual(tourStore.hasResumableTourSession(), true, 'a fresh guest session should be resumable before the first AI turn')
assert.strictEqual(tourStore.hasResumableConversation(), false, 'an empty guest session must not show the home resume entry')
storage[storageUtil.KEYS.TOUR_AI_CONVERSATION_COUNT] = 5
reloadTourStore()
assert.strictEqual(tourStore.hasResumableTourSession(), true, 'session with five AI turns should show resume entry')
tourStore.saveHallChatMessages('basic-exhibition-hall', [
  { id: 'stopped-u1', role: 'user', content: '请介绍这件陶器？' },
  { id: 'stopped-a1', role: 'assistant', content: '（已停止）' },
])
assert.strictEqual(tourStore.hasResumableConversation(), false, 'a stop marker must not count as a completed assistant answer')
tourStore.saveHallChatMessages('basic-exhibition-hall', [
  { id: 'partial-u1', role: 'user', content: '请介绍这件陶器？' },
  { id: 'partial-a1', role: 'assistant', content: '这件陶器用于测试（已停止）' },
])
assert.strictEqual(tourStore.hasResumableConversation(), false, 'a partial answer ending in the stop marker must remain incomplete')
tourStore.saveHallChatMessages('basic-exhibition-hall', [
  { id: 'resume-u1', role: 'user', content: '彩陶纹样有什么规律？' },
  { id: 'resume-a1', role: 'assistant', content: '先比较人面纹与鱼纹的组合位置。' },
])
assert.strictEqual(tourStore.hasResumableConversation(), true, 'a completed stored exchange should enable the home resume entry')

resetStorage()
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'expired-session'
storage[storageUtil.KEYS.TOUR_SESSION_TOKEN] = 'expired-token'
storage[storageUtil.KEYS.TOUR_SESSION_CREATED_AT] = Date.now() - 25 * 60 * 60 * 1000
storage[storageUtil.KEYS.TOUR_SESSION_SCHEMA_VERSION] = storageUtil.TOUR_SESSION_SCHEMA_VERSION
storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION] = storageUtil.TOUR_CACHE_SCHEMA_VERSION
reloadTourStore()
assert.strictEqual(tourStore.getTourState().sessionId, null, 'expired session cache should be ignored')

resetStorage()
storage[storageUtil.KEYS.TOUR_SESSION_ID] = 'missing-token-session'
storage[storageUtil.KEYS.TOUR_SESSION_CREATED_AT] = Date.now()
storage[storageUtil.KEYS.TOUR_SESSION_SCHEMA_VERSION] = storageUtil.TOUR_SESSION_SCHEMA_VERSION
storage[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION] = storageUtil.TOUR_CACHE_SCHEMA_VERSION
reloadTourStore()
assert.strictEqual(tourStore.getTourState().sessionId, null, 'a session without its guest token must not be resumable')
assert.strictEqual(tourStore.hasResumableTourSession(), false)

resetStorage()
storageUtil.ensureTourCacheSchema()
reloadTourStore()

const HALLS = [
  'museum-imported-hall',
  'another-imported-hall',
]
const PERSONAS = ['default', 'A', 'B', 'C', 'D']

function resetTour(personaId, hall) {
  tourStore.clearTour()
  tourStore.updateTourState({
    personaId: personaId,
    persona: ['A', 'B', 'C', 'D'].indexOf(personaId) >= 0 ? personaId : 'default',
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
    assert.deepStrictEqual(
      suggestions,
      [],
      hall + ' / ' + personaId + ' production hall mode must not expose bundled fact templates'
    )
  })
})

const backendSuggestions = tourStore.buildServerGuideSuggestions([
  '陶盆口沿有哪些磨损？',
  '石器刃部痕迹有何不同？',
])
assert.deepStrictEqual(
  backendSuggestions.map(function (item) { return item.payload.prompt }),
  ['陶盆口沿有哪些磨损？', '石器刃部痕迹有何不同？'],
  'contentful backend suggestion text must pass through without replacement by static hall templates'
)
assert.deepStrictEqual(
  backendSuggestions.map(function (item) { return item.title }),
  ['陶盆口沿有哪些磨损？', '石器刃部痕迹有何不同？'],
  'suggestion chips must display each accepted short question in full without frontend ellipsis'
)
assert.deepStrictEqual(tourStore.buildServerGuideSuggestions(null), [], 'missing backend suggestions must keep the bar empty')
assert.deepStrictEqual(tourStore.buildServerGuideSuggestions(['', null, 123]), [], 'malformed backend suggestions must keep the bar empty')
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions([
    '陶器口沿哪里有磨损？',
    '看看石器哪里最锋利？',
    '柱洞是怎么建成的？',
    '这件陶器怎么使用？',
    '彩陶纹样哪里在重复？',
    '骨器和石器用途相同吗？',
    '陶窑里面怎么烧陶器？',
  ])
    .map(function (item) { return item.payload.prompt }),
  [
    '陶器口沿哪里有磨损？',
    '看看石器哪里最锋利？',
    '柱洞是怎么建成的？',
    '这件陶器怎么使用？',
    '彩陶纹样哪里在重复？',
    '骨器和石器用途相同吗？',
  ],
  'the horizontal suggestion bar should preserve the backend contract of up to six trusted suggestions'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions([
    '眼前这些内容可以怎样理解？',
    '眼前这些展品可以怎样理解？',
    '这是一条测试数据吗？',
    '真实数据接入后会如何替换？',
    '这个展厅最值得先看什么？',
    '这里有哪些可以直接观察的证据？',
    '这些材料反映了怎样的史前生活？',
    '馆方自定义：这条建议只存在于服务端。',
  ]),
  [],
  'maintenance, test and unanchored vague suggestions must never reach the visitor'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions(['陶罐口沿磨损']),
  [],
  'a suggestion without a Chinese or ASCII question mark must be rejected'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions(['陶罐口沿磨损？']),
  [],
  'a seven-character question remains below the visitor-chip minimum'
)
assert.strictEqual(tourStore.buildServerGuideSuggestions(['陶罐口沿有磨损？']).length, 1, 'the eight-character boundary must remain valid')
const targetLengthSuggestion = '尖底瓶口沿磨损' + '痕'.repeat(15 - '尖底瓶口沿磨损'.length) + '？'
assert.strictEqual(targetLengthSuggestion.length, 16)
assert.strictEqual(
  tourStore.buildServerGuideSuggestions([targetLengthSuggestion]).length,
  1,
  'a production-target 16-character suggestion must remain valid'
)
const maxLengthSuggestion = targetLengthSuggestion.slice(0, -1) + '迹象？'
assert.strictEqual(maxLengthSuggestion.length, 18)
assert.strictEqual(tourStore.buildServerGuideSuggestions([maxLengthSuggestion]).length, 1, 'the 18-character boundary must remain valid')
const overMaxSuggestion = maxLengthSuggestion.slice(0, -1) + '痕？'
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions([overMaxSuggestion]),
  [],
  'a 19-character suggestion must be rejected by the mini-program boundary'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions([
    '观察彩陶盆口沿的磨损，能否判断它在不同生活场景中的具体使用方式？',
    '从考古类型学与地层学角度比较这些陶器的年代关系？',
  ]),
  [],
  'old overlong backend suggestions are expected to leave the bar empty during a staggered deployment; they must not be truncated into chips'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions([
    '比较两件石器的刃部形制？',
    '出土层位能说明什么？',
    '怎样建立完整证据链？',
    '纹样与用途有什么对应关系？',
  ]),
  [],
  'academic terminology must be rejected until the backend rewrites it as visitor-friendly questions'
)
assert.deepStrictEqual(
  tourStore.buildServerGuideSuggestions(['彩陶盆纹样画了什么？'])
    .map(function (item) { return item.payload.prompt }),
  ['彩陶盆纹样画了什么？'],
  'a concrete exhibit anchor should preserve a legitimate interpretation question'
)

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
const legacyBackAction = 'navigate' + '_back'
assert.strictEqual(
  rawExhibitSuggestions.some(function (item) {
    return (item.title && item.title.indexOf('返回') >= 0 && item.title.indexOf('列表') >= 0) ||
      item.actionType === legacyBackAction
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
const backendTourChat = fs.readFileSync(
  path.join(__dirname, '..', '..', 'backend', 'backend', 'app', 'application', 'tour_chat_service.py'),
  'utf8'
)
assert.ok(
  backendTourChat.indexOf('parts.append(f"当前展厅：{hall_context}")') >= 0,
  'backend tour system prompt should inject trusted database hall_context'
)
assert.strictEqual(
  backendTourChat.indexOf('HALL_DESCRIPTIONS'),
  -1,
  'backend must not retain a second hardcoded nine-hall description catalogue'
)
assert.ok(
  backendTourChat.indexOf('临展厅回答规则') >= 0 &&
    backendTourChat.indexOf('不要编造当期展品') >= 0 &&
    backendTourChat.indexOf('需要向馆方确认的信息') >= 0,
  'temporary halls must keep the anti-fabrication and museum-confirmation rules'
)

async function verifyTourPageSuggestionBoundary() {
  let tourPageConfig = null
  global.Page = function (config) { tourPageConfig = config }
  delete require.cache[require.resolve('../pages/tour/tour')]
  require('../pages/tour/tour')
  assert.ok(tourPageConfig, 'tour page config should load for suggestion runtime checks')
  const kilnWelcome = tourPageConfig._buildWelcomeMessage(
    'kiln-hall',
    '馆方更名后的陶窑专题厅',
    '本厅展示馆方导入的陶窑专题资料。',
    '讲解陶器制坯、装饰与入窑烧成。'
  )
  const temporaryWelcome = tourPageConfig._buildWelcomeMessage(
    'temporary-hall-1',
    '馆方临时专题厅',
    '本期围绕馆方新近整理的专题内容展开。',
    '集中呈现当期专题展览的主题内容。'
  )
  assert.ok(kilnWelcome.indexOf('欢迎来到馆方更名后的陶窑专题厅，这里讲解陶器制坯、装饰与入窑烧成。') === 0)
  assert.strictEqual(kilnWelcome.indexOf('本厅展示馆方导入的陶窑专题资料'), -1, 'welcome must not repeat the long hall description')
  assert.ok(kilnWelcome.indexOf('先选一件展品或一处遗迹') >= 0, 'welcome should offer one concrete data-independent starting action')
  assert.ok(temporaryWelcome.indexOf('欢迎来到馆方临时专题厅，这里集中呈现当期专题展览的主题内容。') === 0)
  assert.notStrictEqual(kilnWelcome, temporaryWelcome, 'different trusted hall rows must produce different welcome content')
  const dynamicWelcome = tourPageConfig._buildWelcomeMessage(
    'current-hall',
    '当前展厅',
    '本厅介绍馆方当前开放的专题内容，并说明相关展项。',
    '介绍馆方当前开放的专题内容。'
  )
  assert.ok(dynamicWelcome.indexOf('欢迎来到当前展厅，这里介绍馆方当前开放的专题内容。') === 0)
  assert.strictEqual(dynamicWelcome.indexOf('并说明相关展项'), -1, 'dynamic halls should also prefer structured card copy')
  const multiSentenceWelcome = tourPageConfig._buildWelcomeMessage(
    'current-hall',
    '当前展厅',
    '不应使用的完整介绍。',
    '先看房屋遗迹。再看墓葬位置！最后核对展签？'
  )
  assert.ok(
    multiSentenceWelcome.indexOf('先看房屋遗迹，再看墓葬位置，最后核对展签。') >= 0,
    'multi-sentence short copy should be joined into one coherent welcome sentence'
  )
  const unknownWelcome = tourPageConfig._buildWelcomeMessage('', '', '', '')
  assert.ok(unknownWelcome.indexOf('可从现场展品与展签开始了解本厅。') === 0)
  assert.strictEqual(unknownWelcome.indexOf('陶窑'), -1, 'missing hall data must not invent a known-hall fact')
  ;[kilnWelcome, temporaryWelcome, dynamicWelcome, multiSentenceWelcome, unknownWelcome].forEach(function (message) {
    assert.strictEqual(message.indexOf('不把其他展厅的内容混进来'), -1)
    assert.strictEqual((message.match(/[。！？]/g) || []).length, 2, 'welcome must contain exactly two concise sentences')
    assert.strictEqual(message.split('\n').length, 2, 'welcome should say what to see and how to start on separate lines')
    assert.ok(message.indexOf('告诉我你注意到的一个细节') >= 0)
  })
  const questionId = '1700000000000-question-stable'
  assert.strictEqual(tourPageConfig._assistantClientEventId(questionId), questionId + ':assistant')
  assert.ok(tourPageConfig._assistantClientEventId(questionId).length <= 120)
  tourStore.updateTourState({ serverStateVersion: 5 })
  assert.strictEqual(tourPageConfig._applyStreamStateVersion({ state_version: 7 }), 7)
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 7)
  assert.strictEqual(tourPageConfig._applyStreamStateVersion({ state_version: 6 }), 7, 'a late done event must not downgrade OCC state')

  const api = require('../api/index')
  const originalGetSuggestions = api.tourApi.getSuggestions
  const originalCreateSession = api.tourApi.createSession
  const originalSetTimeout = global.setTimeout
  const originalWarn = console.warn
  const page = Object.assign({}, tourPageConfig, {
    data: Object.assign({}, tourPageConfig.data, {
      hallName: '馆方新专题厅',
      currentExhibit: null,
      guideSuggestions: [{ payload: { prompt: '旧静态建议' } }],
      showSuggestions: true,
    }),
    _suggestionSeq: 0,
    _suggestionFetchTimer: null,
    _suggestionLoadingSeq: 0,
    _guideSuggestionsSig: '',
    setData: function (patch) {
      this.data = Object.assign({}, this.data, patch || {})
    },
  })

  try {
    global.setTimeout = function (fn) { return originalSetTimeout(fn, 0) }
    tourStore.invalidateTourSession()
    tourStore.updateTourState({
      currentHall: 'new-special-hall',
      currentHallName: '馆方新专题厅',
      currentExhibitId: null,
    })
    page.data.sessionId = null
    assert.strictEqual(tourStore.getTourState().sessionId, null, 'page-first runtime test must start before guest session creation finishes')
    assert.strictEqual(tourStore.getTourState().currentHall, 'new-special-hall', 'runtime test requires the dynamic backend hall slug')

    let resolveSessionCreate = null
    let sessionCreateCount = 0
    let suggestionRequestCount = 0
    api.tourApi.createSession = function () {
      sessionCreateCount += 1
      return new Promise(function (resolve) { resolveSessionCreate = resolve })
    }
    api.tourApi.getSuggestions = function () {
      suggestionRequestCount += 1
      return Promise.resolve({
        ok: true,
        data: { suggestions: ['陶盆口沿为什么会磨损？'] },
      })
    }
    page._loadSuggestions()
    assert.deepStrictEqual(page.data.guideSuggestions, [], 'suggestion bar must clear while the backend request is pending')
    await new Promise(function (resolve) { originalSetTimeout(resolve, 20) })
    assert.strictEqual(sessionCreateCount, 1, 'page-first suggestion loading must join guest-session bootstrap')
    assert.strictEqual(suggestionRequestCount, 0, 'suggestions must wait until the guest session is ready')

    // A repeated page/context refresh while session creation is pending must
    // share the same bootstrap and produce only one final suggestions request.
    page._loadSuggestions()
    await new Promise(function (resolve) { originalSetTimeout(resolve, 20) })
    assert.strictEqual(sessionCreateCount, 1, 'repeated suggestion loads must reuse the in-flight guest session')
    resolveSessionCreate({
      ok: true,
      status: 201,
      data: { id: 'late-suggestion-session', session_token: 'late-suggestion-token' },
    })
    await new Promise(function (resolve) { originalSetTimeout(resolve, 60) })
    assert.strictEqual(tourStore.getTourState().sessionId, 'late-suggestion-session', 'late guest-session success must become the active session')
    assert.strictEqual(suggestionRequestCount, 1, 'late guest-session success must trigger exactly one suggestions request')
    assert.deepStrictEqual(
      page.data.guideSuggestions.map(function (item) { return item.payload.prompt }),
      ['陶盆口沿为什么会磨损？'],
      'successful runtime suggestions must contain only backend response text'
    )

    api.tourApi.getSuggestions = function () {
      return Promise.resolve({
        ok: true,
        data: { suggestions: ['观察彩陶盆口沿的磨损，能否判断它在不同生活场景中的具体使用方式？'] },
      })
    }
    page._loadSuggestions()
    await new Promise(function (resolve) { originalSetTimeout(resolve, 60) })
    assert.deepStrictEqual(
      page.data.guideSuggestions,
      [],
      'old long suggestions may temporarily produce an empty bar until the short-copy backend is deployed'
    )
    assert.strictEqual(page.data.showSuggestions, false, 'an all-filtered old response should hide the empty container')

    console.warn = function () {}
    api.tourApi.getSuggestions = function () {
      return Promise.reject(new Error('network unavailable'))
    }
    page._loadSuggestions()
    await new Promise(function (resolve) { originalSetTimeout(resolve, 60) })
    assert.deepStrictEqual(page.data.guideSuggestions, [], 'failed suggestion requests must not retain prior or static suggestions')
    assert.strictEqual(page.data.showSuggestions, false, 'failed suggestion requests must hide the empty suggestion bar')
  } finally {
    api.tourApi.getSuggestions = originalGetSuggestions
    api.tourApi.createSession = originalCreateSession
    global.setTimeout = originalSetTimeout
    console.warn = originalWarn
  }
}

verifyTourPageSuggestionBoundary().then(function () {
  console.log('guide suggestion checks passed: backend-owned hall mode and exhibit mode')
}).catch(function (err) {
  console.error(err)
  process.exitCode = 1
})
