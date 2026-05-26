/**
 * MuseAI Mini Program — API layer entry point
 *
 * Phase 2: scaffolding only.
 * Concrete implementations will be filled in Phase 3 (store layer).
 *
 * BASE_URL: http://122.152.232.190:3000/api/v1
 */

const request = require('../utils/request')
const storage = require('../utils/storage')

// ---------------------------------------------------------------------------
// Auth  POST /auth/register  POST /auth/login  POST /auth/logout
// ---------------------------------------------------------------------------
const authApi = {
  // register(email, password)
  // login(email, password)
  // logout()
}

// ---------------------------------------------------------------------------
// Chat (authenticated)
//   POST /chat/sessions          createSession
//   GET  /chat/sessions          listSessions
//   GET  /chat/sessions/:id/messages
//   POST /chat/ask/stream        askStream  (SSE — Phase 4)
// Chat (guest)
//   POST /chat/guest/message     guestMessage  (SSE — Phase 4)
// ---------------------------------------------------------------------------
const chatApi = {
  // createSession(title)
  // listSessions()
  // getMessages(sessionId)
  // askStream(sessionId, message, ttsOptions)      → streaming, Phase 4
  // guestMessage(sessionId, message, ttsOptions)   → streaming, Phase 4
}

// ---------------------------------------------------------------------------
// Tour
//   POST  /tour/sessions                     createSession
//   GET   /tour/sessions/:id                 getSession
//   PATCH /tour/sessions/:id                 updateSession
//   POST  /tour/sessions/:id/events          recordEvents
//   POST  /tour/sessions/:id/complete-hall   completeHall
//   POST  /tour/sessions/:id/report          generateReport
//   GET   /tour/sessions/:id/report          getReport
//   POST  /tour/sessions/:id/chat/stream     chatStream  (SSE — Phase 4)
//   GET   /tour/halls                        getHalls
// ---------------------------------------------------------------------------
const tourApi = {
  // createSession(data)
  // getSession(id, token)
  // updateSession(id, data, token)
  // recordEvents(id, events, token)
  // completeHall(id, token)
  // generateReport(id, token)
  // getReport(id, token)
  // chatStream(id, message, token, exhibitId, style, ttsOptions)  → streaming, Phase 4
  // getHalls()
}

// ---------------------------------------------------------------------------
// Exhibits (public)
//   GET /exhibits          list(params)
//   GET /exhibits/:id      get(id)
// ---------------------------------------------------------------------------
const exhibitsApi = {
  // list(params)
  // get(id)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  request,   // raw request util — import directly when needed
  storage,   // storage util — import directly when needed
  authApi,
  chatApi,
  tourApi,
  exhibitsApi,
}
