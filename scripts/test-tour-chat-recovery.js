const assert = require('assert')

const memory = {}
const toasts = []
let pageConfig = null

global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
  showLoading: function () {},
  hideLoading: function () {},
  showToast: function (options) { toasts.push(options && options.title) },
}
global.Page = function (config) { pageConfig = config }

const api = require('../api/index')
const chatStore = require('../store/chat')
const tourStore = require('../store/tour')
const tourSync = require('../utils/tour-sync')
require('../pages/tour/tour')

function makePage() {
  return Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data || {})),
    _streamTask: null,
    _retryQuestionEvent: null,
    _sessionRecoveryRetrying: false,
    _contextSyncing: false,
    _skipContextSyncOnce: false,
    _suggestionLoadingSeq: 0,
    _suggestionFetchTimer: null,
    _chunkBuffer: '',
    _streamText: '',
    setData: function (patch, callback) {
      this.data = Object.assign({}, this.data, patch || {})
      if (callback) callback()
    },
    _scrollToBottom: function () {},
    _scrollToBottomAfterRestore: function () {},
    _scrollToBottomSettled: function () {},
    _syncHallChatAndSummary: function () {},
    _loadSuggestions: function () {},
  })
}

function resetTour(sessionId, token) {
  tourStore.clearTour()
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.updateTourState({
    currentHall: 'kiln-hall',
    currentHallName: '陶窑专题厅',
    status: 'touring',
    currentPage: 'pages/tour/tour',
  })
  tourStore.setTourSession({ sessionId: sessionId, sessionToken: token })
  chatStore.resetChat()
  toasts.length = 0
}

function nextTurn() {
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return
    await nextTurn()
  }
  assert.fail('timed out waiting for ' + label)
}

