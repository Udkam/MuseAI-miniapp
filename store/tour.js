/**
 * store/tour.js — Tour session state + workbench preferences
 *
 * Merges useTour.js and useTourWorkbench.js from the Web archive.
 *
 * Runtime tour state lives in a module-level object (_tour).
 * Workbench preferences are persisted to wx.storage.
 * Pending events are buffered locally and flushed by pages when appropriate.
 *
 * No real API calls here — pages call api/index.js tourApi and pass results
 * back via setTourSession() / updateTourState().
 */

const storage   = require('../utils/storage')
const constants = require('../constants/index')
const banpoHalls = require('../constants/banpo-halls')
const exhibitIds = require('../utils/exhibit-id')

const TOUR_STATUS      = constants.TOUR_STATUS
const STORAGE_KEYS     = constants.STORAGE_KEYS
const ANSWER_LENGTH_MAP = constants.ANSWER_LENGTH_MAP
const DEPTH_MAP        = constants.DEPTH_MAP
const TERMINOLOGY_MAP  = constants.TERMINOLOGY_MAP

// ─── Workbench preference defaults ────────────────────────────────────────
const DEFAULT_UI_PREFS = {
  fontScale:        'md',
  messageDensity:   'comfortable',
  autoScroll:       true,
  showQuickPrompts: true,
  rememberDraft:    true,
}

const DEFAULT_STYLE_PREFS = {
  answerLength: 'balanced',
  depth:        'standard',
  terminology:  'plain',
  enabled:      true,
}

const DEFAULT_TTS_PREFS = {
  voice:    '冰糖',
  autoPlay: false,
  enabled:  true,
}

const HALL_CHAT_MAX_MESSAGES = 30
const HALL_CHAT_MAX_CONTENT_CHARS = 1000
const HALL_CHAT_MAX_HALLS = 9
const TOUR_STATE_VERSION = 1

const VISITED_HALL_EVENT_TYPES = {
  exhibit_question: true,
  exhibit_view: true,
}

// ─── Persona definitions ───────────────────────────────────────────────────
// personaId: canonical frontend profile ID used for display/report semantics.
// backendPersona: 'default'|'A'|'B'|'C'|'D' sent to createSession.
function normalizePersonaId(value) {
  var raw = String(value || '').trim()
  if (!raw) return 'default'
  if (raw === 'default' || raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D') return raw
  return 'default'
}

var PERSONA_DEFS = {
  'default': {
    id:             'default',
    name:           '默认导览',
    backendPersona: 'default',
  },
  'A': {
    id:             'A',
    name:           '考古研究员',
    backendPersona: 'A',
  },
  'B': {
    id:             'B',
    name:           '研学记录员',
    backendPersona: 'B',
  },
  'C': {
    id:             'C',
    name:           '历史追问者',
    backendPersona: 'C',
  },
  'D': {
    id:             'D',
    name:           '器物研究员',
    backendPersona: 'D',
  },
}

// ─── Runtime state ─────────────────────────────────────────────────────────
function _makeEmptyTour() {
  return {
    // Internal client-side generation marker. It is persisted locally but is
    // deliberately excluded from buildResumeState(), so a late async response
    // from a previous tour cannot be attached to a newly-started tour.
    localTourId:       null,
    sessionId:         null,
    sessionToken:      null,
    detachedSessionId: null,
    status:            TOUR_STATUS.ONBOARDING,
    interestType:      null,
    persona:           null,
    personaId:         null,   // 'default'|'A'|'B'|'C'|'D'
    assumption:        null,
    currentHall:       null,
    currentHallName:   null,
    currentExhibitId:  null,
    currentExhibit:    null,   // transient exhibit focus; cleared when leaving the hall
    pendingDetailExhibit: null, // transient detail-page payload; not AI discussion context
    currentScannedExhibitId: null,
    currentScannedExhibitName: null,
    lastScanTimestamp: null,
    aiConversationCount: 0,
    visitedHalls:      [],
    visitedExhibitIds: [],
    pendingEvents:     [],
    questionnaire:     null,
    questionnaireDraft: null,
    routePlan:         null,
    currentPage:       null,
    currentPageParams: null,
    tourStartedAt:     null,
    pendingSessionSync: null,
    serverStateVersion: null,
    // Onboarding extras (set by Stage 8G intent card flow)
    intentText:         null,
    preferredHallOrder: [],
    timeBudget:         null,
    focusId:            null,
    focusTitle:         null,
    focusPrompt:        null,
    assumptionText:     null,
    guideModeId:        null,
    guideModeTitle:     null,
    guideModePrompt:    null,
  }
}

var _tour = _makeEmptyTour()
var _tourStateHydrated = false
var TOUR_SESSION_RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000
var TOUR_SESSION_RESUME_MIN_AI_TURNS = 0

function _isStoredTourSessionFresh(stored) {
  if (!stored || !stored.sessionId) return false
  if (!stored.lastActiveAt && !stored.createdAt) return false
  if (stored.schemaVersion !== storage.TOUR_SESSION_SCHEMA_VERSION) return false
  if (stored.expiresAt) return Date.now() <= stored.expiresAt
  return Date.now() - (stored.lastActiveAt || stored.createdAt) <= TOUR_SESSION_RESUME_MAX_AGE_MS
}

function _isStoredTourSessionResumable(stored) {
  return _isStoredTourSessionFresh(stored) && !!stored.sessionToken
}

function _clearStaleTourResume() {
  _tour = _makeEmptyTour()
  storage.clearTour()
  _tourStateHydrated = true
}

function _detachUnusableStoredSession(stored) {
  var previousSessionId = _tour.sessionId || (stored && stored.sessionId) || null
  if (previousSessionId) _tour.detachedSessionId = previousSessionId
  _tour.sessionId = null
  _tour.sessionToken = null
  storage.setTourSession({ sessionId: null, sessionToken: null })
  // Persist the credential invalidation separately from the rest of the local
  // snapshot. Otherwise an app restart before bootstrap could rehydrate the
  // stale token copied inside TOUR_STATE and lose the recovery path.
  _persistTourState()
}

function _makeLocalTourId() {
  return 'tour-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}

function _ensureTourCacheSchema() {
  if (storage.ensureTourCacheSchema && storage.ensureTourCacheSchema()) {
    _tour = _makeEmptyTour()
    _tourStateHydrated = false
  }
}

function _cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return fallback
  }
}

function _persistTourState() {
  var snapshot = _cloneJson(_tour, {})
  snapshot.stateVersion = TOUR_STATE_VERSION
  snapshot.updatedAt = Date.now()
  storage.set(STORAGE_KEYS.TOUR_STATE, snapshot)
}

function _hydrateTourStateSnapshot() {
  if (_tourStateHydrated) return
  _tourStateHydrated = true
  var snapshot = storage.get(STORAGE_KEYS.TOUR_STATE, null)
  if (!snapshot || typeof snapshot !== 'object') return
  var safe = _cloneJson(snapshot, null)
  if (!safe || Number(safe.stateVersion || 0) !== TOUR_STATE_VERSION) return
  delete safe.stateVersion
  delete safe.updatedAt
  Object.assign(_tour, safe)
  _tour.personaId = normalizePersonaId(_tour.personaId || _tour.persona)
  _tour.currentHall = _tour.currentHall ? _normalizeHallForStorage(_tour.currentHall) : null
  _tour.currentHallName = _tour.currentHallName ? String(_tour.currentHallName).slice(0, 255) : null
  _tour.currentExhibitId = exhibitIds.normalizeBackendExhibitId(_tour.currentExhibitId)
  _tour.visitedHalls = _normalizeVisitedHalls(_tour.visitedHalls)
  _tour.visitedExhibitIds = _normalizeVisitedExhibitIds(_tour.visitedExhibitIds)
  _tour.pendingEvents = (Array.isArray(_tour.pendingEvents) ? _tour.pendingEvents : [])
    .map(_sanitizePendingEvent)
    .filter(Boolean)
}

function _hydrateStoredTour() {
  _ensureTourCacheSchema()
  _hydrateTourStateSnapshot()
  var stored = storage.getTourSession ? storage.getTourSession() : null
  if (stored && stored.sessionId) {
    if (!_isStoredTourSessionFresh(stored)) {
      _clearStaleTourResume()
      return
    }
    if (!stored.sessionToken) {
      // A missing guest token invalidates only the server credentials. The
      // persona, hall, draft, pending events and per-hall chat cache remain a
      // valid same-device snapshot and will be attached to a new guest session.
      _detachUnusableStoredSession(stored)
      stored = null
    }
  }
  if (stored && stored.sessionId && stored.sessionToken) {
    if (!_tour.sessionId && stored.sessionId) {
      _tour.sessionId = stored.sessionId
    }
    if (!_tour.sessionToken && stored.sessionToken) {
      _tour.sessionToken = stored.sessionToken
    }
    _tour.aiConversationCount = Number(stored.aiConversationCount || 0)
  }

  var visited = _deriveVisitedHallsFromStorage()
  if (visited.length || _tour.visitedHalls.length) {
    _tour.visitedHalls = _normalizeVisitedHalls(_tour.visitedHalls.concat(visited))
    if (_tour.visitedHalls.length) _persistVisitedHalls()
  }

  var visitedExhibits = _deriveVisitedExhibitsFromStorage()
  if (visitedExhibits.length || _tour.visitedExhibitIds.length) {
    _tour.visitedExhibitIds = _normalizeVisitedExhibitIds(_tour.visitedExhibitIds.concat(visitedExhibits))
    if (_tour.visitedExhibitIds.length) _persistVisitedExhibits()
  }

  if (!_tour.currentHall) {
    var hall = storage.get(STORAGE_KEYS.TOUR_CURRENT_HALL, null)
    if (hall) _tour.currentHall = banpoHalls.normalizeHallToSlug(hall)
  }

  if (!_tour.pendingEvents.length) {
    var pending = storage.get(STORAGE_KEYS.TOUR_PENDING_EVENTS, [])
    if (Array.isArray(pending) && pending.length) {
      _tour.pendingEvents = pending.map(_sanitizePendingEvent).filter(Boolean)
      _persistPendingEvents()
    }
  }
}

