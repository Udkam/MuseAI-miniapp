/**
 * Reliable, finite session-state synchronization for page-first navigation.
 *
 * Pages update the local store immediately, then enqueue the corresponding
 * backend patch. The pending patch is persisted as part of tour_state, so the
 * next page or the next app launch can finish it. Chat calls should await
 * ensureSessionContext() before opening an SSE stream.
 */

const api = require('../api/index')
const tourStore = require('../store/tour')
const exhibitIds = require('./exhibit-id')
const tourSession = require('./tour-session')
const storage = require('./storage')

const RETRY_DELAYS_MS = [0, 300, 900]
var _inFlight = null
var _inFlightRecord = null

function _compactPatch(patch) {
  var source = patch || {}
  var out = {}
  ;[
    'status', 'current_hall', 'current_exhibit_id', 'tour_started_at', 'questionnaire',
    'resume_state', 'hall_chat_history', 'expected_state_version',
  ].forEach(function (key) {
    if (source[key] === undefined) return
    out[key] = key === 'current_exhibit_id'
      ? exhibitIds.normalizeBackendExhibitId(source[key])
      : source[key]
  })
  return out
}

function _fullSnapshotPatch(extra) {
  return Object.assign({
    questionnaire: tourStore.getQuestionnaireState(),
    resume_state: tourStore.buildResumeState(),
    hall_chat_history: tourStore.getHallChatHistoryPayload(),
    expected_state_version: tourStore.getTourState().serverStateVersion == null
      ? undefined
      : tourStore.getTourState().serverStateVersion,
  }, extra || {})
}

function _hasKeys(value) {
  return !!(value && Object.keys(value).length)
}

function _hasBusinessKeys(value) {
  return !!(value && Object.keys(value).some(function (key) {
    return key !== 'expected_state_version'
  }))
}

function _sameValue(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b) } catch (_) { return a === b }
}

function _sameSyncTarget(state, sessionId, sessionToken, localTourId) {
  if (!state || state.sessionId !== sessionId) return false
  if (state.sessionToken !== sessionToken) return false
  return !localTourId || state.localTourId === localTourId
}

function _updateOwnedActivity(payload) {
  var usedServerActivity = storage.updateTourSessionActivity
    ? storage.updateTourSessionActivity(payload || {})
    : false
  if (!usedServerActivity && storage.touchTourSession) storage.touchTourSession()
}

function _mergePending(patch) {
  var state = tourStore.getTourState()
  var merged = Object.assign({}, state.pendingSessionSync || {}, _compactPatch(patch))
  tourStore.updateTourState({ pendingSessionSync: merged })
  return merged
}

function _setPendingExpectedVersion(value) {
  var state = tourStore.getTourState()
  var pending = Object.assign({}, state.pendingSessionSync || {})
  if (value === undefined || value === null) delete pending.expected_state_version
  else pending.expected_state_version = value
  tourStore.updateTourState({ pendingSessionSync: _hasKeys(pending) ? pending : null })
  return pending
}

function _clearSynced(sent) {
  var state = tourStore.getTourState()
  var pending = Object.assign({}, state.pendingSessionSync || {})
  Object.keys(sent || {}).forEach(function (key) {
    if (_sameValue(pending[key], sent[key])) delete pending[key]
  })
  tourStore.updateTourState({ pendingSessionSync: _hasKeys(pending) ? pending : null })
}

