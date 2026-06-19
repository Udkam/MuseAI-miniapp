/**
 * store/chat.js — Ephemeral chat state (not persisted to wx.storage)
 *
 * Maintains a module-level state object.  Pages import this store, call
 * mutators, then write the returned snapshot into their own data via
 * setData() to trigger UI updates.
 *
 * Streaming (SSE) integration is wired in Phase 6; this module only manages
 * state transitions and message accumulation.
 */

const { RAG_STEP_CONFIG } = require('../constants/index')
const RECENT_MESSAGE_MAX_CONTENT_CHARS = 800

// ─── Status machine ────────────────────────────────────────────────────────
const STATUS = {
  IDLE:      'IDLE',       // No active operation
  THINKING:  'THINKING',  // Request sent, waiting for first token
  STREAMING: 'STREAMING', // Receiving stream chunks
  DONE:      'DONE',       // Stream completed
  ERROR:     'ERROR',      // Stream or request error
}

// ─── Initial state factory ─────────────────────────────────────────────────
function _makeInitialState() {
  return {
    sessions:          [],
    currentSessionId:  null,
    messages:          [],
    status:            STATUS.IDLE,
    streamingBuffer:   '',   // Accumulates assistant content mid-stream
    ragSteps:          [],
    sources:           [],
    traceId:           null,
    error:             null,
    guestSessionId:    null, // In-memory only; lost on page close
  }
}

let _state = _makeInitialState()

// ─── Read ──────────────────────────────────────────────────────────────────

/** Snapshot of current state (shallow copy). */
function getState() {
  return Object.assign({}, _state)
}

// ─── Message flow ──────────────────────────────────────────────────────────

/**
 * Called when the user submits a message.
 * Appends the user message and resets transient state.
 */
function addUserMessage(content) {
  _state.messages = _state.messages.concat({
    id:        Date.now(),
    role:      'user',
    content,
    createdAt: new Date().toISOString(),
  })
  _state.status          = STATUS.THINKING
  _state.streamingBuffer = ''
  _state.ragSteps        = []
  _state.sources         = []
  _state.traceId         = null
  _state.error           = null
}

/**
 * Called when the first stream chunk arrives (transition THINKING → STREAMING).
 */
function startAssistantMessage() {
  _state.status = STATUS.STREAMING
}

/**
 * Append a content delta to the streaming buffer.
 * @param {string} delta
 */
function appendAssistantChunk(delta) {
  _state.streamingBuffer += delta
}

/**
 * Called when the stream emits a 'done' event.
 * Commits the buffered content as a real assistant message.
 *
 * @param {{ content?: string, sources?: Array, traceId?: string }} [payload]
 */
function finishAssistantMessage(payload) {
  const { content, sources, traceId } = payload || {}
  const finalContent = content !== undefined ? content : _state.streamingBuffer

  _state.messages = _state.messages.concat({
    id:        Date.now(),
    role:      'assistant',
    content:   finalContent,
    sources:   sources || [],
    traceId:   traceId || null,
    createdAt: new Date().toISOString(),
  })

  _state.streamingBuffer = ''
  _state.sources         = sources || []
  _state.traceId         = traceId || null
  _state.status          = STATUS.DONE
}

// ─── RAG steps ─────────────────────────────────────────────────────────────

/**
 * Upsert a RAG pipeline step by its key.
 * @param {string} step     - One of the RAG_STEP_CONFIG keys
 * @param {string} status   - 'running' | 'completed' | 'pending'
 * @param {string} [message]
 */
function setRagStep(step, status, message) {
  const config      = RAG_STEP_CONFIG[step] || { label: step, icon: '•' }
  const existingIdx = _state.ragSteps.findIndex(function(s) { return s.step === step })
  const entry = {
    step,
    label:   config.label,
    icon:    config.icon,
    status,
    message: message || null,
  }

  if (existingIdx >= 0) {
    var updated = _state.ragSteps.slice()
    updated[existingIdx] = entry
    _state.ragSteps = updated
  } else {
    _state.ragSteps = _state.ragSteps.concat(entry)
  }
}

// ─── Error handling ────────────────────────────────────────────────────────

/** @param {string} errorMsg */
function setError(errorMsg) {
  _state.error  = errorMsg
  _state.status = STATUS.ERROR
}

// ─── Session management (called by pages after API responses) ──────────────

function setSessions(sessions) {
  _state.sessions = sessions || []
}

function setCurrentSession(sessionId) {
  _state.currentSessionId = sessionId
}

function setMessages(messages) {
  _state.messages = messages || []
}

function setGuestSessionId(id) {
  _state.guestSessionId = id
}

// ─── Recent messages ────────────────────────────────────────────────────────

/**
 * Return the last N committed messages for use as conversation context.
 * Only returns messages already in _state.messages (not the in-progress stream).
 * @param {number} [maxCount=6]
 * @returns {Array<{role:string, content:string}>}
 */
function getRecentMessages(maxCount) {
  var n = Math.min(Math.max(maxCount || 6, 1), 10)
  return _state.messages.slice(-n).map(function (message) {
    var content = String((message && message.content) || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (content.length > RECENT_MESSAGE_MAX_CONTENT_CHARS) {
      content = content.slice(0, RECENT_MESSAGE_MAX_CONTENT_CHARS - 1) + '…'
    }
    return {
      role: message.role,
      content: content,
    }
  }).filter(function (message) {
    return (message.role === 'user' || message.role === 'assistant') && message.content
  })
}

// ─── Full reset ────────────────────────────────────────────────────────────

/** Wipe all chat state (e.g. on logout or page unload). */
function resetChat() {
  _state = _makeInitialState()
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  STATUS,
  getState,
  addUserMessage,
  startAssistantMessage,
  appendAssistantChunk,
  finishAssistantMessage,
  setRagStep,
  setError,
  setSessions,
  setCurrentSession,
  setMessages,
  setGuestSessionId,
  getRecentMessages,
  resetChat,
}