function _normalizeHallForStorage(hall) {
  return banpoHalls.normalizeHallToSlug(hall)
}

function _normalizeVisitedHalls(list) {
  var seen = {}
  var out = []
  ;(Array.isArray(list) ? list : []).forEach(function (hall) {
    var slug = _normalizeHallForStorage(hall)
    if (!slug || seen[slug]) return
    seen[slug] = true
    out.push(slug)
  })
  return out
}

function _persistVisitedHalls() {
  _tour.visitedHalls = _normalizeVisitedHalls(_tour.visitedHalls)
  storage.set(STORAGE_KEYS.TOUR_VISITED_HALLS, _tour.visitedHalls)
}

function _normalizeVisitedExhibitIds(list) {
  var seen = {}
  var out = []
  ;(Array.isArray(list) ? list : []).forEach(function (item) {
    var value = item === undefined || item === null ? '' : String(item).trim()
    if (value.indexOf('name:') === 0) return
    var candidate = value.indexOf('id:') === 0 ? value.slice(3) : value
    var trustedId = exhibitIds.normalizeBackendExhibitUuid(candidate)
    if (!trustedId) return
    var key = 'id:' + trustedId
    if (seen[key]) return
    seen[key] = true
    out.push(key)
  })
  return out
}

function _persistVisitedExhibits() {
  _tour.visitedExhibitIds = _normalizeVisitedExhibitIds(_tour.visitedExhibitIds)
  storage.set(STORAGE_KEYS.TOUR_VISITED_EXHIBITS, _tour.visitedExhibitIds)
}

function _deriveVisitedHallsFromStorage() {
  var halls = []

  var storedEvents = storage.get(STORAGE_KEYS.TOUR_PENDING_EVENTS, null)
  if (Array.isArray(storedEvents)) {
    storedEvents.forEach(function (event) {
      if (event && VISITED_HALL_EVENT_TYPES[event.event_type || event.eventType] && event.hall) {
        halls.push(event.hall)
      }
    })
  }

  var chatCache = storage.get(STORAGE_KEYS.TOUR_HALL_CHATS, null)
  if (chatCache && chatCache.halls && typeof chatCache.halls === 'object') {
    Object.keys(chatCache.halls).forEach(function (hall) {
      var record = chatCache.halls[hall]
      if (record && Array.isArray(record.messages) && _hasUserMessages(record.messages)) {
        halls.push(hall)
      }
    })
  }

  return _normalizeVisitedHalls(halls)
}

function _exhibitVisitKeyFromEvent(event) {
  if (!event || (event.event_type || event.eventType) !== 'exhibit_view') return ''
  var id = exhibitIds.normalizeBackendExhibitUuid(event.exhibitId || event.exhibit_id)
  if (id) return 'id:' + id
  return ''
}

function _rememberVisitedExhibit(event) {
  var key = _exhibitVisitKeyFromEvent(event)
  if (!key || _tour.visitedExhibitIds.indexOf(key) >= 0) return
  _tour.visitedExhibitIds = _tour.visitedExhibitIds.concat(key)
  _persistVisitedExhibits()
}

function _deriveVisitedExhibitsFromStorage() {
  var exhibits = []

  var stored = storage.get(STORAGE_KEYS.TOUR_VISITED_EXHIBITS, [])
  if (Array.isArray(stored)) {
    exhibits = exhibits.concat(stored)
  }

  var storedEvents = storage.get(STORAGE_KEYS.TOUR_PENDING_EVENTS, null)
  if (Array.isArray(storedEvents)) {
    storedEvents.forEach(function (event) {
      var key = _exhibitVisitKeyFromEvent(event)
      if (key) exhibits.push(key)
    })
  }

  return _normalizeVisitedExhibitIds(exhibits)
}

function _eventOrderValue(event, fallback) {
  var metadata = (event && event.metadata) || {}
  var clientEventId = String(metadata.client_event_id || '')
  var maybeTime = Number(clientEventId.split('-')[0])
  if (isFinite(maybeTime) && maybeTime > 0) return maybeTime + ((fallback || 0) / 1000)
  var createdAt = Number(event && (event.createdAt || event.created_at))
  if (isFinite(createdAt) && createdAt > 0) return createdAt
  return fallback || 0
}

function _latestAnsweredHallFromStorage() {
  var latest = null

  function consider(hall, order) {
    var slug = hall ? _normalizeHallForStorage(hall) : null
    if (!slug) return
    if (!latest || order > latest.order) {
      latest = { hall: slug, order: order }
    }
  }

  var pending = storage.get(STORAGE_KEYS.TOUR_PENDING_EVENTS, [])
  if (Array.isArray(pending)) {
    pending.forEach(function (event, index) {
      if (!event || (event.event_type || event.eventType) !== 'assistant_answer') return
      consider(event.hall, _eventOrderValue(event, index + 1))
    })
  }

  var runtimeEvents = Array.isArray(_tour.pendingEvents) ? _tour.pendingEvents : []
  runtimeEvents.forEach(function (event, index) {
    if (!event || (event.event_type || event.eventType) !== 'assistant_answer') return
    consider(event.hall, _eventOrderValue(event, pending.length + index + 1))
  })

  var chatCache = storage.get(STORAGE_KEYS.TOUR_HALL_CHATS, null)
  var sessionKey = _tour.sessionId || (storage.getTourSession && storage.getTourSession().sessionId) || 'local'
  if (chatCache && chatCache.sessionId === sessionKey && chatCache.halls && typeof chatCache.halls === 'object') {
    Object.keys(chatCache.halls).forEach(function (hall) {
      var record = chatCache.halls[hall]
      if (!record || !Array.isArray(record.messages)) return
      if (_extractMessagePairs(record.messages).length) {
        consider(hall, Number(record.updatedAt || chatCache.updatedAt || 0))
      }
    })
  }

  return latest ? latest.hall : null
}

function _makeClientEventId() {
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10)
}

function _normalizeEventExhibitId(value) {
  return exhibitIds.normalizeBackendExhibitId(value)
}

function _sanitizePendingEvent(event) {
  if (!event || typeof event !== 'object') return null
  var eventType = event.event_type || event.eventType || 'unknown'
  var hall = event.hall || _tour.currentHall || null
  var hallSlug = hall ? _normalizeHallForStorage(hall) : null
  var metadata = Object.assign({}, event.metadata || {})
  if (!metadata.client_event_id) metadata.client_event_id = _makeClientEventId()
  return {
    event_type: eventType,
    exhibit_id: _normalizeEventExhibitId(event.exhibitId || event.exhibit_id),
    hall: hallSlug,
    duration_seconds: event.durationSeconds || event.duration_seconds || null,
    metadata: metadata,
  }
}

function _getHallChatSessionKey() {
  if (!_tour.sessionId) _hydrateStoredTour()
  return _tour.sessionId || _tour.detachedSessionId || 'local'
}

function _getHallChatCache() {
  var sessionKey = _getHallChatSessionKey()
  var raw = storage.get(STORAGE_KEYS.TOUR_HALL_CHATS, null)
  if (!raw || typeof raw !== 'object' || raw.sessionId !== sessionKey) {
    return { sessionId: sessionKey, updatedAt: Date.now(), halls: {} }
  }
  if (!raw.halls || typeof raw.halls !== 'object') raw.halls = {}
  return raw
}

function _writeHallChatCache(cache) {
  storage.set(STORAGE_KEYS.TOUR_HALL_CHATS, cache)
}

function _migrateHallChatSession(fromSessionId, toSessionId) {
  if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return
  var raw = storage.get(STORAGE_KEYS.TOUR_HALL_CHATS, null)
  if (!raw || typeof raw !== 'object' || raw.sessionId !== fromSessionId) return
  raw.sessionId = toSessionId
  raw.updatedAt = Date.now()
  _writeHallChatCache(raw)
}

function _trimHallChatContent(value) {
  var text = String(value || '')
  if (text.length <= HALL_CHAT_MAX_CONTENT_CHARS) return text
  return text.slice(0, HALL_CHAT_MAX_CONTENT_CHARS - 1) + '…'
}

