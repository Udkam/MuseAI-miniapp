/**
 * MuseAI Mini Program — API layer
 *
 * BASE_URL: https://api.banpo-museai.xyz/api/v1  (set in utils/request.js)
 * Local backend alternative: http://127.0.0.1:8000/api/v1
 * Temporary server HTTP fallback: http://122.152.232.190:3000/api/v1
 * Health endpoint is under /api/v1.
 * Streaming endpoints use api/stream.js (wx.request enableChunked).
 */

const req    = require('../utils/request')
const stream = require('./stream')
const storage = require('../utils/storage')
const banpoHalls = require('../constants/banpo-halls')
const exhibitIds = require('../utils/exhibit-id')

// Runtime-only catalogue cache. Imported exhibits always keep the backend
// hall slug as their machine identifier; this map is used only for display
// when an exhibit response omits the optional hall_name field.
var REMOTE_HALL_SLUG_NAMES = {}

const OCR_SERVICE_CONFIG = {
  // Fill this from app.globalData.ocrServiceConfig or replace here after
  // enabling a WeChat Service Market OCR capability for the mini-program.
  service: '',
  api: 'OcrAllInOne',
  dataType: 2, // base64 image payload
  ocrType: 0,
}

// ─── Helper: strip null/undefined query params ─────────────────────────────
function _clean(params) {
  var out = {}
  Object.keys(params).forEach(function(k) {
    if (params[k] !== null && params[k] !== undefined) out[k] = params[k]
  })
  return out
}

