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
const banpoHalls = require('../constants/banpo-halls')

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
  voice:    null,
  autoPlay: false,
  enabled:  true,
}

// ─── Persona definitions ───────────────────────────────────────────────────
// personaId: frontend ID used to look up prompt prefix + display name.
// backendPersona: 'A'|'B'|'C'|'D' sent to createSession (backend system prompt).
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
    name:           '考古研究员',
    backendPersona: 'A',
    promptPrefix:   '',   // backend system prompt fully handles persona A
  },
  'student': {
    id:             'student',
    name:           '研学记录员',
    backendPersona: 'B',
    promptPrefix:   '[研学记录员视角：回答要方便边看边记，把观察任务、证据要点和解释自然融入内容；不要每次都套固定栏目。]',
  },
  'resident': {
    id:             'resident',
    name:           '研学记录员',
    backendPersona: 'B',
    promptPrefix:   '[研学记录员视角：回答要方便边看边记，把观察任务、证据要点和解释自然融入内容；不要每次都套固定栏目。]',
  },
  'B': {
    id:             'B',
    name:           '研学记录员',
    backendPersona: 'B',
    promptPrefix:   '',   // backend system prompt fully handles persona B
  },
  'C': {
    id:             'C',
    name:           '历史追问者',
    backendPersona: 'C',
    promptPrefix:   '',   // backend system prompt fully handles persona C
  },
  'D': {
    id:             'D',
    name:           '器物研究员',
    backendPersona: 'D',
    promptPrefix:   '',   // backend system prompt fully handles persona D
  },
  'historian': {
    id:             'historian',
    name:           '历史追问者',
    backendPersona: 'C',
    promptPrefix:   '[历史追问者视角：请把半坡遗址放进史前中国、文明起源和今天的公共生活中追问，重视问题意识，不要写成课堂讲稿。]',
  },
  'artifact': {
    id:             'artifact',
    name:           '器物研究员',
    backendPersona: 'D',
    promptPrefix:   '[器物研究员视角：请优先从材料、器形、纹饰、制作工艺和使用痕迹解释问题，明确区分可观察事实与推测。]',
  },
  'artisan': {
    id:             'artisan',
    name:           '器物研究员',
    backendPersona: 'D',
    promptPrefix:   '[器物研究员视角：请优先从材料、器形、纹饰、制作工艺和使用痕迹解释问题，明确区分可观察事实与推测。]',
  },
  'community': {
    id:             'community',
    name:           '历史追问者',
    backendPersona: 'C',
    promptPrefix:   '[历史追问者视角：请把半坡遗址放进史前中国、文明起源和今天的公共生活中追问，重视问题意识，不要写成课堂讲稿。]',
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
    personaId:         null,   // 'default'|'A'|'B'|'C'|'D'|'student'|'historian'|'artifact'
    assumption:        null,
    currentHall:       null,
    currentExhibitId:  null,
    currentExhibit:    null,   // full exhibit object; set by exhibit-detail before goDeeper
    currentScannedExhibitId: null,
    currentScannedExhibitName: null,
    lastScanTimestamp: null,
    aiConversationCount: 0,
    visitedHalls:      [],
    visitedExhibitIds: [],
    pendingEvents:     [],
    // Onboarding extras (set by Stage 8G intent card flow)
    intentText:         null,
    preferredHallOrder: ['basic', 'site', 'kiln', 'workshop', 'banpoGirl', 'education', 'peony', 'temp1', 'temp2'],
    timeBudget:         null,
    focusId:            null,
    focusTitle:         null,
    focusPrompt:        null,
    assumptionText:     null,
    guideModeId:        null,
    guideModeTitle:     null,
    guideModePrompt:    null,
  }
}

var _tour = _makeEmptyTour()
var TOUR_SESSION_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000
var TOUR_SESSION_RESUME_MIN_AI_TURNS = 5

function _isStoredTourSessionResumable(stored) {
  if (!stored || !stored.sessionId) return false
  if (!stored.createdAt) return false
  if (stored.schemaVersion !== storage.TOUR_SESSION_SCHEMA_VERSION) return false
  return Date.now() - stored.createdAt <= TOUR_SESSION_RESUME_MAX_AGE_MS
}