function _sanitizeHallChatMessage(message, index) {
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null
  if (message.isError) return null
  var content = _trimHallChatContent(message.content)
  if (!content) return null
  var item = {
    id: message.id || (Date.now() + index),
    role: message.role,
    content: content,
    createdAt: message.createdAt || new Date().toISOString(),
  }
  if (message.role === 'assistant') {
    item.traceId = message.traceId || null
    item.ttsStatus = 'idle'
  }
  return item
}

function _sanitizeHallChatMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map(_sanitizeHallChatMessage)
    .filter(Boolean)
    .slice(-HALL_CHAT_MAX_MESSAGES)
}

function saveHallChatMessages(hall, messages, options) {
  var slug = hall ? _normalizeHallForStorage(hall) : null
  if (!slug) return []
  var sanitized = _sanitizeHallChatMessages(messages)
  if (!sanitized.length) return []

  var write = function () {
    var cache = _getHallChatCache()
    cache.halls[slug] = {
      messages: sanitized,
      updatedAt: Date.now(),
    }
    var keys = Object.keys(cache.halls)
    if (keys.length > HALL_CHAT_MAX_HALLS) {
      keys.sort(function (a, b) {
        return ((cache.halls[a] && cache.halls[a].updatedAt) || 0) -
          ((cache.halls[b] && cache.halls[b].updatedAt) || 0)
      })
      keys.slice(0, keys.length - HALL_CHAT_MAX_HALLS).forEach(function (key) {
        delete cache.halls[key]
      })
    }
    cache.updatedAt = Date.now()
    _writeHallChatCache(cache)
  }

  if (options && options.defer) {
    setTimeout(write, 0)
  } else {
    write()
  }
  return sanitized
}

function getHallChatMessages(hall) {
  var slug = hall ? _normalizeHallForStorage(hall) : null
  if (!slug) return []
  var cache = _getHallChatCache()
  var record = cache.halls && cache.halls[slug]
  return record ? _sanitizeHallChatMessages(record.messages) : []
}

function getHallChatHistoryPayload() {
  var cache = _getHallChatCache()
  var result = {}
  Object.keys(cache.halls || {}).forEach(function (hall) {
    var record = cache.halls[hall]
    var messages = record && Array.isArray(record.messages)
      ? _sanitizeHallChatMessages(record.messages)
      : []
    if (messages.length) {
      result[_normalizeHallForStorage(hall)] = messages.map(function (message) {
        return {
          role: message.role,
          content: _trimHallChatContent(message.content),
        }
      })
    }
  })
  return result
}

function saveCurrentHallChatMessages(messages, options) {
  if (!_tour.currentHall) return []
  return saveHallChatMessages(_tour.currentHall, messages, options)
}

function _getCurrentHallDisplayName() {
  return _tour.currentHall
    ? (_tour.currentHallName || banpoHalls.getHallDisplayName(_tour.currentHall))
    : ''
}

// ─── Preference helpers ────────────────────────────────────────────────────

function _loadPrefs(key, defaults) {
  try {
    var raw = storage.get(key, null)
    if (raw && typeof raw === 'object') return Object.assign({}, defaults, raw)
  } catch (_) {}
  return Object.assign({}, defaults)
}

function getUiPrefs()    { return _loadPrefs(STORAGE_KEYS.TOUR_UI_PREFS,    DEFAULT_UI_PREFS) }
function getStylePrefs() { return _loadPrefs(STORAGE_KEYS.TOUR_STYLE_PREFS, DEFAULT_STYLE_PREFS) }
function getTtsPrefs()   { return _loadPrefs(STORAGE_KEYS.TOUR_TTS_PREFS,   DEFAULT_TTS_PREFS) }

function setUiPrefs(patch) {
  storage.set(STORAGE_KEYS.TOUR_UI_PREFS, Object.assign(getUiPrefs(), patch))
}
function setStylePrefs(patch) {
  storage.set(STORAGE_KEYS.TOUR_STYLE_PREFS, Object.assign(getStylePrefs(), patch))
}
function setTtsPrefs(patch) {
  storage.set(STORAGE_KEYS.TOUR_TTS_PREFS, Object.assign(getTtsPrefs(), patch))
}

// ─── Session init ──────────────────────────────────────────────────────────

/**
 * Reset runtime state and reload pending events from storage.
 * Call this at onboarding entry (before the server session is created).
 *
 * @param {{ interestType?: string, persona?: string, assumption?: string }} [opts]
 * @returns {object} snapshot of the freshly created local state
 */
function createLocalTourState(opts) {
  var o = opts || {}
  _ensureTourCacheSchema()
  _tour = _makeEmptyTour()
  _tour.localTourId = _makeLocalTourId()
  _tourStateHydrated = true
  storage.setTourSession({ sessionId: null, sessionToken: null })
  storage.remove(STORAGE_KEYS.TOUR_CURRENT_HALL)
  storage.remove(STORAGE_KEYS.TOUR_VISITED_HALLS)
  storage.remove(STORAGE_KEYS.TOUR_VISITED_EXHIBITS)
  storage.remove(STORAGE_KEYS.TOUR_HALL_EXHIBITS)
  storage.remove(STORAGE_KEYS.TOUR_PENDING_EVENTS)
  storage.remove(STORAGE_KEYS.TOUR_RECORD_SUMMARY)
  storage.remove(STORAGE_KEYS.TOUR_HALL_CHATS)
  _tour.interestType = o.interestType || null
  _tour.persona      = o.persona      || null
  _tour.assumption   = o.assumption   || null
  _tour.personaId    = normalizePersonaId(o.personaId || o.persona || null)

  _tour.pendingEvents = []
  _tour.questionnaire = _buildQuestionnaireState(_tour)

  _persistTourState()

  return Object.assign({}, _tour)
}

function ensureLocalTourId() {
  _hydrateStoredTour()
  if (!_tour.localTourId) {
    _tour.localTourId = _makeLocalTourId()
    _persistTourState()
  }
  return _tour.localTourId
}

/**
 * Store the session credentials returned by the backend after POST /tour/sessions.
 * @param {{ sessionId: string, sessionToken: string }} param
 */
function setTourSession(param) {
  var previousSessionId = _tour.sessionId || _tour.detachedSessionId || 'local'
  var preserveLocalProgress = !!_tour.detachedSessionId
  var previousConversationCount = Number(_tour.aiConversationCount || 0)
  _tour.sessionId    = param.sessionId    || null
  _tour.sessionToken = param.sessionToken || null
  _tour.detachedSessionId = null
  storage.setTourSession({ sessionId: _tour.sessionId, sessionToken: _tour.sessionToken })
  if (_tour.sessionId) _migrateHallChatSession(previousSessionId, _tour.sessionId)
  var stored = storage.getTourSession ? storage.getTourSession() : null
  _tour.aiConversationCount = preserveLocalProgress
    ? previousConversationCount
    : (stored ? Number(stored.aiConversationCount || 0) : 0)
  if (preserveLocalProgress) {
    storage.set(STORAGE_KEYS.TOUR_AI_CONVERSATION_COUNT, _tour.aiConversationCount)
  }
  _persistTourState()
}

function invalidateTourSession() {
  if (_tour.sessionId) _tour.detachedSessionId = _tour.sessionId
  _tour.sessionId = null
  _tour.sessionToken = null
  storage.setTourSession({ sessionId: null, sessionToken: null })
  _persistTourState()
}

function incrementAiConversationCount() {
  if (!_tour.sessionId) return 0
  _tour.aiConversationCount = Number(_tour.aiConversationCount || 0) + 1
  storage.set(STORAGE_KEYS.TOUR_AI_CONVERSATION_COUNT, _tour.aiConversationCount)
  _persistTourState()
  return _tour.aiConversationCount
}

function hasResumableTourSession(minTurns) {
  var required = minTurns == null ? TOUR_SESSION_RESUME_MIN_AI_TURNS : minTurns
  _hydrateStoredTour()
  var stored = storage.getTourSession ? storage.getTourSession() : null
  if (!_isStoredTourSessionResumable(stored)) return false
  return Number(stored.aiConversationCount || 0) >= required
}

function hasRecoverableTourState() {
  _hydrateStoredTour()
  if (_tour.sessionId || !_tour.detachedSessionId) return false
  var hasSnapshot = !!(
    _tour.localTourId || _tour.persona || _tour.currentHall || _tour.currentPage ||
    _tour.tourStartedAt || _tour.questionnaire || _tour.questionnaireDraft ||
    (_tour.visitedHalls && _tour.visitedHalls.length) ||
    (_tour.pendingEvents && _tour.pendingEvents.length)
  )
  if (hasSnapshot) return true
  var chatCache = storage.get(STORAGE_KEYS.TOUR_HALL_CHATS, null)
  return !!(
    chatCache && chatCache.sessionId === _tour.detachedSessionId &&
    chatCache.halls && Object.keys(chatCache.halls).length
  )
}

