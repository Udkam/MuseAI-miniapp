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
}

/** @returns {object} shallow copy of current tour state */
function getTourState() {
  return Object.assign({}, _tour)
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

// ─── Prompt builder (ported from useTourWorkbench.buildStyledPrompt) ───────

/**
 * Wraps a raw user input with style constraints understood by the backend.
 *
 * @param {string} rawInput
 * @param {object} [styleOverride] - If omitted, reads from wx.storage
 * @returns {string}
 */
function buildStyledPrompt(rawInput, styleOverride) {
  var style = styleOverride || getStylePrefs()
  var def   = PERSONA_DEFS[_tour.personaId] || PERSONA_DEFS['default']

  var parts = []

  // Persona prompt prefix (empty string for A/B/C — backend handles those)
  if (def.promptPrefix) parts.push(def.promptPrefix)

  // Style constraints
  if (style.enabled !== false) {
    parts.push('[风格约束]')
    if (style.answerLength) parts.push('回答长度: ' + (ANSWER_LENGTH_MAP[style.answerLength] || style.answerLength))
    if (style.depth)        parts.push('讲解深浅: ' + (DEPTH_MAP[style.depth]               || style.depth))
    if (style.terminology)  parts.push('术语难度: ' + (TERMINOLOGY_MAP[style.terminology]    || style.terminology))
    parts.push('---')
  }

  parts.push(rawInput)
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

  // Persona display
  getPersonaLabel,
  getReportThemeTitle,

  // Persona system
  PERSONA_DEFS,
  getPersonaDef,
  getBackendPersona,
}
