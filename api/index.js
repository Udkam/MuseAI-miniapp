/**
 * MuseAI Mini Program — API layer
 *
 * BASE_URL: http://122.152.232.190:3000/api/v1  (set in utils/request.js)
 * Health endpoint hits the server root directly (not /api/v1).
 * Streaming endpoints use api/stream.js (wx.request enableChunked).
 */

const req    = require('../utils/request')
const stream = require('./stream')
const storage = require('../utils/storage')

const SERVER_ROOT = 'http://122.152.232.190:3000'

// ─── Helper: strip null/undefined query params ─────────────────────────────
function _clean(params) {
  var out = {}
  Object.keys(params).forEach(function(k) {
    if (params[k] !== null && params[k] !== undefined) out[k] = params[k]
  })
  return out
}

// ─── Health ────────────────────────────────────────────────────────────────
// GET /health  (server root, not under /api/v1)
const healthApi = {
  check: function() {
    return new Promise(function(resolve, reject) {
      wx.request({
        url:     SERVER_ROOT + '/health',
        method:  'GET',
        timeout: 5000,
        success: function(res) {
          resolve({
            ok:     res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data:   res.data || {},
          })
        },
        fail: function(err) {
          reject(new Error((err && err.errMsg) || '网络不可达'))
        },
      })
    })
  },
}

// ─── Auth  ─────────────────────────────────────────────────────────────────
// POST /auth/register   { email, password }
// POST /auth/login      { email, password }
// POST /auth/logout
const authApi = {
  register: function(email, password) {
    return req.post('/auth/register', { email: email, password: password }, { retries: 1 })
  },

  login: function(email, password) {
    return req.post('/auth/login', { email: email, password: password }, { retries: 1 })
  },

  logout: function() {
    return req.post('/auth/logout', null, { retries: 0 })
  },
}

// ─── Chat (authenticated) ──────────────────────────────────────────────────
// POST /chat/sessions          { title }
// GET  /chat/sessions
// GET  /chat/sessions/:id
// GET  /chat/sessions/:id/messages
// DELETE /chat/sessions/:id
// POST /chat/ask               { session_id, message }           (non-stream fallback)
// POST /chat/ask/stream        { session_id, message, tts? }     (SSE — Phase 6)
//
// Chat (guest)
// POST /chat/guest/message     { message, session_id? }          (SSE — Phase 6)
const chatApi = {
  createSession: function(title) {
    return req.post('/chat/sessions', { title: title || '新对话' })
  },

  listSessions: function() {
    return req.get('/chat/sessions')
  },

  getSession: function(id) {
    return req.get('/chat/sessions/' + id)
  },

  deleteSession: function(id) {
    return req.del('/chat/sessions/' + id)
  },

  getMessages: function(sessionId) {
    return req.get('/chat/sessions/' + sessionId + '/messages')
  },

  ask: function(sessionId, message) {
    return req.post('/chat/ask', { session_id: sessionId, message: message })
  },

  // ── Streaming stubs — will be wired in a later batch ─────────────────────
  askStream: function(sessionId, message, ttsOptions) {
    console.warn('[chatApi] askStream: not yet wired (use tourApi.chatStream for tour flow)')
    return Promise.reject(new Error('streaming_not_implemented'))
  },

  guestMessage: function(sessionId, message, ttsOptions) {
    console.warn('[chatApi] guestMessage: not yet wired (use tourApi.chatStream for tour flow)')
    return Promise.reject(new Error('streaming_not_implemented'))
  },
}