/**
 * Save profile extras captured during onboarding.
 * @param {{
 *   intentText?: string,
 *   preferredHallOrder?: string[],
 *   timeBudget?: string,
 *   focusId?: string,
 *   focusTitle?: string,
 *   focusPrompt?: string,
 *   assumptionText?: string,
 *   guideModeId?: string,
 *   guideModeTitle?: string,
 *   guideModePrompt?: string
 * }} opts
 */
function setOnboardingExtras(opts) {
  var o = opts || {}
  if (o.intentText         !== undefined) _tour.intentText         = o.intentText         || null
  if (o.preferredHallOrder !== undefined) _tour.preferredHallOrder = o.preferredHallOrder || []
  if (o.timeBudget         !== undefined) _tour.timeBudget         = o.timeBudget         || null
  if (o.focusId            !== undefined) _tour.focusId            = o.focusId            || null
  if (o.focusTitle         !== undefined) _tour.focusTitle         = o.focusTitle         || null
  if (o.focusPrompt        !== undefined) _tour.focusPrompt        = o.focusPrompt        || null
  if (o.assumptionText     !== undefined) _tour.assumptionText     = o.assumptionText     || null
  if (o.guideModeId        !== undefined) _tour.guideModeId        = o.guideModeId        || null
  if (o.guideModeTitle     !== undefined) _tour.guideModeTitle     = o.guideModeTitle     || null
  if (o.guideModePrompt    !== undefined) _tour.guideModePrompt    = o.guideModePrompt    || null
  _tour.questionnaire = _buildQuestionnaireState(_tour)
  _persistTourState()
}

function _buildQuestionnaireState(source) {
  var state = source || _tour
  return {
    persona_id: normalizePersonaId(state.personaId || state.persona),
    focus_id: state.focusId || null,
    assumption: state.assumption || null,
    rhythm_id: state.guideModeId || state.timeBudget || null,
    intent_text: state.intentText || null,
    preferred_hall_order: (Array.isArray(state.preferredHallOrder) ? state.preferredHallOrder : [])
      .map(function (hall) { return _normalizeHallForStorage(hall) })
      .filter(Boolean),
  }
}

function getQuestionnaireState() {
  _hydrateStoredTour()
  return _cloneJson(_tour.questionnaire || _buildQuestionnaireState(_tour), {})
}

function setQuestionnaireDraft(draft) {
  _tour.questionnaireDraft = draft && typeof draft === 'object' ? _cloneJson(draft, null) : null
  _persistTourState()
}

function getQuestionnaireDraft() {
  _hydrateStoredTour()
  return _tour.questionnaireDraft ? _cloneJson(_tour.questionnaireDraft, null) : null
}

function buildResumeState() {
  _hydrateStoredTour()
  return _cloneJson({
    status: _tour.status,
    interest_type: _tour.interestType,
    persona: _tour.persona,
    persona_id: _tour.personaId,
    assumption: _tour.assumption,
    questionnaire: _tour.questionnaire || _buildQuestionnaireState(_tour),
    questionnaire_draft: _tour.questionnaireDraft,
    route_plan: _tour.routePlan,
    current_page: _tour.currentPage,
    current_page_params: _tour.currentPageParams,
    current_hall: _tour.currentHall,
    current_hall_name: _tour.currentHallName,
    current_exhibit_id: _tour.currentExhibitId,
    current_exhibit: _tour.currentExhibit,
    current_scanned_exhibit_id: _tour.currentScannedExhibitId,
    current_scanned_exhibit_name: _tour.currentScannedExhibitName,
    last_scan_timestamp: _tour.lastScanTimestamp,
    visited_halls: _tour.visitedHalls,
    visited_exhibit_ids: _tour.visitedExhibitIds,
    ai_conversation_count: _tour.aiConversationCount,
    tour_started_at: _tour.tourStartedAt,
    intent_text: _tour.intentText,
    preferred_hall_order: _tour.preferredHallOrder,
    time_budget: _tour.timeBudget,
    focus_id: _tour.focusId,
    focus_title: _tour.focusTitle,
    focus_prompt: _tour.focusPrompt,
    assumption_text: _tour.assumptionText,
    guide_mode_id: _tour.guideModeId,
    guide_mode_title: _tour.guideModeTitle,
    guide_mode_prompt: _tour.guideModePrompt,
    style_preferences: getStylePrefs(),
    tts_preferences: getTtsPrefs(),
  }, {})
}

function applyServerResumeState(payload) {
  if (!payload || typeof payload !== 'object') return getTourState()
  if (storage.updateTourSessionActivity) storage.updateTourSessionActivity(payload)
  var localBeforeMerge = _cloneJson(_tour, {})
  var preserveDefaultPersona = localBeforeMerge.personaId === 'default' && (
    localBeforeMerge.focusId === 'default' ||
    (localBeforeMerge.questionnaire && localBeforeMerge.questionnaire.persona_id === 'default')
  )
  var pendingBeforeMerge = localBeforeMerge.pendingSessionSync || null
  var resume = payload.resume_state && typeof payload.resume_state === 'object'
    ? payload.resume_state
    : payload
  var patch = {}
  var fields = [
    'status', 'currentHall', 'currentHallName', 'currentExhibitId', 'currentExhibit', 'visitedHalls',
    'persona', 'personaId', 'assumption', 'questionnaire', 'routePlan', 'currentPage',
    'currentPageParams', 'tourStartedAt', 'serverStateVersion', 'questionnaireDraft',
    'visitedExhibitIds', 'aiConversationCount', 'interestType', 'intentText',
    'preferredHallOrder', 'timeBudget', 'focusId', 'focusTitle', 'assumptionText',
    'focusPrompt', 'guideModeId', 'guideModeTitle', 'guideModePrompt', 'currentScannedExhibitId',
    'currentScannedExhibitName', 'lastScanTimestamp',
  ]
  var aliases = {
    currentHall: ['current_hall'],
    currentHallName: ['current_hall_name'],
    currentExhibitId: ['current_exhibit_id'],
    currentExhibit: ['current_exhibit'],
    visitedHalls: ['visited_halls'],
    personaId: ['persona_id'],
    routePlan: ['route_plan'],
    currentPage: ['current_page'],
    currentPageParams: ['current_page_params'],
    tourStartedAt: ['tour_started_at'],
    serverStateVersion: ['state_version'],
    questionnaireDraft: ['questionnaire_draft'],
    visitedExhibitIds: ['visited_exhibit_ids'],
    aiConversationCount: ['ai_conversation_count'],
    interestType: ['interest_type'],
    intentText: ['intent_text'],
    preferredHallOrder: ['preferred_hall_order'],
    timeBudget: ['time_budget'],
    focusId: ['focus_id'],
    focusTitle: ['focus_title'],
    focusPrompt: ['focus_prompt'],
    assumptionText: ['assumption_text'],
    guideModeId: ['guide_mode_id'],
    guideModeTitle: ['guide_mode_title'],
    guideModePrompt: ['guide_mode_prompt'],
    currentScannedExhibitId: ['current_scanned_exhibit_id'],
    currentScannedExhibitName: ['current_scanned_exhibit_name'],
    lastScanTimestamp: ['last_scan_timestamp'],
  }
  fields.forEach(function (field) {
    if (resume[field] !== undefined) {
      patch[field] = resume[field]
      return
    }
    var names = aliases[field] || []
    for (var i = 0; i < names.length; i++) {
      if (resume[names[i]] !== undefined) {
        patch[field] = resume[names[i]]
        break
      }
    }
  })
  ;[
    ['status', 'status'],
    ['interest_type', 'interestType'],
    ['persona', 'persona'],
    ['assumption', 'assumption'],
    ['current_hall', 'currentHall'],
    ['current_exhibit_id', 'currentExhibitId'],
    ['visited_halls', 'visitedHalls'],
    ['visited_exhibit_ids', 'visitedExhibitIds'],
  ].forEach(function (entry) {
    if (payload[entry[0]] !== undefined) patch[entry[1]] = payload[entry[0]]
  })
  if (payload.questionnaire !== undefined) patch.questionnaire = payload.questionnaire
  if (payload.tour_started_at !== undefined) patch.tourStartedAt = payload.tour_started_at
  if (payload.state_version !== undefined) patch.serverStateVersion = payload.state_version
  if (pendingBeforeMerge && pendingBeforeMerge.resume_state) {
    patch = patch.serverStateVersion !== undefined
      ? { serverStateVersion: patch.serverStateVersion }
      : {}
  } else if (pendingBeforeMerge) {
    if (pendingBeforeMerge.current_hall !== undefined) delete patch.currentHall
    if (pendingBeforeMerge.current_exhibit_id !== undefined) delete patch.currentExhibitId
    if (pendingBeforeMerge.status !== undefined) delete patch.status
    if (pendingBeforeMerge.tour_started_at !== undefined) delete patch.tourStartedAt
    if (pendingBeforeMerge.questionnaire !== undefined) delete patch.questionnaire
  }
  if (patch.questionnaire && typeof patch.questionnaire === 'object') {
    var q = patch.questionnaire
    if (q.persona_id) patch.personaId = q.persona_id
    if (q.focus_id !== undefined) patch.focusId = q.focus_id
    if (q.assumption !== undefined) patch.assumption = q.assumption
    if (q.rhythm_id !== undefined) {
      patch.guideModeId = q.rhythm_id
      patch.timeBudget = q.rhythm_id
    }
    if (q.intent_text !== undefined) patch.intentText = q.intent_text
    if (Array.isArray(q.preferred_hall_order)) patch.preferredHallOrder = q.preferred_hall_order
  }
  if (preserveDefaultPersona) {
    patch.personaId = 'default'
    if (patch.questionnaire && typeof patch.questionnaire === 'object') {
      patch.questionnaire = Object.assign({}, patch.questionnaire, { persona_id: 'default' })
    }
  }
  if (!(pendingBeforeMerge && pendingBeforeMerge.resume_state)) {
    if (resume.style_preferences) setStylePrefs(resume.style_preferences)
    if (resume.tts_preferences) setTtsPrefs(resume.tts_preferences)
  }
  updateTourState(patch)
  var histories = pendingBeforeMerge && pendingBeforeMerge.hall_chat_history
    ? null
    : (payload.hall_chat_history || resume.hall_chat_history)
  if (Array.isArray(histories)) {
    histories.forEach(function (record) {
      if (!record || !record.hall) return
      var messages = Array.isArray(record.messages) ? record.messages : []
      if (messages.length) saveHallChatMessages(record.hall, messages)
    })
  } else if (histories && typeof histories === 'object') {
    Object.keys(histories).forEach(function (hall) {
      var value = histories[hall]
      var messages = Array.isArray(value) ? value : (value && value.messages)
      if (Array.isArray(messages)) saveHallChatMessages(hall, messages)
    })
  }
  return getTourState()
}