async function run() {
  const originalChatStream = api.tourApi.chatStream
  const originalCreateSession = api.tourApi.createSession
  const originalEnsureContext = tourSync.ensureSessionContext
  const originalQueueSnapshot = tourSync.queueSessionSnapshot
  const originalConsoleError = console.error
  const streams = []
  let createCount = 0

  api.tourApi.chatStream = function (id, options) {
    streams.push({ id: id, options: options })
    return { abort: function () {} }
  }
  tourSync.ensureSessionContext = function () {
    return Promise.resolve({ ok: true, status: 200 })
  }
  tourSync.queueSessionSnapshot = function () {
    return Promise.resolve({ ok: true, status: 200 })
  }
  console.error = function () {}

  try {
    // The route hall owns an already-open tour page even when a legal home GET
    // later restores a different server hall. Imported history for the owned
    // hall refreshes the page, while send/save operations never bleed into B.
    resetTour('page-owner-session', 'page-owner-token')
    const hallA = 'basic-exhibition-hall'
    const hallB = 'kiln-hall'
    const localHallA = [{ id: 'local-a', role: 'assistant', content: 'A厅本地历史' }]
    chatStore.setMessages(localHallA)
    tourStore.saveHallChatMessages(hallA, localHallA)
    let ownerPage = makePage()
    ownerPage._pageHallSlug = hallA
    ownerPage._pageHallName = '基本陈列展厅'
    ownerPage._pageLocalTourId = tourStore.getTourState().localTourId
    ownerPage.data.hallName = '基本陈列展厅'
    ownerPage.data.messages = localHallA
    tourStore.applyServerResumeState({
      state_version: 2,
      current_hall: hallB,
      resume_state: { current_hall: hallB, current_hall_name: '陶窑专题厅' },
      hall_chat_history: {
        'basic-exhibition-hall': [
          { id: 'server-a-user', role: 'user', content: 'A厅服务端补充问题' },
          { id: 'server-a-ai', role: 'assistant', content: 'A厅服务端补充回答' },
        ],
        'kiln-hall': [{ id: 'server-b', role: 'assistant', content: 'B厅服务端历史' }],
      },
    })
    assert.strictEqual(tourStore.getTourState().currentHall, hallB, 'fixture should reproduce the server hall overwrite before page coordination')
    ownerPage._applyBackgroundResumeState({
      localTourId: ownerPage._pageLocalTourId,
      sessionId: 'page-owner-session',
      payload: {
        current_hall: hallB,
        hall_chat_history: {
          'basic-exhibition-hall': [
            { id: 'server-a-user', role: 'user', content: 'A厅服务端补充问题' },
            { id: 'server-a-ai', role: 'assistant', content: 'A厅服务端补充回答' },
          ],
          'kiln-hall': [{ id: 'server-b', role: 'assistant', content: 'B厅服务端历史' }],
        },
      },
    })
    assert.strictEqual(tourStore.getTourState().currentHall, hallA, 'the visible A page must reassert its hall owner without a second navigation')
    assert.deepStrictEqual(ownerPage.data.messages.map(function (message) { return message.content }), [
      'A厅服务端补充问题', 'A厅服务端补充回答',
    ], 'background resume should refresh only the visible hall history')
    assert.ok(ownerPage.data.messages.every(function (message) {
      return message.content.indexOf('B厅') !== 0
    }))

    chatStore.setMessages([{ id: 'page-a-new', role: 'assistant', content: 'A页新增记录' }])
    tourStore.updateTourState({ currentHall: hallB, currentHallName: '陶窑专题厅' })
    pageConfig._persistCurrentHallChat.call(ownerPage)
    assert.strictEqual(tourStore.getHallChatMessages(hallA)[0].content, 'A页新增记录', 'page persistence must use its entry hall owner')
    assert.strictEqual(tourStore.getHallChatMessages(hallB)[0].content, 'B厅服务端历史', 'page persistence must not overwrite another hall')
    ownerPage.data.messages = [{ id: 'page-a-new', role: 'assistant', content: 'A页新增记录' }]
    ownerPage.data.inputText = '继续问A厅'
    ownerPage._skipContextSyncOnce = true
    ownerPage.sendMessage()
    await waitFor(function () { return streams.length === 1 }, 'page-owner chat stream')
    assert.strictEqual(streams[0].options.hallId, hallA, 'chat must remain bound to the visible A page')
    assert.ok(streams[0].options.conversationHistory.every(function (message) {
      return message.content.indexOf('B厅') !== 0
    }), 'chat history must not include B after a late server hall restore')
    streams[0].options.onDone({ content: 'A厅回答', trace_id: 'owner-trace', state_version: 3 })
    streams.length = 0

    // A same-hall background GET can add history after onLoad/onShow; the open
    // page must repaint it instead of requiring another navigation cycle.
    resetTour('same-hall-session', 'same-hall-token')
    const sameHallInitial = [{ id: 'same-old', role: 'assistant', content: '同厅旧历史' }]
    chatStore.setMessages(sameHallInitial)
    tourStore.saveHallChatMessages(hallB, sameHallInitial)
    let sameHallPage = makePage()
    sameHallPage._pageHallSlug = hallB
    sameHallPage._pageHallName = '陶窑专题厅'
    sameHallPage._pageLocalTourId = tourStore.getTourState().localTourId
    sameHallPage.data.hallName = '陶窑专题厅'
    sameHallPage.data.messages = sameHallInitial
    sameHallPage._applyBackgroundResumeState({
      localTourId: sameHallPage._pageLocalTourId,
      payload: {
        current_hall: hallB,
        hall_chat_history: {
          'kiln-hall': [
            { id: 'same-user', role: 'user', content: '同厅补充问题' },
            { id: 'same-ai', role: 'assistant', content: '同厅补充回答' },
          ],
        },
      },
    })
    assert.deepStrictEqual(sameHallPage.data.messages.map(function (message) { return message.content }), [
      '同厅补充问题', '同厅补充回答',
    ], 'same-hall server history should refresh the already-open page')

    // A completed SSE keeps both sides of the stable event pair pending. If
    // chat-service best-effort persistence failed, the later batch can repair
    // both; if it succeeded, backend client_event_id idempotency skips both.
    resetTour('pair-session', 'pair-token')
    const currentHallHistory = []
    const otherHallHistory = []
    for (let index = 0; index < 35; index++) {
      currentHallHistory.push({
        id: 'current-' + index,
        role: index % 2 ? 'user' : 'assistant',
        content: '当前陶窑厅-' + index,
      })
      otherHallHistory.push({
        id: 'other-' + index,
        role: index % 2 ? 'user' : 'assistant',
        content: '其他基本厅-' + index,
      })
    }
    tourStore.saveHallChatMessages('kiln-hall', currentHallHistory)
    tourStore.saveHallChatMessages('basic-exhibition-hall', otherHallHistory)
    let page = makePage()
    page.data.inputText = '这座陶窑如何使用？'
    page.sendMessage()
    await waitFor(function () { return streams.length === 1 }, 'first chat stream')
    assert.strictEqual(streams[0].options.conversationHistory.length, 30, 'next chat should submit only the current hall latest 30 messages')
    assert.strictEqual(streams[0].options.conversationHistory[0].content, '当前陶窑厅-5')
    assert.strictEqual(streams[0].options.conversationHistory[29].content, '当前陶窑厅-34')
    assert.ok(streams[0].options.conversationHistory.every(function (message) {
      return message.content.indexOf('当前陶窑厅-') === 0
    }), 'another hall history must never enter the current hall chat request')
    streams[0].options.onDone({ content: '请观察窑室、火道和操作面。', trace_id: 'pair-trace', state_version: 2 })
    let pending = tourStore.getTourState().pendingEvents
    assert.deepStrictEqual(pending.map(function (event) { return event.event_type }), [
      'exhibit_question',
      'assistant_answer',
    ])
    const questionId = pending[0].metadata.client_event_id
    assert.strictEqual(pending[1].metadata.question_client_event_id, questionId)
    assert.strictEqual(pending[1].metadata.client_event_id, questionId + ':assistant')

    // A late 403 from session A must reuse peer-recovered session B instead of
    // invalidating B. The automatic resend reuses the same question event ID.
    streams.length = 0
    createCount = 0
    resetTour('peer-session-a', 'peer-token-a')
    page = makePage()
    page.data.inputText = '这个火道有什么作用？'
    page.sendMessage()
    await waitFor(function () { return streams.length === 1 }, 'peer stream A')
    const peerQuestionId = streams[0].options.clientEventId
    const peerLocalTourId = tourStore.getTourState().localTourId
    tourStore.invalidateTourSession()
    tourStore.setTourSession({ sessionId: 'peer-session-b', sessionToken: 'peer-token-b' })
    api.tourApi.createSession = function () {
      createCount += 1
      return Promise.reject(new Error('peer recovery must not create session C'))
    }
    streams[0].options.onError({ status: 403, message: 'late A ownership failure' })
    await waitFor(function () { return streams.length === 2 }, 'peer resend on B')
    assert.strictEqual(tourStore.getTourState().localTourId, peerLocalTourId)
    assert.strictEqual(tourStore.getTourState().sessionId, 'peer-session-b')
    assert.strictEqual(tourStore.getTourState().sessionToken, 'peer-token-b')
    assert.strictEqual(createCount, 0, 'late A must not bootstrap over peer session B')
    assert.strictEqual(streams[1].id, 'peer-session-b')
    assert.strictEqual(streams[1].options.clientEventId, peerQuestionId)
    streams[1].options.onDone({ content: '它负责引导热流。', trace_id: 'peer-trace', state_version: 3 })
    pending = tourStore.getTourState().pendingEvents
    assert.strictEqual(pending.filter(function (event) { return event.event_type === 'exhibit_question' }).length, 1)
    assert.strictEqual(pending.filter(function (event) { return event.event_type === 'assistant_answer' }).length, 1)

    // Repeated ownership failures get one automatic recovery/resend only. The
    // second 403 becomes a visible error and cannot recurse into create loops.
    streams.length = 0
    createCount = 0
    resetTour('retry-session-a', 'retry-token-a')
    page = makePage()
    api.tourApi.createSession = function () {
      createCount += 1
      return Promise.resolve({
        ok: true,
        status: 201,
        data: {
          id: 'retry-session-b',
          session_token: 'retry-token-b',
          state_version: 1,
          status: 'onboarding',
          current_hall: null,
          visited_halls: [],
          resume_state: {},
        },
      })
    }
    page.data.inputText = '连续失效测试'
    page.sendMessage()
    await waitFor(function () { return streams.length === 1 }, 'retry stream A')
    const retryQuestionId = streams[0].options.clientEventId
    streams[0].options.onError({ status: 403, message: 'A expired' })
    await waitFor(function () { return streams.length === 2 }, 'single automatic resend')
    assert.strictEqual(createCount, 1)
    assert.strictEqual(streams[1].id, 'retry-session-b')
    assert.strictEqual(streams[1].options.clientEventId, retryQuestionId)
    streams[1].options.onError({ status: 403, message: 'B also expired' })
    await nextTurn()
    await nextTurn()
    assert.strictEqual(streams.length, 2, 'a second 403 for the same user message must not auto-resend again')
    assert.strictEqual(createCount, 1, 'a second 403 must not create session C')
    assert.strictEqual(page._sessionRecoveryRetrying, false)
    assert.ok(toasts.some(function (title) { return title && title.indexOf('请求参数') >= 0 }))
    pending = tourStore.getTourState().pendingEvents
    assert.strictEqual(pending.filter(function (event) { return event.event_type === 'exhibit_question' }).length, 1)
    assert.strictEqual(pending.filter(function (event) { return event.event_type === 'assistant_answer' }).length, 0)

    // A session ID without a guest token is never considered ready by the
    // actual page entry; it is replaced before the next stream can start.
    createCount = 0
    resetTour('partial-session', null)
    page = makePage()
    api.tourApi.createSession = function () {
      createCount += 1
      return Promise.resolve({
        ok: true,
        status: 201,
        data: { id: 'complete-session', session_token: 'complete-token', state_version: 1 },
      })
    }
    const ready = await page._ensureTourSession()
    assert.strictEqual(ready, true)
    assert.strictEqual(createCount, 1)
    assert.strictEqual(tourStore.getTourState().sessionId, 'complete-session')
    assert.strictEqual(tourStore.getTourState().sessionToken, 'complete-token')
  } finally {
    api.tourApi.chatStream = originalChatStream
    api.tourApi.createSession = originalCreateSession
    tourSync.ensureSessionContext = originalEnsureContext
    tourSync.queueSessionSnapshot = originalQueueSnapshot
    console.error = originalConsoleError
  }

  console.log('tour chat recovery and pending event checks passed')
}

run().catch(function (error) {
  console.error(error)
  process.exitCode = 1
})
