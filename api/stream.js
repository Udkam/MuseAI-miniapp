/**
 * api/stream.js — SSE streaming via wx.request enableChunked
 *
 * Parses Server-Sent Events from chunked ArrayBuffer responses.
 * Requires WeChat mini-program base library >= 2.20.0.
 *
 * Usage:
 *   var stream = require('./stream')
 *   var task = stream.streamRequest({
 *     path:    '/tour/sessions/xxx/chat/stream',
 *     data:    { message: '你好' },
 *     onChunk: function(text) { appendText(text) },
 *     onEvent: function(ev)   { handleRagStep(ev) },
 *     onDone:  function(pay)  { commitMessage(pay) },
 *     onError: function(err)  { showError(err.message) },
 *   })
 *   // later: task.abort()
 */

var storage = require('../utils/storage')

// Production HTTPS endpoint after ICP filing.
var BASE_URL = 'https://api.banpo-museai.xyz/api/v1'
// Local backend alternative:
// var BASE_URL = 'http://127.0.0.1:8000/api/v1'
// Temporary server HTTP fallback for emergency debugging only:
// var BASE_URL = 'http://122.152.232.190:3000/api/v1'

// ─── Header builder ────────────────────────────────────────────────────────

function _buildHeaders(extra) {
  var headers = {
    'Content-Type': 'application/json',
    'Accept':       'text/event-stream',  // tells FastAPI to use SSE path
  }

  var authToken = storage.getToken()
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken

  var tour = storage.getTourSession()
  if (tour && tour.sessionToken) {
    headers['X-Session-Token'] = tour.sessionToken
  }

  // Caller-supplied headers override auto-injected ones
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      headers[k] = extra[k]
    })
  }
  return headers
}

// ─── ArrayBuffer → UTF-8 string ───────────────────────────────────────────

function _decodeBuffer(buffer) {
  // TextDecoder available in wx base library >= 2.21.0
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(new Uint8Array(buffer))
  }

  // Manual UTF-8 fallback for older base library versions
  var bytes  = new Uint8Array(buffer)
  var result = ''
  var i      = 0

  while (i < bytes.length) {
    var b = bytes[i]

    if (b < 0x80) {
      result += String.fromCharCode(b)
      i += 1
    } else if ((b & 0xE0) === 0xC0) {
      result += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F))
      i += 2
    } else if ((b & 0xF0) === 0xE0) {
      result += String.fromCharCode(
        ((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)
      )
      i += 3
    } else {
      // 4-byte sequence → surrogate pair (emoji / CJK extension)
      var cp = ((b & 0x07) << 18) |
               ((bytes[i + 1] & 0x3F) << 12) |
               ((bytes[i + 2] & 0x3F) << 6)  |
               (bytes[i + 3] & 0x3F)
      cp -= 0x10000
      result += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF))
      i += 4
    }
  }

  return result
}

// ─── SSE parser ────────────────────────────────────────────────────────────

/**
 * Parse one SSE block (text between two successive \n\n separators).
 * Returns the parsed JSON object from the `data:` field, or null.
 */
function _parseBlock(block) {
  if (!block) return null

  var lines     = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  var dataParts = []

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    // Skip heartbeat comments (": heartbeat" or ": keep-alive")
    if (line.charAt(0) === ':') continue
    // Skip retry directives
    if (line.indexOf('retry:') === 0) continue
    // Extract data field
    if (line.indexOf('data:') === 0) {
      var dataLine = line.slice(5)
      if (dataLine.charAt(0) === ' ') dataLine = dataLine.slice(1)
      dataParts.push(dataLine)
    }
  }

  var dataStr = dataParts.length ? dataParts.join('\n') : null
  if (dataStr === null || dataStr === '[DONE]') return null

  try {
    return JSON.parse(dataStr)
  } catch (e) {
    console.warn('[stream] SSE JSON parse error:', dataStr.slice(0, 120))
    return null
  }
}

/**
 * Flush as many complete SSE events as possible from the rolling text buffer.
 * Returns { events: Array<object>, remaining: string }.
 *
 * SSE events are separated by double newline (\n\n).  The last segment may be
 * incomplete; it is returned as `remaining` for the next call.
 */
