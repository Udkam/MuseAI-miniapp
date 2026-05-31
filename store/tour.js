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
  autoPlay: true,
  enabled:  true,
}

// ─── Persona definitions ───────────────────────────────────────────────────
// personaId: frontend ID used to look up prompt prefix + display name.
// backendPersona: 'A'|'B'|'C' sent to createSession (backend system prompt).
// promptPrefix: prepended to every user message for extra persona flavour.
var PERSONA_DEFS = {
  'default': {
    id:             'default',
    name:           'MuseAI 导览员',
    backendPersona: 'B',
    promptPrefix:   '[导览员设定：请以专业中立的博物馆导览员身份介绍，综合考古、历史和文化多角度，客观全面，不扮演特定历史角色。]',
  },
  'A': {
    id:             'A',
    name:           '考古队长',
    backendPersona: 'A',
    promptPrefix:   '',   // backend system prompt fully handles persona A
  },
  'B': {
    id:             'B',
    name:           '半坡原住民',
    backendPersona: 'B',
    promptPrefix:   '',   // backend system prompt fully handles persona B
  },
  'C': {
    id:             'C',
    name:           '历史老师',
    backendPersona: 'C',
    promptPrefix:   '',   // backend system prompt fully handles persona C
  },
  'artisan': {
    id:             'artisan',
    name:           '陶器工匠',
    backendPersona: 'B',
    promptPrefix:   '[工匠视角：你是六千年前的半坡制陶工匠，请从制作工艺、材料选择和实用功能角度讲解，用词朴实，分享匠人的技艺心得与生活体验，避免学术腔。]',
  },
}

// ─── Runtime state ─────────────────────────────────────────────────────────
function _makeEmptyTour() {
  return {
    sessionId:         null,
    sessionToken:      null,
    status:            TOUR_STATUS.ONBOARDING,
    interestType:      null,
    persona:           null,
    personaId:         null,   // 'default'|'A'|'B'|'C'|'artisan'
    assumption:        null,
    currentHall:       null,
    currentExhibitId:  null,
    currentExhibit:    null,   // full exhibit object; set by exhibit-detail before goDeeper
    visitedHalls:      [],
    visitedExhibitIds: [],
    pendingEvents:     [],
    // Onboarding extras (set by Stage 8G intent card flow)
    intentText:         null,
    preferredHallOrder: ['settlement', 'artifacts', 'culture'],
    timeBudget:         null,
  }
}

var _tour = _makeEmptyTour()

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
  _tour = _makeEmptyTour()
  _tour.interestType = o.interestType || null
  _tour.persona      = o.persona      || null
  _tour.assumption   = o.assumption   || null
  _tour.personaId    = o.personaId    || o.persona || null

  // Recover any events that were buffered before a forced page restart
  var stored = storage.get(STORAGE_KEYS.TOUR_PENDING_EVENTS, null)
  _tour.pendingEvents = Array.isArray(stored) ? stored : []

  return Object.assign({}, _tour)
}

/**
 * Store the session credentials returned by the backend after POST /tour/sessions.
 * @param {{ sessionId: string, sessionToken: string }} param
 */
function setTourSession(param) {
  _tour.sessionId    = param.sessionId    || null
  _tour.sessionToken = param.sessionToken || null
  storage.setTourSession({ sessionId: _tour.sessionId, sessionToken: _tour.sessionToken })
}

/**
 * Save intent card extras captured during the Stage 8G onboarding flow.
 * @param {{ intentText?: string, preferredHallOrder?: string[], timeBudget?: string }} opts
 */
function setOnboardingExtras(opts) {
  var o = opts || {}
  if (o.intentText         !== undefined) _tour.intentText         = o.intentText         || null
  if (o.preferredHallOrder !== undefined) _tour.preferredHallOrder = o.preferredHallOrder || ['settlement', 'artifacts', 'culture']
  if (o.timeBudget         !== undefined) _tour.timeBudget         = o.timeBudget         || null
}

