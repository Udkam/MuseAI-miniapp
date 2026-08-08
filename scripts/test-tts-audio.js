const assert = require('assert')

const memory = {}
const writes = []
const toasts = []
const audioContexts = []
const warnings = []
let pageConfig = null
let audioPlan = []

function arrayBufferFromBase64(value) {
  const buffer = Buffer.from(String(value || ''), 'base64')
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function makeAudioContext(plan) {
  const options = plan || {}
  const handlers = {}
  const order = []
  let srcValue = ''
  const ctx = {
    obeyMuteSwitch: true,
    handlers: handlers,
    order: order,
    playCalls: 0,
    destroyed: false,
    stopped: false,
    onError: function (handler) { order.push('onError'); handlers.error = handler },
    onCanplay: function (handler) { order.push('onCanplay'); handlers.canplay = handler },
    onPlay: function (handler) { order.push('onPlay'); handlers.play = handler },
    onEnded: function (handler) { order.push('onEnded'); handlers.ended = handler },
    onStop: function (handler) { order.push('onStop'); handlers.stop = handler },
    play: function () {
      this.playCalls += 1
      order.push('play#' + this.playCalls)
      if (options.throwOnPlay === this.playCalls) throw new Error('play threw')
      if (options.emitPlayOnCall === this.playCalls && handlers.play) handlers.play()
    },
    stop: function () {
      this.stopped = true
      order.push('stop')
      if (options.stopEmitsEvent && handlers.stop) handlers.stop()
    },
    destroy: function () {
      this.destroyed = true
      order.push('destroy')
      if (options.destroyEmitsStop && handlers.stop) handlers.stop()
    },
  }
  Object.defineProperty(ctx, 'src', {
    configurable: true,
    get: function () { return srcValue },
    set: function (value) {
      order.push('src')
      srcValue = value
      if (options.canplayOnSrc && handlers.canplay) handlers.canplay()
    },
  })
  return ctx
}

global.wx = {
  env: { USER_DATA_PATH: '/mock-user-data' },
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
  base64ToArrayBuffer: arrayBufferFromBase64,
  getFileSystemManager: function () {
    return {
      writeFile: function (options) {
        writes.push(options)
        options.success()
      },
    }
  },
  createInnerAudioContext: function () {
    const ctx = makeAudioContext(audioPlan.shift())
    audioContexts.push(ctx)
    return ctx
  },
  showToast: function (options) { toasts.push(options) },
}
global.Page = function (config) { pageConfig = config }

const ttsAudio = require('../utils/tts-audio')
require('../pages/tour/tour')

function makePage(messageIds) {
  const ids = messageIds || ['m1']
  return Object.assign({}, pageConfig, {
    data: Object.assign({}, JSON.parse(JSON.stringify(pageConfig.data || {})), {
      messages: ids.map(function (id) {
        return { id: id, role: 'assistant', content: '测试语音', ttsStatus: 'idle' }
      }),
    }),
    _ttsAudioCtx: null,
    _ttsAudioCache: {},
    _ttsQueue: null,
    _ttsRequestSeq: 0,
    _ttsStartTimer: null,
    _testTtsStartCallback: null,
    _armTtsStartTimer: function (callback) {
      this._ttsStartTimer = { mock: true }
      this._testTtsStartCallback = callback
    },
    _clearTtsStartTimer: function () {
      this._ttsStartTimer = null
    },
    setData: function (patch, callback) {
      this.data = Object.assign({}, this.data, patch || {})
      if (callback) callback()
    },
  })
}

function messageStatus(page, id) {
  const item = page.data.messages.find(function (message) { return String(message.id) === String(id) })
  return item && item.ttsStatus
}

function wavFromChunks(chunks) {
  const bodyParts = []
  chunks.forEach(function (chunk) {
    const data = Buffer.from(chunk.data || [])
    const header = Buffer.alloc(8)
    header.write(String(chunk.id || '').slice(0, 4).padEnd(4, ' '), 0, 4, 'ascii')
    header.writeUInt32LE(chunk.declaredSize === undefined ? data.length : chunk.declaredSize, 4)
    bodyParts.push(header, data)
    if (data.length % 2) bodyParts.push(Buffer.from([0]))
  })
  const body = Buffer.concat(bodyParts)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WAVE', 8, 'ascii')
  return Buffer.concat([header, body])
}

function pcmFmtChunk() {
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0)
  fmt.writeUInt16LE(1, 2)
  fmt.writeUInt32LE(24000, 4)
  fmt.writeUInt32LE(48000, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)
  return fmt
}

