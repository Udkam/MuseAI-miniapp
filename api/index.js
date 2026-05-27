/**
 * MuseAI Mini Program — API layer
 *
 * All non-streaming endpoints are fully implemented via utils/request.js.
 * Streaming endpoints (askStream, guestMessage, chatStream) are stubbed —
 * they will be wired to wx.request enableChunked in Phase 6.
 *
 * BASE_URL: http://122.152.232.190:3000/api/v1  (set in utils/request.js)
 */

const req     = require('../utils/request')
const storage = require('../utils/storage')

// ─── Helper: strip null/undefined query params ─────────────────────────────
function _clean(params) {
  var out = {}
  Object.keys(params).forEach(function(k) {
    if (params[k] !== null && params[k] !== undefined) out[k] = params[k]
  })
  return out
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

  // Non-streaming ask (fallback for when SSE is not available)
  ask: function(sessionId, message) {
    return req.post('/chat/ask', { session_id: sessionId, message: message })
  },

  // ── Streaming — Phase 6 ──────────────────────────────────────────────────
  // Implemented via wx.request enableChunked + onChunkReceived.
  // Stub returns a rejected promise so callers can detect unavailability.
  askStream: function(sessionId, message, ttsOptions) {
    console.warn('[chatApi] askStream: SSE streaming not yet implemented (Phase 6)')
    return Promise.reject(new Error('streaming_not_implemented'))
  },

  guestMessage: function(sessionId, message, ttsOptions) {
    console.warn('[chatApi] guestMessage: SSE streaming not yet implemented (Phase 6)')
    return Promise.reject(new Error('streaming_not_implemented'))
  },
}

// ─── Tour ──────────────────────────────────────────────────────────────────
// POST  /tour/sessions
// GET   /tour/sessions/:id
// PATCH /tour/sessions/:id
// POST  /tour/sessions/:id/events          { events }
// POST  /tour/sessions/:id/complete-hall
// POST  /tour/sessions/:id/report
// GET   /tour/sessions/:id/report
// POST  /tour/sessions/:id/chat/stream     (SSE — Phase 6)
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

  // ── Streaming — Phase 6 ──────────────────────────────────────────────────
  chatStream: function(id, message, token, exhibitId, style, ttsOptions) {
    console.warn('[tourApi] chatStream: SSE streaming not yet implemented (Phase 6)')
    return Promise.reject(new Error('streaming_not_implemented'))
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
      voice:   voice || '冰糖',
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
  request:     req,      // raw request util for one-off calls
  storage:     storage,  // storage util

  authApi,
  chatApi,
  tourApi,
  exhibitsApi,
  ttsApi,
  curatorApi,
}