/**
 * Apply a partial update to the runtime tour state.
 * Automatically re-persists session credentials if they changed.
 * @param {object} patch
 */
function updateTourState(patch) {
  Object.assign(_tour, patch)
  if (patch.sessionId !== undefined || patch.sessionToken !== undefined) {
    storage.setTourSession({ sessionId: _tour.sessionId, sessionToken: _tour.sessionToken })
  }
  if (patch.currentHall !== undefined) {
    storage.set(STORAGE_KEYS.TOUR_CURRENT_HALL, _tour.currentHall || '')
  }
}

/**
 * Return the current hall name from runtime state, falling back to storage.
 * Handles the case where the app was restarted and _tour.currentHall is null.
 * @returns {string|null}
 */
function getSavedCurrentHall() {
  if (_tour.currentHall) return _tour.currentHall
  return storage.get(STORAGE_KEYS.TOUR_CURRENT_HALL, null) || null
}

/** @returns {object} shallow copy of current tour state */
function getTourState() {
  return Object.assign({}, _tour)
}

// ─── Exhibit context ───────────────────────────────────────────────────────

/**
 * Store the exhibit currently being discussed so buildStyledPrompt can inject
 * its metadata into every message while the user is in exhibit-focus mode.
 * @param {object|null} exhibit  normalizeExhibit() output from exhibit-detail
 */
function setCurrentExhibit(exhibit) {
  if (!exhibit) { _tour.currentExhibit = null; return }
  // Store only the fields needed for context injection and display
  _tour.currentExhibit = {
    id:          exhibit.id          || exhibit.name || null,
    name:        exhibit.name        || '',
    hall:        exhibit.hall        || '',
    hallDisplay: exhibit.hallDisplay || exhibit.hall || '',
    era:         exhibit.era         || '',
    category:    exhibit.category    || '',
    description: exhibit.description || exhibit.summary || exhibit.desc || '',
    tags:        exhibit.tags        || [],
  }
}

/** Clear exhibit-focus mode (user tapped ✕ in the Context Bar). */
function clearCurrentExhibit() {
  _tour.currentExhibit = null
}