/**
 * Apply a partial update to the runtime tour state.
 * Automatically re-persists session credentials if they changed.
 * @param {object} patch
 */
function updateTourState(patch, options) {
  var opts = options || {}
  if (patch && patch.currentHall !== undefined) {
    patch = Object.assign({}, patch, { currentHall: _normalizeHallForStorage(patch.currentHall) })
  }
  if (patch && patch.currentHallName !== undefined) {
    patch = Object.assign({}, patch, {
      currentHallName: patch.currentHallName ? String(patch.currentHallName).slice(0, 255) : null,
    })
  }
  if (patch && patch.currentExhibitId !== undefined) {
    patch = Object.assign({}, patch, {
      currentExhibitId: exhibitIds.normalizeBackendExhibitId(patch.currentExhibitId),
    })
  }
  if (patch && patch.personaId !== undefined) {
    patch = Object.assign({}, patch, { personaId: normalizePersonaId(patch.personaId) })
  }
  Object.assign(_tour, patch)
  if (patch.sessionId !== undefined || patch.sessionToken !== undefined) {
    storage.setTourSession({ sessionId: _tour.sessionId, sessionToken: _tour.sessionToken })
  }
  if (patch.currentHall !== undefined) {
    if (opts.deferPersist) {
      setTimeout(function () {
        storage.set(STORAGE_KEYS.TOUR_CURRENT_HALL, _tour.currentHall || '')
      }, 0)
    } else {
      storage.set(STORAGE_KEYS.TOUR_CURRENT_HALL, _tour.currentHall || '')
    }
  }
  if (patch && (
    patch.persona !== undefined || patch.personaId !== undefined || patch.assumption !== undefined ||
    patch.focusId !== undefined || patch.guideModeId !== undefined || patch.timeBudget !== undefined ||
    patch.intentText !== undefined || patch.preferredHallOrder !== undefined
  )) {
    _tour.questionnaire = _buildQuestionnaireState(_tour)
  }
  if (opts.deferPersist) {
    setTimeout(_persistTourState, 0)
  } else {
    _persistTourState()
  }
}

function markCurrentPage(route, params) {
  var safeParams = null
  if (params && typeof params === 'object') {
    safeParams = {}
    Object.keys(params).slice(0, 20).forEach(function (key) {
      if (params[key] === undefined || params[key] === null) return
      safeParams[String(key).slice(0, 100)] = String(params[key]).slice(0, 500)
    })
  }
  updateTourState({
    currentPage: route ? String(route).slice(0, 100) : null,
    currentPageParams: safeParams,
  }, { deferPersist: true })
}

function ensureTourStartedAt() {
  _hydrateStoredTour()
  if (_tour.tourStartedAt) return _tour.tourStartedAt
  _tour.tourStartedAt = new Date().toISOString()
  addTourEvent({
    eventType: 'tour_start',
    metadata: { started_at: _tour.tourStartedAt },
  })
  _persistTourState()
  return _tour.tourStartedAt
}

function getLiveDurationMinutes(now) {
  _hydrateStoredTour()
  var started = Date.parse(_tour.tourStartedAt || '')
  var end = now === undefined ? Date.now() : Number(now)
  if (!isFinite(started) || !isFinite(end) || end < started) return null
  return (end - started) / 60000
}

/**
 * Return the current hall name from runtime state, falling back to storage.
 * Handles the case where the app was restarted and _tour.currentHall is null.
 * @returns {string|null}
 */
function getSavedCurrentHall() {
  _hydrateStoredTour()
  if (_tour.currentHall) return _tour.currentHall
  var storedHall = storage.get(STORAGE_KEYS.TOUR_CURRENT_HALL, null)
  return storedHall ? _normalizeHallForStorage(storedHall) : null
}

function getLastAnsweredHall() {
  _hydrateStoredTour()
  return _latestAnsweredHallFromStorage()
}

function getLastAnsweredHallDisplayName() {
  var hall = getLastAnsweredHall()
  return hall ? banpoHalls.getHallDisplayName(hall) : ''
}

/** @returns {object} shallow copy of current tour state */
function getTourState() {
  _hydrateStoredTour()
  return Object.assign({}, _tour)
}

// ─── Exhibit context ───────────────────────────────────────────────────────

function inferDiscussionObjectKind(exhibit) {
  var ex = exhibit || {}
  var text = [
    ex.objectKind || ex.kind || '',
    ex.category || '',
    ex.name || '',
    ex.description || '',
  ].join(' ')

  if (/房屋|房址|遗迹|遗址|墓葬|壕沟|窑址|灶址|柱洞|地层|灰坑|作坊|居址|聚落/.test(text)) {
    return '遗迹'
  }
  if (/陶|盆|瓶|罐|钵|器|石器|骨器|工具|饰品|纹|残片|器物/.test(text)) {
    return '器物'
  }
  if (/图|模型|复原|照片|展板|说明|资料|示意/.test(text)) {
    return '资料'
  }
  if (/雕塑|园|中心|空间|展厅/.test(text)) {
    return '空间'
  }
  return '展品'
}

function buildObjectPrompt(kind, name, intent) {
  var n = name ? '“' + name + '”' : '这个' + kind
  if (intent === 'details') {
    if (kind === '遗迹') return '看' + n + '时，哪些痕迹能在现场直接看到，哪些只是根据位置关系做出的推测？'
    if (kind === '资料') return n + '里哪些关键信息能帮助我理解半坡？'
    return n + '的材料、形态、痕迹或纹样里，哪些细节最值得先看？'
  }
  if (intent === 'function') {
    if (kind === '遗迹') return n + '在半坡聚落中可能承担什么功能，哪些现象能支持这种判断？'
    if (kind === '资料') return n + '和半坡人的生活、生产或信仰有什么关系？'
    if (kind === '空间') return n + '为什么安排在这里？它和参观路线里的其他内容有什么关系？'
    return n + '可能怎么使用？哪些痕迹或形态能支持这个判断？'
  }
  if (kind === '遗迹') return n + '和周围的房址、墓葬、壕沟或作坊之间有什么关系？'
  if (kind === '资料') return n + '可以和展厅里的哪些实物或遗迹互相印证？'
  if (kind === '空间') return n + '能帮我复盘前面哪些观察线索？'
  return n + '能和展厅里哪些对象放在一起比较？比较后能看出什么？'
}

function _textHasAny(text, words) {
  var source = String(text || '')
  for (var i = 0; i < words.length; i++) {
    if (source.indexOf(words[i]) >= 0) return true
  }
  return false
}