function _flushBuffer(buf) {
  buf = String(buf || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  var parts     = buf.split('\n\n')
  var remaining = parts[parts.length - 1]  // possibly incomplete
  var events    = []

  for (var i = 0; i < parts.length - 1; i++) {
    var parsed = _parseBlock(parts[i].trim())
    if (parsed) events.push(parsed)
  }

  return { events: events, remaining: remaining }
}

// ─── Event dispatcher ──────────────────────────────────────────────────────

function _makeDispatcher(options, stateRef) {
  var onChunk = options.onChunk || null
  var onEvent = options.onEvent || null
  var onDone  = options.onDone  || null
  var onError = options.onError || null

  return function dispatch(rawEvent) {
    if (!rawEvent || stateRef.aborted || stateRef.done) return

    // ── Normalize event shape ──────────────────────────────────────────────
    // Backend emits: { "event": "chunk", "data": {...} }  (key = "event")
    // We also accept: { "type": "chunk", ... }  for forward-compat.
    var eventType = rawEvent.event || rawEvent.type
    // Merge so downstream callbacks always see ev.type regardless of source.
    var ev = Object.assign({ type: eventType }, rawEvent)

    switch (eventType) {
      case 'chunk':
        // Backend: { event:"chunk", data:{ content:"..." } }
        var chunkText = (ev.data && ev.data.content) || ev.content || ''
        if (onChunk) onChunk(chunkText)
        break

      case 'done':
        stateRef.done = true
        // Backend: { event:"done", trace_id:"...", is_ceramic_question:bool }
        // (no content field — caller falls back to accumulated streamingBuffer)
        if (onDone) onDone(ev)
        break

      case 'error':
        stateRef.done = true
        // Backend: { event:"error", data:{ code:"...", message:"..." } }
        var errData = ev.data || ev
        if (onError) onError({
          type:    'error',
          message: errData.message || ev.detail || '流式错误',
          code:    errData.code    || null,
        })
        break

      case 'rag_step':
      case 'thinking':
        if (onEvent) onEvent(ev)
        break

      // TTS audio events — forward to onEvent for optional handling
      case 'audio_start':
      case 'audio_chunk':
      case 'audio_end':
      case 'audio_error':
        if (onEvent) onEvent(ev)
        break

      default:
        if (onEvent) onEvent(ev)
        break
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Open a streaming SSE connection using wx.request enableChunked.
 *
 * @param {object}   options
 * @param {string}   options.path          API path, e.g. '/tour/sessions/:id/chat/stream'
 * @param {string}   [options.method]      HTTP method (default 'POST')
 * @param {object}   [options.data]        JSON request body
 * @param {object}   [options.headers]     Extra headers merged after auth headers
 * @param {Function} [options.onChunk]     (text: string) => void — content delta
 * @param {Function} [options.onEvent]     (event: object) => void — rag_step / thinking / etc.
 * @param {Function} [options.onDone]      (payload: object) => void — stream completed
 * @param {Function} [options.onError]     (err: { message, status? }) => void — error
 *
 * @returns {{ abort: () => void }}
 */
function streamRequest(options) {
  var url     = BASE_URL + options.path
  var method  = options.method || 'POST'
  var data    = options.data   || null
  var headers = _buildHeaders(options.headers)

  var state   = { aborted: false, done: false }
  var buffer  = ''
  var dispatch = _makeDispatcher(options, state)

  var requestTask = wx.request({
    url:           url,
    method:        method,
    data:          data,
    header:        headers,
    enableChunked: true,
    timeout:       90000,

    success: function (res) {
      if (state.aborted) return

      // Flush any remaining buffered text on connection close
      if (buffer.trim()) {
        var result = _flushBuffer(buffer + '\n\n')
        buffer = result.remaining
        result.events.forEach(dispatch)
      }

      // If an HTTP error arrived as a full response body (not SSE)
      if (res.statusCode >= 400 && !state.done) {
        var d   = res.data || {}
        var msg = d.detail || d.message || ('服务器错误 ' + res.statusCode)
        if (options.onError) {
          options.onError({ type: 'error', message: msg, status: res.statusCode })
        }
      }
    },

    fail: function (err) {
      if (state.aborted || state.done) return
      var msg = (err && err.errMsg) || '网络错误'
      if (options.onError) options.onError({ type: 'error', message: msg })
    },
  })

  requestTask.onChunkReceived(function (response) {
    if (state.aborted || state.done) return

    var text = _decodeBuffer(response.data)
    buffer  += text

    var result = _flushBuffer(buffer)
    buffer     = result.remaining

    result.events.forEach(dispatch)
  })

  return {
    abort: function () {
      state.aborted = true
      try { requestTask.abort() } catch (e) {}
    },
  }
}

module.exports = { streamRequest: streamRequest }
