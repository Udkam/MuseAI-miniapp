var tourStore = require('../store/tour')
var api = require('../api/index')

var EVENT_BATCH_SIZE = 50

function flushEventList(events, sendBatch) {
  var list = Array.isArray(events) ? events.slice() : []
  if (!list.length) {
    return Promise.resolve({ ok: true, confirmedCount: 0, remaining: [], batchCount: 0 })
  }
  if (typeof sendBatch !== 'function') {
    return Promise.resolve({ ok: false, status: 0, confirmedCount: 0, remaining: list, batchCount: 0 })
  }

  var confirmedCount = 0
  var batchCount = 0

  function sendNext() {
    if (confirmedCount >= list.length) {
      return Promise.resolve({
        ok: true,
        confirmedCount: confirmedCount,
        remaining: [],
        batchCount: batchCount,
      })
    }
    var batch = list.slice(confirmedCount, confirmedCount + EVENT_BATCH_SIZE)
    var batchIndex = batchCount
    batchCount += 1
    return Promise.resolve().then(function () {
      return sendBatch(batch, batchIndex)
    }).then(function (res) {
      if (!res || !res.ok) {
        return {
          ok: false,
          status: Number(res && res.status) || 0,
          response: res || null,
          confirmedCount: confirmedCount,
          remaining: list.slice(confirmedCount),
          batchCount: batchCount,
        }
      }
      confirmedCount += batch.length
      return sendNext()
    }).catch(function (error) {
      return {
        ok: false,
        status: Number(error && error.status) || 0,
        error: error,
        confirmedCount: confirmedCount,
        remaining: list.slice(confirmedCount),
        batchCount: batchCount,
      }
    })
  }

  return sendNext()
}

function flushPendingEvents(options) {
  var source = options || {}
  var store = source.store || tourStore
  var sessionId = source.sessionId
  var token = source.token
  var events = store.drainPendingEvents()

  if (!events.length) {
    return Promise.resolve({ ok: true, confirmedCount: 0, remaining: [], batchCount: 0 })
  }
  if (!sessionId) {
    store.restorePendingEvents(events)
    return Promise.resolve({
      ok: false,
      status: 0,
      reason: 'missing_session',
      confirmedCount: 0,
      remaining: events,
      batchCount: 0,
    })
  }

  var sendBatch = source.sendBatch || function (batch) {
    return api.tourApi.recordEvents(sessionId, batch, token)
  }
  return flushEventList(events, sendBatch).then(function (result) {
    if (!result.ok && result.remaining.length) {
      // Every sanitized event has a stable client_event_id. Restoring the
      // uncertain current batch is therefore safe if the response was lost;
      // confirmed earlier batches stay removed.
      store.restorePendingEvents(result.remaining)
    }
    return result
  })
}

module.exports = {
  EVENT_BATCH_SIZE: EVENT_BATCH_SIZE,
  flushEventList: flushEventList,
  flushPendingEvents: flushPendingEvents,
}