function _buildExhibitSuggestionPool(exhibit, persona) {
  var kind = exhibit.objectKind || inferDiscussionObjectKind(exhibit)
  var name = exhibit.name || ''
  var label = name ? '“' + name + '”' : '这个对象'
  var text = [name, exhibit.category, exhibit.description, kind].join(' ')
  var pool = []

  pool.push({
    type: 'observation_task',
    icon: '🔎',
    title: kind === '遗迹' ? '看现场痕迹' : '看关键细节',
    prompt: buildObjectPrompt(kind, name, 'details'),
  })

  if (_textHasAny(text, ['彩陶', '纹', '图案', '人面', '鱼纹', '装饰'])) {
    pool.push({
      type: 'observation_task',
      icon: '🎨',
      title: '读纹样线索',
      prompt: label + '的纹样或装饰中，哪些是直接可见的线索，哪些需要结合展厅解释？',
    })
  } else if (_textHasAny(text, ['石器', '骨器', '工具', '针', '斧', '锥', '磨', '钻'])) {
    pool.push({
      type: 'observation_task',
      icon: '🛠',
      title: '看使用痕迹',
      prompt: label + '可能经历过哪些加工或使用？材料、刃口、磨损和形态分别能说明什么？',
    })
  } else if (_textHasAny(text, ['陶窑', '烧', '窑', '火候', '残片'])) {
    pool.push({
      type: 'observation_task',
      icon: '🔥',
      title: '找火候证据',
      prompt: label + '的颜色、残片、结构或位置关系，能提示哪些烧制信息？',
    })
  } else if (kind === '遗迹' || _textHasAny(text, ['房屋', '壕沟', '墓葬', '作坊', '灶', '空间'])) {
    pool.push({
      type: 'comparison',
      icon: '🧭',
      title: '读空间关系',
      prompt: label + '和周围的房址、墓葬、壕沟或作坊之间有什么关系？这些关系能说明怎样的聚落秩序？',
    })
  } else {
    pool.push({
      type: 'observation_task',
      icon: '💡',
      title: '问用途证据',
      prompt: buildObjectPrompt(kind, name, 'function'),
    })
  }

  var personaPrompts = {
    A: {
      icon: '📍',
      title: '证据边界',
      prompt: '围绕' + label + '，哪些判断能由实物或现场位置直接支持，哪些还只能作为解释？',
    },
    B: {
      icon: '📝',
      title: '记成笔记',
      prompt: '如果把' + label + '写进研学笔记，可以记录哪三个观察点和一个追问？',
    },
    C: {
      icon: '🧩',
      title: '连到社会',
      prompt: label + '能连接到半坡人的共同生活、分工或礼俗吗？哪些是证据，哪些还只是推测？',
    },
    D: {
      icon: '🏺',
      title: '器物细读',
      prompt: '从材料、器形、纹饰、痕迹和使用场景看，' + label + '最值得细读的地方是什么？',
    },
    default: {
      icon: '📍',
      title: '先看什么',
      prompt: '第一次看' + label + '时，哪些可见信息最能帮助判断它的用途或意义？',
    },
  }
  var personaItem = personaPrompts[persona] || personaPrompts.default
  pool.push({
    type: persona === 'C' ? 'comparison' : 'observation_task',
    icon: personaItem.icon,
    title: personaItem.title,
    prompt: personaItem.prompt,
  })

  pool.push({
    type: 'comparison',
    icon: '🧭',
    title: '展厅对照',
    prompt: buildObjectPrompt(kind, name, 'relation'),
  })

  return pool
}

/**
 * Store the exhibit currently being discussed so the chat request can send
 * only its stable identifier while the user is in exhibit-focus mode.
 * @param {object|null} exhibit  normalizeExhibit() output from exhibit-detail
 */
function _normalizeExhibitContext(exhibit) {
  if (!exhibit) return null
  return {
    id:          String(exhibit.id || exhibit.name || '').slice(0, 100) || null,
    name:        String(exhibit.name || '').slice(0, 255),
    hall:        exhibit.hall ? banpoHalls.normalizeHallToSlug(exhibit.hall) : '',
    hallDisplay: String(exhibit.hallDisplay || _tour.currentHallName || banpoHalls.getHallDisplayName(exhibit.hall) || '').slice(0, 255),
    era:         String(exhibit.era || '').slice(0, 100),
    category:    String(exhibit.category || '').slice(0, 100),
    objectKind:  String(exhibit.objectKind || exhibit.kind || inferDiscussionObjectKind(exhibit)).slice(0, 100),
    description: String(exhibit.description || exhibit.summary || exhibit.desc || '').slice(0, 2000),
    tags:        (Array.isArray(exhibit.tags) ? exhibit.tags : []).map(function (tag) {
      return String(tag).slice(0, 100)
    }).slice(0, 20),
  }
}

function _resolveExhibitHall(exhibit, hall) {
  var fromArg = hall ? _normalizeHallForStorage(hall) : ''
  if (fromArg) return fromArg
  var fromExhibit = exhibit && exhibit.hall ? _normalizeHallForStorage(exhibit.hall) : ''
  if (fromExhibit) return fromExhibit
  return _tour.currentHall ? _normalizeHallForStorage(_tour.currentHall) : ''
}

function setCurrentExhibit(exhibit, hall) {
  var normalized = _normalizeExhibitContext(exhibit)
  var hallSlug = _resolveExhibitHall(normalized || exhibit, hall)
  if (normalized && hallSlug && !normalized.hall) {
    normalized.hall = hallSlug
    normalized.hallDisplay = normalized.hallDisplay || banpoHalls.getHallDisplayName(hallSlug)
  }
  _tour.currentExhibit = normalized
  _tour.currentExhibitId = exhibitIds.normalizeBackendExhibitId(exhibit && exhibit.id)
  _persistTourState()
}

/** Clear exhibit-focus mode (user tapped ✕ in the Context Bar). */
function clearCurrentExhibit() {
  _tour.currentExhibit = null
  _tour.currentExhibitId = null
  _persistTourState()
}

/** @returns {object|null} shallow copy of currentExhibit, or null */
function getCurrentExhibit() {
  return _tour.currentExhibit ? Object.assign({}, _tour.currentExhibit) : null
}

function setPendingDetailExhibit(exhibit) {
  _tour.pendingDetailExhibit = _normalizeExhibitContext(exhibit)
  _persistTourState()
}

function consumePendingDetailExhibit(name) {
  var pending = _tour.pendingDetailExhibit
  if (!pending) return null
  if (name && pending.name && pending.name !== name) return null
  _tour.pendingDetailExhibit = null
  _persistTourState()
  return Object.assign({}, pending)
}

function setCurrentScannedExhibit(exhibit) {
  _tour.currentScannedExhibitId = exhibit && exhibit.id ? exhibit.id : null
  _tour.currentScannedExhibitName = exhibit && exhibit.name ? exhibit.name : null
  _tour.lastScanTimestamp = exhibit ? Date.now() : null
  _persistTourState()
}

function getCurrentScannedExhibit() {
  return {
    currentScannedExhibitId: _tour.currentScannedExhibitId,
    currentScannedExhibitName: _tour.currentScannedExhibitName,
    lastScanTimestamp: _tour.lastScanTimestamp,
  }
}

// ─── Event buffering ───────────────────────────────────────────────────────

/**
 * Append an event to the local pending buffer and persist it.
 * Pages call drainPendingEvents() before flushing to the server.
 *
 * @param {{ eventType: string, exhibitId?: string, hall?: string,
 *            durationSeconds?: number, metadata?: object }} event
 */
function addTourEvent(event) {
  var entry = _sanitizePendingEvent(event)
  if (!entry) return
  var eventType = entry.event_type
  var hallSlug = entry.hall
  if (VISITED_HALL_EVENT_TYPES[eventType] && hallSlug && _tour.visitedHalls.indexOf(hallSlug) === -1) {
    _tour.visitedHalls = _tour.visitedHalls.concat(hallSlug)
    _persistVisitedHalls()
  }
  if (eventType === 'exhibit_view') {
    _rememberVisitedExhibit(entry)
  }
  _tour.pendingEvents = _tour.pendingEvents.concat(entry)
  _persistPendingEvents()
}

/**
 * Atomically remove and return all pending events.
 * Call this right before sending them to the server.  If the upload fails,
 * pass the events back via restorePendingEvents().
 * @returns {Array}
 */
function drainPendingEvents() {
  _hydrateStoredTour()
  var events          = _tour.pendingEvents.map(_sanitizePendingEvent).filter(Boolean)
  _tour.pendingEvents = []
  _persistPendingEvents()
  return events
}

/**
 * Re-prepend events that failed to upload.
 * @param {Array} events
 */
function restorePendingEvents(events) {
  var sanitized = (events || []).map(_sanitizePendingEvent).filter(Boolean)
  _tour.pendingEvents = sanitized.concat(_tour.pendingEvents.map(_sanitizePendingEvent).filter(Boolean))
  sanitized.forEach(function (event) {
    var eventType = event && (event.event_type || event.eventType)
    var hallSlug = event && event.hall ? _normalizeHallForStorage(event.hall) : null
    if (VISITED_HALL_EVENT_TYPES[eventType] && hallSlug && _tour.visitedHalls.indexOf(hallSlug) === -1) {
      _tour.visitedHalls = _tour.visitedHalls.concat(hallSlug)
    }
    if (eventType === 'exhibit_view') {
      _rememberVisitedExhibit(event)
    }
  })
  if (events && events.length) _persistVisitedHalls()
  _persistPendingEvents()
}

function getVisitedExhibitCount() {
  _hydrateStoredTour()
  return _normalizeVisitedExhibitIds(_tour.visitedExhibitIds).length
}

function _persistPendingEvents() {
  _tour.pendingEvents = _tour.pendingEvents.map(_sanitizePendingEvent).filter(Boolean)
  storage.set(STORAGE_KEYS.TOUR_PENDING_EVENTS, _tour.pendingEvents)
  _persistTourState()
}

// ─── Teardown ──────────────────────────────────────────────────────────────

