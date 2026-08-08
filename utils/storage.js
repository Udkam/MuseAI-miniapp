const KEYS = {
  TOUR_SESSION_ID:       'tour_session_id',
  TOUR_SESSION_TOKEN:    'tour_session_token',
  TOUR_SESSION_CREATED_AT: 'tour_session_created_at',
  TOUR_SESSION_LAST_ACTIVE_AT: 'tour_session_last_active_at',
  TOUR_SESSION_EXPIRES_AT: 'tour_session_expires_at',
  TOUR_SESSION_SCHEMA_VERSION: 'tour_session_schema_version',
  TOUR_AI_CONVERSATION_COUNT: 'tour_ai_conversation_count',
  TOUR_CACHE_SCHEMA_VERSION: 'tour_cache_schema_version',
  TOUR_CURRENT_HALL:     'tour_current_hall',
  TOUR_VISITED_HALLS:    'tour_visited_halls',
  TOUR_VISITED_EXHIBITS: 'tour_visited_exhibits',
  TOUR_HALL_EXHIBITS:    'tour_hall_exhibits',
  TOUR_PENDING_EVENTS:   'tour_pending_events',
  TOUR_RECORD_SUMMARY:   'tour_record_summary',
  TOUR_HALL_CHATS:       'tour_hall_chats',
  TOUR_STATE:            'tour_state',
  TOUR_UI_PREFS:         'tour_workbench_ui_prefs',
  TOUR_STYLE_PREFS:      'tour_workbench_style_prefs',
  TOUR_TTS_PREFS:        'tour_workbench_tts_prefs',
}

const TOUR_SESSION_SCHEMA_VERSION = 'tour-session-v3'
const TOUR_CACHE_SCHEMA_VERSION = 'tour-cache-v5'
const LEGACY_AUTH_KEYS = ['auth_token', 'user', 'user_role']

