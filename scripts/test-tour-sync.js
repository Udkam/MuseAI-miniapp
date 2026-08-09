const assert = require('assert')

const memory = {}
let capturedRequest = null
let deferWxRequests = false
const pendingWxRequests = []
global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
  request: function (options) {
    capturedRequest = options
    if (deferWxRequests) {
      pendingWxRequests.push(options)
      return { onChunkReceived: function () {}, abort: function () {} }
    }
    options.success({ statusCode: 200, data: { id: 'created-session', session_token: 'created-token' } })
    return { onChunkReceived: function () {}, abort: function () {} }
  },
}

const storage = require('../utils/storage')
const api = require('../api/index')
const tourStore = require('../store/tour')
const tourSync = require('../utils/tour-sync')

function nextTurn() {
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return
    await nextTurn()
  }
  throw new Error('timed out waiting for ' + label)
}

function resetTour() {
  Object.keys(memory).forEach(function (key) { delete memory[key] })
  tourStore.clearTour()
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'D', personaId: 'B' })
  tourStore.setOnboardingExtras({
    intentText: '重点看聚落证据',
    preferredHallOrder: ['basic', 'site'],
    timeBudget: 'dialogue',
    focusId: 'study',
    focusTitle: '带着任务研学',
    focusPrompt: '优先记录可观察证据。',
    assumptionText: '先跟证据走',
    guideModeId: 'dialogue',
    guideModeTitle: '边看边问',
    guideModePrompt: '用对话节奏组织回答。',
  })
  tourStore.setTourSession({ sessionId: 'session-1', sessionToken: 'token-1' })
  tourStore.updateTourState({ currentHall: 'basic-exhibition-hall', status: 'touring', serverStateVersion: 1 })
}

function assertExactKeys(value, expected, label) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), label)
}