/** Reset all runtime tour state and clear wx.storage tour keys. */
function clearTour() {
  _tour = _makeEmptyTour()
  _tourStateHydrated = true
  storage.clearTour()
}

// ─── Record summary ───────────────────────────────────────────────────────

function _compactRecordText(value, maxLen) {
  var text = String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  var limit = maxLen || 80
  if (text.length > limit) return text.slice(0, limit).replace(/[，。；、\s]+$/g, '') + '…'
  return text
}

function _pushRecordKeyword(list, value) {
  var text = String(value || '').trim()
  if (text && list.indexOf(text) === -1) list.push(text)
}

function _recordSummaryPhrases(questionText, answerText) {
  var text = String([questionText, answerText].join(' '))
  var focus = []
  var knowledge = []
  if (/石器|骨器|工具|用途/.test(text)) _pushRecordKeyword(focus, '石器骨器用途')
  if (/文物|类型|展示|展厅/.test(text)) _pushRecordKeyword(focus, '文物类型')
  if (/动手|体验|技术|制作|步骤/.test(text)) _pushRecordKeyword(focus, '动手体验与技术理解')
  if (/陶|彩陶|陶器|器形|纹饰|工艺|烧制/.test(text)) _pushRecordKeyword(focus, '器物工艺')
  if (/房屋|聚落|遗址|壕沟|布局|半地穴/.test(text)) _pushRecordKeyword(focus, '聚落空间')
  if (/人面|鱼纹|图案|信仰|仪式|观念/.test(text)) _pushRecordKeyword(focus, '图案与观念')
  if (/生活|先民|日常|生产|定居/.test(text)) _pushRecordKeyword(focus, '半坡生活方式')

  if (/石器|骨器|工具/.test(answerText)) _pushRecordKeyword(knowledge, '石器、骨器和工具可对应加工、制作与生产分工')
  if (/陶|彩陶|陶器|器形|纹饰|烧制/.test(answerText)) _pushRecordKeyword(knowledge, '陶器可从器形、纹饰和制作痕迹理解用途')
  if (/房屋|聚落|遗址|壕沟|半地穴|布局/.test(answerText)) _pushRecordKeyword(knowledge, '房屋、壕沟等遗迹能说明聚落布局')
  if (/人面|鱼纹|图案|信仰|仪式|观念/.test(answerText)) _pushRecordKeyword(knowledge, '人面鱼纹等图案关联审美、仪式与观念')
  if (/动手|体验|技术|制作|步骤|材料/.test(answerText)) _pushRecordKeyword(knowledge, '动手体验能把材料、步骤和工具关系具体化')
  if (/生活|定居|生产|日常|先民/.test(answerText)) _pushRecordKeyword(knowledge, '出土文物反映定居、生产和日常生活方式')

  if (!focus.length) _pushRecordKeyword(focus, '证据线索')
  if (!knowledge.length) _pushRecordKeyword(knowledge, '相关判断需要回到展品、展签和遗迹位置核对')
  return { focus: focus.slice(0, 4), knowledge: knowledge.slice(0, 3) }
}

function _appendRecordSentence(parts, sentence, maxLen) {
  if (!sentence) return
  if ((parts.join('') + sentence).length <= (maxLen || 300)) parts.push(sentence)
}

function _joinRecordPhrases(phrases) {
  var list = (phrases || []).filter(Boolean)
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return list[0] + '和' + list[1]
  return list.slice(0, -1).join('、') + '和' + list[list.length - 1]
}

function _buildRecordSummaryPoint(hallName, questionText, answerText) {
  var phrases = _recordSummaryPhrases(questionText, answerText)
  var subject = hallName ? hallName + '这段记录' : '这次参观'
  var focusText = _joinRecordPhrases(phrases.focus)
  var knowledgeText = _joinRecordPhrases(phrases.knowledge)
  var parts = []
  _appendRecordSentence(parts, subject + '主要留下这些线索：' + knowledgeText + '。', 300)
  _appendRecordSentence(parts, '提问中的' + focusText + '，可在展柜、展签和遗迹位置继续核对。', 300)
  return parts.join('')
}

function _extractMessagePairs(messages) {
  var pairs = []
  var list = Array.isArray(messages) ? messages : []
  for (var i = 0; i < list.length; i++) {
    var msg = list[i]
    if (!msg || msg.role !== 'user' || !msg.content) continue
    var answer = ''
    for (var j = i + 1; j < list.length; j++) {
      if (list[j].role === 'assistant' && !list[j].isError && list[j].content) {
        answer = list[j].content
        break
      }
      if (list[j].role === 'user') break
    }
    if (answer) pairs.push({ question: msg.content, answer: answer })
  }
  return pairs
}

function _hasUserMessages(messages) {
  return (Array.isArray(messages) ? messages : []).some(function (msg) {
    return msg && msg.role === 'user' && !!msg.content
  })
}

function _summarizeHallRecord(hall, messages) {
  hall = hall ? _normalizeHallForStorage(hall) : null
  if (!hall) return []
  var pairs = _extractMessagePairs(messages)
  if (!pairs.length) return getRecordSummaryNotes()

  var hallName = banpoHalls.getHallDisplayName(hall)
  var questionText = pairs.map(function (pair) { return pair.question }).join(' ')
  var answerText = pairs.map(function (pair) { return pair.answer }).join(' ')
  var point = _buildRecordSummaryPoint(hallName, questionText, answerText)

  var note = {
    hall: hall,
    question: '游览记录摘要',
    point: point,
    updatedAt: Date.now(),
  }
  var notes = getRecordSummaryNotes().filter(function (item) {
    return item && item.hall !== hall
  })
  notes.push(note)
  notes.sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0) })
  storage.set(STORAGE_KEYS.TOUR_RECORD_SUMMARY, notes.slice(-6))
  return notes.slice(-6)
}

function summarizeCurrentHallRecord(messages) {
  var hall = _tour.currentHall ? _normalizeHallForStorage(_tour.currentHall) : null
  return _summarizeHallRecord(hall, messages)
}

function summarizeHallRecord(hall, messages) {
  var slug = hall ? _normalizeHallForStorage(hall) : null
  return _summarizeHallRecord(slug, messages)
}

function summarizeStoredHallRecords() {
  var cache = _getHallChatCache()
  var halls = cache.halls || {}
  Object.keys(halls).forEach(function (hall) {
    var record = halls[hall] || {}
    _summarizeHallRecord(hall, record.messages || [])
  })
  return getRecordSummaryNotes()
}

function getRecordSummaryNotes() {
  var notes = storage.get(STORAGE_KEYS.TOUR_RECORD_SUMMARY, [])
  return Array.isArray(notes) ? notes : []
}

// ─── API header helper ─────────────────────────────────────────────────────

/**
 * Returns an extra-headers object for tour API calls that require
 * the X-Session-Token header.
 * @returns {object}
 */
function getTourHeader() {
  _hydrateStoredTour()
  if (!_tour.sessionToken) return {}
  return { 'X-Session-Token': _tour.sessionToken }
}

// ─── Guide suggestions ────────────────────────────────────────────────────


var SUGGESTION_FALLBACK_ICON_BY_TYPE = {
  hall_intro:       'suggest-overview',
  observation_task:'suggest-detail',
  comparison:      'suggest-relation',
  related_exhibit: 'suggest-exhibit',
  next_step:       'suggest-back',
}

var SUGGESTION_ICON_RULES = [
  { pattern: /返回|列表|退出|回到/, iconKey: 'suggest-back' },
  { pattern: /对照|比较|关系|放回展厅|关联|连起来/, iconKey: 'suggest-relation' },
  { pattern: /石器|骨器|工具|加工|制作工艺|工艺步骤|打磨|切割|钻孔|针|斧|铲|锥/, iconKey: 'suggest-tools' },
  { pattern: /陶窑|烧成|火候|窑火|窑炉|制陶|陶器制作|烧制/, iconKey: 'suggest-kiln' },
  { pattern: /聚落|布局|壕沟|边界|公共|空间|遗址保护/, iconKey: 'suggest-settlement' },
  { pattern: /房屋|居住|居所|半穴居|建造|柱洞|灶/, iconKey: 'suggest-house' },
  { pattern: /食物|饮食|炊煮|粮食|陶甑|取水|尖底瓶/, iconKey: 'suggest-food' },
  { pattern: /纹样|彩陶|艺术|审美|图像|人面|鱼纹|鹿纹|装饰/, iconKey: 'suggest-pattern' },
  { pattern: /考古|证据|判断|推理|不确定|遗址价值|信息来源|层位|出土/, iconKey: 'suggest-archaeology' },
  { pattern: /体验|动手|手作|互动|复原|操作/, iconKey: 'suggest-hands' },
  { pattern: /姑娘|人物|形象|雕塑|合影|记忆/, iconKey: 'suggest-figure' },
  { pattern: /研学|记录|笔记|整理|问题|任务|复盘|小结/, iconKey: 'suggest-notes' },
  { pattern: /休憩|环境|园林|牡丹|自然/, iconKey: 'suggest-garden' },
  { pattern: /临展|现场主题|主题线索|策展|叙事|单元|展签|看展方法/, iconKey: 'suggest-curation' },
  { pattern: /文物类型|文物种类|展品类型|本厅展品|器物种类|器物看法|代表器物/, iconKey: 'suggest-artifacts' },
  { pattern: /细节|关键|用途|使用|原理|功能|观察/, iconKey: 'suggest-detail' },
]