function get(key, defaultValue) {
  try {
    const val = wx.getStorageSync(key)
    return (val !== '' && val !== undefined && val !== null) ? val : defaultValue
  } catch (e) {
    return defaultValue
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {
    console.error('[storage] set failed:', key, e)
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    // ignore — key may not exist
  }
}

function clearTourPrefs() {
  [
    KEYS.TOUR_UI_PREFS,
    KEYS.TOUR_STYLE_PREFS,
    KEYS.TOUR_TTS_PREFS,
  ].forEach(remove)
}

// Old releases persisted ordinary-user auth state. The mini-program is now
// guest-only, so remove those keys on every launch even when the cache schema
// is already current.
function clearLegacyAuth() {
  LEGACY_AUTH_KEYS.forEach(remove)
}

function getTourSession() {
  return {
    sessionId:    get(KEYS.TOUR_SESSION_ID, null),
    sessionToken: get(KEYS.TOUR_SESSION_TOKEN, null),
    createdAt:    Number(get(KEYS.TOUR_SESSION_CREATED_AT, 0)) || 0,
    lastActiveAt: Number(get(KEYS.TOUR_SESSION_LAST_ACTIVE_AT, 0)) || 0,
    expiresAt:   Number(get(KEYS.TOUR_SESSION_EXPIRES_AT, 0)) || 0,
    schemaVersion: get(KEYS.TOUR_SESSION_SCHEMA_VERSION, null),
    aiConversationCount: Number(get(KEYS.TOUR_AI_CONVERSATION_COUNT, 0)) || 0,
  }
}

function setTourSession({ sessionId, sessionToken }) {
  const previousSessionId = get(KEYS.TOUR_SESSION_ID, null)
  if (sessionId) {
    set(KEYS.TOUR_SESSION_ID, sessionId)
    set(KEYS.TOUR_SESSION_CREATED_AT, Date.now())
    set(KEYS.TOUR_SESSION_LAST_ACTIVE_AT, Date.now())
    set(KEYS.TOUR_SESSION_EXPIRES_AT, Date.now() + 24 * 60 * 60 * 1000)
    set(KEYS.TOUR_SESSION_SCHEMA_VERSION, TOUR_SESSION_SCHEMA_VERSION)
    if (previousSessionId !== sessionId) {
      set(KEYS.TOUR_AI_CONVERSATION_COUNT, 0)
    }
  } else {
    remove(KEYS.TOUR_SESSION_ID)
    remove(KEYS.TOUR_SESSION_CREATED_AT)
    remove(KEYS.TOUR_SESSION_LAST_ACTIVE_AT)
    remove(KEYS.TOUR_SESSION_EXPIRES_AT)
    remove(KEYS.TOUR_SESSION_SCHEMA_VERSION)
    remove(KEYS.TOUR_SESSION_TOKEN)
    remove(KEYS.TOUR_AI_CONVERSATION_COUNT)
    return
  }
  // sessionToken may be empty string — store as-is so key exists
  set(KEYS.TOUR_SESSION_TOKEN, sessionToken || '')
}

function touchTourSession(at) {
  if (!get(KEYS.TOUR_SESSION_ID, null)) return
  const activeAt = Number(at) || Date.now()
  set(KEYS.TOUR_SESSION_LAST_ACTIVE_AT, activeAt)
  set(KEYS.TOUR_SESSION_EXPIRES_AT, activeAt + 24 * 60 * 60 * 1000)
}

function updateTourSessionActivity(payload) {
  if (!payload || typeof payload !== 'object') return false
  const activeAt = Date.parse(payload.last_active_at || '')
  const expiresAt = Date.parse(payload.expires_at || '')
  const hasActiveAt = isFinite(activeAt)
  const hasExpiresAt = isFinite(expiresAt)
  if (hasActiveAt) set(KEYS.TOUR_SESSION_LAST_ACTIVE_AT, activeAt)
  if (hasExpiresAt) set(KEYS.TOUR_SESSION_EXPIRES_AT, expiresAt)
  return hasActiveAt || hasExpiresAt
}

// Clears only tour session state (e.g. on tour reset)
function clearTour() {
  [
    KEYS.TOUR_SESSION_ID,
    KEYS.TOUR_SESSION_TOKEN,
    KEYS.TOUR_SESSION_CREATED_AT,
    KEYS.TOUR_SESSION_LAST_ACTIVE_AT,
    KEYS.TOUR_SESSION_EXPIRES_AT,
    KEYS.TOUR_SESSION_SCHEMA_VERSION,
    KEYS.TOUR_AI_CONVERSATION_COUNT,
    KEYS.TOUR_CURRENT_HALL,
    KEYS.TOUR_VISITED_HALLS,
    KEYS.TOUR_VISITED_EXHIBITS,
    KEYS.TOUR_HALL_EXHIBITS,
    KEYS.TOUR_PENDING_EVENTS,
    KEYS.TOUR_RECORD_SUMMARY,
    KEYS.TOUR_HALL_CHATS,
    KEYS.TOUR_STATE,
  ].forEach(remove)
}

function ensureTourCacheSchema() {
  clearLegacyAuth()
  if (get(KEYS.TOUR_CACHE_SCHEMA_VERSION, null) === TOUR_CACHE_SCHEMA_VERSION) {
    return false
  }
  clearTour()
  clearTourPrefs()
  set(KEYS.TOUR_CACHE_SCHEMA_VERSION, TOUR_CACHE_SCHEMA_VERSION)
  return true
}

module.exports = {
  KEYS,
  TOUR_SESSION_SCHEMA_VERSION,
  TOUR_CACHE_SCHEMA_VERSION,
  LEGACY_AUTH_KEYS,
  get,
  set,
  remove,
  getTourSession,
  setTourSession,
  touchTourSession,
  updateTourSessionActivity,
  clearTour,
  clearTourPrefs,
  clearLegacyAuth,
  ensureTourCacheSchema,
}
