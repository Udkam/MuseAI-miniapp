const assert = require('assert')

const memory = {}
const actions = []
let createdCount = 0
let capturedPage = null
let deferRequests = false
const pendingRequests = []
let deferNavigationComplete = false
const pendingNavigations = []
let currentPages = []

global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
  navigateTo: function (options) {
    actions.push('navigate')
    if (deferNavigationComplete) {
      pendingNavigations.push(options || {})
      return
    }
    if (options && options.complete) options.complete({ errMsg: 'navigateTo:ok' })
  },
  redirectTo: function () { actions.push('navigate') },
  showToast: function () {},
  nextTick: function (callback) { callback() },
  request: function (options) {
    actions.push('request')
    createdCount += 1
    if (deferRequests) {
      pendingRequests.push(options)
      return { abort: function () {}, onChunkReceived: function () {} }
    }
    options.success({
      statusCode: 201,
      data: { id: 'page-first-session-' + createdCount, session_token: 'token-' + createdCount },
    })
    return { abort: function () {}, onChunkReceived: function () {} }
  },
}
global.Page = function (config) { capturedPage = config }
global.getCurrentPages = function () { return currentPages }

const tourStore = require('../store/tour')
const tourSession = require('../utils/tour-session')
const storageUtil = require('../utils/storage')

function pageInstance(config) {
  return Object.assign({}, config, {
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData: function (patch) { this.data = Object.assign({}, this.data, patch || {}) },
  })
}

function nextTurn() {
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}

function saveCompletedConversation(store, hall, prefix) {
  var slug = hall || 'basic-exhibition-hall'
  var key = prefix || slug
  store.updateTourState({ currentHall: slug, currentPage: 'pages/tour/tour' })
  store.saveHallChatMessages(slug, [
    { id: key + '-u1', role: 'user', content: '这件展品有哪些可观察的细节？' },
    { id: key + '-a1', role: 'assistant', content: '先看材质、形制和使用痕迹。' },
  ])
}

