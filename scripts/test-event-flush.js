const assert = require('assert')

global.wx = {
  getStorageSync: function () { return '' },
  setStorageSync: function () {},
  removeStorageSync: function () {},
}

const eventFlush = require('../utils/event-flush')

function makeEvents(count) {
  const events = []
  for (let i = 0; i < count; i++) {
    events.push({
      event_type: 'exhibit_view',
      exhibit_id: 'trusted-' + i,
      hall: 'basic-exhibition-hall',
      metadata: { client_event_id: 'event-' + i },
    })
  }
  return events
}

async function assertBatchSequence(count, expectedSizes) {
  const calls = []
  const result = await eventFlush.flushEventList(makeEvents(count), function (batch, index) {
    calls.push({
      index: index,
      size: batch.length,
      ids: batch.map(function (event) { return event.metadata.client_event_id }),
    })
    return Promise.resolve({ ok: true, status: 201 })
  })
  assert.strictEqual(result.ok, true)
  assert.deepStrictEqual(calls.map(function (call) { return call.size }), expectedSizes)
  assert.ok(calls.every(function (call) { return call.size <= 50 }), 'every backend event batch must stay within 50')
  assert.deepStrictEqual(
    calls.reduce(function (all, call) { return all.concat(call.ids) }, []),
    makeEvents(count).map(function (event) { return event.metadata.client_event_id }),
    'event batches must preserve original order without duplication'
  )
}

async function run() {
  await assertBatchSequence(51, [50, 1])
  await assertBatchSequence(120, [50, 50, 20])

  const initial = makeEvents(120)
  const store = {
    pending: initial.slice(),
    drainPendingEvents: function () {
      const drained = this.pending.slice()
      this.pending = []
      return drained
    },
    restorePendingEvents: function (events) {
      this.pending = events.concat(this.pending)
    },
  }
  const calls = []
  const result = await eventFlush.flushPendingEvents({
    sessionId: 'session-1',
    token: 'token-1',
    store: store,
    sendBatch: function (batch, index) {
      calls.push(batch.map(function (event) { return event.metadata.client_event_id }))
      if (index === 0) return Promise.resolve({ ok: true, status: 201 })
      store.pending.push({ event_type: 'assistant_answer', metadata: { client_event_id: 'new-during-flush' } })
      return Promise.resolve({ ok: false, status: 503 })
    },
  })

  assert.strictEqual(result.ok, false)
  assert.strictEqual(result.confirmedCount, 50)
  assert.deepStrictEqual(calls.map(function (batch) { return batch.length }), [50, 50])
  assert.deepStrictEqual(
    store.pending.slice(0, 70).map(function (event) { return event.metadata.client_event_id }),
    initial.slice(50).map(function (event) { return event.metadata.client_event_id }),
    'a second-batch failure must restore only the uncertain batch and unattempted remainder'
  )
  assert.strictEqual(store.pending[70].metadata.client_event_id, 'new-during-flush')
  assert.strictEqual(
    store.pending.some(function (event) { return event.metadata.client_event_id === 'event-0' }),
    false,
    'confirmed first-batch events must not be restored'
  )

  console.log('event batch flush checks passed')
}

run().catch(function (err) {
  console.error(err)
  process.exitCode = 1
})