function _wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function _attemptFlush(maxAttempts, flightRecord) {
  var attempts = Math.max(1, Math.min(Number(maxAttempts) || RETRY_DELAYS_MS.length, RETRY_DELAYS_MS.length))
  var recoveredSession = false

  function attempt(index) {
    var state = tourStore.getTourState()
    var patch = _compactPatch(state.pendingSessionSync)
    if (flightRecord) flightRecord.patch = patch
    if (!_hasKeys(patch)) return Promise.resolve({ ok: true, status: 204, data: null })
    if (!state.sessionId) {
      return Promise.resolve({ ok: false, status: 0, code: 'SESSION_NOT_READY', queued: true })
    }
    var targetSessionId = state.sessionId
    var targetSessionToken = state.sessionToken
    var targetLocalTourId = state.localTourId || null

    return _wait(RETRY_DELAYS_MS[index] || 0)
      .then(function () {
        return api.tourApi.updateSession(targetSessionId, patch, targetSessionToken, {
          skipActivityUpdate: true,
          expectedSessionId: targetSessionId,
          expectedSessionToken: targetSessionToken,
        })
      })
      .then(function (res) {
        var current = tourStore.getTourState()
        if (!_sameSyncTarget(current, targetSessionId, targetSessionToken, targetLocalTourId)) {
          if (
            targetLocalTourId &&
            current.localTourId === targetLocalTourId &&
            current.sessionId &&
            current.sessionToken
          ) {
            return attempt(index)
          }
          return {
            ok: false,
            status: 409,
            code: 'STALE_SESSION_SYNC',
            stale: true,
            queued: _hasKeys(current.pendingSessionSync),
          }
        }
        if (res && res.ok) {
          _updateOwnedActivity(res.data)
          _clearSynced(patch)
          var data = res.data || {}
          var nextVersion = data.state_version != null
            ? data.state_version
            : (data.resume_state && data.resume_state.state_version)
          if (nextVersion != null) {
            tourStore.updateTourState({ serverStateVersion: nextVersion })
            if (_hasBusinessKeys(tourStore.getTourState().pendingSessionSync)) {
              _mergePending({ expected_state_version: nextVersion })
            }
          }
          return res
        }
        if (
          !recoveredSession &&
          res &&
          tourSession.isRecoverableSessionStatus &&
          tourSession.isRecoverableSessionStatus(res.status)
        ) {
          recoveredSession = true
          return tourSession.recoverTourSession(targetSessionId, targetLocalTourId).then(function (created) {
            if (!created || !created.ok || !created.sessionId) {
              return Object.assign({ ok: false, queued: true, recoveryFailed: true }, res)
            }
            var latest = tourStore.getTourState()
            if (_hasBusinessKeys(latest.pendingSessionSync)) {
              _setPendingExpectedVersion(latest.serverStateVersion)
            }
            return attempt(index)
          })
        }
        if (res && res.status === 409 && patch.expected_state_version !== undefined && index + 1 < attempts) {
          return api.tourApi.getSession(targetSessionId, targetSessionToken, {
            skipActivityUpdate: true,
            expectedSessionId: targetSessionId,
            expectedSessionToken: targetSessionToken,
          }).then(function (latest) {
            var latestOwner = tourStore.getTourState()
            if (!_sameSyncTarget(latestOwner, targetSessionId, targetSessionToken, targetLocalTourId)) {
              if (
                targetLocalTourId &&
                latestOwner.localTourId === targetLocalTourId &&
                latestOwner.sessionId &&
                latestOwner.sessionToken
              ) {
                return attempt(index + 1)
              }
              return {
                ok: false,
                status: 409,
                code: 'STALE_SESSION_SYNC',
                stale: true,
                queued: _hasKeys(latestOwner.pendingSessionSync),
              }
            }
            var nextVersion = latest && latest.ok && latest.data && latest.data.state_version
            if (nextVersion == null) return Object.assign({ ok: false, queued: true }, res)
            _updateOwnedActivity(latest.data)
            tourStore.updateTourState({ serverStateVersion: nextVersion })
            _mergePending({ expected_state_version: nextVersion })
            return attempt(index + 1)
          })
        }
        if (index + 1 < attempts && (!res || res.status === 0 || res.status === 408 || res.status === 429 || res.status >= 500)) {
          return attempt(index + 1)
        }
        return Object.assign({ ok: false, queued: true }, res || {})
      })
      .catch(function (err) {
        if (index + 1 < attempts) return attempt(index + 1)
        return { ok: false, status: Number(err && err.status) || 0, error: err, queued: true }
      })
  }

  return attempt(0)
}

function flushPendingSessionSync(options) {
  if (_inFlight) {
    var joinedFlight = _inFlightRecord
    return _inFlight.then(function (result) {
      var state = tourStore.getTourState()
      var pending = _compactPatch(state.pendingSessionSync)
      var lastSentPatch = joinedFlight && joinedFlight.patch
      if ((!result || !result.ok) && _sameValue(pending, lastSentPatch)) {
        return result || { ok: false, status: 0, queued: true }
      }
      return _hasKeys(state.pendingSessionSync)
        ? flushPendingSessionSync(options)
        : { ok: true, status: 204, data: null }
    })
  }
  var flightRecord = { patch: null }
  _inFlightRecord = flightRecord
  _inFlight = _attemptFlush(options && options.maxAttempts, flightRecord)
    .then(function (result) {
      _inFlight = null
      _inFlightRecord = null
      return result
    }, function (err) {
      _inFlight = null
      _inFlightRecord = null
      return { ok: false, status: Number(err && err.status) || 0, error: err, queued: true }
    })
  return _inFlight
}

function queueSessionSync(patch, options) {
  _mergePending(patch)
  if (options && options.defer) {
    setTimeout(function () {
      flushPendingSessionSync({ maxAttempts: options.maxAttempts || 3 })
    }, Number(options.delayMs) || 0)
    return Promise.resolve({ ok: true, queued: true })
  }
  return flushPendingSessionSync({ maxAttempts: (options && options.maxAttempts) || 3 })
}

function queueSessionSnapshot(patch, options) {
  return queueSessionSync(_fullSnapshotPatch(patch), options)
}

function ensureSessionContext(context) {
  var desired = context || {}
  var patch = {
    status: desired.status || 'touring',
    current_hall: desired.currentHall || null,
    current_exhibit_id: exhibitIds.normalizeBackendExhibitId(desired.currentExhibitId),
  }
  _mergePending(_fullSnapshotPatch(patch))
  return flushPendingSessionSync({ maxAttempts: 3 })
}

module.exports = {
  queueSessionSync,
  queueSessionSnapshot,
  flushPendingSessionSync,
  ensureSessionContext,
}