function minimalPcmWav() {
  return wavFromChunks([
    { id: 'fmt ', data: pcmFmtChunk() },
    { id: 'data', data: Buffer.from([0, 0]) },
  ])
}

function minimalWavBase64() {
  return minimalPcmWav().toString('base64')
}

async function run() {
  const originalWarn = console.warn
  console.warn = function () { warnings.push(Array.prototype.slice.call(arguments)) }

  try {
    // WAV validation is independently testable and rejects before touching FS.
    const wav = arrayBufferFromBase64(minimalWavBase64())
    assert.strictEqual(ttsAudio.validateWavArrayBuffer(wav), wav)
    assert.throws(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(Buffer.from('not a wav').toString('base64')))
    }, function (err) {
      return err && err.code === 'INVALID_WAV_AUDIO' && err.stage === 'validate_wav'
    })

    const oddPaddedWav = wavFromChunks([
      { id: 'JUNK', data: Buffer.from([7]) },
      { id: 'fmt ', data: pcmFmtChunk() },
      { id: 'data', data: Buffer.from([0, 0]) },
    ])
    assert.doesNotThrow(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(oddPaddedWav.toString('base64')))
    }, 'odd-sized chunks must advance across their RIFF padding byte')

    const missingFmtWav = wavFromChunks([
      { id: 'JUNK', data: Buffer.alloc(24) },
      { id: 'data', data: Buffer.from([0, 0]) },
    ])
    assert.throws(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(missingFmtWav.toString('base64')))
    }, function (err) { return err && err.code === 'INVALID_WAV_AUDIO' && /fmt/.test(err.message) })

    const emptyDataWav = wavFromChunks([
      { id: 'fmt ', data: pcmFmtChunk() },
      { id: 'data', data: Buffer.alloc(0) },
    ])
    assert.throws(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(emptyDataWav.toString('base64')))
    }, function (err) { return err && err.code === 'INVALID_WAV_AUDIO' && /data/.test(err.message) })

    const outOfBoundsChunkWav = Buffer.from(minimalPcmWav())
    outOfBoundsChunkWav.writeUInt32LE(0xffffffff, 40)
    assert.throws(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(outOfBoundsChunkWav.toString('base64')))
    }, function (err) { return err && err.code === 'INVALID_WAV_AUDIO' && /exceeds/.test(err.message) })

    const outOfBoundsRiffWav = Buffer.from(minimalPcmWav())
    outOfBoundsRiffWav.writeUInt32LE(outOfBoundsRiffWav.length + 100, 4)
    assert.throws(function () {
      ttsAudio.validateWavArrayBuffer(arrayBufferFromBase64(outOfBoundsRiffWav.toString('base64')))
    }, function (err) { return err && err.code === 'INVALID_WAV_AUDIO' && /RIFF declared range/.test(err.message) })

    let page = makePage()
    writes.length = 0
    await assert.rejects(
      page._writeBase64AudioFile('invalid', missingFmtWav.toString('base64'), 'wav'),
      function (err) { return err && err.code === 'INVALID_WAV_AUDIO' }
    )
    assert.strictEqual(writes.length, 0, 'invalid WAV data must never be written')
    const validPath = await page._writeBase64AudioFile('valid', minimalWavBase64(), 'wav')
    assert.strictEqual(writes.length, 1, 'valid WAV data should be written exactly once')
    assert.ok(/\.wav$/.test(validPath))

    // A timeout callback that was already queued before clearTimeout must not
    // erase or invoke the replacement playback's watchdog.
    const originalSetTimeout = global.setTimeout
    const originalClearTimeout = global.clearTimeout
    const scheduledTimers = []
    try {
      global.setTimeout = function (callback) {
        const timer = { callback: callback, cleared: false }
        scheduledTimers.push(timer)
        return timer
      }
      global.clearTimeout = function (timer) { timer.cleared = true }
      const timerPage = makePage()
      timerPage._armTtsStartTimer = pageConfig._armTtsStartTimer
      timerPage._clearTtsStartTimer = pageConfig._clearTtsStartTimer
      let oldTimeouts = 0
      let currentTimeouts = 0
      timerPage._armTtsStartTimer(function () { oldTimeouts += 1 })
      const oldTimer = scheduledTimers[0]
      timerPage._armTtsStartTimer(function () { currentTimeouts += 1 })
      const currentTimer = scheduledTimers[1]
      oldTimer.callback()
      assert.strictEqual(oldTimeouts, 0)
      assert.strictEqual(timerPage._ttsStartTimer, currentTimer)
      currentTimer.callback()
      assert.strictEqual(currentTimeouts, 1)
      assert.strictEqual(timerPage._ttsStartTimer, null)
    } finally {
      global.setTimeout = originalSetTimeout
      global.clearTimeout = originalClearTimeout
    }

    // All callbacks must precede src/play. The direct play may be silently
    // ignored; canplay gets one bounded retry and only onPlay marks playing.
    audioContexts.length = 0
    audioPlan = [{ emitPlayOnCall: 2 }]
    page = makePage(['m1'])
    page._ttsRequestSeq = 7
    page._ttsQueue = {
      messageId: 'm1', cacheKey: 'm1', segments: ['第一段'], paths: ['/mock/a.wav'], index: 0, seq: 7, preloading: {},
    }
    page._playTtsFile('m1', '/mock/a.wav', { queued: true, seq: 7 })
    const lifecycleCtx = audioContexts[0]
    assert.deepStrictEqual(lifecycleCtx.order.slice(0, 7), [
      'onError', 'onCanplay', 'onPlay', 'onEnded', 'onStop', 'src', 'play#1',
    ])
    assert.strictEqual(lifecycleCtx.obeyMuteSwitch, false)
    assert.strictEqual(lifecycleCtx.playCalls, 1)
    assert.strictEqual(messageStatus(page, 'm1'), 'loading', 'play() request alone must not mark playing')
    assert.deepStrictEqual(page.data.ttsState, {
      playingMessageId: null, loadingMessageId: 'm1', audioPath: '/mock/a.wav',
    })
    lifecycleCtx.handlers.canplay()
    assert.strictEqual(lifecycleCtx.playCalls, 2, 'canplay should retry one silently ignored early play')
    assert.strictEqual(messageStatus(page, 'm1'), 'playing', 'only the actual onPlay callback marks playing')
    assert.strictEqual(page.data.ttsState.playingMessageId, 'm1')
    lifecycleCtx.handlers.canplay()
    assert.strictEqual(lifecycleCtx.playCalls, 2, 'canplay must never re-enter play after playback starts')

    // Playback errors reset loading/playing state, invalidate the queue and log
    // structured stage + errCode + errMsg while keeping the toast concise.
    warnings.length = 0
    toasts.length = 0
    lifecycleCtx.handlers.error({ errCode: 10003, errMsg: 'unsupported audio format' })
    assert.deepStrictEqual(page.data.ttsState, {
      playingMessageId: null, loadingMessageId: null, audioPath: null,
    })
    assert.strictEqual(messageStatus(page, 'm1'), 'idle')
    assert.strictEqual(page._ttsQueue, null)
    assert.strictEqual(page._ttsAudioCtx, null)
    assert.strictEqual(lifecycleCtx.destroyed, true)
    assert.deepStrictEqual(warnings[0][1], {
      stage: 'inner_audio_error', errCode: 10003, errMsg: 'unsupported audio format',
    })
    assert.strictEqual(toasts[0].title, '语音播放失败')

    // Some runtimes synchronously emit canplay from the src setter. Preserve
    // direct-play-first semantics, then consume that signal as one bounded
    // retry instead of losing it or recursively calling play.
    audioContexts.length = 0
    audioPlan = [{ canplayOnSrc: true }]
    page = makePage(['sync-canplay'])
    page._ttsRequestSeq = 8
    page._ttsQueue = {
      messageId: 'sync-canplay', cacheKey: 'sync-canplay', segments: ['同步'], paths: ['/mock/sync.wav'], index: 0, seq: 8, preloading: {},
    }
    page._playTtsFile('sync-canplay', '/mock/sync.wav', { queued: true, seq: 8 })
    const syncCanplayCtx = audioContexts[0]
    assert.deepStrictEqual(syncCanplayCtx.order.slice(-3), ['src', 'play#1', 'play#2'])
    assert.strictEqual(syncCanplayCtx.playCalls, 2)
    syncCanplayCtx.handlers.canplay()
    assert.strictEqual(syncCanplayCtx.playCalls, 2, 'synchronous/repeated canplay must remain capped at two attempts')

    // If both bounded play attempts are silently ignored, the start watchdog
    // converts permanent loading into a visible, structured playback failure.
    warnings.length = 0
    toasts.length = 0
    audioContexts.length = 0
    audioPlan = [{}]
    page = makePage(['silent'])
    page._ttsRequestSeq = 12
    page._ttsQueue = {
      messageId: 'silent', cacheKey: 'silent', segments: ['静默'], paths: ['/mock/silent.wav'], index: 0, seq: 12, preloading: {},
    }
    page._playTtsFile('silent', '/mock/silent.wav', { queued: true, seq: 12 })
    const silentCtx = audioContexts[0]
    silentCtx.handlers.canplay()
    assert.strictEqual(silentCtx.playCalls, 2)
    assert.strictEqual(messageStatus(page, 'silent'), 'loading')
    assert.strictEqual(typeof page._testTtsStartCallback, 'function')
    page._testTtsStartCallback()
    assert.strictEqual(messageStatus(page, 'silent'), 'idle')
    assert.strictEqual(page._ttsAudioCtx, null)
    assert.strictEqual(page._ttsQueue, null)
    assert.deepStrictEqual(warnings[0][1], {
      stage: 'play_start_timeout',
      errCode: 'PLAY_START_TIMEOUT',
      errMsg: 'InnerAudioContext did not emit onPlay within 5000 ms',
    })
    assert.strictEqual(toasts[0].title, '语音播放失败')

    // A destroyed context may synchronously or belatedly fire callbacks. Its
    // identity and sequence can no longer alter the replacement playback.
    warnings.length = 0
    toasts.length = 0
    audioContexts.length = 0
    audioPlan = [{ destroyEmitsStop: true }, {}]
    page = makePage(['old', 'new'])
    page._ttsRequestSeq = 20
    const oldQueue = {
      messageId: 'old', cacheKey: 'old', segments: ['旧'], paths: ['/mock/old.wav'], index: 0, seq: 20, preloading: {},
    }
    page._ttsQueue = oldQueue
    page._playTtsFile('old', '/mock/old.wav', { queued: true, seq: 20 })
    const oldCtx = audioContexts[0]
    page._ttsRequestSeq = 21
    const newQueue = {
      messageId: 'new', cacheKey: 'new', segments: ['新'], paths: ['/mock/new.wav'], index: 0, seq: 21, preloading: {},
    }
    page._ttsQueue = newQueue
    page._playTtsFile('new', '/mock/new.wav', { queued: true, seq: 21 })
    const newCtx = audioContexts[1]
    assert.strictEqual(page._ttsAudioCtx, newCtx)
    assert.strictEqual(messageStatus(page, 'new'), 'loading')
    oldCtx.handlers.play()
    oldCtx.handlers.error({ errCode: 9, errMsg: 'late old error' })
    oldCtx.handlers.ended()
    oldCtx.handlers.stop()
    assert.strictEqual(page._ttsAudioCtx, newCtx)
    assert.strictEqual(page._ttsQueue, newQueue)
    assert.strictEqual(page._ttsRequestSeq, 21)
    assert.strictEqual(messageStatus(page, 'new'), 'loading')
    assert.strictEqual(newCtx.destroyed, false)
    assert.strictEqual(warnings.length, 0, 'stale errors must not pollute current playback logs')
    assert.strictEqual(toasts.length, 0, 'stale errors must not show current UI failures')

    // Successful segment completion advances through the existing queue and
    // resets only after the final segment ends.
    audioContexts.length = 0
    audioPlan = [{ emitPlayOnCall: 1 }, { emitPlayOnCall: 1 }]
    page = makePage(['queue'])
    page._ttsRequestSeq = 30
    const queue = {
      messageId: 'queue', cacheKey: 'queue', segments: ['一', '二'], paths: ['/mock/one.wav', '/mock/two.wav'], index: 0, seq: 30, preloading: {},
    }
    page._ttsQueue = queue
    page._playTtsQueueIndex(0)
    assert.strictEqual(messageStatus(page, 'queue'), 'playing')
    audioContexts[0].handlers.ended()
    assert.strictEqual(audioContexts.length, 2)
    assert.strictEqual(queue.index, 1)
    assert.strictEqual(page._ttsAudioCtx, audioContexts[1])
    assert.strictEqual(messageStatus(page, 'queue'), 'playing')
    audioContexts[1].handlers.ended()
    assert.strictEqual(page._ttsQueue, null)
    assert.strictEqual(page._ttsAudioCtx, null)
    assert.strictEqual(messageStatus(page, 'queue'), 'idle')

    console.log('tts audio validation/lifecycle tests passed')
  } finally {
    console.warn = originalWarn
  }
}

run().catch(function (err) {
  console.error(err)
  process.exit(1)
})