async function run() {
  require('../pages/home/home')
  const homeConfig = capturedPage
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'empty-home-session', sessionToken: 'empty-home-token' })
  tourStore.setQuestionnaireDraft({ step: 2, selectedFocusId: 'study' })
  tourStore.updateTourState({ currentHall: 'basic-exhibition-hall', currentPage: 'pages/hall/hall' })
  const emptyHome = pageInstance(homeConfig)
  emptyHome.onShow()
  assert.strictEqual(emptyHome.data.hasTourSession, false, 'session, hall, timer and questionnaire state without chat history must not show resume')

  const home = pageInstance(homeConfig)
  actions.length = 0
  home.goQuickStart()
  assert.deepStrictEqual(actions.slice(0, 2), ['navigate', 'request'], 'quick start should navigate before session creation')
  await nextTurn()
  assert.strictEqual(tourStore.getTourState().persona, 'default')
  assert.strictEqual(tourStore.getBackendPersona(), 'default')

  tourStore.clearTour()
  capturedPage = null
  delete require.cache[require.resolve('../pages/onboarding/onboarding')]
  require('../pages/onboarding/onboarding')
  const onboarding = pageInstance(capturedPage)
  actions.length = 0
  onboarding.skipProfile()
  assert.deepStrictEqual(actions.slice(0, 2), ['navigate', 'request'], 'questionnaire completion should navigate before session creation')
  await nextTurn()
  assert.strictEqual(tourStore.getTourState().persona, 'default', 'skipping the questionnaire must use default, not B')
  assert.strictEqual(tourStore.getQuestionnaireState().persona_id, 'default')

  // Starting a different local tour while page-first session creation is still
  // in flight must not attach the old persona/session to the new tour.
  tourStore.clearTour()
  deferRequests = true
  pendingRequests.length = 0
  tourStore.createLocalTourState({
    interestType: 'default', persona: 'default', assumption: 'D', personaId: 'default',
  })
  tourStore.setOnboardingExtras({ focusId: 'default', guideModeId: 'default' })
  const firstTourId = tourStore.getTourState().localTourId
  const firstSession = tourSession.ensureTourSession()

  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setOnboardingExtras({ focusId: 'study', guideModeId: 'notebook' })
  const secondTourId = tourStore.getTourState().localTourId
  const secondSession = tourSession.ensureTourSession()

  assert.notStrictEqual(firstTourId, secondTourId, 'each newly-started tour needs a distinct local generation')
  assert.strictEqual(pendingRequests.length, 2, 'a new tour must not join the previous tour bootstrap')

  pendingRequests[0].success({
    statusCode: 201,
    data: { id: 'stale-default-session', session_token: 'stale-token' },
  })
  const staleResult = await firstSession
  assert.strictEqual(staleResult.code, 'STALE_SESSION_BOOTSTRAP')
  assert.strictEqual(tourStore.getTourState().sessionId, null, 'stale bootstrap must not mutate the new tour')

  pendingRequests[1].success({
    statusCode: 201,
    data: { id: 'current-persona-b-session', session_token: 'current-token' },
  })
  const currentResult = await secondSession
  assert.strictEqual(currentResult.ok, true)
  assert.strictEqual(tourStore.getTourState().sessionId, 'current-persona-b-session')
  assert.strictEqual(tourStore.getBackendPersona(), 'B')

  // Resume GET ownership failures should transparently replace the unusable
  // guest session instead of navigating into a permanently stuck session.
  const api = require('../api/index')
  const originalGetSession = api.tourApi.getSession
  const originalCreateSession = api.tourApi.createSession
  deferRequests = false
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setOnboardingExtras({ focusId: 'study', guideModeId: 'notebook' })
  tourStore.setTourSession({ sessionId: 'invalid-resume-session', sessionToken: 'wrong-token' })
  saveCompletedConversation(tourStore, 'basic-exhibition-hall', 'invalid-resume')
  api.tourApi.getSession = function () {
    return Promise.resolve({ ok: false, status: 403, data: { detail: 'Invalid session token' } })
  }
  api.tourApi.createSession = function () {
    return Promise.resolve({
      ok: true,
      status: 201,
      data: { id: 'replacement-session', session_token: 'replacement-token', state_version: 1 },
    })
  }
  actions.length = 0
  const resumeHome = pageInstance(homeConfig)
  resumeHome.resumeTour()
  await nextTurn()
  await nextTurn()
  assert.strictEqual(tourStore.getTourState().sessionId, 'replacement-session')
  assert.ok(actions.indexOf('navigate') >= 0, 'resume should continue after automatic guest-session recovery')
  api.tourApi.getSession = originalGetSession
  api.tourApi.createSession = originalCreateSession

  // A resume GET belongs to both the local tour generation and the exact
  // source credentials. This uses the real tourApi/request wrapper: the page
  // navigates before the pending GET, an old response cannot rewrite the new
  // session expiry, and the navigation lock outlives an already-finished GET.
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'resume-source-session', sessionToken: 'resume-source-token' })
  tourStore.updateTourState({ currentHall: 'basic-exhibition-hall', currentPage: 'pages/tour/tour' })
  saveCompletedConversation(tourStore, 'basic-exhibition-hall', 'source-owned')
  const sourceLocalTourId = tourStore.getTourState().localTourId
  deferRequests = true
  deferNavigationComplete = true
  pendingRequests.length = 0
  pendingNavigations.length = 0
  actions.length = 0
  const sourceOwnedHome = pageInstance(homeConfig)
  sourceOwnedHome.resumeTour()
  sourceOwnedHome.resumeTour()
  assert.deepStrictEqual(actions.slice(0, 2), ['navigate', 'request'], 'existing sessions must navigate before starting the resume GET')
  assert.strictEqual(pendingRequests.length, 1, 'repeated resume taps must not start duplicate GET requests')
  assert.strictEqual(pendingNavigations.length, 1, 'repeated resume taps must not start duplicate navigation')
  assert.strictEqual(sourceOwnedHome.data.resuming, true)

  tourStore.invalidateTourSession()
  tourStore.setTourSession({ sessionId: 'peer-recovered-session', sessionToken: 'peer-recovered-token' })
  const peerExpiry = Date.now() + 3 * 60 * 60 * 1000
  memory[storageUtil.KEYS.TOUR_SESSION_EXPIRES_AT] = peerExpiry
  pendingRequests[0].success({
    statusCode: 200,
    data: {
      last_active_at: '2001-01-01T00:00:00.000Z',
      expires_at: '2001-01-02T00:00:00.000Z',
      resume_state: {
        persona: 'C',
        persona_id: 'C',
        current_hall: 'site-protection-hall',
        current_page: 'pages/tour/tour',
      },
    },
  })
  await nextTurn()
  assert.strictEqual(sourceOwnedHome._resumeInFlight, false, 'the stale GET should finish independently of navigation')
  assert.strictEqual(sourceOwnedHome._resumeNavigationInFlight, true, 'navigation must remain locked until navigateTo completes')
  sourceOwnedHome.resumeTour()
  assert.strictEqual(pendingRequests.length, 1, 'a finished GET must not allow another request while navigation is pending')
  assert.strictEqual(pendingNavigations.length, 1, 'a finished GET must not allow another navigation while navigation is pending')
  assert.strictEqual(tourStore.getTourState().localTourId, sourceLocalTourId)
  assert.strictEqual(tourStore.getTourState().sessionId, 'peer-recovered-session')
  assert.strictEqual(tourStore.getTourState().personaId, 'B', 'a stale source-session GET must not overwrite the current persona')
  assert.strictEqual(tourStore.getTourState().currentHall, 'basic-exhibition-hall', 'a stale source-session GET must not overwrite the current hall')
  assert.strictEqual(memory[storageUtil.KEYS.TOUR_SESSION_EXPIRES_AT], peerExpiry, 'an old GET must not replace the new session expiry through request-layer side effects')
  assert.strictEqual(actions.filter(function (item) { return item === 'navigate' }).length, 1, 'a late response must not navigate a second time')
  pendingNavigations[0].complete({ errMsg: 'navigateTo:ok' })
  assert.strictEqual(sourceOwnedHome.data.resuming, false)

  // The inverse timing is also safe: navigateTo may complete while the GET is
  // still pending. The request owner continues to suppress duplicate taps, and
  // a valid owned response explicitly applies server activity afterwards.
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'navigation-first-session', sessionToken: 'navigation-first-token' })
  tourStore.updateTourState({ currentHall: 'kiln-hall', currentPage: 'pages/tour/tour' })
  saveCompletedConversation(tourStore, 'kiln-hall', 'navigation-first')
  pendingRequests.length = 0
  pendingNavigations.length = 0
  actions.length = 0
  const navigationFirstHome = pageInstance(homeConfig)
  navigationFirstHome.resumeTour()
  assert.deepStrictEqual(actions.slice(0, 2), ['navigate', 'request'])
  pendingNavigations[0].complete({ errMsg: 'navigateTo:ok' })
  assert.strictEqual(navigationFirstHome.data.resuming, false)
  assert.strictEqual(navigationFirstHome._resumeInFlight, true, 'background GET ownership must remain after navigation completes')
  navigationFirstHome.resumeTour()
  assert.strictEqual(pendingRequests.length, 1, 'navigation completion must not unlock a duplicate background GET')
  assert.strictEqual(actions.filter(function (item) { return item === 'navigate' }).length, 1)
  const ownedActivity = {
    lastActiveAt: new Date(Date.now() - 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  }
  const resumedPageUpdates = []
  currentPages = [{
    route: 'pages/tour/tour',
    _applyBackgroundResumeState: function (update) {
      resumedPageUpdates.push(update)
      return true
    },
  }]
  pendingRequests[0].success({
    statusCode: 200,
    data: {
      last_active_at: ownedActivity.lastActiveAt,
      expires_at: ownedActivity.expiresAt,
      resume_state: {
        persona: 'B',
        persona_id: 'B',
        current_hall: 'kiln-hall',
        current_page: 'pages/tour/tour',
      },
    },
  })
  await nextTurn()
  assert.strictEqual(navigationFirstHome._resumeInFlight, false)
  assert.strictEqual(memory[storageUtil.KEYS.TOUR_SESSION_LAST_ACTIVE_AT], Date.parse(ownedActivity.lastActiveAt))
  assert.strictEqual(memory[storageUtil.KEYS.TOUR_SESSION_EXPIRES_AT], Date.parse(ownedActivity.expiresAt))
  assert.strictEqual(actions.filter(function (item) { return item === 'navigate' }).length, 1, 'a valid late response must update state without a second navigation')
  assert.strictEqual(resumedPageUpdates.length, 1, 'a valid background resume must refresh the already-open tour page')
  assert.strictEqual(resumedPageUpdates[0].localTourId, tourStore.getTourState().localTourId)
  assert.strictEqual(resumedPageUpdates[0].payload.resume_state.current_hall, 'kiln-hall')
  currentPages = []

  // The request wrapper also supports an ownership guard for non-home callers
  // that want automatic activity updates without accepting a stale response.
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'expected-owner-session', sessionToken: 'expected-owner-token' })
  pendingRequests.length = 0
  const guardedGet = originalGetSession('expected-owner-session', 'expected-owner-token', {
    expectedSessionId: 'expected-owner-session',
    expectedSessionToken: 'expected-owner-token',
  })
  tourStore.invalidateTourSession()
  tourStore.setTourSession({ sessionId: 'guard-replacement-session', sessionToken: 'guard-replacement-token' })
  const guardedExpiry = Date.now() + 4 * 60 * 60 * 1000
  memory[storageUtil.KEYS.TOUR_SESSION_EXPIRES_AT] = guardedExpiry
  pendingRequests[0].success({
    statusCode: 200,
    data: {
      last_active_at: '2002-01-01T00:00:00.000Z',
      expires_at: '2002-01-02T00:00:00.000Z',
    },
  })
  const guardedResult = await guardedGet
  assert.strictEqual(guardedResult.ok, true)
  assert.strictEqual(memory[storageUtil.KEYS.TOUR_SESSION_EXPIRES_AT], guardedExpiry, 'expected session credentials must guard automatic activity updates')
  deferRequests = false
  deferNavigationComplete = false

  // Entering the personalized questionnaire invalidates the request generation
  // even before a replacement localTourId is allocated on questionnaire finish.
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'questionnaire-source-session', sessionToken: 'questionnaire-source-token' })
  tourStore.updateTourState({ currentHall: 'basic-exhibition-hall', currentPage: 'pages/tour/tour' })
  saveCompletedConversation(tourStore, 'basic-exhibition-hall', 'questionnaire-source')
  let resolveQuestionnaireResume = null
  api.tourApi.getSession = function () {
    return new Promise(function (resolve) { resolveQuestionnaireResume = resolve })
  }
  actions.length = 0
  const questionnaireHome = pageInstance(homeConfig)
  questionnaireHome.resumeTour()
  questionnaireHome.goOnboarding()
  resolveQuestionnaireResume({
    ok: true,
    status: 200,
    data: {
      resume_state: {
        persona: 'C',
        persona_id: 'C',
        current_hall: 'site-protection-hall',
        current_page: 'pages/tour/tour',
      },
    },
  })
  await nextTurn()
  assert.strictEqual(tourStore.getTourState().personaId, 'B', 'entering onboarding must invalidate the pending resume GET')
  assert.strictEqual(tourStore.getTourState().currentHall, 'basic-exhibition-hall')
  assert.strictEqual(actions.filter(function (item) { return item === 'navigate' }).length, 2, 'resume navigates once immediately and onboarding is the only later navigation')
  assert.strictEqual(questionnaireHome.data.resuming, false)
  api.tourApi.getSession = originalGetSession

  // Starting a new local tour invalidates the resume request generation before
  // the old GET can apply its response or redirect the visitor.
  tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  tourStore.setTourSession({ sessionId: 'old-generation-session', sessionToken: 'old-generation-token' })
  tourStore.updateTourState({ currentHall: 'kiln-hall', currentPage: 'pages/tour/tour' })
  saveCompletedConversation(tourStore, 'kiln-hall', 'old-generation')
  const oldResumeLocalTourId = tourStore.getTourState().localTourId
  let resolveOldGenerationResume = null
  api.tourApi.getSession = function () {
    return new Promise(function (resolve) { resolveOldGenerationResume = resolve })
  }
  actions.length = 0
  const generationOwnedHome = pageInstance(homeConfig)
  generationOwnedHome.resumeTour()
  generationOwnedHome.goQuickStart()
  const newQuickStartLocalTourId = tourStore.getTourState().localTourId
  assert.notStrictEqual(newQuickStartLocalTourId, oldResumeLocalTourId)
  resolveOldGenerationResume({
    ok: true,
    status: 200,
    data: {
      resume_state: {
        persona: 'C',
        persona_id: 'C',
        current_hall: 'site-protection-hall',
        current_page: 'pages/tour/tour',
      },
    },
  })
  await nextTurn()
  await nextTurn()
  assert.strictEqual(tourStore.getTourState().localTourId, newQuickStartLocalTourId)
  assert.strictEqual(tourStore.getTourState().personaId, 'default', 'a late GET must not overwrite a newly-started default tour')
  assert.strictEqual(tourStore.getTourState().currentHall, null, 'a late GET must not import the old hall into a new tour')
  assert.strictEqual(actions.filter(function (item) { return item === 'navigate' }).length, 2, 'resume navigates once immediately and quick start is the only later navigation')
  assert.strictEqual(generationOwnedHome.data.resuming, false)
  api.tourApi.getSession = originalGetSession

  // Expired sessions must clear the complete in-memory resume snapshot, not
  // leave a phantom questionnaire draft visible until the next app restart.
  tourStore.setQuestionnaireDraft({ step: 2, selectedFocusId: 'study' })
  memory.tour_session_expires_at = Date.now() - 1
  delete require.cache[require.resolve('../store/tour')]
  const freshTourStore = require('../store/tour')
  const expiredState = freshTourStore.getTourState()
  assert.strictEqual(expiredState.sessionId, null)
  assert.strictEqual(expiredState.persona, null)
  assert.strictEqual(freshTourStore.getQuestionnaireDraft(), null, 'expired state must not expose a stale draft')

  // Losing only the guest token must detach the unusable credentials without
  // treating the complete same-device tour snapshot as expired.
  freshTourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'A', personaId: 'B' })
  freshTourStore.setOnboardingExtras({ focusId: 'study', guideModeId: 'notebook' })
  freshTourStore.setTourSession({ sessionId: 'token-lost-session', sessionToken: 'token-to-remove' })
  freshTourStore.updateTourState({
    currentHall: 'kiln-hall',
    currentHallName: '馆方陶窑专题厅',
    status: 'touring',
    currentPage: 'pages/tour/tour',
    currentPageParams: { hall: 'kiln-hall' },
  })
  freshTourStore.setQuestionnaireDraft({ step: 3, selectedFocusId: 'study' })
  freshTourStore.addTourEvent({
    eventType: 'exhibit_question',
    hall: 'kiln-hall',
    metadata: { client_event_id: 'preserved-question' },
  })
  freshTourStore.incrementAiConversationCount()
  freshTourStore.saveHallChatMessages('kiln-hall', [
    { id: 'u1', role: 'user', content: '这座陶窑怎么烧制？' },
    { id: 'a1', role: 'assistant', content: '先观察窑室和火道。' },
  ])
  const preservedLocalTourId = freshTourStore.getTourState().localTourId
  delete memory[storageUtil.KEYS.TOUR_SESSION_TOKEN]

  delete require.cache[require.resolve('../store/tour')]
  delete require.cache[require.resolve('../utils/tour-session')]
  const recoveredTourStore = require('../store/tour')
  const recoveredState = recoveredTourStore.getTourState()
  assert.strictEqual(recoveredState.sessionId, null)
  assert.strictEqual(recoveredState.sessionToken, null)
  assert.strictEqual(recoveredState.detachedSessionId, 'token-lost-session')
  assert.strictEqual(recoveredState.localTourId, preservedLocalTourId)
  assert.strictEqual(recoveredState.persona, 'B')
  assert.strictEqual(recoveredState.currentHall, 'kiln-hall')
  assert.strictEqual(recoveredState.currentHallName, '馆方陶窑专题厅')
  assert.strictEqual(recoveredState.status, 'touring')
  assert.strictEqual(recoveredState.currentPage, 'pages/tour/tour')
  assert.strictEqual(recoveredState.aiConversationCount, 1)
  assert.deepStrictEqual(recoveredState.visitedHalls, ['kiln-hall'])
  assert.strictEqual(recoveredState.pendingEvents.length, 1)
  assert.deepStrictEqual(recoveredTourStore.getQuestionnaireDraft(), { step: 3, selectedFocusId: 'study' })
  assert.deepStrictEqual(
    recoveredTourStore.getHallChatMessages('kiln-hall').map(function (message) { return message.content }),
    ['这座陶窑怎么烧制？', '先观察窑室和火道。'],
    'the detached session key must keep the last per-hall chat history readable'
  )
  assert.strictEqual(recoveredTourStore.hasRecoverableTourState(), true)
  assert.strictEqual(memory[storageUtil.KEYS.TOUR_SESSION_ID], undefined, 'unusable credentials must be removed immediately')

  delete require.cache[require.resolve('../utils/tour-sync')]
  delete require.cache[require.resolve('../pages/home/home')]
  capturedPage = null
  require('../pages/home/home')
  const recoveredHome = pageInstance(capturedPage)
  recoveredHome.onShow()
  assert.strictEqual(recoveredHome.data.hasTourSession, true, 'the home page must expose a recoverable local snapshot')

  const recoveredTourSync = require('../utils/tour-sync')
  const syncBeforeTokenRecovery = recoveredTourSync.queueSessionSnapshot
  const createBeforeTokenRecovery = api.tourApi.createSession
  let recoverySnapshotQueued = false
  recoveredTourSync.queueSessionSnapshot = function () {
    recoverySnapshotQueued = true
    return Promise.resolve({ ok: true, status: 200 })
  }
  api.tourApi.createSession = function () {
    actions.push('request')
    return Promise.resolve({
      ok: true,
      status: 201,
      data: {
        id: 'token-replacement-session',
        session_token: 'token-replacement',
        state_version: 1,
        status: 'onboarding',
        current_hall: null,
        current_exhibit_id: null,
        visited_halls: [],
        last_active_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        resume_state: {
          status: 'touring',
          current_hall: 'kiln-hall',
          visited_halls: ['kiln-hall'],
          current_page: 'pages/tour/tour',
        },
      },
    })
  }
  actions.length = 0
  recoveredHome.resumeTour()
  assert.deepStrictEqual(actions.slice(0, 2), ['navigate', 'request'], 'local recovery should navigate before guest bootstrap')
  await nextTurn()
  await nextTurn()
  api.tourApi.createSession = createBeforeTokenRecovery
  recoveredTourSync.queueSessionSnapshot = syncBeforeTokenRecovery
  assert.strictEqual(recoverySnapshotQueued, true, 'the replacement session must receive the preserved local snapshot')
  assert.strictEqual(recoveredTourStore.getTourState().sessionId, 'token-replacement-session')
  assert.strictEqual(recoveredTourStore.getTourState().status, 'touring', 'create defaults must not erase local touring status')
  assert.strictEqual(recoveredTourStore.getTourState().currentHall, 'kiln-hall')
  assert.strictEqual(recoveredTourStore.getTourState().currentPage, 'pages/tour/tour')
  assert.strictEqual(recoveredTourStore.getTourState().persona, 'B')
  assert.deepStrictEqual(recoveredTourStore.getTourState().visitedHalls, ['kiln-hall'])
  assert.strictEqual(recoveredTourStore.getTourState().aiConversationCount, 1)
  assert.strictEqual(recoveredTourStore.getQuestionnaireDraft().step, 3)
  assert.strictEqual(recoveredTourStore.getTourState().pendingEvents.length, 1)
  assert.deepStrictEqual(
    recoveredTourStore.getHallChatMessages('kiln-hall').map(function (message) { return message.content }),
    ['这座陶窑怎么烧制？', '先观察窑室和火道。'],
    'bootstrapping a replacement guest session must migrate, not erase, hall history'
  )

  console.log('page-first guest session checks passed')
}

run().catch(function (error) {
  console.error(error)
  process.exitCode = 1
})
