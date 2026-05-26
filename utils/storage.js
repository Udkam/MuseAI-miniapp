const KEYS = {
  AUTH_TOKEN:            'auth_token',
  USER:                  'user',
  USER_ROLE:             'user_role',
  TOUR_SESSION_ID:       'tour_session_id',
  TOUR_SESSION_TOKEN:    'tour_session_token',
  TOUR_PENDING_EVENTS:   'tour_pending_events',
  TOUR_UI_PREFS:         'tour_workbench_ui_prefs',
  TOUR_STYLE_PREFS:      'tour_workbench_style_prefs',
  TOUR_TTS_PREFS:        'tour_workbench_tts_prefs',
}

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

function getToken() {
  return get(KEYS.AUTH_TOKEN, null)
}

function setToken(token) {
  if (token) {
    set(KEYS.AUTH_TOKEN, token)
  } else {
    remove(KEYS.AUTH_TOKEN)
  }
}

function getTourSession() {
  return {
    sessionId:    get(KEYS.TOUR_SESSION_ID, null),
    sessionToken: get(KEYS.TOUR_SESSION_TOKEN, null),
  }
}

function setTourSession({ sessionId, sessionToken }) {
  if (sessionId) {
    set(KEYS.TOUR_SESSION_ID, sessionId)
  } else {
    remove(KEYS.TOUR_SESSION_ID)
  }
  // sessionToken may be empty string — store as-is so key exists
  set(KEYS.TOUR_SESSION_TOKEN, sessionToken || '')
}

// Clears all auth AND tour state (e.g. on logout or 401)
function clearAuth() {
  [
    KEYS.AUTH_TOKEN,
    KEYS.USER,
    KEYS.USER_ROLE,
    KEYS.TOUR_SESSION_ID,
    KEYS.TOUR_SESSION_TOKEN,
    KEYS.TOUR_PENDING_EVENTS,
  ].forEach(remove)
}

// Clears only tour session state (e.g. on tour reset)
function clearTour() {
  [
    KEYS.TOUR_SESSION_ID,
    KEYS.TOUR_SESSION_TOKEN,
    KEYS.TOUR_PENDING_EVENTS,
  ].forEach(remove)
}

module.exports = {
  KEYS,
  get,
  set,
  remove,
  getToken,
  setToken,
  getTourSession,
  setTourSession,
  clearAuth,
  clearTour,
}