function _clearStaleTourResume() {
  _tour.sessionId = null
  _tour.sessionToken = null
  _tour.currentHall = null
  _tour.pendingEvents = []
  storage.clearTour()
}

function _ensureTourCacheSchema() {
  if (storage.ensureTourCacheSchema && storage.ensureTourCacheSchema()) {
    _tour = _makeEmptyTour()
  }
}

function _hydrateStoredTour() {
  _ensureTourCacheSchema()
  var stored = storage.getTourSession ? storage.getTourSession() : null
  if (stored && stored.sessionId) {
    if (!_isStoredTourSessionResumable(stored)) {
      _clearStaleTourResume()
      return
    }
    if (!_tour.sessionId && stored.sessionId) {
      _tour.sessionId = stored.sessionId
    }
    if (!_tour.sessionToken && stored.sessionToken) {
      _tour.sessionToken = stored.sessionToken
    }
    _tour.aiConversationCount = Number(stored.aiConversationCount || 0)
  }

  if (!_tour.currentHall) {
    var hall = storage.get(STORAGE_KEYS.TOUR_CURRENT_HALL, null)
    if (hall) _tour.currentHall = banpoHalls.normalizeHallToSlug(hall)
  }
}

function _normalizeHallForStorage(hall) {
  return banpoHalls.normalizeHallToSlug(hall)
}

function _getCurrentHallDisplayName() {
  return _tour.currentHall ? banpoHalls.getHallDisplayName(_tour.currentHall) : ''
}

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
  _ensureTourCacheSchema()
  _tour = _makeEmptyTour()
  storage.setTourSession({ sessionId: null, sessionToken: null })
  storage.remove(STORAGE_KEYS.TOUR_CURRENT_HALL)
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
  var stored = storage.getTourSession ? storage.getTourSession() : null
  _tour.aiConversationCount = stored ? Number(stored.aiConversationCount || 0) : 0
}

function incrementAiConversationCount() {
  if (!_tour.sessionId) return 0
  _tour.aiConversationCount = Number(_tour.aiConversationCount || 0) + 1
  storage.set(STORAGE_KEYS.TOUR_AI_CONVERSATION_COUNT, _tour.aiConversationCount)
  return _tour.aiConversationCount
}

function hasResumableTourSession(minTurns) {
  var required = minTurns == null ? TOUR_SESSION_RESUME_MIN_AI_TURNS : minTurns
  _hydrateStoredTour()
  var stored = storage.getTourSession ? storage.getTourSession() : null
  if (!_isStoredTourSessionResumable(stored)) return false
  return Number(stored.aiConversationCount || 0) >= required
}

/**
 * Save profile extras captured during onboarding.
 * @param {{
 *   intentText?: string,
 *   preferredHallOrder?: string[],
 *   timeBudget?: string,
 *   focusId?: string,
 *   focusTitle?: string,
 *   focusPrompt?: string,
 *   assumptionText?: string,
 *   guideModeId?: string,
 *   guideModeTitle?: string,
 *   guideModePrompt?: string
 * }} opts
 */
function setOnboardingExtras(opts) {
  var o = opts || {}
  if (o.intentText         !== undefined) _tour.intentText         = o.intentText         || null
  if (o.preferredHallOrder !== undefined) _tour.preferredHallOrder = o.preferredHallOrder || ['basic', 'site', 'kiln', 'workshop', 'banpoGirl', 'education', 'peony', 'temp1', 'temp2']
  if (o.timeBudget         !== undefined) _tour.timeBudget         = o.timeBudget         || null
  if (o.focusId            !== undefined) _tour.focusId            = o.focusId            || null
  if (o.focusTitle         !== undefined) _tour.focusTitle         = o.focusTitle         || null
  if (o.focusPrompt        !== undefined) _tour.focusPrompt        = o.focusPrompt        || null
  if (o.assumptionText     !== undefined) _tour.assumptionText     = o.assumptionText     || null
  if (o.guideModeId        !== undefined) _tour.guideModeId        = o.guideModeId        || null
  if (o.guideModeTitle     !== undefined) _tour.guideModeTitle     = o.guideModeTitle     || null
  if (o.guideModePrompt    !== undefined) _tour.guideModePrompt    = o.guideModePrompt    || null
}