function _suggestionIconKey(item) {
  if (!item) return 'suggest-overview'
  if (item.iconKey) return item.iconKey

  var payload = item.payload || {}
  var text = [
    item.title,
    item.type,
    item.actionType,
    payload.prompt,
    payload.keyword,
    payload.exhibitName,
  ].filter(Boolean).join(' ')

  for (var i = 0; i < SUGGESTION_ICON_RULES.length; i++) {
    var rule = SUGGESTION_ICON_RULES[i]
    if (rule.pattern.test(text)) return rule.iconKey
  }

  if (item.actionType === 'open_exhibit') return 'suggest-exhibit'
  return SUGGESTION_FALLBACK_ICON_BY_TYPE[item.type] || 'suggest-overview'
}

function _decorateSuggestion(item) {
  var iconKey = _suggestionIconKey(item)
  return Object.assign({}, item, {
    iconKey: iconKey,
    iconSrc: '/assets/icons/' + iconKey + '.png',
  })
}

function _decorateSuggestions(list) {
  return (list || []).map(_decorateSuggestion)
}

/**
 * Convert trusted backend suggestion strings into guide-chip view models.
 * Invalid or empty payloads intentionally produce an empty bar.
 */
function buildServerGuideSuggestions(values) {
  if (!Array.isArray(values)) return []
  var prompts = values.map(function (item) {
    return typeof item === 'string' ? item.trim() : ''
  }).filter(Boolean).slice(0, 6)

  return _decorateSuggestions(prompts.map(function (prompt, index) {
    return {
      id: 'server-suggestion-' + index,
      type: 'observation_task',
      icon: '💬',
      title: prompt.length > 18 ? prompt.slice(0, 18) + '…' : prompt,
      actionType: 'ask',
      payload: { prompt: prompt },
    }
  }))
}

/**
 * Generate guide suggestions for the current tour context.
 * Can be called with an optional list of real exhibits from the API to
 * enrich suggestions with actual high-importance exhibit cards.
 *
 * @param {{
 *   exhibits?:       object[],      // normalizeExhibit() objects from API (may be empty)
 *   currentExhibit?: object|null,   // override; defaults to _tour.currentExhibit
 *   currentHall?:    string|null,   // override; defaults to _tour.currentHall
 * }} [opts]
 * @returns {Array<{ id, type, icon, title, actionType, payload }>}
 */
function generateGuideSuggestions(opts) {
  var options  = opts || {}
  var exhibit  = options.currentExhibit !== undefined ? options.currentExhibit : (_tour.currentExhibit || null)
  var persona  = normalizePersonaId(_tour.personaId || _tour.persona || 'default')
  var exhibits = options.exhibits || []

  var suggestions = []
  var counter = 0
  function _id() { return 'sg_' + (++counter) }

  // ── Exhibit mode: suggestions around the selected exhibit ─────────────────
  if (exhibit) {
    var pool = _buildExhibitSuggestionPool(exhibit, persona)
    for (var pi = 0; pi < pool.length; pi++) {
      suggestions.push({
        id: _id(), type: pool[pi].type, icon: pool[pi].icon, title: pool[pi].title,
        actionType: 'ask', payload: { prompt: pool[pi].prompt },
      })
    }

    // Related object: highest importance in same hall, not current
    var related = null
    for (var ri = 0; ri < exhibits.length; ri++) {
      var re = exhibits[ri]
      if (re.name === exhibit.name || re.id === exhibit.id) continue
      if (!related || (re.importance || 0) > (related.importance || 0)) related = re
    }
    if (related) {
      suggestions.push({
        id: _id(), type: 'related_exhibit', icon: '🏺',
        title: '对照：' + related.name,
        actionType: 'open_exhibit',
        payload: { exhibitId: related.id, exhibitName: related.name },
      })
    }

    return _decorateSuggestions(suggestions.slice(0, 4))
  }

  // Hall-mode chips are backend-owned so imported museum data becomes visible
  // without shipping another mini-program bundle.
  return []
}

// ─── Context question detection ────────────────────────────────────────────

var _CONTEXT_KEYWORDS = [
  '刚刚', '刚才', '我们在讨论', '我们刚才', '继续',
  '上一个', '上一件', '前面说', '你刚刚', '你说的',
  '总结', '说到哪', '这个问题', '你上面', '上面说',
  '之前', '前面我们',
  // 覆盖元问题和上下文整理请求（修复"请帮我整理上下文"等场景）
  '上下文', '整理', '回顾', '聊了', '说了什么', '帮我总结', '复述', '讲到',
]

/**
 * Returns true when the user's question is referential — i.e. it references
 * the ongoing conversation rather than asking about a new topic.
 * Used to decide whether to inject recent message history into the prompt.
 * @param {string} text
 * @returns {boolean}
 */
function isContextQuestion(text) {
  var s = String(text || '').trim()
  for (var i = 0; i < _CONTEXT_KEYWORDS.length; i++) {
    if (s.indexOf(_CONTEXT_KEYWORDS[i]) >= 0) return true
  }
  // "它" with no active exhibit: user is likely referring to something discussed earlier
  if (s.indexOf('它') >= 0 && !_tour.currentExhibit) return true
  return false
}

// Prompt/persona/context assembly is backend-owned. The mini-program sends
// only raw user text plus stable hall/exhibit identifiers and display style.

/** Return the persona definition for the current session. */
function getPersonaDef() {
  return PERSONA_DEFS[normalizePersonaId(_tour.personaId || _tour.persona)] || PERSONA_DEFS['default']
}

/**
 * Return the backend persona ID ('default'|'A'|'B'|'C'|'D').
 */
function getBackendPersona() {
  return getPersonaDef().backendPersona || 'default'
}

// ─── Persona helpers (ported from useTour computed props) ──────────────────

/**
 * @returns {string} Display label for the current session's persona, e.g. '考古研究员'
 */
function getPersonaLabel() {
  var def = PERSONA_DEFS[normalizePersonaId(_tour.personaId || _tour.persona)]
  if (def && def.name) return def.name
  var map = { A: '考古研究员', B: '研学记录员', C: '历史追问者', D: '器物研究员' }
  return map[_tour.persona] || ''
}

/**
 * @returns {string} Report title for the current persona
 */
function getReportThemeTitle() {
  var idMap = {
    'default': '半坡游览报告',
    A: '半坡考古研究报告',
    B: '半坡研学记录报告',
    C: '半坡历史追问报告',
    D: '半坡器物观察报告',
  }
  var id = normalizePersonaId(_tour.personaId || _tour.persona)
  if (idMap[id]) return idMap[id]
  var map = { A: '半坡考古研究报告', B: '半坡研学记录报告', C: '半坡历史追问报告', D: '半坡器物观察报告' }
  return map[_tour.persona] || ''
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Session lifecycle
  createLocalTourState,
  ensureLocalTourId,
  setTourSession,
  invalidateTourSession,
  incrementAiConversationCount,
  hasResumableTourSession,
  hasRecoverableTourState,
  updateTourState,
  getTourState,
  clearTour,
  setOnboardingExtras,
  getQuestionnaireState,
  setQuestionnaireDraft,
  getQuestionnaireDraft,
  buildResumeState,
  applyServerResumeState,
  markCurrentPage,
  ensureTourStartedAt,
  getLiveDurationMinutes,

  // Exhibit context
  setCurrentExhibit,
  clearCurrentExhibit,
  getCurrentExhibit,
  normalizeBackendExhibitId: exhibitIds.normalizeBackendExhibitId,
  normalizeBackendExhibitUuid: exhibitIds.normalizeBackendExhibitUuid,
  setPendingDetailExhibit,
  consumePendingDetailExhibit,
  setCurrentScannedExhibit,
  getCurrentScannedExhibit,

  // Event buffer
  addTourEvent,
  drainPendingEvents,
  restorePendingEvents,
  getVisitedExhibitCount,
  saveHallChatMessages,
  getHallChatMessages,
  getHallChatHistoryPayload,
  saveCurrentHallChatMessages,
  summarizeHallRecord,
  summarizeCurrentHallRecord,
  summarizeStoredHallRecords,
  getRecordSummaryNotes,

  // API helpers
  getTourHeader,

  // Workbench preferences
  getUiPrefs,
  getStylePrefs,
  getTtsPrefs,
  setUiPrefs,
  setStylePrefs,
  setTtsPrefs,
  isContextQuestion,

  // Persona display
  getPersonaLabel,
  getReportThemeTitle,

  // Persona system
  PERSONA_DEFS,
  getPersonaDef,
  getBackendPersona,

  // Guide suggestions
  buildServerGuideSuggestions,
  generateGuideSuggestions,

  // Hall persistence
  getSavedCurrentHall,
  getCurrentHallDisplayName: _getCurrentHallDisplayName,
  getLastAnsweredHall,
  getLastAnsweredHallDisplayName,
}
