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
const banpoHalls = require('../constants/banpo-halls')

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
   * @param {string}   [opts.clientContext] Compact frontend context that should not affect retrieval
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
    // client_context: str | None  (answer guidance; backend keeps retrieval query as message)
    // tts: bool  (MUST be bool, not null — backend default False)
    var body = { message: opts.message || '' }
    if (opts.exhibitId) body.exhibit_id = opts.exhibitId
    if (opts.style)     body.style      = opts.style
    if (opts.clientContext) body.client_context = opts.clientContext
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
// GET /exhibits          ?category=&hall=&search=&limit=&skip=
// GET /exhibits/:id
// GET /exhibits/stats
// GET /exhibits/categories/list
// GET /exhibits/halls/list

// ── Hall slug ↔ Chinese name mapping ──────────────────────────────────────
// Backend slugs come from import_real_exhibits_via_api.py / HALL_SPECS.
// Frontend hall.js uses its own HALLS_MAP display names for currentHall.
// HALL_SLUG_NAMES maps backend slug → frontend display name (matching hall.js).

var HALL_SLUG_NAMES = {
  'basic-exhibition-hall': '基本陈列展厅',
  'site-protection-hall':  '遗址保护大厅',
  'temporary-hall-1':      '临展厅一',
  'temporary-hall-2':      '临展厅二',
  'banpo-girl-sculpture':  '半坡姑娘雕塑',
  'prehistoric-workshop':  '史前工坊',
  'education-center':      '教研中心',
  'peony-garden':          '牡丹园',
  'kiln-hall':             '陶窑展厅',
  'pottery-spirit-hall':     '基本陈列展厅',    // legacy imported pottery/craft exhibits
  'civilization-spark-hall': '基本陈列展厅',    // legacy imported civilization/daily-life exhibits
  'site-archaeology-hall':   '遗址保护大厅',    // legacy imported site/archaeology exhibits
}

// Build reverse map: Chinese name → slug
var HALL_NAME_SLUGS = {}
Object.keys(HALL_SLUG_NAMES).forEach(function (slug) {
  HALL_NAME_SLUGS[HALL_SLUG_NAMES[slug]] = slug
})
// New visitor-facing points from 展厅信息.docx. Several spaces do not have
// exhibit-level DB data yet, so they either reuse the closest legacy slug or
// intentionally return null and load all/none depending on the page.
HALL_NAME_SLUGS['基本陈列展厅'] = HALL_NAME_SLUGS['基本陈列展厅'] || 'basic-exhibition-hall'
HALL_NAME_SLUGS['遗址保护大厅'] = HALL_NAME_SLUGS['遗址保护大厅'] || 'site-protection-hall'
HALL_NAME_SLUGS['陶窑展厅'] = HALL_NAME_SLUGS['陶窑展厅'] || 'kiln-hall'
HALL_NAME_SLUGS['出土文物陈列区'] = 'pottery-spirit-hall'
HALL_NAME_SLUGS['半坡聚落复原区'] = 'site-archaeology-hall'
HALL_NAME_SLUGS['专题文化展区'] = 'civilization-spark-hall'

HALL_SLUG_NAMES = Object.assign({}, banpoHalls.HALL_SLUG_NAMES)
HALL_NAME_SLUGS = Object.assign({}, banpoHalls.HALL_NAME_SLUGS)

/** Convert a backend hall slug to a user-visible Chinese name. */
function hallSlugToName(slug) {
  return banpoHalls.getHallDisplayName(slug)
}

/** Convert a frontend Chinese hall name to a backend slug.  Returns null if unknown. */
function hallNameToSlug(name) {
  return banpoHalls.normalizeHallToSlug(name)
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
  var slug = raw.hall || raw.hall_name || ''
  return {
    id:                raw.id                   || '',
    name:              raw.name                 || raw.title || '未知展品',
    hall:              slug,
    hallDisplay:       hallSlugToName(slug),     // user-visible Chinese name
    category:          raw.category             || '',
    era:               raw.era                  || raw.dynasty || raw.period || '',
    importance:        raw.importance           || 0,
    description:       raw.description          || raw.summary || raw.desc || '',
    floor:             raw.floor                || null,
    estimatedVisitTime: raw.estimated_visit_time || null,
  }
}

const exhibitsApi = {
  list: function(params) {
    return req.get('/exhibits', { data: _clean(params || {}), retries: 1 })
  },

  get: function(id) {
    return req.get('/exhibits/' + encodeURIComponent(id), { retries: 1 })
  },

  search: function(keyword) {
    return req.get('/exhibits', { data: _clean({ search: keyword, limit: 20 }), retries: 1 })
  },

  listByHall: function(hall) {
    return req.get('/exhibits', { data: _clean({ hall: hall, limit: 50 }), retries: 1 })
  },

  listHalls: function() {
    return req.get('/exhibits/halls/list', { retries: 1 })
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
function _pushInterest(list, key, value) {
  if (value === null || value === undefined || value === '') return
  list.push(key + ':' + String(value))
}

function _normalizeHallList(values) {
  if (!Array.isArray(values)) return []
  var result = []
  values.forEach(function (item) {
    var slug = hallNameToSlug(item)
    if (slug && result.indexOf(slug) === -1) result.push(slug)
  })
  return result
}

function _buildPlanTourPayload(availableTime, interests) {
  if (!availableTime || typeof availableTime !== 'object') {
    return { available_time: availableTime, interests: interests || [] }
  }

  var input = availableTime
  var nextInterests = Array.isArray(input.interests) ? input.interests.slice() : []
  var currentHallSlug = input.currentHall ? hallNameToSlug(input.currentHall) : null
  var preferredHallSlugs = _normalizeHallList(input.preferredHallOrder)
  var persona = input.persona || input.backendPersona || ''

  _pushInterest(nextInterests, 'persona', persona)
  _pushInterest(nextInterests, 'personaId', input.personaId)
  _pushInterest(nextInterests, '身份', input.personaLabel)
  _pushInterest(nextInterests, '时间预算', input.timeBudget)
  _pushInterest(nextInterests, '关注点', input.focusTitle)
  _pushInterest(nextInterests, '关注提示', input.focusPrompt)
  _pushInterest(nextInterests, '初始假设', input.assumptionText)
  _pushInterest(nextInterests, '导览节奏', input.guideModeTitle)
  _pushInterest(nextInterests, '导览提示', input.guideModePrompt)
  _pushInterest(nextInterests, '自写问题', input.intentText)
  _pushInterest(nextInterests, '当前展厅', currentHallSlug)
  if (preferredHallSlugs.length) {
    _pushInterest(nextInterests, '优先展厅', preferredHallSlugs.join(','))
  }

  return {
    available_time: input.available_time || input.availableTime || 60,
    interests: nextInterests,
  }
}

const curatorApi = {
  planTour: function(availableTime, interests) {
    return req.post('/curator/plan-tour', _buildPlanTourPayload(availableTime, interests), {
      timeout: 5000,
      retries: 0,
    })
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

  normalizeExhibit,
  hallSlugToName,
  hallNameToSlug,
  HALL_SLUG_NAMES,
  HALL_NAME_SLUGS,
  EXHIBIT_ALIASES,
  resolveAliases,

  healthApi,
  authApi,
  chatApi,
  tourApi,
  exhibitsApi,
  ttsApi,
  curatorApi,
}