/**
 * Apply a partial update to the runtime tour state.
 * Automatically re-persists session credentials if they changed.
 * @param {object} patch
 */
function updateTourState(patch) {
  if (patch && patch.currentHall !== undefined) {
    patch = Object.assign({}, patch, { currentHall: _normalizeHallForStorage(patch.currentHall) })
  }
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
  _hydrateStoredTour()
  if (_tour.currentHall) return _tour.currentHall
  var storedHall = storage.get(STORAGE_KEYS.TOUR_CURRENT_HALL, null)
  return storedHall ? _normalizeHallForStorage(storedHall) : null
}

/** @returns {object} shallow copy of current tour state */
function getTourState() {
  _hydrateStoredTour()
  return Object.assign({}, _tour)
}

// ─── Exhibit context ───────────────────────────────────────────────────────

function inferDiscussionObjectKind(exhibit) {
  var ex = exhibit || {}
  var text = [
    ex.objectKind || ex.kind || '',
    ex.category || '',
    ex.name || '',
    ex.description || '',
  ].join(' ')

  if (/房屋|房址|遗迹|遗址|墓葬|壕沟|窑址|灶址|柱洞|地层|灰坑|作坊|居址|聚落/.test(text)) {
    return '遗迹'
  }
  if (/陶|盆|瓶|罐|钵|器|石器|骨器|工具|饰品|纹|残片|器物/.test(text)) {
    return '器物'
  }
  if (/图|模型|复原|照片|展板|说明|资料|示意/.test(text)) {
    return '资料'
  }
  if (/雕塑|园|中心|空间|展厅/.test(text)) {
    return '空间'
  }
  return '展项'
}

function buildObjectPrompt(kind, name, intent) {
  var n = name ? '“' + name + '”' : '这个' + kind
  if (intent === 'details') {
    if (kind === '遗迹') return '请带我观察' + n + '：哪些是现场能看到的遗存，哪些只是合理推测？'
    if (kind === '资料') return n + '里最值得抓住的关键信息是什么？它能帮助我理解哪个半坡问题？'
    return '请带我观察' + n + '的关键细节：材料、形态、痕迹或纹样里哪些最能说明问题？'
  }
  if (intent === 'function') {
    if (kind === '遗迹') return n + '在半坡聚落中可能承担什么功能？我们能从哪些现象判断？'
    if (kind === '资料') return n + '和半坡人的生活、生产或信仰有什么关系？'
    if (kind === '空间') return n + '为什么安排在这里？它和参观路线里的其他内容有什么关系？'
    return n + '可能怎么使用？哪些痕迹或形态能支持这个判断？'
  }
  if (kind === '遗迹') return n + '和周围的房址、墓葬、壕沟或作坊之间有什么关系？'
  if (kind === '资料') return n + '可以和展厅里的哪些实物或遗迹互相印证？'
  if (kind === '空间') return n + '适合帮我复盘前面哪些观察？'
  return n + '能和展厅里哪些对象放在一起比较？比较后能看出什么？'
}

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
    hall:        exhibit.hall ? banpoHalls.normalizeHallToSlug(exhibit.hall) : '',
    hallDisplay: exhibit.hallDisplay || banpoHalls.getHallDisplayName(exhibit.hall) || '',
    era:         exhibit.era         || '',
    category:    exhibit.category    || '',
    objectKind:  exhibit.objectKind  || exhibit.kind || inferDiscussionObjectKind(exhibit),
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

function setCurrentScannedExhibit(exhibit) {
  _tour.currentScannedExhibitId = exhibit && exhibit.id ? exhibit.id : null
  _tour.currentScannedExhibitName = exhibit && exhibit.name ? exhibit.name : null
  _tour.lastScanTimestamp = exhibit ? Date.now() : null
}