// ─── Health ────────────────────────────────────────────────────────────────
// GET /health  (under /api/v1 via utils/request.js)
const healthApi = {
  check: function() {
    return req.get('/health', { timeout: 5000, retries: 0 })
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

  getSession: function(id, token, options) {
    var opts = options || {}
    var requestOptions = Object.assign({}, opts, {
      headers: Object.assign({}, opts.headers || {}, token ? { 'X-Session-Token': token } : {}),
      retries: opts.retries == null ? 1 : opts.retries,
    })
    return req.get('/tour/sessions/' + id, requestOptions)
  },

  updateSession: function(id, data, token, options) {
    var opts = options || {}
    var requestOptions = Object.assign({}, opts, {
      headers: Object.assign({}, opts.headers || {}, token ? { 'X-Session-Token': token } : {}),
      retries: opts.retries == null ? 0 : opts.retries,
    })
    return req.patch('/tour/sessions/' + id, data, requestOptions)
  },

  recordEvents: function(id, events, token) {
    var options = {
      headers: token ? { 'X-Session-Token': token } : undefined,
      timeout: 4000,
      retries: 0,
    }
    var list = Array.isArray(events) ? events : []
    return req.post('/tour/sessions/' + id + '/events', { events: list }, options)
      .then(function (res) {
        // Compatibility during the coordinated backend rollout: older servers
        // reject the new tour_start event as a Literal validation error. Retry
        // the remaining batch so one optional timing event cannot block all
        // question/view events forever. tour_started_at is also PATCHed.
        if (!res || res.status !== 422) return res
        var compatible = list.filter(function (event) {
          return event && (event.event_type || event.eventType) !== 'tour_start'
        })
        if (compatible.length === list.length) return res
        if (!compatible.length) return { ok: true, status: 204, data: null, compatibilityFallback: true }
        return req.post('/tour/sessions/' + id + '/events', { events: compatible }, options)
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
      timeout: 45000,
      retries: 0,
    })
  },

  getReport: function(id, token) {
    return req.get('/tour/sessions/' + id + '/report', {
      headers: token ? { 'X-Session-Token': token } : undefined,
      timeout: 15000,
      retries: 0,
    })
  },

  getHalls: function() {
    return req.get('/tour/halls', { retries: 1 }).then(function (res) {
      if (res && res.ok) _rememberHallCatalog(res.data)
      return res
    })
  },

  /**
   * Stream a tour chat response via SSE.
   *
   * @param {string} id    Tour session ID
   * @param {object} opts
   * @param {string}   opts.message      User message text
   * @param {string}   [opts.token]      X-Session-Token (falls back to storage)
   * @param {string}   [opts.hallId]     Current canonical hall slug
   * @param {string}   [opts.exhibitId]  Current exhibit ID
   * @param {object}   [opts.style]      Style preferences object
   * @param {Array}    [opts.conversationHistory] Recent user/assistant turns for answer continuity
   * @param {string}   [opts.clientEventId] Stable ID for the user-send event; used to dedupe client/server event uploads
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
    if (opts.hallId) body.hall_id = opts.hallId
    var trustedExhibitId = exhibitIds.normalizeBackendExhibitId(opts.exhibitId)
    if (trustedExhibitId) body.exhibit_id = trustedExhibitId
    if (opts.clientEventId) body.client_event_id = opts.clientEventId
    if (opts.style)     body.style      = opts.style
    if (opts.conversationHistory && opts.conversationHistory.length) {
      body.conversation_history = opts.conversationHistory.slice(-30).map(function (m) {
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 1000),
        }
      }).filter(function (m) { return m.content })
    }
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

  getSuggestions: function(id, params, token) {
    var query = params || {}
    return req.get('/tour/sessions/' + id + '/suggestions', {
      data: _clean({
        hall_id: query.hallId || null,
        exhibit_id: exhibitIds.normalizeBackendExhibitId(query.exhibitId),
      }),
      headers: token ? { 'X-Session-Token': token } : undefined,
      retries: 1,
    })
  },
}

// ─── Exhibits (public) ─────────────────────────────────────────────────────
// GET /exhibits          ?category=&hall=&search=&limit=&skip=
// GET /exhibits/:id
// GET /exhibits/stats
// GET /exhibits/categories/list
// GET /exhibits/halls/list

// ── Hall slug ↔ Chinese name mapping ──────────────────────────────────────
// The shared hall catalogue is the only bundled compatibility mapping. Runtime
// imports may extend display names through REMOTE_HALL_SLUG_NAMES below.
var HALL_SLUG_NAMES = Object.assign({}, banpoHalls.HALL_SLUG_NAMES)
var HALL_NAME_SLUGS = Object.assign({}, banpoHalls.HALL_NAME_SLUGS)

/** Convert a backend hall slug to a user-visible Chinese name. */
function hallSlugToName(slug) {
  return banpoHalls.getHallDisplayName(slug)
}

/** Convert a frontend Chinese hall name to a backend slug.  Returns null if unknown. */
function hallNameToSlug(name) {
  var canonical = banpoHalls.normalizeHallToSlug(name)
  if (canonical) return canonical
  var raw = String(name || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(raw) ? raw : null
}

function _rememberHallCatalog(data) {
  var list = Array.isArray(data)
    ? data
    : (data && (data.halls !== undefined ? data.halls : data.items))
  if (!Array.isArray(list)) return Object.assign({}, REMOTE_HALL_SLUG_NAMES)

  var next = {}
  list.forEach(function (item) {
    if (!item || typeof item !== 'object') return
    var slug = String(item.slug || item.hall_slug || item.id || '').trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return
    var name = String(item.name || item.title || item.display_name || item.hall_name || '').trim()
    if (name) next[slug] = name
  })
  REMOTE_HALL_SLUG_NAMES = next
  return Object.assign({}, REMOTE_HALL_SLUG_NAMES)
}

// ── Exhibit alias map ──────────────────────────────────────────────────────
// Maps common user-facing aliases → canonical DB exhibit names.
// Used in client-side search to catch name variants the backend ILIKE misses.
var EXHIBIT_ALIASES = {
  '人面鱼纹盆':    ['人面网纹彩陶盆'],
  '鱼纹盆':        ['人面网纹彩陶盆'],
  '人面彩陶盆':    ['人面网纹彩陶盆'],
  '人面鱼纹彩陶':  ['人面网纹彩陶盆'],
  '鹿纹盆':        ['鹿纹彩陶盆'],
  '彩陶盆':        ['人面网纹彩陶盆', '鹿纹彩陶盆'],
  '镇馆之宝':      ['人面网纹彩陶盆'],
}

function isDisplayableExhibitName(name) {
  return !!String(name || '').trim()
}

/**
 * Given a search keyword, return an array of canonical names to also search.
 * Returns [] if no alias match.
 * @param {string} keyword
 * @returns {string[]}
 */
function resolveAliases(keyword) {
  if (!keyword) return []
  var canonical = []
  var seen = {}
  Object.keys(EXHIBIT_ALIASES).forEach(function (alias) {
    if (alias.indexOf(keyword) >= 0 || keyword.indexOf(alias) >= 0) {
      EXHIBIT_ALIASES[alias].forEach(function (name) {
        if (!seen[name]) { seen[name] = true; canonical.push(name) }
      })
    }
  })
  return canonical
}

function normalizeExhibit(raw) {
  if (!raw) return null
  var slug = String(raw.hall || raw.hall_slug || '').trim()
  var responseHallName = String(raw.hall_name || '').trim()
  var cachedHallName = REMOTE_HALL_SLUG_NAMES[slug.toLowerCase()] || ''
  var name = raw.name || raw.title || '未知展品'
  if (!isDisplayableExhibitName(name)) return null
  var imageUrl = req.resolvePublicAssetUrl(
    raw.image_url || raw.imageUrl || raw.cover_url || raw.coverUrl || ''
  )
  return {
    id:                raw.id                   || '',
    name:              name,
    hall:              slug,
    hallDisplay:       responseHallName || cachedHallName || hallSlugToName(slug),
    category:          raw.category             || '',
    era:               raw.era                  || raw.dynasty || raw.period || '',
    importance:        raw.importance           || 0,
    description:       raw.description          || raw.summary || raw.desc || '',
    floor:             raw.floor                || null,
    estimatedVisitTime: raw.estimated_visit_time || null,
    imageUrl:           imageUrl,
    suggestedQuestions: (Array.isArray(raw.suggested_questions)
      ? raw.suggested_questions
      : (Array.isArray(raw.suggestions) ? raw.suggestions : (Array.isArray(raw.guide_suggestions) ? raw.guide_suggestions : [])))
      .map(function (item) { return String(item || '').trim() })
      .filter(Boolean)
      .slice(0, 8),
  }
}

const exhibitsApi = {
  list: function(params, options) {
    var opt = options || {}
    return req.get('/exhibits', {
      data: _clean(params || {}),
      timeout: opt.timeout || 3000,
      retries: opt.retries == null ? 0 : opt.retries,
    })
  },

  get: function(id) {
    return req.get('/exhibits/' + encodeURIComponent(id), { retries: 1 })
  },

  search: function(keyword) {
    return req.get('/exhibits', {
      data: _clean({ search: keyword, limit: 20 }),
      timeout: 3000,
      retries: 0,
    })
  },

  listByHall: function(hall, params, options) {
    var opt = options || {}
    return req.get('/exhibits', {
      data: _clean(Object.assign({}, params || {}, { hall: hall })),
      timeout: opt.timeout || 3000,
      retries: opt.retries == null ? 0 : opt.retries,
    })
  },

  listHalls: function() {
    return req.get('/exhibits/halls/list', { timeout: 3000, retries: 0 })
  },
}

// ─── TTS ───────────────────────────────────────────────────────────────────
// POST /tts/synthesize   { text, voice, style?, persona? }
const ttsApi = {
  synthesize: function(text, voice, style, persona) {
    return req.post('/tts/synthesize', {
      text:    text,
      voice:   '冰糖',
      style:   style   || null,
      persona: persona || null,
    }, {
      timeout: 18000,
      retries: 0,
    })
  },
}

// ─── OCR / Image Text Recognition ─────────────────────────────────────────
// Uses WeChat Service Market OCR when configured. This does not call the
// MuseAI backend and therefore keeps Stage 12B within the existing /exhibits
// backend contract.
function _getOcrServiceConfig() {
  var app = null
  try {
    if (typeof getApp === 'function') app = getApp()
  } catch (_) {}
  return Object.assign({}, OCR_SERVICE_CONFIG, (app && app.globalData && app.globalData.ocrServiceConfig) || {})
}

const ocrApi = {
  getConfig: function() {
    return _getOcrServiceConfig()
  },

  isConfigured: function() {
    var cfg = _getOcrServiceConfig()
    return !!(cfg.service && typeof wx !== 'undefined' && wx.serviceMarket && wx.serviceMarket.invokeService)
  },

  recognizeImage: function(filePath, imageBase64) {
    return new Promise(function(resolve) {
      var cfg = _getOcrServiceConfig()
      if (!cfg.service) {
        resolve({ ok: false, code: 'OCR_NOT_CONFIGURED', data: { text: '' } })
        return
      }
      if (!(typeof wx !== 'undefined' && wx.serviceMarket && wx.serviceMarket.invokeService)) {
        resolve({ ok: false, code: 'OCR_UNAVAILABLE', data: { text: '' } })
        return
      }

      var payload = {
        data_type: cfg.dataType || 2,
        ocr_type: cfg.ocrType || 0,
      }
      if (imageBase64) payload.img_data = imageBase64
      else if (filePath) payload.img_url = filePath

      wx.serviceMarket.invokeService({
        service: cfg.service,
        api: cfg.api || 'OcrAllInOne',
        data: payload,
        client_msg_id: 'museai_ocr_' + Date.now(),
        success: function(res) {
          resolve({ ok: true, data: res && (res.data || res) })
        },
        fail: function(err) {
          resolve({ ok: false, code: 'OCR_FAILED', error: err, data: { text: '' } })
        },
      })
    })
  },
}

// ─── Curator ───────────────────────────────────────────────────────────────
// POST /curator/narrative    { exhibit_id }
// POST /curator/reflection   { exhibit_id }
const curatorApi = {
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

  normalizeExhibit,
  _rememberHallCatalog,
  hallSlugToName,
  hallNameToSlug,
  HALL_SLUG_NAMES,
  HALL_NAME_SLUGS,
  EXHIBIT_ALIASES,
  isDisplayableExhibitName,
  resolveAliases,

  healthApi,
  tourApi,
  exhibitsApi,
  ttsApi,
  ocrApi,
  curatorApi,
}
