const assert = require('assert')
const stream = require('../api/stream')

function bytes(value) {
  return Uint8Array.from(Buffer.from(value, 'utf8'))
}

function decodeOneByteAtATime(value, options) {
  const decoder = stream._createUtf8StreamDecoder(options)
  const input = bytes(value)
  let output = ''
  for (let i = 0; i < input.length; i++) {
    output += decoder.write(input.slice(i, i + 1))
  }
  output += decoder.end()
  return output
}

const sample = '半坡中文分片🙂𠮷，保持完整。'
assert.strictEqual(decodeOneByteAtATime(sample), sample, 'TextDecoder streaming mode should preserve split UTF-8 code points')
assert.strictEqual(
  decodeOneByteAtATime(sample, { forceManual: true }),
  sample,
  'manual fallback should carry incomplete UTF-8 bytes across chunks'
)

const eventText = 'data: ' + JSON.stringify({ event: 'chunk', data: { content: '中文🙂' } }) + '\n\n'
const decoder = stream._createUtf8StreamDecoder({ forceManual: true })
const encoded = bytes(eventText)
let rolling = ''
let parsed = []
for (let i = 0; i < encoded.length; i++) {
  rolling += decoder.write(encoded.slice(i, i + 1))
  const result = stream._flushBuffer(rolling)
  rolling = result.remaining
  parsed = parsed.concat(result.events)
}
rolling += decoder.end()
if (rolling) {
  const finalResult = stream._flushBuffer(rolling)
  parsed = parsed.concat(finalResult.events)
}
assert.strictEqual(parsed.length, 1, 'split SSE JSON should produce one event')
assert.strictEqual(parsed[0].data.content, '中文🙂')

let requestOptions = null
let chunkReceiver = null
global.wx = {
  getStorageSync: function () { return '' },
  setStorageSync: function () {},
  removeStorageSync: function () {},
  request: function (options) {
    requestOptions = options
    return {
      onChunkReceived: function (handler) { chunkReceiver = handler },
      abort: function () {},
    }
  },
}

function exactArrayBuffer(value) {
  const input = bytes(value)
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
}

function openStream(callbacks) {
  requestOptions = null
  chunkReceiver = null
  stream.streamRequest(Object.assign({ path: '/fixture', data: {} }, callbacks || {}))
  assert.ok(requestOptions && chunkReceiver, 'streamRequest should register a chunk listener')
}

let donePayload = null
let streamError = null
openStream({
  onDone: function (payload) { donePayload = payload },
  onError: function (error) { streamError = error },
})
const completeStream =
  'data: ' + JSON.stringify({ event: 'chunk', data: { content: '完整中文🙂' } }) + '\r\n\r\n' +
  'data: ' + JSON.stringify({ event: 'done', trace_id: 'trace-1', state_version: 9 }) + '\r\n\r\n'
const completeBytes = bytes(completeStream)
for (let i = 0; i < completeBytes.length; i++) {
  chunkReceiver({ data: completeBytes.slice(i, i + 1).buffer })
}
requestOptions.success({ statusCode: 200, data: null })
assert.strictEqual(streamError, null)
assert.strictEqual(donePayload.trace_id, 'trace-1', 'one-byte CRLF/UTF-8 chunks should reach done')
assert.strictEqual(donePayload.state_version, 9, 'done payload must preserve backend OCC state_version')

donePayload = null
streamError = null
openStream({
  onDone: function (payload) { donePayload = payload },
  onError: function (error) { streamError = error },
})
chunkReceiver({
  data: exactArrayBuffer('data: ' + JSON.stringify({ event: 'chunk', data: { content: '未完成' } }) + '\n\n'),
})
requestOptions.success({ statusCode: 200, data: null })
assert.strictEqual(donePayload, null)
assert.strictEqual(streamError.code, 'STREAM_INCOMPLETE', '2xx close without done must release the page from streaming state')

let emittedChunks = []
donePayload = null
streamError = null
openStream({
  onChunk: function (text) { emittedChunks.push(text) },
  onDone: function (payload) { donePayload = payload },
  onError: function (error) { streamError = error },
})
const hybridChunkEvent = 'data: ' + JSON.stringify({ event: 'chunk', data: { content: '混合交付正文' } }) + '\n\n'
const hybridDoneEvent = 'data: ' + JSON.stringify({ event: 'done', trace_id: 'hybrid-terminal' }) + '\n\n'
chunkReceiver({ data: exactArrayBuffer(hybridChunkEvent) })
requestOptions.success({
  statusCode: 200,
  data: exactArrayBuffer(hybridChunkEvent + hybridDoneEvent),
})
assert.strictEqual(streamError, null)
assert.strictEqual(donePayload.trace_id, 'hybrid-terminal', 'success.data must supply a terminal event after content chunks')
assert.deepStrictEqual(emittedChunks, ['混合交付正文'], 'a replayed success body must not duplicate content chunks')

emittedChunks = []
donePayload = null
streamError = null
openStream({
  onChunk: function (text) { emittedChunks.push(text) },
  onDone: function (payload) { donePayload = payload },
  onError: function (error) { streamError = error },
})
chunkReceiver({ data: new ArrayBuffer(0) })
requestOptions.success({
  statusCode: 200,
  data: exactArrayBuffer(
    'data: ' + JSON.stringify({ event: 'chunk', data: { content: '空分片后的正文' } }) + '\n\n' +
    'data: ' + JSON.stringify({ event: 'done', trace_id: 'empty-chunk-success' }) + '\n\n'
  ),
})
assert.strictEqual(streamError, null)
assert.strictEqual(donePayload.trace_id, 'empty-chunk-success', 'an empty chunk callback must not hide the final success body')
assert.deepStrictEqual(emittedChunks, ['空分片后的正文'])

donePayload = null
streamError = null
openStream({
  onDone: function (payload) { donePayload = payload },
  onError: function (error) { streamError = error },
})
requestOptions.success({
  statusCode: 200,
  data: exactArrayBuffer(
    'data: ' + JSON.stringify({ event: 'done', trace_id: 'success-body-only' }) + '\n\n'
  ),
})
assert.strictEqual(streamError, null)
assert.strictEqual(donePayload.trace_id, 'success-body-only', 'final success payload should work when no chunk callback fires')

console.log('stream UTF-8 chunk checks passed')
