/** Shared, deduplicated guest-session bootstrap for page-first navigation. */
const api = require('../api/index')
const tourStore = require('../store/tour')

var _inFlight = null
var RECOVERABLE_SESSION_STATUS = { 401: true, 403: true, 404: true, 410: true }

function isRecoverableSessionStatus(status) {
  return !!RECOVERABLE_SESSION_STATUS[Number(status) || 0]
}

function _createPayload(state) {
  var persona = tourStore.getBackendPersona ? tourStore.getBackendPersona() : 'default'
  return {
    interest_type: state.interestType || persona || 'default',
    persona: persona || 'default',
    assumption: ['A', 'B', 'C', 'D'].indexOf(state.assumption) >= 0 ? state.assumption : 'D',
    guest_id: 'miniapp_guest_' + Date.now(),
    questionnaire: tourStore.getQuestionnaireState(),
    resume_state: tourStore.buildResumeState(),
  }
}

function ensureTourSession() {
  var state = tourStore.getTourState()
  if (state.sessionId && state.sessionToken) {
    return Promise.resolve({
      ok: true,
      status: 200,
      sessionId: state.sessionId,
      sessionToken: state.sessionToken || null,
      existing: true,
    })
  }
  if (state.sessionId && !state.sessionToken && tourStore.invalidateTourSession) {
    tourStore.invalidateTourSession()
    state = tourStore.getTourState()
  }
  var localTourId = state.localTourId || (
    tourStore.ensureLocalTourId ? tourStore.ensureLocalTourId() : null
  )
  if (_inFlight && _inFlight.localTourId === localTourId) return _inFlight.promise

  var record = { localTourId: localTourId, promise: null }
  record.promise = api.tourApi.createSession(_createPayload(tourStore.getTourState()))
    .then(function (res) {
      var current = tourStore.getTourState()
      if (current.localTourId !== localTourId || current.sessionId) {
        return {
          ok: false,
          status: 409,
          code: 'STALE_SESSION_BOOTSTRAP',
          stale: true,
          queued: false,
        }
      }
      if (!res || !res.ok || !res.data) {
        return {
          ok: false,
          status: Number(res && res.status) || 0,
          data: res && res.data,
          queued: true,
        }
      }
      var data = res.data || {}
      var sessionId = data.id || data.session_id || null
      var sessionToken = data.session_token || null
      if (!sessionId || !sessionToken) {
        return { ok: false, status: 502, code: 'INVALID_SESSION_CREDENTIALS', data: data, queued: true }
      }
      tourStore.setTourSession({
        sessionId: sessionId,
        sessionToken: sessionToken,
      })
      // POST /sessions returns a freshly-created server row whose top-level
      // status/current_hall/visited fields still contain database defaults.
      // The complete same-device snapshot remains authoritative until the
      // following PATCH; applying this create response as a resume payload
      // would erase the local page-first state before it can be synchronized.
      if (data.state_version != null) {
        tourStore.updateTourState({ serverStateVersion: data.state_version })
      }
      if (api.storage && api.storage.updateTourSessionActivity) {
        api.storage.updateTourSessionActivity(data)
      }
      return {
        ok: true,
        status: Number(res.status) || 201,
        data: data,
        sessionId: sessionId,
        sessionToken: sessionToken,
      }
    })
    .catch(function (error) {
      return { ok: false, status: Number(error && error.status) || 0, error: error, queued: true }
    })
    .then(function (result) {
      if (_inFlight === record) _inFlight = null
      return result
    }, function (error) {
      if (_inFlight === record) _inFlight = null
      return { ok: false, status: 0, error: error, queued: true }
    })
  _inFlight = record

  return record.promise
}

function recoverTourSession(expectedSessionId, expectedLocalTourId) {
  var state = tourStore.getTourState()
  if (expectedLocalTourId && state.localTourId !== expectedLocalTourId) {
    return Promise.resolve({
      ok: false,
      status: 409,
      code: 'STALE_SESSION_RECOVERY',
      stale: true,
      queued: false,
    })
  }
  // Another caller may already have replaced the failed session. Preserve the
  // newer credentials instead of invalidating them in response to a late 4xx.
  if (
    expectedSessionId && state.sessionId && state.sessionToken &&
    state.sessionId !== expectedSessionId
  ) {
    return Promise.resolve({
      ok: true,
      status: 200,
      sessionId: state.sessionId,
      sessionToken: state.sessionToken || null,
      existing: true,
      recoveredByPeer: true,
    })
  }
  if (
    state.sessionId &&
    (!state.sessionToken || !expectedSessionId || state.sessionId === expectedSessionId) &&
    tourStore.invalidateTourSession
  ) {
    tourStore.invalidateTourSession()
  }
  return ensureTourSession()
}

module.exports = {
  ensureTourSession: ensureTourSession,
  recoverTourSession: recoverTourSession,
  isRecoverableSessionStatus: isRecoverableSessionStatus,
}