/** @returns {object|null} shallow copy of currentExhibit, or null */
function getCurrentExhibit() {
  return _tour.currentExhibit ? Object.assign({}, _tour.currentExhibit) : null
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
  var entry = {
    event_type:       event.eventType       || event.event_type       || 'unknown',
    exhibit_id:       event.exhibitId        || event.exhibit_id        || null,
    hall:             event.hall             || _tour.currentHall       || null,
    duration_seconds: event.durationSeconds  || event.duration_seconds  || null,
    metadata:         event.metadata         || {},
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
  var events          = _tour.pendingEvents.slice()
  _tour.pendingEvents = []
  _persistPendingEvents()
  return events
}

/**
 * Re-prepend events that failed to upload.
 * @param {Array} events
 */
function restorePendingEvents(events) {
  _tour.pendingEvents = events.concat(_tour.pendingEvents)
  _persistPendingEvents()
}

function _persistPendingEvents() {
  storage.set(STORAGE_KEYS.TOUR_PENDING_EVENTS, _tour.pendingEvents)
}

// ─── Teardown ──────────────────────────────────────────────────────────────

/** Reset all runtime tour state and clear wx.storage tour keys. */
function clearTour() {
  _tour = _makeEmptyTour()
  storage.clearTour()
}

// ─── API header helper ─────────────────────────────────────────────────────

/**
 * Returns an extra-headers object for tour API calls that require
 * the X-Session-Token header.
 * @returns {object}
 */
function getTourHeader() {
  if (!_tour.sessionToken) return {}
  return { 'X-Session-Token': _tour.sessionToken }
}

// ─── Guide suggestions ────────────────────────────────────────────────────

// Hall suggestion templates keyed by Chinese hall name → persona ID → array of templates.
// Each template: { type, icon, title, prompt }
// ── Suggestion template design rules ───────────────────────────────────────
// Hall-mode prompts must be answerable without a selected exhibit. Avoid
// referential wording such as "这件/它/这个展品" here; those belong in exhibit mode
// where buildStyledPrompt can inject the exact exhibit context.
// Keep prompts tied to the current hall's topic so a tap does not pull the user
// into an unrelated artifact.
var _HALL_SUGGEST_TEMPLATES = {
  // Verified-clean pool: 文物类型概览 / 石器骨器用途 / 出土文物反映的生活
  '出土文物陈列区': {
    default: [
      { type: 'hall_intro',      icon: '🏺', title: '本厅展品', prompt: '这个展厅主要展示哪些类型的文物？' },
      { type: 'observation_task',icon: '🛠', title: '石器骨器', prompt: '半坡的石器和骨器是做什么用的？' },
    ],
    A: [
      { type: 'hall_intro',      icon: '🔍', title: '文物类型', prompt: '这个展厅主要展示哪些类型的文物？' },
      { type: 'observation_task',icon: '📍', title: '工具用途', prompt: '半坡的石器和骨器是做什么用的？' },
    ],
    B: [
      { type: 'hall_intro',      icon: '🏺', title: '先民用具', prompt: '半坡的石器和骨器是做什么用的？' },
      { type: 'observation_task',icon: '🌿', title: '先民生活', prompt: '这些出土文物反映了半坡先民怎样的生活？' },
    ],
    C: [
      { type: 'hall_intro',      icon: '💡', title: '文物种类', prompt: '这个展厅主要展示哪些类型的文物？' },
      { type: 'observation_task',icon: '🔎', title: '透物见人', prompt: '这些出土文物反映了半坡先民怎样的生活？' },
    ],
    artisan: [
      { type: 'hall_intro',      icon: '🛠', title: '工具用途', prompt: '半坡的石器和骨器是做什么用的？' },
      { type: 'observation_task',icon: '🏺', title: '器物种类', prompt: '这个展厅主要展示哪些类型的文物？' },
    ],
  },
  // Verified-clean pool: ALL 8 candidates passed — this hall's RAG is richest.
  '半坡聚落复原区': {
    default: [
      { type: 'hall_intro',      icon: '🏠', title: '聚落生活', prompt: '六千年前半坡人的日常生活是怎样的？' },
      { type: 'observation_task',icon: '🏗', title: '半穴居',   prompt: '半坡先民居住的房子是什么样的？' },
    ],
    A: [
      { type: 'hall_intro',      icon: '🔍', title: '聚落布局', prompt: '半坡聚落的整体布局是怎样的？' },
      { type: 'observation_task',icon: '📐', title: '壕沟作用', prompt: '半坡聚落周围的壕沟有什么作用？' },
    ],
    B: [
      { type: 'hall_intro',      icon: '🌿', title: '先民的一天', prompt: '六千年前半坡人的日常生活是怎样的？' },
      { type: 'observation_task',icon: '🏠', title: '房屋建造', prompt: '半坡先民的房屋是怎么建造的？' },
    ],
    C: [
      { type: 'hall_intro',      icon: '💡', title: '聚落布局', prompt: '半坡聚落的整体布局是怎样的？' },
      { type: 'observation_task',icon: '🍚', title: '食物来源', prompt: '半坡先民主要靠什么获取食物？' },
    ],
    artisan: [
      { type: 'hall_intro',      icon: '🛠', title: '房屋建造', prompt: '半坡先民的房屋是怎么建造的？' },
      { type: 'observation_task',icon: '🏠', title: '居所样貌', prompt: '半坡先民居住的房子是什么样的？' },
    ],
  },
  // Hall-level culture prompts: no single-object wording unless an exhibit is selected.
  '专题文化展区': {
    default: [
      { type: 'hall_intro',      icon: '🏛', title: '考古发现', prompt: '半坡遗址的考古发现说明了什么？' },
      { type: 'observation_task',icon: '🎨', title: '艺术审美', prompt: '半坡人有自己的艺术或审美吗？' },
    ],
    A: [
      { type: 'hall_intro',      icon: '🔍', title: '考古发现', prompt: '半坡遗址的考古发现说明了什么？' },
      { type: 'observation_task',icon: '🏆', title: '遗址价值', prompt: '半坡遗址为什么这么重要？' },
    ],
    B: [
      { type: 'hall_intro',      icon: '🎨', title: '先民审美', prompt: '半坡人有自己的艺术或审美吗？' },
      { type: 'observation_task',icon: '✨', title: '遗址价值', prompt: '半坡遗址为什么这么重要？' },
    ],
    C: [
      { type: 'hall_intro',      icon: '🏆', title: '遗址价值', prompt: '半坡遗址为什么这么重要？' },
      { type: 'observation_task',icon: '🔎', title: '先民审美', prompt: '半坡人有自己的艺术或审美吗？' },
    ],
    artisan: [
      { type: 'hall_intro',      icon: '🎨', title: '艺术审美', prompt: '半坡人有自己的艺术或审美吗？' },
      { type: 'observation_task',icon: '🏛', title: '考古发现', prompt: '半坡遗址的考古发现说明了什么？' },
    ],
  },
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
  var hall     = options.currentHall    !== undefined ? options.currentHall    : (_tour.currentHall    || null)
  var exhibit  = options.currentExhibit !== undefined ? options.currentExhibit : (_tour.currentExhibit || null)
  var persona  = _tour.personaId || 'default'
  var exhibits = options.exhibits || []

  var suggestions = []
  var counter = 0
  function _id() { return 'sg_' + (++counter) }

  // ── Exhibit mode: suggestions around the selected exhibit ─────────────────
  if (exhibit) {
    // 1. "它有什么用？" — always first
    suggestions.push({
      id: _id(), type: 'observation_task', icon: '❓', title: '它有什么用？',
      actionType: 'ask', payload: { prompt: '它有什么用？' },
    })

    // 2. Category-specific observation task
    var cat = exhibit.category || ''
    var obsTitle = '观察结构细节'
    var obsPmt   = '这件器物有什么独特的结构或工艺细节值得仔细观察？'
    if (cat.indexOf('彩陶') >= 0) {
      obsTitle = '了解纹样含义'
      obsPmt   = '"' + exhibit.name + '"上的纹样图案有什么含义或象征？'
    } else if (cat.indexOf('汲水') >= 0 || cat.indexOf('汲') >= 0) {
      obsTitle = '了解使用原理'
      obsPmt   = '"' + exhibit.name + '"是如何使用的？设计有什么独特之处？'
    } else if (cat.indexOf('骨') >= 0 || cat.indexOf('石') >= 0) {
      obsTitle = '了解制作工艺'
      obsPmt   = '"' + exhibit.name + '"是怎么制作的？需要哪些技艺？'
    }
    suggestions.push({
      id: _id(), type: 'observation_task', icon: '🔎', title: obsTitle,
      actionType: 'ask', payload: { prompt: obsPmt },
    })

    // 3. Related exhibit: highest importance in same hall, not current
    var related = null
    for (var ri = 0; ri < exhibits.length; ri++) {
      var re = exhibits[ri]
      if (re.name === exhibit.name || re.id === exhibit.id) continue
      if (!related || (re.importance || 0) > (related.importance || 0)) related = re
    }
    if (related) {
      suggestions.push({
        id: _id(), type: 'related_exhibit', icon: '🏺',
        title: '看看：' + related.name,
        actionType: 'open_exhibit',
        payload: { exhibitId: related.id, exhibitName: related.name },
      })
    }

    // 4. Back to exhibit list
    suggestions.push({
      id: _id(), type: 'next_step', icon: '←', title: '返回展品列表',
      actionType: 'navigate_back', payload: {},
    })

    return suggestions
  }

  // ── Hall mode: suggestions based on hall + persona ─────────────────────────
  if (!hall) return []
  var hallTpls = _HALL_SUGGEST_TEMPLATES[hall]
  if (!hallTpls) return []

  var personaTpls = hallTpls[persona] || hallTpls['default'] || []
  for (var i = 0; i < personaTpls.length; i++) {
    var tpl = personaTpls[i]
    suggestions.push({
      id: _id(), type: tpl.type, icon: tpl.icon, title: tpl.title,
      actionType: 'ask', payload: { prompt: tpl.prompt },
    })
  }

  // Append up to 2 high-importance exhibit cards from the API list
  var hiEx = []
  for (var j = 0; j < exhibits.length; j++) {
    if ((exhibits[j].importance || 0) >= 8) hiEx.push(exhibits[j])
  }
  hiEx.sort(function (a, b) { return (b.importance || 0) - (a.importance || 0) })
  var topEx = hiEx.slice(0, 2)
  for (var k = 0; k < topEx.length; k++) {
    suggestions.push({
      id: _id(), type: 'related_exhibit', icon: '🏺',
      title: topEx[k].name,
      actionType: 'open_exhibit',
      payload: { exhibitId: topEx[k].id, exhibitName: topEx[k].name },
    })
  }

  return suggestions
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

// ─── Prompt builder (ported from useTourWorkbench.buildStyledPrompt) ───────

/**
 * Wraps a raw user input with context, tone and style constraints.
 *
 * @param {string} rawInput
 * @param {object|null} [opts]
 *   Legacy form:  pass a style-prefs object directly (has .answerLength / .enabled keys)
 *   New form:     { styleOverride?: object, recentMessages?: Array }
 * @returns {string}
 */
function buildStyledPrompt(rawInput, opts) {
  // Backward compat: if opts looks like a style-prefs object, treat it as styleOverride
  var styleOverride, recentMessages
  if (!opts) {
    styleOverride = null; recentMessages = null
  } else if (opts.answerLength !== undefined || opts.enabled !== undefined) {
    styleOverride = opts; recentMessages = null
  } else {
    styleOverride  = opts.styleOverride  || null
    recentMessages = opts.recentMessages || null
  }

  var style  = styleOverride || getStylePrefs()
  var def    = PERSONA_DEFS[_tour.personaId] || PERSONA_DEFS['default']
  var parts  = []
  var ex     = _tour.currentExhibit || null
  var hasEx  = !!ex

  // ── 1. Persona prefix ──────────────────────────────────────────────────
  if (def.promptPrefix) parts.push(def.promptPrefix)

  // ── 2. Hall context (when browsing a hall without a specific exhibit) ──────
  // Inject current hall so backend RAG doesn't guess or hallucinate a different hall.
  if (!hasEx && _tour.currentHall) {
    parts.push([
      '[当前展厅上下文]',
      '用户当前正在参观的展厅是：' + _tour.currentHall,
      '请围绕该展厅相关内容作答，不要把它称为其他展厅名称。',
      '---',
    ].join('\n'))
  }

  // ── 3. Exhibit context — disambiguation only, no forced answer structure ─
  if (hasEx) {
    var exName = ex.name || ''
    var ctx    = ['[当前展品上下文｜仅用于指代消歧]']
    ctx.push('当前用户正在查看的展品是：' + exName)
    if (exName) {
      ctx.push('当用户说"它""这个""这件展品""这里的东西"等指代词时，优先理解为：' + exName + '。')
      ctx.push('除非用户明确提到其他展品，不要把这些指代词解释成其他展品。')
      ctx.push('检索材料若出现其他展品，只能作为比较，不能替代当前展品。')
    }
    if (ex.hallDisplay || ex.hall)  ctx.push('展厅：' + (ex.hallDisplay || ex.hall))
    if (ex.era)                     ctx.push('时代：' + ex.era)
    if (ex.category)                ctx.push('类别：' + ex.category)
    // Smart truncation: up to 220 chars, prefer sentence boundary
    var rawDesc = String(ex.description || '')
    if (rawDesc) {
      var maxLen  = 220
      var desc    = rawDesc
      if (rawDesc.length > maxLen) {
        var snippet   = rawDesc.slice(0, maxLen)
        var lastBreak = Math.max(
          snippet.lastIndexOf('。'),
          snippet.lastIndexOf('？'),
          snippet.lastIndexOf('！'),
          snippet.lastIndexOf('；')
        )
        desc = lastBreak > 80 ? snippet.slice(0, lastBreak + 1) : snippet
      }
      ctx.push('简介：' + desc)
    }
    ctx.push('---')
    parts.push(ctx.join('\n'))
  }

  // ── 3. Recent conversation context (only for referential/context questions) ─
  // recentMessages === null  → not a context question, skip entirely
  // recentMessages === []    → context question but no history yet, inject "no history" hint
  // recentMessages.length>0 → inject conversation history
  if (recentMessages !== null) {
    if (recentMessages.length > 0) {
      var histLines = ['[近期对话上下文｜仅供参考]']
      var usedChars = 0
      var MAX_HIST  = 600
      var msgs      = recentMessages.slice(-6)
      for (var mi = 0; mi < msgs.length; mi++) {
        var m         = msgs[mi]
        var roleLabel = m.role === 'user' ? '用户' : 'AI'
        var mc        = String(m.content || '').slice(0, 150)
        var histLine  = roleLabel + '：' + mc
        if (usedChars + histLine.length > MAX_HIST) break
        histLines.push(histLine)
        usedChars += histLine.length
      }
      histLines.push('---')
      // RAG 绕过提示：告诉 LLM 优先用历史，不要引入 RAG 检索的无关展品
      histLines.push('用户正在询问对话历史内容，请优先基于以上对话内容作答，不要引入知识库中未出现的新展品或话题。')
      histLines.push('请根据以上近期对话理解用户当前问题，不要凭空引入无关展品或话题。')
      parts.push(histLines.join('\n'))
    } else {
      // Context question with no conversation history yet
      parts.push([
        '[对话历史状态]',
        '当前尚无近期对话记录。',
        '如果用户询问"我们在讨论什么""整理上下文""刚才说了什么"等，请如实告知用户我们还没有开始具体讨论，并邀请用户提问。',
        '---',
      ].join('\n'))
    }
  }

  // ── 4. Exhibit focus hint — respond to the specific question asked, no fixed structure ─
  if (hasEx) {
    parts.push([
      '[展品问答提示]',
      '用户正在围绕展品"' + (ex.name || '') + '"提问，请聚焦该展品直接回答用户的具体问题。',
      '不要先泛泛介绍展厅，也不要把回答扩展到无关展品。',
      '根据用户实际问题作答：问定义就解释定义，问价值就解释价值，问细节就给观察点，不要强行回答用户没问的内容。',
      '---',
    ].join('\n'))
  }

  // ── 5. Dialogue tone constraint — always present ───────────────────────
  var PERSONA_TONE_MAP = {
    'default':  '中立、亲切、专业，不要过度拟人化。',
    'A':        '引用证据和推断，语气对话化，不要像论文报告。',
    'B':        '可以沉浸式叙述，但不要编造超出史料的细节。',
    'C':        '可以提问引导，但不要每段都反问用户。',
    'artisan':  '强调工艺和材质，保持工匠视角，语言朴实自然。',
  }
  var toneHint = PERSONA_TONE_MAP[_tour.personaId] || PERSONA_TONE_MAP['default']
  parts.push([
    '[对话语气约束]',
    '你正在和一名手机小程序用户进行一对一博物馆导览对话。',
    '禁止使用"各位观众""大家请看""各位游客""同学们""朋友们"等群体讲解/广播式称呼。',
    '使用"你""我们可以看""这件展品"等自然的一对一口吻。',
    '回答像博物馆AI导览员在和用户单独交流，不是在做报告或广播讲解。',
    '当前导览风格提示：' + toneHint,
    '---',
  ].join('\n'))

  // ── 6. Style constraints with explicit character-count guidance ────────
  var ANSWER_CHAR_MAP = {
    brief:    '简短（目标80～120字，最多2个要点）',
    balanced: '适中（目标150～220字，最多3个要点，适合手机屏幕一屏阅读）',
    detailed: '详细（目标280～450字，最多4个要点，可分小节但不要写成论文）',
  }
  if (style.enabled !== false) {
    var styleLines = ['[风格约束]']
    if (style.answerLength) styleLines.push('回答长度: ' + (ANSWER_CHAR_MAP[style.answerLength] || ANSWER_LENGTH_MAP[style.answerLength] || style.answerLength))
    if (style.depth)        styleLines.push('讲解深浅: ' + (DEPTH_MAP[style.depth]              || style.depth))
    if (style.terminology)  styleLines.push('术语难度: ' + (TERMINOLOGY_MAP[style.terminology]   || style.terminology))
    styleLines.push('---')
    parts.push(styleLines.join('\n'))
  }

  // ── 7. Markdown format constraints — always present ────────────────────
  parts.push([
    '[格式约束]',
    '可用轻量Markdown：一个简短标题(### 标题)、列表(-)、加粗(**文字**)。',
    '不要使用表格、多级标题堆叠、HTML标签。',
    '连续bullet不超过4个。',
    '---',
  ].join('\n'))

  // ── 8. User question — anchor to exhibit name in exhibit mode ─────────
  if (hasEx) {
    parts.push('关于展品"' + (ex.name || '') + '"，用户问：' + rawInput)
  } else {
    parts.push(rawInput)
  }

  return parts.join('\n')
}

/** Return the persona definition for the current session. */
function getPersonaDef() {
  return PERSONA_DEFS[_tour.personaId] || PERSONA_DEFS['default']
}

/**
 * Return the backend persona letter ('A'|'B'|'C') for createSession calls.
 * artisan and default both map to 'B'.
 */
function getBackendPersona() {
  return getPersonaDef().backendPersona || 'B'
}

// ─── Persona helpers (ported from useTour computed props) ──────────────────

/**
 * @returns {string} Display label for the current session's persona, e.g. '考古队长'
 */
function getPersonaLabel() {
  var map = { A: '考古队长', B: '半坡原住民', C: '历史老师' }
  return map[_tour.persona] || ''
}

/**
 * @returns {string} Report title for the current persona
 */
function getReportThemeTitle() {
  var map = { A: '你的半坡考古报告', B: '半坡一日穿越体验', C: '半坡游学荣誉证书' }
  return map[_tour.persona] || ''
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Session lifecycle
  createLocalTourState,
  setTourSession,
  updateTourState,
  getTourState,
  clearTour,
  setOnboardingExtras,

  // Exhibit context
  setCurrentExhibit,
  clearCurrentExhibit,
  getCurrentExhibit,

  // Event buffer
  addTourEvent,
  drainPendingEvents,
  restorePendingEvents,

  // API helpers
  getTourHeader,

  // Workbench preferences
  getUiPrefs,
  getStylePrefs,
  getTtsPrefs,
  setUiPrefs,
  setStylePrefs,
  setTtsPrefs,
  buildStyledPrompt,
  isContextQuestion,

  // Persona display
  getPersonaLabel,
  getReportThemeTitle,

  // Persona system
  PERSONA_DEFS,
  getPersonaDef,
  getBackendPersona,

  // Guide suggestions
  generateGuideSuggestions,

  // Hall persistence
  getSavedCurrentHall,
}