async function run() {
  tourStore.clearTour()
  tourStore.createLocalTourState({ interestType: 'default', persona: 'default', assumption: 'D', personaId: 'default' })
  tourStore.setOnboardingExtras({ focusId: 'default', guideModeId: 'default' })
  tourStore.setTourSession({ sessionId: 'quick-session', sessionToken: 'quick-token' })
  tourStore.applyServerResumeState({
    persona: 'default',
    questionnaire: {
      persona_id: 'default', focus_id: 'default', assumption: 'D', rhythm_id: 'default',
      intent_text: null, preferred_hall_order: [],
    },
    resume_state: { persona: 'default', persona_id: 'default' },
  })
  assert.strictEqual(tourStore.getTourState().persona, 'default', 'quick-start must remain an independent default persona')
  assert.strictEqual(tourStore.getTourState().personaId, 'default')
  assert.strictEqual(tourStore.getBackendPersona(), 'default', 'default must never map to persona B')
  assert.strictEqual(tourStore.getPersonaLabel(), '默认导览')
  assert.strictEqual(tourStore.getQuestionnaireState().persona_id, 'default')
  assert.strictEqual(tourStore.getReportThemeTitle(), '半坡游览报告')

  resetTour()

  const backendExhibitId = '123e4567-e89b-12d3-a456-426614174000'
  tourStore.setCurrentExhibit({
    id: backendExhibitId, name: '真实展品', hall: 'basic-exhibition-hall',
  })
  assert.strictEqual(tourStore.getTourState().currentExhibitId, backendExhibitId, 'a <=36-char backend ID should be retained')
  assert.strictEqual(tourStore.getCurrentExhibit().name, '真实展品')

  tourStore.setCurrentExhibit({
    id: 'local-fallback-exhibit', name: '本地兜底展品', hall: 'basic-exhibition-hall',
  })
  assert.strictEqual(tourStore.getTourState().currentExhibitId, null, 'local IDs must not enter the syncable top-level field')
  assert.strictEqual(tourStore.getCurrentExhibit().id, 'local-fallback-exhibit', 'local display context should remain available')
  assert.strictEqual(tourStore.buildResumeState().current_exhibit_id, null)
  assert.strictEqual(tourStore.buildResumeState().current_exhibit.id, 'local-fallback-exhibit')

  tourStore.setCurrentExhibit({ id: 'mock-demo-1', name: '模拟展品' })
  assert.strictEqual(tourStore.getTourState().currentExhibitId, null, 'mock IDs must not enter the syncable top-level field')
  assert.strictEqual(tourStore.getCurrentExhibit().name, '模拟展品')

  const oversizedExhibitId = 'x'.repeat(37)
  tourStore.setCurrentExhibit({ id: oversizedExhibitId, name: '超长 ID 展品' })
  assert.strictEqual(tourStore.getTourState().currentExhibitId, null, 'IDs longer than DB String(36) must not sync')
  assert.strictEqual(tourStore.getCurrentExhibit().id, oversizedExhibitId, 'an oversized local display ID should remain on the display object')
  assert.strictEqual(tourStore.normalizeBackendExhibitId('LOCAL-upper'), null)
  assert.strictEqual(tourStore.normalizeBackendExhibitId('mock-anything'), null)
  assert.strictEqual(tourStore.normalizeBackendExhibitUuid(backendExhibitId), backendExhibitId)
  assert.strictEqual(tourStore.normalizeBackendExhibitUuid('basic-ex-1'), null, 'trusted report counts require a backend UUID')

  tourStore.addTourEvent({
    eventType: 'exhibit_question', exhibitId: 'local-fallback-exhibit', hall: 'basic-exhibition-hall',
    metadata: { exhibit_name: '本地兜底展品' },
  })
  const localEvents = tourStore.drainPendingEvents()
  assert.strictEqual(localEvents[0].exhibit_id, null, 'local IDs must not enter event exhibit_id')
  assert.strictEqual(localEvents[0].metadata.exhibit_name, '本地兜底展品')
  resetTour()

  const questionnaire = tourStore.getQuestionnaireState()
  assertExactKeys(questionnaire, [
    'persona_id', 'focus_id', 'assumption', 'rhythm_id', 'intent_text', 'preferred_hall_order',
  ], 'questionnaire fixture must match backend TourQuestionnaire')

  tourStore.updateTourState({
    routePlan: {
      steps: [{
        order: 1,
        hallId: 'basic-exhibition-hall',
        hallSlug: 'basic-exhibition-hall',
        name: '基本陈列展厅',
        short: '基本',
        highlights: [],
        duration: '约 15 分钟',
        estimatedMinutes: 15,
        exhibitCount: 6,
        exhibitCountKnown: true,
        reason: '认识半坡遗址考古发现',
        focus: '',
        status: 'current',
        isVisited: false,
        isCurrent: true,
      }],
      floorItems: [],
      totalDesc: '按开放展厅自由参观',
      personaLabel: '器物研究员',
      tagline: '',
      stepsCount: 1,
      routeSource: 'hall-directory-v2',
      routeSourceLabel: '开放展厅目录',
      planSummary: '',
      routeNotice: '',
    },
  })
  const resume = tourStore.buildResumeState()
  assertExactKeys(resume, [
    'status', 'interest_type', 'persona', 'persona_id', 'assumption', 'questionnaire',
    'questionnaire_draft', 'route_plan', 'current_page', 'current_page_params',
    'current_hall', 'current_hall_name', 'current_exhibit_id', 'current_exhibit',
    'current_scanned_exhibit_id', 'current_scanned_exhibit_name', 'last_scan_timestamp',
    'visited_halls', 'visited_exhibit_ids', 'ai_conversation_count', 'tour_started_at',
    'intent_text', 'preferred_hall_order', 'time_budget', 'focus_id', 'focus_title', 'focus_prompt',
    'assumption_text', 'guide_mode_id', 'guide_mode_title', 'guide_mode_prompt',
    'style_preferences', 'tts_preferences',
  ], 'resume fixture must match backend TourResumeState')
  assertExactKeys(resume.route_plan.steps[0], [
    'order', 'hallId', 'hallSlug', 'name', 'short', 'highlights', 'duration',
    'estimatedMinutes', 'exhibitCount', 'exhibitCountKnown', 'reason', 'focus',
    'status', 'isVisited', 'isCurrent',
  ], 'route step fixture must match backend TourRouteStep')
  assert.strictEqual(resume.focus_prompt, '优先记录可观察证据。')
  assert.strictEqual(resume.guide_mode_prompt, '用对话节奏组织回答。')

  tourStore.applyServerResumeState({
    resume_state: {
      current_hall: 'new-special-hall',
      current_hall_name: '新专题展厅',
    },
  })
  assert.strictEqual(tourStore.getTourState().currentHall, 'new-special-hall')
  assert.strictEqual(tourStore.getTourState().currentHallName, '新专题展厅')

  tourStore.applyServerResumeState({
    resume_state: {
      focus_prompt: '服务端恢复关注提示',
      guide_mode_prompt: '服务端恢复节奏提示',
    },
  })
  assert.strictEqual(tourStore.getTourState().focusPrompt, '服务端恢复关注提示')
  assert.strictEqual(tourStore.getTourState().guideModePrompt, '服务端恢复节奏提示')
  resetTour()

  await api.tourApi.createSession({
    interest_type: 'B', persona: 'B', assumption: 'D', guest_id: 'fixture-guest',
    questionnaire: questionnaire, resume_state: resume,
  })
  assert.ok(capturedRequest, 'createSession should issue a request')
  assertExactKeys(capturedRequest.data, [
    'interest_type', 'persona', 'assumption', 'guest_id', 'questionnaire', 'resume_state',
  ], 'createSession JSON fixture should contain only the guest session contract')
  assert.strictEqual(capturedRequest.header.Authorization, undefined, 'mini-program requests must never inject Bearer auth')
  assert.strictEqual(capturedRequest.header['X-Session-Token'], 'token-1')

  const requestHistory = []
  for (let index = 0; index < 32; index++) {
    requestHistory.push({
      role: index % 2 ? 'user' : 'assistant',
      content: '当前厅历史-' + index + '-' + '中'.repeat(1100),
    })
  }
  const chatTask = api.tourApi.chatStream('session-1', {
    message: '这件器物怎么看？',
    token: 'token-1',
    hallId: 'basic-exhibition-hall',
    exhibitId: 'exhibit-1',
    clientEventId: 'client-event-1',
    style: { answer_length: 'brief' },
    conversationHistory: requestHistory,
    ttsOptions: { enabled: true },
    questionnaire: questionnaire,
    clientContext: '不应发送',
    exhibitContext: '不应发送',
  })
  const chatBody = capturedRequest.data
  assertExactKeys(chatBody, [
    'message', 'hall_id', 'exhibit_id', 'client_event_id', 'style', 'conversation_history', 'tts',
  ], 'chat JSON should contain only raw input and structured identifiers/preferences')
  assert.strictEqual(chatBody.questionnaire, undefined, 'chat should use the questionnaire saved in the backend session')
  assert.strictEqual(chatBody.client_context, undefined, 'chat must not send client-built system-like context')
  assert.strictEqual(chatBody.exhibit_context, undefined, 'chat must not send client exhibit prose')
  assert.strictEqual(chatBody.message, '这件器物怎么看？')
  assert.strictEqual(chatBody.tts, true)
  assert.strictEqual(chatBody.conversation_history.length, 30, 'chat requests should submit at most the current hall latest 30 messages')
  assert.ok(chatBody.conversation_history[0].content.indexOf('当前厅历史-2-') === 0)
  assert.ok(chatBody.conversation_history[29].content.indexOf('当前厅历史-31-') === 0)
  assert.ok(chatBody.conversation_history.every(function (message) {
    return message.content.length <= 1000
  }), 'each submitted chat history message should be capped at 1000 characters')
  chatTask.abort()

  const localChatTask = api.tourApi.chatStream('session-1', {
    message: '本地展品问题',
    token: 'token-1',
    hallId: 'basic-exhibition-hall',
    exhibitId: 'local-fallback-exhibit',
  })
  assert.strictEqual(capturedRequest.data.exhibit_id, undefined, 'SSE body must omit a local exhibit ID')
  localChatTask.abort()

  const longMessages = []
  for (let i = 0; i < 35; i++) {
    longMessages.push({ role: i % 2 ? 'user' : 'assistant', content: '中'.repeat(1200) + i })
  }
  tourStore.saveHallChatMessages('basic-exhibition-hall', longMessages)
  const history = tourStore.getHallChatHistoryPayload()['basic-exhibition-hall']
  assert.strictEqual(history.length, 30, 'each hall should sync only its latest 30 messages')
  assert.ok(history.every(function (item) { return item.content.length <= 1000 }), 'history content should fit backend max_length')
  assert.ok(history.every(function (item) {
    return Object.keys(item).sort().join(',') === 'content,role'
  }), 'history messages should send only role/content')

  const originalUpdate = api.tourApi.updateSession
  const originalGet = api.tourApi.getSession
  const originalCreate = api.tourApi.createSession

  var contextPatch = null
  api.tourApi.updateSession = function (id, patch) {
    contextPatch = patch
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 2 } })
  }
  tourStore.updateTourState({ pendingSessionSync: null, serverStateVersion: 1 })
  const localContextResult = await tourSync.ensureSessionContext({
    status: 'touring', currentHall: 'basic-exhibition-hall', currentExhibitId: 'mock-demo-1',
  })
  assert.strictEqual(localContextResult.ok, true)
  assert.strictEqual(contextPatch.current_exhibit_id, null, 'ensureSessionContext must normalize untrusted IDs to null')
  api.tourApi.updateSession = originalUpdate
  tourStore.updateTourState({ pendingSessionSync: null, serverStateVersion: 1 })

  // Race: A is in flight, B is queued. A must not clear B.
  const pendingResponses = []
  api.tourApi.updateSession = function (id, patch) {
    return new Promise(function (resolve) { pendingResponses.push({ patch: patch, resolve: resolve }) })
  }
  const first = tourSync.queueSessionSnapshot({ current_hall: 'basic-exhibition-hall' }, { maxAttempts: 1 })
  await nextTurn()
  tourStore.updateTourState({ currentHall: 'kiln-hall' })
  const second = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  pendingResponses[0].resolve({ ok: true, status: 200, data: { state_version: 2 } })
  await waitFor(function () { return pendingResponses.length === 2 }, 'queued B snapshot')
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.current_hall, 'kiln-hall', 'A response must preserve newer B hall state')
  assert.strictEqual(pendingResponses.length, 2, 'B should flush after A completes')
  assert.strictEqual(pendingResponses[1].patch.expected_state_version, 2, 'B should use the state version returned by A')
  pendingResponses[1].resolve({ ok: true, status: 200, data: { state_version: 3 } })
  await Promise.all([first, second])
  assert.strictEqual(tourStore.getTourState().pendingSessionSync, null)

  // Optimistic version conflict: refresh only the version, keep local state, retry.
  let updateCount = 0
  const versionPatches = []
  const conflictUpdateOptions = []
  let conflictGetOptions = null
  api.tourApi.updateSession = function (id, patch, token, options) {
    versionPatches.push(patch)
    conflictUpdateOptions.push({ id: id, token: token, options: options })
    updateCount++
    if (updateCount === 1) {
      return Promise.resolve({ ok: false, status: 409, data: { detail: 'Expected session state 6, current state is 7' } })
    }
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 8 } })
  }
  api.tourApi.getSession = function (id, token, options) {
    conflictGetOptions = { id: id, token: token, options: options }
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 7, current_hall: 'stale-hall' } })
  }
  tourStore.updateTourState({ serverStateVersion: 6, currentHall: 'kiln-hall', pendingSessionSync: null })
  const conflict = await tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 3 })
  assert.strictEqual(conflict.ok, true)
  assert.strictEqual(versionPatches[1].expected_state_version, 7, 'retry should use refreshed server state_version')
  assert.strictEqual(tourStore.getTourState().currentHall, 'kiln-hall', 'version refresh must not overwrite local pending state')
  assert.ok(conflictUpdateOptions.every(function (call) {
    return call.id === 'session-1' && call.token === 'token-1' &&
      call.options && call.options.skipActivityUpdate === true &&
      call.options.expectedSessionId === 'session-1' &&
      call.options.expectedSessionToken === 'token-1'
  }), 'PATCH retries must carry the exact session owner and suppress request-layer activity side effects')
  assert.strictEqual(conflictGetOptions.id, 'session-1')
  assert.strictEqual(conflictGetOptions.token, 'token-1')
  assert.strictEqual(conflictGetOptions.options.skipActivityUpdate, true)
  assert.strictEqual(conflictGetOptions.options.expectedSessionId, 'session-1')
  assert.strictEqual(conflictGetOptions.options.expectedSessionToken, 'token-1')

  // A schema 422 must remain visible and keep the full snapshot queued.
  api.tourApi.updateSession = function () {
    return Promise.resolve({ ok: false, status: 422, data: { detail: 'contract mismatch' } })
  }
  tourStore.updateTourState({ pendingSessionSync: null })
  const rejected = await tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  assert.strictEqual(rejected.ok, false)
  assert.strictEqual(rejected.status, 422)
  assert.ok(tourStore.getTourState().pendingSessionSync.resume_state, '422 must not silently discard resume_state')
  assert.ok(tourStore.getTourState().pendingSessionSync.hall_chat_history, '422 must not silently discard hall_chat_history')

  // Multiple pages may join the same in-flight snapshot. A non-retryable
  // schema failure must be returned to every waiter without immediately
  // replaying the identical invalid PATCH.
  var resolveJoinedRejection = null
  var joinedRejectionCalls = 0
  api.tourApi.updateSession = function () {
    joinedRejectionCalls++
    return new Promise(function (resolve) { resolveJoinedRejection = resolve })
  }
  tourStore.updateTourState({ pendingSessionSync: null })
  const joinedFirst = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  const joinedSecond = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  const joinedThird = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  await waitFor(function () { return !!resolveJoinedRejection }, 'joined 422 PATCH')
  resolveJoinedRejection({ ok: false, status: 422, data: { detail: 'contract mismatch' } })
  const joinedResults = await Promise.all([joinedFirst, joinedSecond, joinedThird])
  assert.strictEqual(joinedRejectionCalls, 1, 'concurrent waiters must not amplify one invalid PATCH')
  assert.ok(joinedResults.every(function (result) { return result.status === 422 }))
  assert.ok(tourStore.getTourState().pendingSessionSync.resume_state, 'joined 422 must remain queued for a later fixed backend')

  // A joiner must compare against the final patch actually sent by an
  // internal OCC retry, not the version captured before the 409 refresh.
  const retryThenRejectPatches = []
  api.tourApi.updateSession = function (id, patch) {
    retryThenRejectPatches.push(patch)
    if (retryThenRejectPatches.length === 1) {
      return Promise.resolve({ ok: false, status: 409, data: { detail: 'stale version' } })
    }
    return Promise.resolve({ ok: false, status: 422, data: { detail: 'contract mismatch' } })
  }
  api.tourApi.getSession = function () {
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 2 } })
  }
  tourStore.updateTourState({ serverStateVersion: 1, pendingSessionSync: null })
  const retryThenRejectFirst = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 3 })
  const retryThenRejectJoined = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 3 })
  const retryThenRejectResults = await Promise.all([retryThenRejectFirst, retryThenRejectJoined])
  assert.strictEqual(retryThenRejectPatches.length, 2, '409 refresh followed by 422 must not replay the final patch')
  assert.deepStrictEqual(
    retryThenRejectPatches.map(function (patch) { return patch.expected_state_version }),
    [1, 2]
  )
  assert.ok(retryThenRejectResults.every(function (result) { return result.status === 422 }))
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.expected_state_version, 2)

  // If a genuinely newer patch arrives while the first request is in flight,
  // the newer state must still flush after the older request fails.
  var resolveChangedRejection = null
  const changedPatches = []
  api.tourApi.updateSession = function (id, patch) {
    changedPatches.push(patch)
    if (changedPatches.length === 1) {
      return new Promise(function (resolve) { resolveChangedRejection = resolve })
    }
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 21 } })
  }
  tourStore.updateTourState({ currentHall: 'basic-exhibition-hall', pendingSessionSync: null })
  const changedFirst = tourSync.queueSessionSnapshot(
    { current_hall: 'basic-exhibition-hall' },
    { maxAttempts: 1 }
  )
  await waitFor(function () { return !!resolveChangedRejection }, 'changed-state first PATCH')
  tourStore.updateTourState({ currentHall: 'kiln-hall' })
  const changedSecond = tourSync.queueSessionSnapshot({ current_hall: 'kiln-hall' }, { maxAttempts: 1 })
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.current_hall, 'kiln-hall')
  resolveChangedRejection({ ok: false, status: 422, data: { detail: 'old snapshot rejected' } })
  const changedResults = await Promise.all([changedFirst, changedSecond])
  assert.strictEqual(changedResults[0].status, 422)
  assert.strictEqual(changedResults[1].ok, true)
  assert.strictEqual(changedPatches.length, 2, 'a newer snapshot must still flush after an older failure')
  assert.strictEqual(
    changedPatches[1].current_hall,
    'kiln-hall',
    JSON.stringify(changedPatches.map(function (patch) {
      return { current_hall: patch.current_hall, resume_hall: patch.resume_state.current_hall }
    }))
  )
  assert.strictEqual(tourStore.getTourState().pendingSessionSync, null)

  // A stale GET snapshot must not overwrite fields that are still pending locally.
  tourStore.updateTourState({
    currentHall: 'kiln-hall',
    pendingSessionSync: {
      current_hall: 'kiln-hall',
      resume_state: tourStore.buildResumeState(),
    },
  })
  tourStore.applyServerResumeState({
    state_version: 20,
    current_hall: 'basic-exhibition-hall',
    resume_state: { current_hall: 'basic-exhibition-hall' },
    hall_chat_history: {},
  })
  assert.strictEqual(tourStore.getTourState().currentHall, 'kiln-hall')
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 20)

  // Invalid/expired ownership on PATCH must replace the guest session and
  // retry the complete pending snapshot once, even with maxAttempts=1.
  resetTour()
  const recoveryHallA = []
  const recoveryHallB = []
  for (let index = 0; index < 35; index++) {
    recoveryHallA.push({
      id: 'recovery-a-' + index,
      role: index % 2 ? 'user' : 'assistant',
      content: '恢复A厅-' + index,
    })
    recoveryHallB.push({
      id: 'recovery-b-' + index,
      role: index % 2 ? 'user' : 'assistant',
      content: '恢复B厅-' + index,
    })
  }
  tourStore.saveHallChatMessages('basic-exhibition-hall', recoveryHallA)
  tourStore.saveHallChatMessages('kiln-hall', recoveryHallB)
  let ownershipUpdateCount = 0
  const ownershipPatches = []
  api.tourApi.updateSession = function (id, patch) {
    ownershipUpdateCount += 1
    ownershipPatches.push({ id: id, patch: patch })
    if (ownershipUpdateCount === 1) {
      assert.strictEqual(id, 'session-1')
      return Promise.resolve({ ok: false, status: 403, data: { detail: 'Invalid session token' } })
    }
    assert.strictEqual(id, 'replacement-session')
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 2 } })
  }
  api.tourApi.createSession = function () {
    return Promise.resolve({
      ok: true,
      status: 201,
      data: { id: 'replacement-session', session_token: 'replacement-token', state_version: 1 },
    })
  }
  const recoveredPatch = await tourSync.queueSessionSnapshot(
    { current_hall: 'kiln-hall' },
    { maxAttempts: 1 }
  )
  assert.strictEqual(recoveredPatch.ok, true)
  assert.strictEqual(ownershipUpdateCount, 2)
  assert.strictEqual(tourStore.getTourState().sessionId, 'replacement-session')
  assert.strictEqual(tourStore.getTourState().sessionToken, 'replacement-token')
  assert.strictEqual(tourStore.getTourState().pendingSessionSync, null)
  assert.strictEqual(ownershipPatches[1].patch.hall_chat_history['basic-exhibition-hall'].length, 30)
  assert.strictEqual(ownershipPatches[1].patch.hall_chat_history['kiln-hall'].length, 30)
  assert.strictEqual(ownershipPatches[1].patch.hall_chat_history['basic-exhibition-hall'][0].content, '恢复A厅-5')
  assert.strictEqual(ownershipPatches[1].patch.hall_chat_history['kiln-hall'][0].content, '恢复B厅-5')
  assert.strictEqual(tourStore.getHallChatMessages('basic-exhibition-hall').length, 30, 'session rebuild must preserve hall A history')
  assert.strictEqual(tourStore.getHallChatMessages('kiln-hall').length, 30, 'session rebuild must preserve hall B history')
  api.tourApi.createSession = originalCreate

  // If another caller replaces the failed session for the same local tour
  // while a PATCH is in flight, the original waiter should continue on the
  // peer-recovered session rather than surface a false synchronization error.
  resetTour()
  const peerPatchCalls = []
  let resolveOldPeerPatch = null
  api.tourApi.updateSession = function (id) {
    peerPatchCalls.push(id)
    if (peerPatchCalls.length === 1) {
      return new Promise(function (resolve) { resolveOldPeerPatch = resolve })
    }
    return Promise.resolve({ ok: true, status: 200, data: { state_version: 2 } })
  }
  const peerRecoveredFlush = tourSync.queueSessionSnapshot({}, { maxAttempts: 1 })
  await waitFor(function () { return !!resolveOldPeerPatch }, 'peer-recovery old PATCH')
  const peerLocalTourId = tourStore.getTourState().localTourId
  tourStore.invalidateTourSession()
  tourStore.setTourSession({ sessionId: 'peer-recovered-session', sessionToken: 'peer-token' })
  assert.strictEqual(tourStore.getTourState().localTourId, peerLocalTourId)
  resolveOldPeerPatch({ ok: true, status: 200, data: { state_version: 999 } })
  const peerRecoveredResult = await peerRecoveredFlush
  assert.strictEqual(peerRecoveredResult.ok, true)
  assert.deepStrictEqual(peerPatchCalls, ['session-1', 'peer-recovered-session'])
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 2)

  // A late PATCH response from a previous local tour must not overwrite the
  // state version or pending snapshot of a newly-started tour.
  resetTour()
  const stalePatchResponses = []
  api.tourApi.updateSession = function (id, patch) {
    return new Promise(function (resolve) {
      stalePatchResponses.push({ id: id, patch: patch, resolve: resolve })
    })
  }
  const oldTourId = tourStore.getTourState().localTourId
  const staleFlush = tourSync.queueSessionSnapshot(
    { current_hall: 'basic-exhibition-hall' },
    { maxAttempts: 1 }
  )
  await waitFor(function () { return stalePatchResponses.length === 1 }, 'old tour PATCH')

  tourStore.createLocalTourState({ interestType: 'D', persona: 'D', assumption: 'D', personaId: 'D' })
  tourStore.setTourSession({ sessionId: 'session-2', sessionToken: 'token-2' })
  tourStore.updateTourState({
    currentHall: 'kiln-hall',
    serverStateVersion: 10,
    pendingSessionSync: { current_hall: 'kiln-hall' },
  })
  assert.notStrictEqual(tourStore.getTourState().localTourId, oldTourId)

  stalePatchResponses[0].resolve({ ok: true, status: 200, data: { state_version: 999 } })
  const stalePatchResult = await staleFlush
  assert.strictEqual(stalePatchResult.code, 'STALE_SESSION_SYNC')
  assert.strictEqual(tourStore.getTourState().sessionId, 'session-2')
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 10, 'old PATCH version must not contaminate the new tour')
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.current_hall, 'kiln-hall')

  // Real request wrappers must also remain side-effect free until the sync
  // owner check passes. A late PATCH from an old local tour cannot touch the
  // replacement session's activity, version, or pending snapshot.
  api.tourApi.updateSession = originalUpdate
  api.tourApi.getSession = originalGet
  deferWxRequests = true
  pendingWxRequests.length = 0
  resetTour()
  const realOldTourId = tourStore.getTourState().localTourId
  const realStalePatch = tourSync.queueSessionSnapshot(
    { current_hall: 'basic-exhibition-hall' },
    { maxAttempts: 1 }
  )
  await waitFor(function () { return pendingWxRequests.length === 1 }, 'real old-tour PATCH')
  assert.strictEqual(pendingWxRequests[0].method, 'PATCH')
  assert.strictEqual(pendingWxRequests[0].header['X-Session-Token'], 'token-1')

  tourStore.createLocalTourState({ interestType: 'D', persona: 'D', assumption: 'D', personaId: 'D' })
  tourStore.setTourSession({ sessionId: 'real-session-2', sessionToken: 'real-token-2' })
  tourStore.updateTourState({
    currentHall: 'kiln-hall',
    serverStateVersion: 40,
    pendingSessionSync: { current_hall: 'kiln-hall' },
  })
  assert.notStrictEqual(tourStore.getTourState().localTourId, realOldTourId)
  const realPatchActiveAt = Date.now() + 60 * 1000
  const realPatchExpiry = Date.now() + 5 * 60 * 60 * 1000
  memory[storage.KEYS.TOUR_SESSION_LAST_ACTIVE_AT] = realPatchActiveAt
  memory[storage.KEYS.TOUR_SESSION_EXPIRES_AT] = realPatchExpiry
  pendingWxRequests[0].success({
    statusCode: 200,
    data: {
      state_version: 999,
      last_active_at: '2003-01-01T00:00:00.000Z',
      expires_at: '2003-01-02T00:00:00.000Z',
    },
  })
  const realStalePatchResult = await realStalePatch
  assert.strictEqual(realStalePatchResult.code, 'STALE_SESSION_SYNC')
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 40)
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.current_hall, 'kiln-hall')
  assert.strictEqual(memory[storage.KEYS.TOUR_SESSION_LAST_ACTIVE_AT], realPatchActiveAt)
  assert.strictEqual(memory[storage.KEYS.TOUR_SESSION_EXPIRES_AT], realPatchExpiry)

  // The 409 refresh GET has the same owner boundary. If it returns after a new
  // local tour starts, neither its activity timestamps nor state_version may
  // leak into the replacement tour, and no retry PATCH may be issued for it.
  pendingWxRequests.length = 0
  resetTour()
  tourStore.updateTourState({ serverStateVersion: 6, pendingSessionSync: null })
  const realConflict = tourSync.queueSessionSnapshot(
    { current_hall: 'basic-exhibition-hall' },
    { maxAttempts: 3 }
  )
  await waitFor(function () { return pendingWxRequests.length === 1 }, 'real conflict PATCH')
  pendingWxRequests[0].success({
    statusCode: 409,
    data: { detail: 'Expected session state 6, current state is 7' },
  })
  await waitFor(function () { return pendingWxRequests.length === 2 }, 'real conflict refresh GET')
  assert.strictEqual(pendingWxRequests[1].method, 'GET')
  assert.strictEqual(pendingWxRequests[1].header['X-Session-Token'], 'token-1')

  const conflictOldTourId = tourStore.getTourState().localTourId
  tourStore.createLocalTourState({ interestType: 'A', persona: 'A', assumption: 'A', personaId: 'A' })
  tourStore.setTourSession({ sessionId: 'conflict-session-2', sessionToken: 'conflict-token-2' })
  tourStore.updateTourState({
    currentHall: 'kiln-hall',
    serverStateVersion: 50,
    pendingSessionSync: { current_hall: 'kiln-hall' },
  })
  assert.notStrictEqual(tourStore.getTourState().localTourId, conflictOldTourId)
  const conflictActiveAt = Date.now() + 2 * 60 * 1000
  const conflictExpiry = Date.now() + 6 * 60 * 60 * 1000
  memory[storage.KEYS.TOUR_SESSION_LAST_ACTIVE_AT] = conflictActiveAt
  memory[storage.KEYS.TOUR_SESSION_EXPIRES_AT] = conflictExpiry
  pendingWxRequests[1].success({
    statusCode: 200,
    data: {
      state_version: 1000,
      last_active_at: '2004-01-01T00:00:00.000Z',
      expires_at: '2004-01-02T00:00:00.000Z',
    },
  })
  const realConflictResult = await realConflict
  assert.strictEqual(realConflictResult.code, 'STALE_SESSION_SYNC')
  assert.strictEqual(pendingWxRequests.length, 2, 'a stale conflict GET must not schedule another PATCH')
  assert.strictEqual(tourStore.getTourState().serverStateVersion, 50)
  assert.strictEqual(tourStore.getTourState().pendingSessionSync.current_hall, 'kiln-hall')
  assert.strictEqual(memory[storage.KEYS.TOUR_SESSION_LAST_ACTIVE_AT], conflictActiveAt)
  assert.strictEqual(memory[storage.KEYS.TOUR_SESSION_EXPIRES_AT], conflictExpiry)
  deferWxRequests = false

  api.tourApi.updateSession = originalUpdate
  api.tourApi.getSession = originalGet
  api.tourApi.createSession = originalCreate
  console.log('tour sync and contract checks passed')
}

run().catch(function (err) {
  console.error(err)
  process.exitCode = 1
})