// ─── Tour ──────────────────────────────────────────────────────────────────
// POST  /tour/sessions                { interest_type, persona, assumption, guest_id? }
// GET   /tour/sessions/:id
// PATCH /tour/sessions/:id            { status?, current_hall?, current_exhibit_id? }
// POST  /tour/sessions/:id/events     { events }
// POST  /tour/sessions/:id/complete-hall
// POST  /tour/sessions/:id/report
// GET   /tour/sessions/:id/report
// POST  /tour/sessions/:id/chat/stream     (SSE — stream.js)
// GET   /tour/halls
const tourApi = {
  createSession: function(data) {
    return req.post('/tour/sessions', data)
  },

  getSession: function(id, token) {
    return req.get('/tour/sessions/' + id, {
      headers: token ? { 'X-Session-Token': token } : undefined,
      retries: 1,
    })
  },

  updateSession: function(id, data, token) {
    return req.patch('/tour/sessions/' + id, data, {
      headers: token ? { 'X-Session-Token': token } : undefined,
    })
  },

  recordEvents: function(id, events, token) {
    return req.post('/tour/sessions/' + id + '/events', { events: events }, {
      headers: token ? { 'X-Session-Token': token } : undefined,
      retries: 1,
    })
  },

  completeHall: function(id, token) {
    return req.post('/tour/sessions/' + id + '/complete-hall', null, {
      headers: token ? { 'X-Session-Token': token } : undefined,
    })
  },

  generateReport: function(id, token) {
    return req.post('/tour/sessions/' + id + '/report', null, {
      headers: token ? { 'X-Session-Token': token } : undefined,
    })
  },

  getReport: function(id, token) {
    return req.get('/tour/sessions/' + id + '/report', {
      headers: token ? { 'X-Session-Token': token } : undefined,
    })
  },

  getHalls: function() {
    return req.get('/tour/halls', { retries: 1 })
  },

  /**
   * Stream a tour chat response via SSE.
   *
   * @param {string} id    Tour session ID
   * @param {object} opts
   * @param {string}   opts.message      User message text
   * @param {string}   [opts.token]      X-Session-Token (falls back to storage)
   * @param {string}   [opts.exhibitId]  Current exhibit ID
   * @param {object}   [opts.style]      Style preferences object
   * @param {object}   [opts.ttsOptions] TTS options object
   * @param {Function} [opts.onChunk]    (text) => void — content delta
   * @param {Function} [opts.onEvent]    (event) => void — rag_step / thinking
   * @param {Function} [opts.onDone]     (payload) => void — stream completed
   * @param {Function} [opts.onError]    (err) => void — error
   *
   * @returns {{ abort: Function }}
   */
  chatStream: function(id, opts) {
    var token   = opts.token || null
    var headers = token ? { 'X-Session-Token': token } : {}

    // ── Build body to match backend TourChatRequest schema exactly ──────────
    // message: str  (required)
    // exhibit_id: str | None  (omit when falsy — backend default None)
    // style: TourChatStyle | None  (omit when falsy)
    // tts: bool  (MUST be bool, not null — backend default False)
    var body = { message: opts.message || '' }
    if (opts.exhibitId) body.exhibit_id = opts.exhibitId
    if (opts.style)     body.style      = opts.style
    // ttsOptions is an object {enabled, voice, autoPlay}; map to bool for backend
    body.tts = !!(opts.ttsOptions && opts.ttsOptions.enabled)

    return stream.streamRequest({
      path:    '/tour/sessions/' + id + '/chat/stream',
      method:  'POST',
      data:    body,
      headers: headers,
      onChunk: opts.onChunk || null,
      onEvent: opts.onEvent || null,
      onDone:  opts.onDone  || null,
      onError: opts.onError || null,
    })
  },
}

// ─── Exhibits (public) ─────────────────────────────────────────────────────
// GET /exhibits          ?category=&hall=
// GET /exhibits/:id
const exhibitsApi = {
  list: function(params) {
    return req.get('/exhibits', { data: _clean(params || {}), retries: 1 })
  },

  get: function(id) {
    return req.get('/exhibits/' + id, { retries: 1 })
  },
}

// ─── TTS ───────────────────────────────────────────────────────────────────
// POST /tts/synthesize   { text, voice, style?, persona? }
const ttsApi = {
  synthesize: function(text, voice, style, persona) {
    return req.post('/tts/synthesize', {
      text:    text,
      voice:   voice   || '冰糖',
      style:   style   || null,
      persona: persona || null,
    })
  },
}

// ─── Curator ───────────────────────────────────────────────────────────────
// POST /curator/plan-tour    { available_time, interests }
// POST /curator/narrative    { exhibit_id }
// POST /curator/reflection   { exhibit_id }
const curatorApi = {
  planTour: function(availableTime, interests) {
    return req.post('/curator/plan-tour', { available_time: availableTime, interests: interests })
  },

  generateNarrative: function(exhibitId) {
    return req.post('/curator/narrative', { exhibit_id: exhibitId })
  },

  getReflectionPrompts: function(exhibitId) {
    return req.post('/curator/reflection', { exhibit_id: exhibitId })
  },
}

// ─── Exports ───────────────────────────────────────────────────────────────
module.exports = {
  request:  req,
  storage:  storage,
  stream:   stream,

  healthApi,
  authApi,
  chatApi,
  tourApi,
  exhibitsApi,
  ttsApi,
  curatorApi,
}