function getCurrentScannedExhibit() {
  return {
    currentScannedExhibitId: _tour.currentScannedExhibitId,
    currentScannedExhibitName: _tour.currentScannedExhibitName,
    lastScanTimestamp: _tour.lastScanTimestamp,
  }
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
  var hall = event.hall || _tour.currentHall || null
  var eventType = event.eventType || event.event_type || 'unknown'
  var hallSlug = hall ? _normalizeHallForStorage(hall) : null
  var entry = {
    event_type:       eventType,
    exhibit_id:       event.exhibitId        || event.exhibit_id        || null,
    hall:             hallSlug,
    duration_seconds: event.durationSeconds  || event.duration_seconds  || null,
    metadata:         event.metadata         || {},
  }
  if (eventType === 'hall_enter' && hallSlug && _tour.visitedHalls.indexOf(hallSlug) === -1) {
    _tour.visitedHalls = _tour.visitedHalls.concat(hallSlug)
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
  _hydrateStoredTour()
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

_HALL_SUGGEST_TEMPLATES['基本陈列展厅'] = _HALL_SUGGEST_TEMPLATES['出土文物陈列区']
_HALL_SUGGEST_TEMPLATES['遗址保护大厅'] = _HALL_SUGGEST_TEMPLATES['半坡聚落复原区']
_HALL_SUGGEST_TEMPLATES['陶窑展厅'] = {
  default: [
    { type: 'hall_intro', icon: '🔥', title: '制陶流程', prompt: '半坡陶器从泥土到成品大致经历哪些步骤？' },
    { type: 'observation_task', icon: '🛠', title: '火候证据', prompt: '陶窑结构能说明半坡人掌握了怎样的烧制技术？' },
  ],
  A: [
    { type: 'hall_intro', icon: '🔍', title: '窑炉证据', prompt: '考古上怎样判断半坡陶窑的结构和用途？' },
    { type: 'observation_task', icon: '🔥', title: '烧成技术', prompt: '半坡陶器烧制技术有哪些可以观察的证据？' },
  ],
  B: [
    { type: 'hall_intro', icon: '🏺', title: '做陶过程', prompt: '半坡人制作一件陶器通常要经历哪些过程？' },
    { type: 'observation_task', icon: '🔥', title: '窑火作用', prompt: '陶窑中的火候会怎样影响陶器的结实程度和颜色？' },
  ],
  C: [
    { type: 'hall_intro', icon: '💡', title: '生产分工', prompt: '陶窑和制陶活动能反映半坡社会怎样的分工？' },
    { type: 'observation_task', icon: '🔎', title: '流程观察', prompt: '从制陶流程可以看出半坡人有哪些技术经验？' },
  ],
  artisan: [
    { type: 'hall_intro', icon: '🛠', title: '工艺步骤', prompt: '半坡陶器从选泥、成型到入窑烧成有哪些关键步骤？' },
    { type: 'observation_task', icon: '🔥', title: '火候判断', prompt: '半坡工匠可能怎样判断陶器烧制的火候？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['史前工坊'] = {
  default: [
    { type: 'hall_intro', icon: '🛠', title: '体验重点', prompt: '史前工坊适合重点体验哪些半坡生活或工艺内容？' },
    { type: 'observation_task', icon: '✋', title: '动手理解', prompt: '为什么动手体验能帮助理解半坡人的技术？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['半坡姑娘雕塑'] = {
  default: [
    { type: 'hall_intro', icon: '🗿', title: '形象意义', prompt: '半坡姑娘形象为什么适合作为半坡文化的观展地标？' },
    { type: 'observation_task', icon: '💡', title: '人物想象', prompt: '我们怎样在不编造历史的前提下理解半坡人的形象？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['教研中心'] = {
  default: [
    { type: 'hall_intro', icon: '📚', title: '研学问题', prompt: '如果把半坡博物馆作为研学课程，最适合提出哪些问题？' },
    { type: 'observation_task', icon: '🔎', title: '整理证据', prompt: '参观结束后怎样把看到的遗址和文物整理成一条证据链？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['牡丹园'] = {
  default: [
    { type: 'hall_intro', icon: '🌸', title: '休憩观察', prompt: '牡丹园在博物馆参观中可以承担怎样的休憩和景观作用？' },
    { type: 'observation_task', icon: '🌿', title: '环境联想', prompt: '从园林休憩空间可以怎样联想到半坡人的自然环境？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['临展厅一'] = {
  default: [
    { type: 'hall_intro', icon: '🖼️', title: '现场主题', prompt: '这个临展厅的当期内容以现场展签为准；如果还不知道主题，我应该先看哪些线索？' },
    { type: 'observation_task', icon: '🔎', title: '看展方法', prompt: '面对临展或临时展览，怎样通过标题、导语、展品组合和动线判断策展思路？' },
  ],
  A: [
    { type: 'hall_intro', icon: '🔍', title: '信息来源', prompt: '研究临展时，哪些信息必须以现场展签和馆方清单为准，哪些只能作为推测？' },
    { type: 'observation_task', icon: '🧭', title: '策展证据', prompt: '在临展厅里，怎样从展览标题、单元划分和展品顺序判断策展问题？' },
  ],
  B: [
    { type: 'hall_intro', icon: '📝', title: '记录方法', prompt: '参观临展时，如果当期展品清单还不完整，我的研学笔记应该先记录哪些现场信息？' },
    { type: 'observation_task', icon: '🔎', title: '主题线索', prompt: '我可以怎样用标题、导语和展品组合快速判断这个临展想讲什么？' },
  ],
  C: [
    { type: 'hall_intro', icon: '💡', title: '临展追问', prompt: '临展和常设展有什么不同？临展通常会借一个主题提出怎样的新问题？' },
    { type: 'observation_task', icon: '🧭', title: '叙事线索', prompt: '怎样从临展的开头、单元和结尾看出策展人想引导我们追问什么？' },
  ],
  artisan: [
    { type: 'hall_intro', icon: '🏺', title: '器物看法', prompt: '在临展厅里观察器物时，怎样先看材料、器形、说明牌和展柜组合？' },
    { type: 'observation_task', icon: '🔎', title: '现场细节', prompt: '如果不知道临展当期清单，我应该如何从现场展签判断哪些器物值得细看？' },
  ],
}
_HALL_SUGGEST_TEMPLATES['临展厅二'] = _HALL_SUGGEST_TEMPLATES['临展厅一']

function _isTemporaryHall(hall) {
  var normalized = banpoHalls.normalizeHallToSlug(hall)
  return ['temporary-hall-1', 'temporary-hall-2'].indexOf(normalized) >= 0
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
  var hallDisplay = hall ? banpoHalls.getHallDisplayName(hall) : null

  var suggestions = []
  var counter = 0
  function _id() { return 'sg_' + (++counter) }

  // ── Exhibit mode: suggestions around the selected exhibit ─────────────────
  if (exhibit) {
    var objectKind = exhibit.objectKind || inferDiscussionObjectKind(exhibit)
    var objectName = exhibit.name || ''

    suggestions.push({
      id: _id(), type: 'observation_task', icon: '🔎', title: '看关键细节',
      actionType: 'ask', payload: { prompt: buildObjectPrompt(objectKind, objectName, 'details') },
    })

    var cat = exhibit.category || ''
    var obsTitle = objectKind === '遗迹' ? '判断空间作用' : (objectKind === '资料' ? '读懂信息' : '问用途和证据')
    var obsPmt   = buildObjectPrompt(objectKind, objectName, 'function')
    if (cat.indexOf('彩陶') >= 0) {
      obsTitle = '读纹样证据'
      obsPmt   = '请围绕“' + objectName + '”上的纹样说明：哪些能直接观察，哪些属于可能解释？'
    } else if (cat.indexOf('汲水') >= 0 || cat.indexOf('汲') >= 0) {
      obsTitle = '了解使用原理'
      obsPmt   = '“' + objectName + '”可能怎样使用？它的形态设计提供了哪些证据？'
    } else if (cat.indexOf('骨') >= 0 || cat.indexOf('石') >= 0) {
      obsTitle = '了解制作工艺'
      obsPmt   = '“' + objectName + '”可能怎样制作？能从哪些加工痕迹判断？'
    }
    suggestions.push({
      id: _id(), type: 'observation_task', icon: '🔎', title: obsTitle,
      actionType: 'ask', payload: { prompt: obsPmt },
    })

    suggestions.push({
      id: _id(), type: 'comparison', icon: '🧭', title: '放回展厅看',
      actionType: 'ask', payload: { prompt: buildObjectPrompt(objectKind, objectName, 'relation') },
    })

    // Related object: highest importance in same hall, not current
    var related = null
    for (var ri = 0; ri < exhibits.length; ri++) {
      var re = exhibits[ri]
      if (re.name === exhibit.name || re.id === exhibit.id) continue
      if (!related || (re.importance || 0) > (related.importance || 0)) related = re
    }
    if (related) {
      suggestions.push({
        id: _id(), type: 'related_exhibit', icon: '🏺',
        title: '对照：' + related.name,
        actionType: 'open_exhibit',
        payload: { exhibitId: related.id, exhibitName: related.name },
      })
    }

    suggestions.push({
      id: _id(), type: 'next_step', icon: '←', title: '返回列表',
      actionType: 'navigate_back', payload: {},
    })

    return suggestions.slice(0, 4)
  }

  // ── Hall mode: suggestions based on hall + persona ─────────────────────────
  if (!hall) return []
  var hallTpls = _HALL_SUGGEST_TEMPLATES[hallDisplay] || _HALL_SUGGEST_TEMPLATES[hall]
  if (!hallTpls) return []

  var personaFallback = {
    student: 'B',
    resident: 'B',
    historian: 'C',
    community: 'C',
    artifact: 'artisan',
    artisan: 'D',
    D: 'artisan',
  }
  var personaTpls = hallTpls[persona] || hallTpls[personaFallback[persona]] || hallTpls['default'] || []
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

function buildClientContext(rawInput, opts) {
  var options = opts || {}
  var recentMessages = options.recentMessages || null
  var def = PERSONA_DEFS[_tour.personaId] || PERSONA_DEFS['default']
  var ex = _tour.currentExhibit || null
  var lines = []

  lines.push('[导览上下文]')
  if (_tour.currentHall) {
    var hallDisplay = _getCurrentHallDisplayName()
    lines.push('当前展厅：' + hallDisplay)
    lines.push('回答必须优先围绕当前展厅；检索材料若与当前展厅冲突，以当前展厅和用户问题为准。')
    if (_isTemporaryHall(_tour.currentHall)) {
      lines.push('临展厅当期主题和展品清单尚未在系统中完整确认，不要编造当期展品，也不要借用基本陈列展厅的农耕工具、陶器等内容来填空。')
    }
  }
  lines.push('当前身份：' + (def.name || 'MuseAI 导览员'))
  lines.push('身份只决定观察角度和语气，不是固定回答模板。')

  if (_tour.focusTitle || _tour.intentText || _tour.assumptionText || _tour.guideModeTitle) {
    lines.push('[入场问卷]')
    if (_tour.focusTitle)      lines.push('兴趣方向：' + _tour.focusTitle)
    if (_tour.intentText)      lines.push('用户自写问题：' + _tour.intentText)
    if (_tour.assumptionText)  lines.push('初始判断：' + _tour.assumptionText)
    if (_tour.guideModeTitle)  lines.push('导览节奏：' + _tour.guideModeTitle)
  }

  if (ex) {
    var exKindForContext = ex.objectKind || inferDiscussionObjectKind(ex)
    lines.push('[当前讨论对象]')
    lines.push('对象类型：' + exKindForContext)
    if (ex.name) lines.push('名称：' + ex.name)
    if (ex.hallDisplay || ex.hall) lines.push('展厅：' + (ex.hallDisplay || ex.hall))
    if (ex.category) lines.push('类别：' + ex.category)
    if (ex.era) lines.push('时代：' + ex.era)
    if (ex.description) lines.push('简介：' + String(ex.description).slice(0, 180))
  }

  if (recentMessages && recentMessages.length) {
    lines.push('[近期对话]')
    recentMessages.slice(-4).forEach(function (m) {
      var role = m.role === 'user' ? '用户' : 'AI'
      lines.push(role + '：' + String(m.content || '').slice(0, 100))
    })
  } else if (tourStore_isContextQuestionSafe(rawInput)) {
    lines.push('用户在问上下文，但当前前端没有可用的近期对话记录；请如实说明。')
  }

  return lines.join('\n').slice(0, 1200)
}

function tourStore_isContextQuestionSafe(text) {
  try {
    return isContextQuestion(text)
  } catch (_) {
    return false
  }
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

  // Onboarding profile: keep the entry questionnaire connected to later answers.
  if (_tour.focusTitle || _tour.intentText || _tour.assumptionText || _tour.guideModeTitle) {
    var profileLines = ['[入场问卷上下文]']
    if (_tour.focusTitle)      profileLines.push('用户今天最想追问：' + _tour.focusTitle)
    if (_tour.intentText)      profileLines.push('用户自己写下的问题：' + _tour.intentText)
    if (_tour.assumptionText)  profileLines.push('用户对半坡社会的初始判断：' + _tour.assumptionText)
    if (_tour.focusPrompt)     profileLines.push('内容侧重点：' + _tour.focusPrompt)
    if (_tour.guideModeTitle)  profileLines.push('导览节奏：' + _tour.guideModeTitle)
    if (_tour.guideModePrompt) profileLines.push('回应方式：' + _tour.guideModePrompt)
    profileLines.push('回答时优先照顾这些偏好；当证据与用户初始判断不一致时，用温和追问引导反思，不要直接否定用户。')
    profileLines.push('---')
    parts.push(profileLines.join('\n'))
  }

  // ── 2. Hall context (when browsing a hall without a specific exhibit) ──────
  // Inject current hall so backend RAG doesn't guess or hallucinate a different hall.
  if (!hasEx && _tour.currentHall) {
    var hallDisplayName = _getCurrentHallDisplayName()
    var hallLines = [
      '[当前展厅上下文]',
      '用户当前正在参观的展厅是：' + hallDisplayName,
      '请围绕该展厅相关内容作答，不要把它称为其他展厅名称；检索材料若与当前展厅冲突，以当前展厅和用户问题为准。',
    ]
    if (_isTemporaryHall(_tour.currentHall)) {
      hallLines.push('该空间是临展厅，当期主题和展品清单需要以现场展签/馆方清单为准；不要编造当期展品，也不要把基本陈列展厅的农耕工具、陶器等内容搬进来回答。')
    }
    hallLines.push('---')
    parts.push(hallLines.join('\n'))
  }

  // ── 3. Exhibit context — disambiguation only, no forced answer structure ─
  if (hasEx) {
    var exName = ex.name || ''
    var exKind = ex.objectKind || inferDiscussionObjectKind(ex)
    var ctx    = ['[当前讨论对象上下文｜仅用于指代消歧]']
    ctx.push('当前用户正在讨论的对象类型是：' + exKind)
    ctx.push('当前用户正在讨论的对象是：' + exName)
    if (exName) {
      ctx.push('当用户说"它""这个""这里的东西""这处遗迹""这件器物"等指代词时，优先理解为：' + exName + '。')
      ctx.push('除非用户明确提到其他对象，不要把这些指代词解释成别的内容。')
      ctx.push('检索材料若出现其他对象，只能作为比较，不能替代当前对象。')
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
      '[对象问答提示]',
      '用户正在围绕当前对象"' + (ex.name || '') + '"提问，请聚焦该对象直接回答用户的具体问题。',
      '这个对象可能是器物、遗迹、资料或空间，不要默认称为“展品”。',
      '不要先泛泛介绍展厅，也不要把回答扩展到无关对象。',
      '根据用户实际问题作答：问定义就解释定义，问价值就解释价值，问细节就给观察点，不要强行回答用户没问的内容。',
      '---',
    ].join('\n'))
  }

  // ── 5. Dialogue tone constraint — always present ───────────────────────
  var PERSONA_TONE_MAP = {
    'default':  '中立、亲切、专业，不要过度拟人化。',
    'A':        '像研究员一样引用证据和推断，但用对话语气表达，不要写成论文报告。',
    'student':  '像研学记录员一样帮助用户知道看什么、怎么记、这些证据如何形成解释；需要归纳时用自然过渡句连接，不要固定套“观察任务/笔记要点”栏目。',
    'resident': '像研学记录员一样帮助用户知道看什么、怎么记、这些证据如何形成解释；需要归纳时用自然过渡句连接，不要固定套“观察任务/笔记要点”栏目。',
    'B':        '像研学记录员一样帮助用户知道看什么、怎么记、这些证据如何形成解释；需要归纳时用自然过渡句连接，不要固定套“观察任务/笔记要点”栏目。',
    'C':        '像历史爱好者一样追问大问题，联系史前中国和今天；追问要自然出现，不要每段都反问。',
    'historian':'像历史爱好者一样追问大问题，联系史前中国和今天；追问要自然出现，不要每段都反问。',
    'community':'像历史爱好者一样追问大问题，联系史前中国和今天；追问要自然出现，不要每段都反问。',
    'D':        '从材料、器形、纹饰和使用痕迹切入，明确区分观察事实与推测，但不要机械分栏。',
    'artifact': '从材料、器形、纹饰和使用痕迹切入，明确区分观察事实与推测，但不要机械分栏。',
    'artisan':  '从材料、器形、纹饰和使用痕迹切入，明确区分观察事实与推测，但不要机械分栏。',
  }
  var toneHint = PERSONA_TONE_MAP[_tour.personaId] || PERSONA_TONE_MAP['default']
  parts.push([
    '[对话语气约束]',
    '你正在和一名手机小程序用户进行一对一博物馆导览对话。',
    '禁止使用"各位观众""大家请看""各位游客""同学们""朋友们"等群体讲解/广播式称呼。',
    '使用"你""我们可以看""这个对象"等自然的一对一口吻；只有确认是具体器物时才说"这件器物"。',
    '直接回答用户的问题，不要用"好的""收到""明白了"等寒暄开头；不要先复述"我们来到/站在某展厅"这类前置描述。',
    '回答像博物馆AI导览员在和用户单独交流，不是在做报告或广播讲解。',
    '当前导览风格提示：' + toneHint,
    '以上风格只应自然融入回答，不要变成固定模板；用户问什么，就先回答什么。',
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
    '使用**加粗**突出2到4个真正关键的器物名、观察证据或判断结论，不要整段加粗。',
    '不要使用固定模板小标题，尤其不要把回答分成重要性、后续观察建议等段落；需要解释含义时用自然连接句，例如“可以这样理解：”“换句话说，”，不要写“我的分析”“说明了什么”。',
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
 * Return the backend persona letter ('A'|'B'|'C'|'D') for createSession calls.
 * default maps to 'B'; artisan maps to 'D'.
 */
function getBackendPersona() {
  return getPersonaDef().backendPersona || 'B'
}

// ─── Persona helpers (ported from useTour computed props) ──────────────────

/**
 * @returns {string} Display label for the current session's persona, e.g. '考古研究员'
 */
function getPersonaLabel() {
  var def = PERSONA_DEFS[_tour.personaId]
  if (def && def.name) return def.name
  var map = { A: '考古研究员', B: '研学记录员', C: '历史追问者', D: '器物研究员' }
  return map[_tour.persona] || ''
}

/**
 * @returns {string} Report title for the current persona
 */
function getReportThemeTitle() {
  var idMap = {
    student: '半坡研学记录报告',
    resident: '半坡研学记录报告',
    A: '半坡考古研究报告',
    historian: '半坡历史追问报告',
    community: '半坡历史追问报告',
    D: '半坡器物观察报告',
    artifact: '半坡器物观察报告',
    artisan: '半坡器物观察报告',
  }
  if (_tour.personaId && idMap[_tour.personaId]) return idMap[_tour.personaId]
  var map = { A: '半坡考古研究报告', B: '半坡研学记录报告', C: '半坡历史追问报告', D: '半坡器物观察报告' }
  return map[_tour.persona] || ''
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Session lifecycle
  createLocalTourState,
  setTourSession,
  incrementAiConversationCount,
  hasResumableTourSession,
  updateTourState,
  getTourState,
  clearTour,
  setOnboardingExtras,

  // Exhibit context
  setCurrentExhibit,
  clearCurrentExhibit,
  getCurrentExhibit,
  setCurrentScannedExhibit,
  getCurrentScannedExhibit,

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
  buildClientContext,
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
  getCurrentHallDisplayName: _getCurrentHallDisplayName,
}
