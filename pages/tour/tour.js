const api       = require('../../api/index')
const chatStore = require('../../store/chat')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const tourSession = require('../../utils/tour-session')
const eventFlush = require('../../utils/event-flush')
const ttsAudio = require('../../utils/tts-audio')
const hallData = require('../../utils/hall-data')

const TOUR_TTS_STYLE = '请用清晰、自然、亲切的博物馆导览语气朗读；语速稍快，比常规讲解更利落，句间停顿短一些，尾音不要拖长。不要额外补充文字，只朗读给定内容。'
const TTS_SEGMENT_MAX_CHARS = 72
const TTS_SEGMENT_MAX_COUNT = 10
const TTS_PLAY_START_TIMEOUT_MS = 5000
const STREAM_FLUSH_INTERVAL_MS = 80
function makeClientEventId(prefix) {
  return String(Date.now()) + '-' + (prefix || 'evt') + '-' + Math.random().toString(36).slice(2, 10)
}

function assistantClientEventId(questionClientEventId) {
  var questionId = String(questionClientEventId || '').trim()
  return questionId
    ? questionId.slice(0, 110) + ':assistant'
    : makeClientEventId('assistant')
}

function localExhibitIdFromName(name) {
  return 'local-' + String(name || 'unknown').slice(0, 94)
}

// Safe-area inset is device-constant; cache it across page entries so we don't
// pay the synchronous system-info bridge cost during each slide-in transition.
var _safeAreaBottomCache = null

function cleanHallGuideText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 4000)
}

function finishHallGuideSentence(value) {
  var text = cleanHallGuideText(value, 4000)
  if (!text) return ''
  return /[。！？；]$/.test(text) ? text : text + '。'
}

function singleHallGuideClause(value) {
  return cleanHallGuideText(value, 255)
    .replace(/[。！？!?；;]+/g, '，')
    .replace(/，{2,}/g, '，')
    .replace(/[，,：:、；;\s]+$/, '')
}

function buildWelcomeMessage(hallSlug, hallName, hallDescription, hallCardDescription) {
  var name = cleanHallGuideText(hallName, 255)
  var summary = hallCardDescription || hallData.resolveHallCardDescription(
    { description: hallDescription },
    hallSlug,
    hallDescription
  )
  summary = singleHallGuideClause(summary)
  var first = summary
    ? (name
        ? '欢迎来到' + name + '，' + (/^这里/.test(summary) ? summary : '这里' + summary)
        : summary)
    : (name ? '欢迎来到' + name : '欢迎进入展厅')
  var start = '先选一件展品或一处遗迹，告诉我你注意到的一个细节。'
  return finishHallGuideSentence(first) + '\n' + finishHallGuideSentence(start)
}

function refreshLegacyWelcome(messages, welcomeMessage) {
  var list = Array.isArray(messages) ? messages.slice() : []
  if (!list.length) {
    return [{ id: 1, role: 'assistant', content: welcomeMessage, ttsStatus: 'idle' }]
  }
  var first = list[0]
  if (
    first && first.role === 'assistant' &&
    String(first.content || '').indexOf('让 MuseAI 帮你整理观察重点') >= 0
  ) {
    list[0] = Object.assign({}, first, { content: welcomeMessage, ttsStatus: 'idle' })
  }
  return list
}

function hallChatSignature(messages) {
  return (Array.isArray(messages) ? messages : []).map(function (message) {
    return [message && message.role || '', message && message.content || ''].join(':')
  }).join('\n')
}

function hallMessagesFromResumePayload(payload, hallSlug) {
  if (!payload || !hallSlug) return null
  var resume = payload.resume_state && typeof payload.resume_state === 'object'
    ? payload.resume_state
    : payload
  var histories = payload.hall_chat_history || resume.hall_chat_history
  if (Array.isArray(histories)) {
    for (var i = 0; i < histories.length; i++) {
      var record = histories[i]
      if (!record || banpoHalls.normalizeHallToSlug(record.hall) !== hallSlug) continue
      return Array.isArray(record.messages) ? record.messages : []
    }
    return null
  }
  if (!histories || typeof histories !== 'object') return null
  var keys = Object.keys(histories)
  for (var j = 0; j < keys.length; j++) {
    if (banpoHalls.normalizeHallToSlug(keys[j]) !== hallSlug) continue
    var value = histories[keys[j]]
    return Array.isArray(value) ? value : (value && Array.isArray(value.messages) ? value.messages : [])
  }
  return null
}

function plainTextForTts(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, function (block) {
      return block.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '')
    })
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitTextForTts(content) {
  var text = plainTextForTts(content)
    .replace(/\s+/g, ' ')
    .replace(/([。！？；])\s*/g, '$1\n')
    .trim()
  if (!text) return []

  var lines = text.split(/\n+/).map(function (item) { return item.trim() }).filter(Boolean)
  var out = []
  var cur = ''

  lines.forEach(function (line) {
    if ((cur + line).length <= TTS_SEGMENT_MAX_CHARS) {
      cur = cur ? cur + ' ' + line : line
      return
    }
    if (cur) out.push(cur)
    while (line.length > TTS_SEGMENT_MAX_CHARS) {
      out.push(line.slice(0, TTS_SEGMENT_MAX_CHARS))
      line = line.slice(TTS_SEGMENT_MAX_CHARS)
    }
    cur = line
  })
  if (cur) out.push(cur)
  return out.slice(0, TTS_SEGMENT_MAX_COUNT)
}

function writeAscii(view, offset, text) {
  for (var i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

function pcm16ToWavArrayBuffer(pcmBuffer) {
  var sampleRate = 24000
  var channels = 1
  var bitsPerSample = 16
  var pcmBytes = new Uint8Array(pcmBuffer)
  var wavBuffer = new ArrayBuffer(44 + pcmBytes.byteLength)
  var view = new DataView(wavBuffer)
  var wavBytes = new Uint8Array(wavBuffer)
  var byteRate = sampleRate * channels * bitsPerSample / 8
  var blockAlign = channels * bitsPerSample / 8

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcmBytes.byteLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, pcmBytes.byteLength, true)
  wavBytes.set(pcmBytes, 44)
  return wavBuffer
}

function ttsErrorDetail(stage, err) {
  var source = err || {}
  var errCode = source.errCode
  if (errCode === undefined || errCode === null || errCode === '') errCode = source.code || 'UNKNOWN_TTS_ERROR'
  return {
    stage: stage || source.stage || 'unknown',
    errCode: errCode,
    errMsg: source.errMsg || source.message || String(err || 'unknown TTS error'),
  }
}

Page({
  data: {
    hallName:         '展厅',
    messages:         [],
    streamingContent: '',    // live text — throttled setData, NOT stored in messages[]
    isThinking:       false, // waiting for first chunk
    isStreaming:      false, // receiving chunks
    ragSteps:         [],    // RAG pipeline progress (from onEvent)
    inputText:        '',
    sessionId:        null,
    scrollTarget:     '',    // toggled by _scrollToBottom() after first send
    loadingHint:      '',    // progressive hint text while waiting for first chunk
    currentExhibit:   null,  // set by exhibit-detail goDeeper; null = general tour mode
    guideSuggestions: [],   // array of { id, type, icon, title, actionType, payload }
    showSuggestions:  false,
    keyboardVisible:  false,
    inputPanelStyle: '',
    suggestionsPanelStyle: '',
    messageListStyle: '',
    topbarStyle: '',
    topbarRowStyle: '',
    ttsEnabled:       true,
    ttsState: {
      playingMessageId: null,
      loadingMessageId: null,
      audioPath: null,
    },
  },

  // ── Instance vars (non-reactive) ──────────────────────────────────────────
  _streamTask:    null,   // active RequestTask — call .abort() to cancel
  _scrollPending: false,
  _finalScrollPending: false,
  _perf:          null,   // { sendAt, streamStartAt, firstChunkAt, doneAt }
  _hintTimer3:    null,   // upgrades loadingHint text at 3 s
  _hintTimer8:    null,   // upgrades loadingHint text at 8 s
  _chunkBuffer:   '',     // chunk text accumulator pending the next throttled flush
  _streamText:    '',     // local streaming accumulator; avoids reading stale setData state

  _buildWelcomeMessage: buildWelcomeMessage,
  _assistantClientEventId: assistantClientEventId,

  _applyStreamStateVersion: function (payload) {
    var nextVersion = Number(payload && payload.state_version)
    if (!isFinite(nextVersion) || nextVersion < 1 || Math.floor(nextVersion) !== nextVersion) return null
    var currentVersion = Number(tourStore.getTourState().serverStateVersion)
    if (!isFinite(currentVersion) || nextVersion >= currentVersion) {
      tourStore.updateTourState({ serverStateVersion: nextVersion })
      return nextVersion
    }
    return currentVersion
  },
  _flushTimer:    null,   // timer ID for scheduled _chunkBuffer flush
  _loadedAt:      0,      // timestamp (ms) of last onLoad/onShow — ghost-tap guard
  _suggestionSeq: 0,      // prevents stale Phase-2 suggestions from overwriting the next hall/exhibit
  _ttsAudioCtx:   null,
  _ttsAudioCache: null,
  _ttsQueue:      null,
  _ttsRequestSeq: 0,
  _ttsStartTimer: null,
  _keyboardHandler: null,
  _safeAreaBottom: 0,
  _keyboardLift: 0,
  _sessionRecoveryRetrying: false,
  _suggestionFetchTimer: null,
  _suggestionShowTimer: null,
  _suggestionLoadingSeq: 0,
  _guideSuggestionsSig: '',
  _postEnterTimer: null,
  _scrollPulseTimers: null,
  _retryQuestionEvent: null,
  _contextSyncing: false,
  _skipContextSyncOnce: false,
  _pageHallSlug: null,
  _pageHallName: '',
  _pageHallDescription: '',
  _pageHallFocus: '',
  _pageLocalTourId: null,
  _pageOwnedChatSig: '',
  _renderedHallSlug: null,
  _exhibitContextActive: false,

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onLoad: function (options) {
    this._loadedAt = Date.now()
    var self = this
    var state   = tourStore.getTourState()
    tourStore.markCurrentPage('pages/tour/tour', options || null)
    var fromExhibitDetail = !!(options && (options.directFromDetail === '1' || options.exhibit))
    this._exhibitContextActive = fromExhibitDetail
    var exhibit = fromExhibitDetail ? (state.currentExhibit || null) : null
    var exhibitNameFromQuery = options && options.exhibit ? decodeURIComponent(options.exhibit) : ''
    var ttsPrefs = tourStore.getTtsPrefs()
    var pendingDeepDiveExhibit = options && options.directFromDetail === '1' && tourStore.consumePendingDetailExhibit
      ? tourStore.consumePendingDetailExhibit(exhibitNameFromQuery)
      : null
    if (pendingDeepDiveExhibit) {
      exhibit = pendingDeepDiveExhibit
      this._exhibitContextActive = true
    } else if (!fromExhibitDetail && tourStore.consumePendingDetailExhibit) {
      // A pending detail payload is page-navigation handoff data, not durable
      // hall state. Drain leftovers on every normal/resume hall entry so onShow
      // cannot resurrect the previous exhibit discussion.
      tourStore.consumePendingDetailExhibit()
    }
    if (!this._ttsAudioCache) this._ttsAudioCache = {}
    this._initCustomTopbar()
    this._initSafeArea()
    // Only reset chat on a fresh tour entry (hall page → tour).
    // When coming from exhibit-detail goDeeper(), options.exhibit is set —
    // preserve history so the user can still ask "我们刚才在讨论什么".
    var resumeEntry = !!(options && options.resume === '1')
    var freshEntry = !fromExhibitDetail && !resumeEntry
    if (freshEntry) {
      chatStore.resetChat()
    }

    if (!exhibit && exhibitNameFromQuery) {
      var fallbackHall = options.hall ? decodeURIComponent(options.hall) : (state.currentHall || '')
      tourStore.setCurrentExhibit({
        id: localExhibitIdFromName(exhibitNameFromQuery),
        name: exhibitNameFromQuery,
        hall: fallbackHall ? banpoHalls.normalizeHallToSlug(fallbackHall) : '',
        hallDisplay: fallbackHall ? banpoHalls.getHallDisplayName(fallbackHall) : '',
        objectKind: '展品',
      })
      exhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : tourStore.getTourState().currentExhibit || null
    }

    // URL param takes priority; fallback to saved canonical hall slug.
    var hallFromId = options.hallId ? banpoHalls.getHall(options.hallId) : null
    var hallNameFromQuery = options.hallName ? decodeURIComponent(options.hallName) : ''
    var rawHall = hallFromId
      ? hallFromId.backendSlug
      : (options.hall ? decodeURIComponent(options.hall) : (tourStore.getSavedCurrentHall() || null))
    var hallSlug = rawHall ? banpoHalls.normalizeHallToSlug(rawHall) : null
    var stateHallSlug = state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : null
    var hallName = hallNameFromQuery || (stateHallSlug === hallSlug ? state.currentHallName : '') ||
      (hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : null)
    var hallDescription = stateHallSlug === hallSlug ? (state.currentHallDescription || '') : ''
    var hallCardDescription = stateHallSlug === hallSlug ? (state.currentHallCardDescription || '') : ''
    var hallFocus = stateHallSlug === hallSlug ? (state.currentHallFocus || '') : ''
    this._pageHallSlug = hallSlug
    this._pageHallName = hallName || this.data.hallName
    this._pageHallDescription = hallDescription
    this._pageHallCardDescription = hallCardDescription
    this._pageHallFocus = hallFocus
    this._pageLocalTourId = state.localTourId || null
    this._renderedHallSlug = hallSlug

    if (!fromExhibitDetail) {
      if (tourStore.clearCurrentExhibit) {
        tourStore.clearCurrentExhibit()
      }
      exhibit = null
    } else if (exhibit && hallSlug && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit(exhibit, hallSlug)
      exhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : exhibit
    } else if (!freshEntry && exhibitNameFromQuery && hallSlug && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit({
        id: localExhibitIdFromName(exhibitNameFromQuery),
        name: exhibitNameFromQuery,
        hall: hallSlug,
        hallDisplay: banpoHalls.getHallDisplayName(hallSlug),
        objectKind: '展品',
      }, hallSlug)
      exhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : null
    }

    var patch = { sessionId: state.sessionId || null, currentExhibit: exhibit }
    if (hallName) {
      wx.setNavigationBarTitle({ title: hallName })
      tourStore.updateTourState({ currentHall: hallSlug, currentHallName: hallName }, { deferPersist: true })
      patch.hallName = hallName
    } else {
      hallName = this.data.hallName
    }
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    if (freshEntry) {
      var cachedMessages = hallSlug ? tourStore.getHallChatMessages(hallSlug) : []
      var welcomeMessage = buildWelcomeMessage(hallSlug, hallName, hallDescription, hallCardDescription)
      var messagesForPage = refreshLegacyWelcome(cachedMessages, welcomeMessage)
      chatStore.setMessages(messagesForPage)
      patch.messages = messagesForPage
      if (hallSlug && hallChatSignature(messagesForPage) !== hallChatSignature(cachedMessages)) {
        tourStore.saveHallChatMessages(hallSlug, messagesForPage, { defer: true })
      }
    } else {
      var cachedDeepDiveMessages = hallSlug ? tourStore.getHallChatMessages(hallSlug) : []
      if (cachedDeepDiveMessages.length) {
        var refreshedDeepDiveMessages = refreshLegacyWelcome(
          cachedDeepDiveMessages,
          buildWelcomeMessage(hallSlug, hallName, hallDescription, hallCardDescription)
        )
        chatStore.setMessages(refreshedDeepDiveMessages)
        patch.messages = refreshedDeepDiveMessages
        if (
          hallSlug &&
          hallChatSignature(refreshedDeepDiveMessages) !== hallChatSignature(cachedDeepDiveMessages)
        ) {
          tourStore.saveHallChatMessages(hallSlug, refreshedDeepDiveMessages, { defer: true })
        }
      } else {
        var storedMessages = !hallSlug ? chatStore.getState().messages : []
        var welcomeForDeepDive = refreshLegacyWelcome(
          storedMessages,
          buildWelcomeMessage(hallSlug, hallName, hallDescription, hallCardDescription)
        )
        chatStore.setMessages(welcomeForDeepDive)
        patch.messages = welcomeForDeepDive
        if (hallSlug) tourStore.saveHallChatMessages(hallSlug, welcomeForDeepDive, { defer: true })
      }
    }
    this._pageOwnedChatSig = hallChatSignature(patch.messages || chatStore.getState().messages)
    patch.ttsEnabled = ttsPrefs.enabled !== false
    var shouldScrollToBottom = !!(patch.messages && patch.messages.length)
    this.setData(patch, function () {
      self._deferPostEnterWork()
      if (shouldScrollToBottom) self._scrollToBottomAfterRestore()
    })
  },

  _applyBackgroundResumeState: function (update) {
    var info = update || {}
    if (info.localTourId && this._pageLocalTourId && info.localTourId !== this._pageLocalTourId) return false
    var hallSlug = this._pageHallSlug
    if (!hallSlug) return false

    var self = this
    var state = tourStore.getTourState()
    var stateHall = state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : null
    var hallName = this._pageHallName || this.data.hallName || banpoHalls.getHallDisplayName(hallSlug)
    if (stateHall === hallSlug && state.currentHallName) {
      hallName = state.currentHallName
      this._pageHallName = hallName
    }

    var payloadMessages = hallMessagesFromResumePayload(info.payload, hallSlug)
    if (payloadMessages && payloadMessages.length) {
      payloadMessages = refreshLegacyWelcome(
        payloadMessages,
        buildWelcomeMessage(
          hallSlug,
          hallName,
          this._pageHallDescription,
          this._pageHallCardDescription
        )
      )
    }
    var ownedMessages = payloadMessages && payloadMessages.length
      ? tourStore.saveHallChatMessages(hallSlug, payloadMessages)
      : tourStore.getHallChatMessages(hallSlug)
    var currentMessages = chatStore.getState().messages || []
    var currentSig = hallChatSignature(currentMessages)
    var canRefreshMessages = (
      !this.data.isThinking && !this.data.isStreaming &&
      (!this._pageOwnedChatSig || currentSig === this._pageOwnedChatSig)
    )
    var patch = {}
    var shouldScroll = false
    if (canRefreshMessages && ownedMessages.length && hallChatSignature(ownedMessages) !== currentSig) {
      chatStore.setMessages(ownedMessages)
      this._pageOwnedChatSig = hallChatSignature(ownedMessages)
      patch.messages = ownedMessages
      shouldScroll = true
    }

    var needsOwnerReassert = stateHall !== hallSlug || state.currentPage !== 'pages/tour/tour'
    if (stateHall !== hallSlug) {
      tourStore.updateTourState({ currentHall: hallSlug, currentHallName: hallName }, { deferPersist: true })
      var pageExhibit = this.data.currentExhibit || null
      if (pageExhibit && tourStore.setCurrentExhibit) {
        tourStore.setCurrentExhibit(pageExhibit, hallSlug)
      } else if (tourStore.clearCurrentExhibit) {
        tourStore.clearCurrentExhibit()
      }
    }
    tourStore.markCurrentPage('pages/tour/tour', {
      hall: hallSlug,
      hallName: hallName || '',
      resume: '1',
    })
    if (needsOwnerReassert) {
      tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    }
    state = tourStore.getTourState()
    if (this.data.sessionId !== state.sessionId) patch.sessionId = state.sessionId || null
    if (hallName && this.data.hallName !== hallName) {
      patch.hallName = hallName
      if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: hallName })
    }
    if (Object.keys(patch).length) {
      this.setData(patch, function () {
        if (shouldScroll) self._scrollToBottomAfterRestore()
      })
    }
    return true
  },

  // Refresh exhibit context when navigating back to this page (also after goDeeper)
  onShow: function () {
    this._loadedAt = Date.now()
    var self = this
    var state = tourStore.getTourState()
    var hallSlug = this._pageHallSlug || (state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : null)
    var hallName = this._pageHallName || (hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : this.data.hallName)
    var stateHallSlug = state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : null
    if (hallSlug && stateHallSlug !== hallSlug) {
      tourStore.updateTourState({ currentHall: hallSlug, currentHallName: hallName }, { deferPersist: true })
      var pageExhibit = this.data.currentExhibit || null
      if (pageExhibit && tourStore.setCurrentExhibit) {
        tourStore.setCurrentExhibit(pageExhibit, hallSlug)
      } else if (tourStore.clearCurrentExhibit) {
        tourStore.clearCurrentExhibit()
      }
      state = tourStore.getTourState()
    }
    tourStore.markCurrentPage('pages/tour/tour', {
      hall: hallSlug || '',
      hallName: hallName || '',
      resume: '1',
    })
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    var ttsPrefs = tourStore.getTtsPrefs()
    var patch = {}
    var pendingDeepDiveExhibit = tourStore.consumePendingDetailExhibit
      ? tourStore.consumePendingDetailExhibit()
      : null
    if (pendingDeepDiveExhibit) {
      this._exhibitContextActive = true
      var pendingHall = pendingDeepDiveExhibit.hall ? banpoHalls.normalizeHallToSlug(pendingDeepDiveExhibit.hall) : hallSlug
      if (pendingHall) {
        hallSlug = pendingHall
        hallName = pendingDeepDiveExhibit.hallDisplay || banpoHalls.getHallDisplayName(hallSlug)
        this._pageHallSlug = hallSlug
        this._pageHallName = hallName
        tourStore.updateTourState({ currentHall: hallSlug, currentHallName: hallName }, { deferPersist: true })
      }
      if (tourStore.setCurrentExhibit) {
        tourStore.setCurrentExhibit(pendingDeepDiveExhibit, hallSlug)
      }
      state = tourStore.getTourState()
    }
    var hallChanged = hallSlug && this._renderedHallSlug !== hallSlug
    var stateExhibit = state.currentExhibit || null
    if (stateExhibit && hallSlug) {
      var stateExhibitHall = stateExhibit.hall ? banpoHalls.normalizeHallToSlug(stateExhibit.hall) : hallSlug
      if (stateExhibitHall && stateExhibitHall !== hallSlug) stateExhibit = null
    }
    var nextExhibit = this._exhibitContextActive
      ? (pendingDeepDiveExhibit || stateExhibit || this.data.currentExhibit || null)
      : null
    if (!this._exhibitContextActive && state.currentExhibit && tourStore.clearCurrentExhibit) {
      tourStore.clearCurrentExhibit()
      state = tourStore.getTourState()
    }
    var nextSessionId = state.sessionId || null
    var nextTtsEnabled = ttsPrefs.enabled !== false
    var shouldScrollToBottom = false
    if (hallChanged) {
      var cachedMessages = tourStore.getHallChatMessages(hallSlug)
      var hallDescription = state.currentHall === hallSlug
        ? (state.currentHallDescription || this._pageHallDescription || '')
        : ''
      var hallFocus = state.currentHall === hallSlug
        ? (state.currentHallFocus || this._pageHallFocus || '')
        : ''
      var hallCardDescription = state.currentHall === hallSlug
        ? (state.currentHallCardDescription || this._pageHallCardDescription || '')
        : ''
      this._pageHallDescription = hallDescription
      this._pageHallCardDescription = hallCardDescription
      this._pageHallFocus = hallFocus
      var messagesForPage = refreshLegacyWelcome(
        cachedMessages,
        buildWelcomeMessage(hallSlug, hallName, hallDescription, hallCardDescription)
      )
      chatStore.setMessages(messagesForPage)
      this._pageOwnedChatSig = hallChatSignature(messagesForPage)
      patch.messages = messagesForPage
      shouldScrollToBottom = !!messagesForPage.length
      wx.setNavigationBarTitle({ title: hallName })
      if (hallChatSignature(messagesForPage) !== hallChatSignature(cachedMessages)) {
        tourStore.saveHallChatMessages(hallSlug, messagesForPage, { defer: true })
      }
      this._renderedHallSlug = hallSlug
    }
    if (this.data.currentExhibit !== nextExhibit) patch.currentExhibit = nextExhibit
    if (this.data.sessionId !== nextSessionId) patch.sessionId = nextSessionId
    if (this.data.hallName !== hallName) patch.hallName = hallName
    if (this.data.ttsEnabled !== nextTtsEnabled) patch.ttsEnabled = nextTtsEnabled
    if (Object.keys(patch).length) {
      this.setData(patch, function () {
        if (shouldScrollToBottom) self._scrollToBottomAfterRestore()
      })
    }
    this._preloadNext()
    // Defer the suggestion build + exhibit fetch past the page-transition frame
    // so the slide-in/back stays smooth; suggestions paint a tick later.
    if (self._suggestionShowTimer) clearTimeout(self._suggestionShowTimer)
    self._suggestionShowTimer = setTimeout(function () {
      self._suggestionShowTimer = null
      self._loadSuggestions()
    }, 80)
  },

  onHide: function () {
    this._syncHallChatAndSummary()
    this._invalidateSuggestionLoad()
  },

  onUnload: function () {
    this._syncHallChatAndSummary()
    this._clearCurrentExhibitOnLeave()
    this._clearHintTimers()
    this._clearFlushTimer()
    this._clearScrollPulseTimers()
    if (this._suggestionFetchTimer) {
      clearTimeout(this._suggestionFetchTimer)
      this._suggestionFetchTimer = null
    }
    if (this._suggestionShowTimer) {
      clearTimeout(this._suggestionShowTimer)
      this._suggestionShowTimer = null
    }
    if (this._postEnterTimer) {
      clearTimeout(this._postEnterTimer)
      this._postEnterTimer = null
    }
    if (this._streamTask) {
      this._streamTask.abort()
      this._streamTask = null
    }
    this._stopTtsPlayback()
    this._destroyTtsAudio()
    this._cleanupOwnTtsFiles()
    this._teardownKeyboardLift()
  },

  _persistCurrentHallChat: function () {
    var hall = this._pageHallSlug || banpoHalls.normalizeHallToSlug(this.data.hallName) || null
    if (!hall) return []
    return tourStore.saveHallChatMessages(hall, chatStore.getState().messages)
  },

  _syncHallChatAndSummary: function () {
    this._persistCurrentHallChat()
    if (tourStore.summarizeHallRecord) {
      tourStore.summarizeHallRecord(this._pageHallSlug, chatStore.getState().messages)
    } else {
      tourStore.summarizeCurrentHallRecord(chatStore.getState().messages)
    }
  },

  _deferPostEnterWork: function () {
    var self = this
    var run = function () {
      self._setupKeyboardLift()
      self._preloadNext()
      if (self._postEnterTimer) clearTimeout(self._postEnterTimer)
      self._postEnterTimer = setTimeout(function () {
        self._postEnterTimer = null
        self._cleanupStaleTtsFiles()
      }, 500)
    }
    if (wx.nextTick) {
      wx.nextTick(run)
    } else {
      setTimeout(run, 0)
    }
  },

  _preloadNext: function () {
    preload.preloadPages([
      '/pages/exhibit-scan/exhibit-scan',
      '/pages/exhibit-detail/exhibit-detail',
      '/pages/report/report',
    ], 120)
    preload.preloadImages(preload.TOUR_ICON_ASSETS, 160)
  },

  // ── Input ─────────────────────────────────────────────────────────────────

  onInputChange: function (e) {
    this.setData({ inputText: e.detail.value })
  },

  onInputFocus: function (e) {
    var h = e && e.detail ? Number(e.detail.height) || 0 : 0
    this._applyKeyboardLift(h)
  },

  onInputBlur: function () {
    var self = this
    setTimeout(function () {
      self._applyKeyboardLift(0)
    }, 80)
  },

  _setupKeyboardLift: function () {
    var self = this
    if (!wx.onKeyboardHeightChange || this._keyboardHandler) return
    this._keyboardHandler = function (res) {
      self._applyKeyboardLift(res && res.height ? Number(res.height) : 0)
    }
    wx.onKeyboardHeightChange(this._keyboardHandler)
  },

  _initCustomTopbar: function () {
    try {
      var info = wx.getWindowInfo
        ? wx.getWindowInfo()
        : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : null)
      var status = info && info.statusBarHeight ? Number(info.statusBarHeight) : 0
      var menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      if (menu && menu.top && menu.height && menu.bottom) {
        var totalHeight = Math.ceil(menu.bottom + Math.max(6, menu.top - status))
        this.setData({
          topbarStyle: 'height:' + totalHeight + 'px;padding-top:' + Math.round(menu.top) + 'px;',
          topbarRowStyle: 'height:' + Math.round(menu.height) + 'px;',
        })
      } else if (status > 0) {
        this.setData({
          topbarStyle: 'height:' + (status + 44) + 'px;padding-top:' + status + 'px;',
          topbarRowStyle: 'height:44px;',
        })
      }
    } catch (_) {
      // Keep the default topbar padding on unsupported environments.
    }
  },

  _initSafeArea: function () {
    if (_safeAreaBottomCache !== null) {
      this._safeAreaBottom = _safeAreaBottomCache
      return
    }
    try {
      // Prefer the lightweight wx.getWindowInfo over the deprecated, slower
      // getSystemInfoSync; fall back for older base libraries.
      var info = wx.getWindowInfo
        ? wx.getWindowInfo()
        : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : null)
      if (info && info.safeArea && info.screenHeight) {
        this._safeAreaBottom = Math.max(0, info.screenHeight - info.safeArea.bottom)
      } else {
        this._safeAreaBottom = 0
      }
    } catch (_) {
      this._safeAreaBottom = 0
    }
    _safeAreaBottomCache = this._safeAreaBottom
  },

  _teardownKeyboardLift: function () {
    if (wx.offKeyboardHeightChange && this._keyboardHandler) {
      wx.offKeyboardHeightChange(this._keyboardHandler)
    }
    this._keyboardHandler = null
    this._applyKeyboardLift(0)
  },

  _applyKeyboardLift: function (height) {
    var self = this
    var h = Math.max(0, Number(height) || 0)
    // True-device keyboard height already includes the visible keyboard area.
    // Keep only the input bar above the keyboard; hide suggestions while typing
    // so iOS candidate bars and safe area do not stack into a large blank gap.
    var lift = h ? Math.max(0, h - (this._safeAreaBottom || 0)) : 0
    if (this._keyboardLift === lift && this.data.keyboardVisible === !!lift) return
    this._keyboardLift = lift
    // Keep the input in normal flex flow. A transform only repaints the bar above
    // the keyboard while leaving the message viewport behind it; margin-bottom
    // instead shrinks the flexing scroll-view by the exact real-device lift.
    var inputStyle = lift ? ('margin-bottom:' + lift + 'px;') : ''
    this.setData({
      inputPanelStyle: inputStyle,
      suggestionsPanelStyle: '',
      messageListStyle: '',
      keyboardVisible: !!lift,
    }, function () {
      if (h) self._scrollToBottomSettled()
    })
  },

  // ── Send message ──────────────────────────────────────────────────────────

  sendMessage: function () {
    var text = (this.data.inputText || '').trim()
    if (!text || this.data.isThinking || this.data.isStreaming) return

    var self  = this
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken

    if (!id || !token) {
      self._ensureTourSession().then(function (created) {
        if (!created) return
        self.setData({ inputText: text })
        self.sendMessage()
      })
      return
    }

    var syncHall = self._pageHallSlug
      || (self.data.currentExhibit && self.data.currentExhibit.hall)
      || state.currentHall
      || banpoHalls.normalizeHallToSlug(self.data.hallName)
      || null
    syncHall = banpoHalls.normalizeHallToSlug(syncHall) || syncHall
    var syncExhibit = self.data.currentExhibit || state.currentExhibit || null
    var syncExhibitHall = syncExhibit && syncExhibit.hall
      ? banpoHalls.normalizeHallToSlug(syncExhibit.hall)
      : syncHall
    if (syncExhibitHall && syncHall && syncExhibitHall !== syncHall) syncExhibit = null
    var syncExhibitId = syncExhibit && tourStore.normalizeBackendExhibitId
      ? tourStore.normalizeBackendExhibitId(syncExhibit.id)
      : null
    if (!self._skipContextSyncOnce) {
      if (self._contextSyncing) return
      self._contextSyncing = true
      tourSync.ensureSessionContext({
        status: 'touring',
        currentHall: syncHall,
        currentExhibitId: syncExhibitId,
      }).then(function (res) {
        self._contextSyncing = false
        if (!res || !res.ok) {
          wx.showToast({ title: '展厅状态同步失败，请重试', icon: 'none', duration: 2200 })
          return
        }
        self._skipContextSyncOnce = true
        self.sendMessage()
      })
      return
    }
    self._skipContextSyncOnce = false

    // ── Performance clock ──────────────────────────────────────────────────
    var now = Date.now()
    self._perf = { sendAt: now, streamStartAt: now, firstChunkAt: 0, doneAt: 0 }
    self._streamText = ''
    var retryQuestionEvent = self._retryQuestionEvent
    var isAutomaticRetry = !!(
      retryQuestionEvent && retryQuestionEvent.text === text && retryQuestionEvent.clientEventId
    )
    var questionClientEventId = isAutomaticRetry
      ? retryQuestionEvent.clientEventId
      : makeClientEventId('question')
    var automaticRetryCount = isAutomaticRetry
      ? Number(retryQuestionEvent.retryCount || 0)
      : 0
    self._retryQuestionEvent = null

    // ── Append user bubble immediately ─────────────────────────────────────
    var userMsg = { id: Date.now(), role: 'user', content: text }
    chatStore.addUserMessage(text)
    self.setData({
      messages:         self.data.messages.concat(userMsg),
      inputText:        '',
      isThinking:       true,
      isStreaming:      false,
      streamingContent: '',
      ragSteps:         [],
      loadingHint:      '正在连接 AI 导览员…',
    }, function () {
      self._scrollToBottom(0)
    })

    // ── Progressive loading hints ──────────────────────────────────────────
    self._clearHintTimers()
    self._hintTimer3 = setTimeout(function () {
      if (self.data.isThinking && !self.data.isStreaming) {
        self.setData({ loadingHint: '正在检索半坡资料，请稍候…' })
      }
    }, 3000)
    self._hintTimer8 = setTimeout(function () {
      if (self.data.isThinking && !self.data.isStreaming) {
        self.setData({ loadingHint: '资料较多，AI 正在整理讲解…' })
      }
    }, 8000)

    // Refresh the runtime context right before recording and streaming. When the
    // user returns from exhibit-detail via navigateBack, onLoad params are not
    // replayed, so the latest store/page context is the only reliable source.
    state = tourStore.getTourState()
    var currentHall = self._pageHallSlug
      || (self.data.currentExhibit && self.data.currentExhibit.hall)
      || state.currentHall
      || banpoHalls.normalizeHallToSlug(self.data.hallName)
      || ''
    currentHall = banpoHalls.normalizeHallToSlug(currentHall) || currentHall || ''
    var currentExhibit = self.data.currentExhibit || state.currentExhibit || null
    var currentExhibitHall = currentExhibit && currentExhibit.hall
      ? banpoHalls.normalizeHallToSlug(currentExhibit.hall)
      : currentHall
    if (currentExhibitHall && currentHall && currentExhibitHall !== currentHall) currentExhibit = null
    if (currentExhibit && currentHall && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit(currentExhibit, currentHall)
      currentExhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : currentExhibit
    }
    state = tourStore.getTourState()
    var trustedExhibitId = currentExhibit && tourStore.normalizeBackendExhibitId
      ? tourStore.normalizeBackendExhibitId(currentExhibit.id)
      : null
    // Conversation continuity is hall-scoped. Read the persisted bucket for
    // the current hall instead of the module-global chat list so a rapid hall
    // switch can never submit another hall's messages. Submit at most the same
    // 30 committed messages kept for recovery; the backend decides which older
    // turns to compress while retaining the latest turns verbatim.
    var conversationHistory = currentHall && tourStore.getHallChatMessages
      ? tourStore.getHallChatMessages(currentHall).slice(-30)
      : []

    // ── Record exhibit_question event ──────────────────────────────────────
    var questionAlreadyQueued = isAutomaticRetry && (state.pendingEvents || []).some(function (event) {
      return event && event.event_type === 'exhibit_question' && event.metadata &&
        event.metadata.client_event_id === questionClientEventId
    })
    if (!questionAlreadyQueued) {
      tourStore.addTourEvent({
        eventType: 'exhibit_question',
        exhibitId: trustedExhibitId || undefined,
        hall:      currentHall,
        metadata:  {
          client_event_id: questionClientEventId,
          message: text.slice(0, 200),
          exhibit_name: currentExhibit ? (currentExhibit.name || '') : '',
          exhibit_kind: currentExhibit ? (currentExhibit.objectKind || currentExhibit.kind || '') : '',
        },
      })
    }
    if (!isAutomaticRetry) {
      tourStore.incrementAiConversationCount()
    }

    // ── Start SSE stream ───────────────────────────────────────────────────
    var stylePrefs = tourStore.getStylePrefs()
    var style = stylePrefs.enabled !== false
      ? { answer_length: stylePrefs.answerLength, depth: stylePrefs.depth, terminology: stylePrefs.terminology }
      : null

    self._streamTask = api.tourApi.chatStream(id, {
      message:   text,
      token:     token,
      style:     style,
      clientEventId: questionClientEventId,
      hallId: currentHall || undefined,
      exhibitId: trustedExhibitId || undefined,
      conversationHistory: conversationHistory,

      onChunk: function (chunk) {
        if (!chunk) return

        // First chunk — measure first-token latency, clear hints, transition state
        if (!self.data.isStreaming) {
          if (self._perf) {
            self._perf.firstChunkAt = Date.now()
            var ftl = self._perf.firstChunkAt - self._perf.sendAt
            console.log('[perf] first token latency:', ftl, 'ms')
          }
          self._clearHintTimers()
          chatStore.startAssistantMessage()
          self.setData({ isThinking: false, isStreaming: true, loadingHint: '' }, function () {
            self._scrollToBottom(0)
          })
        }

        // Buffer for throttled UI flush (every 80 ms)
        chatStore.appendAssistantChunk(chunk)
        self._chunkBuffer += chunk
        self._scheduleFlush()
      },

      onEvent: function (ev) {
        if (ev.type === 'rag_step') {
          chatStore.setRagStep(ev.step, ev.status, ev.message)
          self.setData({ ragSteps: chatStore.getState().ragSteps })
        }
      },

      onDone: function (payload) {
        self._streamTask = null
        self._clearHintTimers()
        self._applyStreamStateVersion(payload)

        if (self._perf) {
          self._perf.doneAt = Date.now()
          var totalDuration     = self._perf.doneAt - self._perf.sendAt
          var firstTokenLatency = self._perf.firstChunkAt
            ? (self._perf.firstChunkAt - self._perf.sendAt) + ' ms'
            : 'N/A (no chunks received)'
          console.log('[perf] first token latency:', firstTokenLatency)
          console.log('[perf] total stream duration:', totalDuration, 'ms')
        }

        // Force-flush any buffered chunk text before committing message
        self._forceFlush()

        var finalContent = payload.content
          || (payload.chunks && payload.chunks.join(''))
          || chatStore.getState().streamingBuffer
          || self._streamText
          || self.data.streamingContent
          || ''

        var traceId = payload.trace_id || null
        chatStore.finishAssistantMessage({ content: finalContent, traceId: traceId })
        var answerHall = currentHall || self._pageHallSlug || banpoHalls.normalizeHallToSlug(self.data.hallName) || ''
        tourStore.addTourEvent({
          eventType: 'assistant_answer',
          exhibitId: trustedExhibitId || undefined,
          hall:      answerHall,
          metadata: {
            client_event_id: assistantClientEventId(questionClientEventId),
            question_client_event_id: questionClientEventId,
            question: text.slice(0, 200),
            answer:   plainTextForTts(finalContent).slice(0, 600),
            trace_id: traceId,
            is_ceramic_question: !!(payload && payload.is_ceramic_question),
            exhibit_name: currentExhibit ? (currentExhibit.name || '') : '',
            exhibit_kind: currentExhibit ? (currentExhibit.objectKind || currentExhibit.kind || '') : '',
          },
        })
        var aiMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: finalContent,
          traceId: traceId,
          ttsStatus: 'idle',
        }
        self._finalScrollPending = true
        self.setData({
          messages:         self.data.messages.concat(aiMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
          ragSteps:         [],
          loadingHint:      '',
          // Re-show suggestion chips after each response so user can tap again
          showSuggestions:  self.data.guideSuggestions.length > 0,
        }, function () {
          self._restoreSuggestionsAfterTurn()
        })
        self._syncHallChatAndSummary()
        if (api.storage && api.storage.touchTourSession) api.storage.touchTourSession()
        tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
        self._scrollToBottomSettled()
      },

      onError: function (err) {
        self._streamTask = null
        self._clearHintTimers()
        self._forceFlush()

        console.error('[stream] error at',
          self._perf ? (Date.now() - self._perf.sendAt) + ' ms' : '?',
          '| raw:', err)

        if (
          self._isRecoverableSessionError(err) &&
          automaticRetryCount < 1 &&
          !self._sessionRecoveryRetrying
        ) {
          self._recoverSessionAndRetry(text, state, {
            clientEventId: questionClientEventId,
            retryCount: automaticRetryCount + 1,
            expectedSessionId: id,
            expectedLocalTourId: state.localTourId || null,
          })
          return
        }

        var friendly = self._friendlyError(err)
        chatStore.setError(friendly)
        wx.showToast({ title: friendly, icon: 'none', duration: 2500 })

        var errMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: '⚠ ' + friendly,
          isError: true,
        }
        self._finalScrollPending = true
        self.setData({
          messages:         self.data.messages.concat(errMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
          ragSteps:         [],
          loadingHint:      '',
          showSuggestions:  self.data.guideSuggestions.length > 0,
        })
        self._scrollToBottomSettled()
      },
    })
  },

  // ── Stop generation ───────────────────────────────────────────────────────

  stopStream: function () {
    var self = this
    if (!self.data.isThinking && !self.data.isStreaming) return

    if (self._perf) {
      console.log('[perf] stream aborted by user at', Date.now() - self._perf.sendAt, 'ms')
    }

    if (self._streamTask) {
      self._streamTask.abort()
      self._streamTask = null
    }
    self._clearHintTimers()
    self._forceFlush()

    var accumulated  = self._streamText
      || self.data.streamingContent
      || chatStore.getState().streamingBuffer
      || ''
    var finalContent = accumulated
      ? accumulated + '\n\n（已停止）'
      : '（已停止）'

    chatStore.finishAssistantMessage({ content: finalContent })

    var stoppedMsg = {
      id:      Date.now(),
      role:    'assistant',
      content: finalContent,
      ttsStatus: 'idle',
    }
    self._finalScrollPending = true
    self.setData({
      messages:         self.data.messages.concat(stoppedMsg),
      streamingContent: '',
      isThinking:       false,
      isStreaming:      false,
      ragSteps:         [],
      loadingHint:      '',
    }, function () {
      // A suggestion tap hides the bar before sending. Stopping during either
      // the thinking phase or the stream must restore the contextual choices.
      self._restoreSuggestionsAfterTurn()
    })
    self._syncHallChatAndSummary()
    self._scrollToBottomSettled()
  },

  // ── TTS playback ─────────────────────────────────────────────────────────
  // This button-driven chain is intentionally independent from chat SSE audio:
  // it synthesizes the completed assistant text through /tts/synthesize and
  // plays the validated local file. SSE remains text-only in this page.

  onMessageTtsTap: function (e) {
    var detail = e.detail || {}
    var messageId = detail.messageId
    var status = detail.status || 'idle'
    var content = plainTextForTts(detail.content)

    if (!messageId || !content) return
    if (status === 'loading') return
    if (status === 'playing') {
      this._stopTtsPlayback()
      return
    }

    this._playMessageTts(messageId, content)
  },

  _playMessageTts: function (messageId, content) {
    var self = this
    var cacheKey = String(messageId)
    if (!self._ttsAudioCache) self._ttsAudioCache = {}

    self._stopTtsPlayback()
    var seq = ++self._ttsRequestSeq

    var cached = self._ttsAudioCache[cacheKey]
    if (cached && cached.paths && cached.paths[0]) {
      self._startTtsQueue(messageId, cacheKey, cached.segments || splitTextForTts(content), cached.paths, seq)
      return
    }

    var segments = splitTextForTts(content)
    if (!segments.length) return
    self._ttsAudioCache[cacheKey] = { segments: segments, paths: [] }
    self._setMessageTtsStatus(messageId, 'loading')
    var persona = tourStore.getBackendPersona()
    var voice = self._getTtsVoiceOverride()

    self._synthesizeTtsSegment(messageId, segments[0], 0, voice, persona)
      .then(function (res) {
        if (seq !== self._ttsRequestSeq) {
          self._setMessageTtsStatus(messageId, 'idle')
          return
        }
        self._ttsAudioCache[cacheKey].paths[0] = res
        self._startTtsQueue(messageId, cacheKey, segments, self._ttsAudioCache[cacheKey].paths, seq)
      })
      .catch(function (err) {
        if (seq !== self._ttsRequestSeq) return
        console.warn('[tts] synthesize failed', ttsErrorDetail(err && err.stage ? err.stage : 'synthesize', err))
        self._resetTtsPlaybackState(messageId)
        wx.showToast({ title: '语音生成失败', icon: 'none', duration: 2000 })
      })
  },

  _synthesizeTtsSegment: function (messageId, segmentText, index, voice, persona) {
    var self = this
    return api.ttsApi.synthesize(segmentText, '冰糖', TOUR_TTS_STYLE, persona)
      .then(function (res) {
        if (!res || !res.ok || !res.data || !res.data.audio) {
          throw new Error('TTS synthesize failed')
        }
        var format = String(res.data.format || 'pcm16').toLowerCase()
        if (format === 'wav') {
          return self._writeBase64AudioFile(messageId + '_' + index, res.data.audio, 'wav')
        }
        if (format === 'mp3') {
          return self._writeBase64AudioFile(messageId + '_' + index, res.data.audio, 'mp3')
        }
        if (format !== 'pcm16') {
          throw new Error('Unsupported TTS format: ' + res.data.format)
        }
        return self._writePcm16AsWav(messageId + '_' + index, res.data.audio)
      })
  },

  _writeBase64AudioFile: function (messageId, audioBase64, ext) {
    return new Promise(function (resolve, reject) {
      try {
        var suffix = String(ext || 'wav').toLowerCase()
        var audioBuffer = suffix === 'wav'
          ? ttsAudio.decodeAndValidateWavBase64(audioBase64, function (value) {
              return wx.base64ToArrayBuffer(value)
            })
          : wx.base64ToArrayBuffer(audioBase64)
        var filePath = wx.env.USER_DATA_PATH + '/museai_tts_' + String(messageId).replace(/[^a-zA-Z0-9_-]/g, '') + '_' + Date.now() + '.' + suffix
        wx.getFileSystemManager().writeFile({
          filePath: filePath,
          data: audioBuffer,
          success: function () { resolve(filePath) },
          fail: reject,
        })
      } catch (err) {
        reject(err)
      }
    })
  },

  _writePcm16AsWav: function (messageId, audioBase64) {
    return new Promise(function (resolve, reject) {
      try {
        var pcmBuffer = wx.base64ToArrayBuffer(audioBase64)
        var wavBuffer = pcm16ToWavArrayBuffer(pcmBuffer)
        ttsAudio.validateWavArrayBuffer(wavBuffer)
        var filePath = wx.env.USER_DATA_PATH + '/museai_tts_' + String(messageId).replace(/[^a-zA-Z0-9_-]/g, '') + '_' + Date.now() + '.wav'
        wx.getFileSystemManager().writeFile({
          filePath: filePath,
          data: wavBuffer,
          success: function () { resolve(filePath) },
          fail: reject,
        })
      } catch (err) {
        reject(err)
      }
    })
  },

  _startTtsQueue: function (messageId, cacheKey, segments, paths, seq) {
    this._ttsQueue = {
      messageId: messageId,
      cacheKey: cacheKey,
      segments: segments,
      paths: paths,
      index: 0,
      seq: seq,
      preloading: {},
    }
    this._playTtsQueueIndex(0)
    this._preloadNextTtsSegment()
  },

  _playTtsQueueIndex: function (index) {
    var q = this._ttsQueue
    if (!q || index >= q.segments.length) {
      if (q && q.messageId) this._setMessageTtsStatus(q.messageId, 'idle')
      this.setData({ ttsState: { playingMessageId: null, loadingMessageId: null, audioPath: null } })
      this._destroyTtsAudio()
      this._ttsQueue = null
      return
    }
    q.index = index
    if (q.paths[index]) {
      this._playTtsFile(q.messageId, q.paths[index], { queued: true, seq: q.seq })
      this._preloadNextTtsSegment()
      return
    }
    this._setTtsLoadingState(q.messageId, null)
    this._ensureTtsSegmentPath(index).then(function () {
      if (this._ttsQueue !== q || q.seq !== this._ttsRequestSeq) return
      this._playTtsQueueIndex(index)
    }.bind(this)).catch(function (err) {
      if (this._ttsQueue !== q || q.seq !== this._ttsRequestSeq) return
      console.warn('[tts] queued synthesize failed', ttsErrorDetail(err && err.stage ? err.stage : 'queue_synthesize', err))
      this._ttsRequestSeq++
      this._ttsQueue = null
      this._resetTtsPlaybackState(q.messageId)
      this._destroyTtsAudio()
      wx.showToast({ title: '语音生成失败', icon: 'none', duration: 2000 })
    }.bind(this))
  },

  _preloadNextTtsSegment: function () {
    var q = this._ttsQueue
    if (!q) return
    var next = q.index + 1
    if (next >= q.segments.length || q.paths[next] || q.preloading[next]) return
    this._ensureTtsSegmentPath(next).catch(function (err) {
      console.warn('[tts] preload failed', ttsErrorDetail(err && err.stage ? err.stage : 'preload', err))
      if (q && q.preloading) delete q.preloading[next]
    })
  },

  _ensureTtsSegmentPath: function (index) {
    var q = this._ttsQueue
    if (!q) return Promise.reject(new Error('No TTS queue'))
    if (q.paths[index]) return Promise.resolve(q.paths[index])
    if (q.preloading[index]) return q.preloading[index]
    var self = this
    var persona = tourStore.getBackendPersona()
    var voice = self._getTtsVoiceOverride()
    q.preloading[index] = self._synthesizeTtsSegment(q.messageId, q.segments[index], index, voice, persona)
      .then(function (path) {
        if (!self._ttsAudioCache[q.cacheKey]) self._ttsAudioCache[q.cacheKey] = { segments: q.segments, paths: [] }
        self._ttsAudioCache[q.cacheKey].paths[index] = path
        q.paths[index] = path
        return path
      })
      .catch(function (err) {
        if (q && q.preloading) delete q.preloading[index]
        throw err
      })
    return q.preloading[index]
  },

  _getTtsVoiceOverride: function () {
    return '冰糖'
  },

  _setTtsLoadingState: function (messageId, filePath) {
    this._setMessageTtsStatus(messageId, 'loading')
    this.setData({
      ttsState: {
        playingMessageId: null,
        loadingMessageId: messageId,
        audioPath: filePath || null,
      },
    })
  },

  _resetTtsPlaybackState: function (messageId) {
    if (messageId !== undefined && messageId !== null) this._setMessageTtsStatus(messageId, 'idle')
    this.setData({
      ttsState: { playingMessageId: null, loadingMessageId: null, audioPath: null },
    })
  },

  _armTtsStartTimer: function (callback) {
    var self = this
    self._clearTtsStartTimer()
    var timerId = setTimeout(function () {
      if (self._ttsStartTimer !== timerId) return
      self._ttsStartTimer = null
      callback()
    }, TTS_PLAY_START_TIMEOUT_MS)
    self._ttsStartTimer = timerId
  },

  _clearTtsStartTimer: function () {
    if (this._ttsStartTimer === null || this._ttsStartTimer === undefined) return
    clearTimeout(this._ttsStartTimer)
    this._ttsStartTimer = null
  },

  _playTtsFile: function (messageId, filePath, options) {
    var self = this
    var opts = options || {}
    var seq = opts.seq === undefined || opts.seq === null ? self._ttsRequestSeq : opts.seq
    var expectedQueue = opts.queued ? self._ttsQueue : null
    var expectedQueueIndex = expectedQueue ? expectedQueue.index : null
    self._destroyTtsAudio()

    var ctx
    try {
      ctx = wx.createInnerAudioContext()
    } catch (err) {
      console.warn('[tts] playback failed', ttsErrorDetail('create_context', err))
      self._ttsRequestSeq++
      self._ttsQueue = null
      self._resetTtsPlaybackState(messageId)
      wx.showToast({ title: '语音播放失败', icon: 'none', duration: 2000 })
      return
    }
    self._ttsAudioCtx = ctx
    var playAttempts = 0
    var playStarted = false
    var srcAssigned = false
    var canplayPending = false
    var playCallInProgress = false

    function isCurrentPlayback() {
      if (self._ttsAudioCtx !== ctx || seq !== self._ttsRequestSeq) return false
      if (!opts.queued) return true
      return !!(
        expectedQueue &&
        self._ttsQueue === expectedQueue &&
        expectedQueue.seq === seq &&
        expectedQueue.index === expectedQueueIndex &&
        String(expectedQueue.messageId) === String(messageId)
      )
    }

    function failPlayback(stage, err) {
      if (!isCurrentPlayback()) return
      self._clearTtsStartTimer()
      console.warn('[tts] playback failed', ttsErrorDetail(stage, err))
      self._ttsRequestSeq++
      self._ttsQueue = null
      self._resetTtsPlaybackState(messageId)
      self._destroyTtsAudio()
      wx.showToast({ title: '语音播放失败', icon: 'none', duration: 2000 })
    }

    function requestPlay(stage) {
      if (playStarted || playAttempts >= 2 || !isCurrentPlayback()) return
      // The direct attempt runs once after src assignment. If a device silently
      // ignores that early call, the first canplay may make exactly one retry.
      if (stage !== 'canplay' && playAttempts > 0) return
      playAttempts++
      playCallInProgress = true
      try {
        ctx.play()
      } catch (err) {
        failPlayback(stage || 'play', err)
      } finally {
        playCallInProgress = false
      }
      if (canplayPending && srcAssigned && !playStarted && playAttempts < 2) {
        canplayPending = false
        requestPlay('canplay')
      }
    }

    // Register every lifecycle callback before assigning src or requesting
    // playback. Some devices emit canplay synchronously from the src setter.
    ctx.onError(function (err) {
      failPlayback('inner_audio_error', err)
    })
    ctx.onCanplay(function () {
      if (!srcAssigned || playCallInProgress) {
        canplayPending = true
        return
      }
      requestPlay('canplay')
    })
    ctx.onPlay(function () {
      if (!isCurrentPlayback()) return
      self._clearTtsStartTimer()
      playStarted = true
      self._setMessageTtsStatus(messageId, 'playing')
    })
    ctx.onEnded(function () {
      if (!isCurrentPlayback()) return
      self._clearTtsStartTimer()
      if (opts.queued && expectedQueue) {
        self._playTtsQueueIndex(expectedQueueIndex + 1)
        return
      }
      self._resetTtsPlaybackState(messageId)
      self._destroyTtsAudio()
    })
    ctx.onStop(function () {
      if (!isCurrentPlayback()) return
      self._clearTtsStartTimer()
      self._ttsRequestSeq++
      self._ttsQueue = null
      self._resetTtsPlaybackState(messageId)
      self._destroyTtsAudio()
    })

    if ('obeyMuteSwitch' in ctx) ctx.obeyMuteSwitch = false
    self._setTtsLoadingState(messageId, filePath)
    self._armTtsStartTimer(function () {
      failPlayback('play_start_timeout', {
        errCode: 'PLAY_START_TIMEOUT',
        errMsg: 'InnerAudioContext did not emit onPlay within ' + TTS_PLAY_START_TIMEOUT_MS + ' ms',
      })
    })
    try {
      ctx.src = filePath
    } catch (err) {
      failPlayback('set_src', err)
      return
    }
    srcAssigned = true
    requestPlay('play')
  },

  _stopTtsPlayback: function () {
    var currentId = this.data.ttsState && this.data.ttsState.playingMessageId
    var loadingId = this.data.ttsState && this.data.ttsState.loadingMessageId
    this._ttsRequestSeq++
    this._ttsQueue = null
    if (this._ttsAudioCtx) {
      try { this._ttsAudioCtx.stop() } catch (_) {}
    }
    if (currentId) this._setMessageTtsStatus(currentId, 'idle')
    if (loadingId) this._setMessageTtsStatus(loadingId, 'idle')
    this._resetTtsPlaybackState(null)
    this._destroyTtsAudio()
  },

  _destroyTtsAudio: function () {
    this._clearTtsStartTimer()
    var ctx = this._ttsAudioCtx
    if (!ctx) return
    this._ttsAudioCtx = null
    try { ctx.destroy() } catch (_) {}
  },

  // ── TTS temp-file cleanup ──────────────────────────────────────────────────
  // TTS segments are written to USER_DATA_PATH (200 MB quota) and would
  // otherwise accumulate forever. Files created by this page instance are
  // removed on unload; leftovers from earlier sessions are swept on load.
  // The 24 h age gate protects segments still cached by tour pages deeper in
  // the navigation stack (goDeeper re-entry keeps the previous page alive).
  // Cleanup is best-effort: failures only warn and never block the chat.

  _cleanupStaleTtsFiles: function () {
    var maxAgeMs = 24 * 60 * 60 * 1000
    var dir = wx.env.USER_DATA_PATH
    var now = Date.now()
    try {
      var fs = wx.getFileSystemManager()
      fs.readdir({
        dirPath: dir,
        success: function (res) {
          ;(res.files || []).forEach(function (name) {
            if (String(name).indexOf('museai_tts_') !== 0) return
            var m = /_(\d+)\.(wav|mp3)$/.exec(name)
            if (m && now - Number(m[1]) < maxAgeMs) return
            fs.unlink({
              filePath: dir + '/' + name,
              fail: function (err) { console.warn('[tts] stale temp cleanup failed', name, err) },
            })
          })
        },
        fail: function (err) { console.warn('[tts] temp dir scan failed', err) },
      })
    } catch (err) {
      console.warn('[tts] temp cleanup error', err)
    }
  },

  _cleanupOwnTtsFiles: function () {
    var cache = this._ttsAudioCache
    this._ttsAudioCache = {}
    if (!cache) return
    var playingPath = this.data.ttsState && this.data.ttsState.audioPath
    try {
      var fs = wx.getFileSystemManager()
      Object.keys(cache).forEach(function (key) {
        var paths = (cache[key] && cache[key].paths) || []
        paths.forEach(function (p) {
          if (!p || p === playingPath) return
          fs.unlink({
            filePath: p,
            fail: function (err) { console.warn('[tts] temp cleanup failed', p, err) },
          })
        })
      })
    } catch (err) {
      console.warn('[tts] temp cleanup error', err)
    }
  },

  _setMessageTtsStatus: function (messageId, status) {
    var target = String(messageId)
    var messages = (this.data.messages || []).map(function (msg) {
      if (String(msg.id) !== target) {
        if (status === 'playing' && msg.ttsStatus === 'playing') {
          return Object.assign({}, msg, { ttsStatus: 'idle' })
        }
        return msg
      }
      return Object.assign({}, msg, { ttsStatus: status })
    })
    var nextState = {
      playingMessageId: status === 'playing' ? messageId : (this.data.ttsState && this.data.ttsState.playingMessageId),
      loadingMessageId: status === 'loading' ? messageId : null,
      audioPath: this.data.ttsState ? this.data.ttsState.audioPath : null,
    }
    if (status === 'idle' && String(nextState.playingMessageId) === target) nextState.playingMessageId = null
    this.setData({ messages: messages, ttsState: nextState })
  },

  // ── Guide suggestions ─────────────────────────────────────────────────────

  /**
   * Load guide suggestions for the current hall/exhibit context.
   * Production chips are backend-owned: the bar remains empty before the
   * request and after any failed or malformed response.
   */
  _loadSuggestions: function () {
    var self    = this
    var seq     = ++this._suggestionSeq
    var exhibit = this.data.currentExhibit || null
    var state   = tourStore.getTourState()
    var hall    = this._pageHallName || this.data.hallName || null

    self._applyGuideSuggestions([])
    if (self._suggestionFetchTimer) {
      clearTimeout(self._suggestionFetchTimer)
      self._suggestionFetchTimer = null
    }

    // exhibit.hall is already a backend slug; otherwise convert hall display name to slug.
    var hallSlug = this._pageHallSlug || (exhibit
      ? (exhibit.hall || null)
      : (state.currentHall || (hall ? api.hallNameToSlug(hall) : null)))
    hallSlug = hallSlug ? (banpoHalls.normalizeHallToSlug(hallSlug) || hallSlug) : null
    if (!hallSlug) return
    var exhibitId = exhibit && tourStore.normalizeBackendExhibitId
      ? tourStore.normalizeBackendExhibitId(exhibit.id)
      : null
    var exhibitKey = exhibit
      ? [String(exhibit.id || ''), String(exhibit.name || ''), String(exhibit.hall || '')].join('|')
      : ''
    var owner = {
      seq: seq,
      localTourId: state.localTourId || this._pageLocalTourId || null,
      hallSlug: hallSlug,
      exhibitKey: exhibitKey,
    }
    var requestSessionId = null

    self._suggestionFetchTimer = setTimeout(function () {
      self._suggestionFetchTimer = null
      var latest = tourStore.getTourState()
      self._suggestionLoadingSeq = seq

      // Page-first navigation can reach the tour before hall/home session
      // bootstrap finishes. Join the shared bootstrap promise instead of
      // permanently giving up this context's suggestions.
      var sessionReady = latest.sessionId
        ? Promise.resolve({ ok: true, sessionId: latest.sessionId })
        : tourSession.ensureTourSession()

      sessionReady.then(function (sessionResult) {
        if (!self._isSuggestionOwnerCurrent(owner)) return null
        var ready = tourStore.getTourState()
        if (!sessionResult || !sessionResult.ok || !ready.sessionId) {
          self._applyGuideSuggestions([])
          return null
        }
        if (self.data.sessionId !== ready.sessionId) {
          self.setData({ sessionId: ready.sessionId })
        }
        requestSessionId = ready.sessionId
        return api.tourApi.getSuggestions(ready.sessionId, {
          hallId: hallSlug,
          exhibitId: exhibitId,
        }, ready.sessionToken).then(function (res) {
          if (!self._isSuggestionOwnerCurrent(owner, requestSessionId)) return
          var prompts = res && res.ok && res.data && Array.isArray(res.data.suggestions)
            ? res.data.suggestions
            : []
          self._applyGuideSuggestions(tourStore.buildServerGuideSuggestions(prompts))
        })
      }).catch(function (err) {
        if (!self._isSuggestionOwnerCurrent(owner, requestSessionId)) return
        console.warn('[tour] suggestions unavailable', err)
        self._applyGuideSuggestions([])
      }).then(function () {
        if (self._suggestionLoadingSeq === seq) self._suggestionLoadingSeq = 0
      }, function () {
        if (self._suggestionLoadingSeq === seq) self._suggestionLoadingSeq = 0
      })
    }, 160)
  },

  _isSuggestionOwnerCurrent: function (owner, sessionId) {
    if (!owner || owner.seq !== this._suggestionSeq) return false
    var state = tourStore.getTourState()
    if (owner.localTourId && state.localTourId && owner.localTourId !== state.localTourId) return false
    if (sessionId && state.sessionId !== sessionId) return false
    var hall = this._pageHallSlug || state.currentHall || ''
    hall = hall ? (banpoHalls.normalizeHallToSlug(hall) || hall) : ''
    if (hall !== owner.hallSlug) return false
    var exhibit = this.data.currentExhibit || null
    var exhibitKey = exhibit
      ? [String(exhibit.id || ''), String(exhibit.name || ''), String(exhibit.hall || '')].join('|')
      : ''
    return exhibitKey === owner.exhibitKey
  },

  _invalidateSuggestionLoad: function () {
    this._suggestionSeq += 1
    this._suggestionLoadingSeq = 0
    if (this._suggestionFetchTimer) {
      clearTimeout(this._suggestionFetchTimer)
      this._suggestionFetchTimer = null
    }
    if (this._suggestionShowTimer) {
      clearTimeout(this._suggestionShowTimer)
      this._suggestionShowTimer = null
    }
  },

  _applyGuideSuggestions: function (list) {
    var suggestions = list || []
    var show = suggestions.length > 0
    var sig = suggestions.map(function (item) {
      return [
        item.type || '',
        item.actionType || '',
        item.title || '',
        item.iconSrc || item.icon || '',
        item.payload && (item.payload.exhibitId || item.payload.exhibitName || item.payload.prompt || item.payload.keyword) || '',
      ].join(':')
    }).join('|')
    if (sig === this._guideSuggestionsSig && this.data.showSuggestions === show) return
    this._guideSuggestionsSig = sig
    this.setData({ guideSuggestions: suggestions, showSuggestions: show })
  },

  _restoreSuggestionsAfterTurn: function () {
    var suggestions = this.data.guideSuggestions || []
    if (suggestions.length) {
      this.setData({ showSuggestions: true })
      return
    }
    if (!this._suggestionLoadingSeq && !this._suggestionFetchTimer) {
      this._loadSuggestions()
    }
  },

  dismissSuggestions: function () {
    this.setData({ showSuggestions: false })
  },

  /**
   * Handle suggestion chip tap.
   * actionType:
   *   'ask'            — fill input box with prompt (user still taps Send)
   *   'open_exhibit'   — navigate to exhibit-detail
   *   'search_exhibit' — navigate to exhibit-scan with keyword
   *   anything else    — dismiss suggestions
   */
  onSuggestionTap: function (e) {
    var idx        = e.currentTarget.dataset.index
    var suggestion = this.data.guideSuggestions[idx]
    if (!suggestion) return

    var payload = suggestion.payload || {}

    switch (suggestion.actionType) {
      case 'ask': {
        var prompt = payload.prompt || suggestion.title
        this.setData({ inputText: prompt, showSuggestions: false })
        // Ghost-tap guard: WeChat navigation taps can bleed through to the new page
        // within ~300 ms of the page becoming visible. Only auto-send after 500 ms.
        if (Date.now() - this._loadedAt >= 500) {
          this.sendMessage()
        }
        break
      }

      case 'open_exhibit': {
        var url = '/pages/exhibit-detail/exhibit-detail?'
        if (payload.exhibitId) {
          url += 'id=' + encodeURIComponent(payload.exhibitId)
        } else if (payload.exhibitName) {
          url += 'name=' + encodeURIComponent(payload.exhibitName)
        } else { break }
        wx.navigateTo({ url: url })
        break
      }

      case 'search_exhibit': {
        var kw = payload.keyword || ''
        wx.navigateTo({ url: '/pages/exhibit-scan/exhibit-scan?keyword=' + encodeURIComponent(kw) })
        break
      }

      default:
        this.setData({ showSuggestions: false })
        break
    }
  },

  // ── Pending-events flush helper ────────────────────────────────────────────

  /**
   * Upload all buffered tour events to the backend.
   * If the upload fails, events are restored to the buffer.
   * @param {Function|null} callback  Called when flush completes (success or failure).
   */
  _flushEvents: function (callback) {
    var state = tourStore.getTourState()
    return eventFlush.flushPendingEvents({
      sessionId: state.sessionId,
      token: state.sessionToken,
    }).then(function (result) {
      if (!result.ok) {
        console.warn('[tour] event batches not fully flushed:', result.status || result.reason)
      }
      if (callback) callback(result)
      return result
    })
  },

  // ── Chunk-flush helpers ────────────────────────────────────────────────────

  _scheduleFlush: function () {
    var self = this
    if (self._flushTimer) return
    self._flushTimer = setTimeout(function () {
      self._flushTimer = null
      if (self._chunkBuffer) {
        self._streamText += self._chunkBuffer
        self._chunkBuffer = ''
        self.setData({ streamingContent: self._streamText }, function () {
          self._scrollToBottom(0)
        })
      }
    }, STREAM_FLUSH_INTERVAL_MS)
  },

  _forceFlush: function () {
    this._clearFlushTimer()
    if (this._chunkBuffer) {
      this._streamText += this._chunkBuffer
      this._chunkBuffer = ''
      this.setData({ streamingContent: this._streamText })
    }
  },

  _clearFlushTimer: function () {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
  },

  // ── Hint-timer helpers ────────────────────────────────────────────────────

  _clearHintTimers: function () {
    if (this._hintTimer3) { clearTimeout(this._hintTimer3); this._hintTimer3 = null }
    if (this._hintTimer8) { clearTimeout(this._hintTimer8); this._hintTimer8 = null }
  },

  // ── User-friendly error mapper ────────────────────────────────────────────

  _friendlyError: function (err) {
    var raw    = (err && err.message) || ''
    var status = (err && err.status)  || 0

    if (raw.indexOf('timeout') >= 0 || raw.indexOf('超时') >= 0) {
      return 'AI 导览员响应超时，请稍后再试。'
    }
    if (status >= 500) return '服务器暂时繁忙，请稍后再试。'
    if (status >= 400 && status < 500) return '请求参数有误，请重试或刷新页面。'
    return '连接 AI 导览员失败，请检查网络后重试。'
  },

  _isRecoverableSessionError: function (err) {
    var status = Number(err && err.status) || 0
    return status === 401 || status === 403 || status === 404 || status === 410
  },

  _removeLastUserMessage: function (text) {
    var messages = (this.data.messages || []).slice()
    var last = messages[messages.length - 1]
    if (last && last.role === 'user' && last.content === text) {
      messages.pop()
      this.setData({ messages: messages })
    }

    var storeMessages = (chatStore.getState().messages || []).slice()
    var storeLast = storeMessages[storeMessages.length - 1]
    if (storeLast && storeLast.role === 'user' && storeLast.content === text) {
      storeMessages.pop()
      chatStore.setMessages(storeMessages)
    }
  },

  _recoverSessionAndRetry: function (text, previousState, recovery) {
    var self = this
    var prev = previousState || tourStore.getTourState()
    var retry = recovery || {}
    var expectedLocalTourId = retry.expectedLocalTourId || prev.localTourId || null
    if (expectedLocalTourId && tourStore.getTourState().localTourId !== expectedLocalTourId) return

    self._sessionRecoveryRetrying = true
    self._removeLastUserMessage(text)
    self.setData({
      inputText: text,
      streamingContent: '',
      isThinking: false,
      isStreaming: false,
      ragSteps: [],
      loadingHint: '',
    })

    tourSession.recoverTourSession(retry.expectedSessionId || prev.sessionId, expectedLocalTourId)
      .then(function (created) {
      self._sessionRecoveryRetrying = false
      var current = tourStore.getTourState()
      if (
        created && created.ok && created.sessionId && created.sessionToken &&
        (!expectedLocalTourId || current.localTourId === expectedLocalTourId)
      ) {
        self._retryQuestionEvent = {
          text: text,
          clientEventId: retry.clientEventId,
          retryCount: Number(retry.retryCount || 1),
        }
        self.setData({ sessionId: created.sessionId })
        self.sendMessage()
        return
      }
      wx.showToast({ title: '会话恢复失败，请稍后重试', icon: 'none', duration: 2200 })
    }).catch(function (err) {
      self._sessionRecoveryRetrying = false
      console.warn('[tour] session recovery failed', err)
      wx.showToast({ title: '会话恢复失败，请稍后重试', icon: 'none', duration: 2200 })
    })
  },

  _ensureTourSession: function () {
    var self = this
    var state = tourStore.getTourState()
    if (state.sessionId && state.sessionToken) return Promise.resolve(true)

    wx.showLoading({ title: '正在连接导览…', mask: false })
    return tourSession.ensureTourSession().then(function (res) {
      wx.hideLoading()
      if (!res || !res.ok || !res.sessionId || !res.sessionToken) throw new Error('create session failed')
      if (self._pageHallSlug) {
        tourStore.updateTourState({
          currentHall: self._pageHallSlug,
          currentHallName: self._pageHallName || self.data.hallName || null,
        })
      }
      tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
      self.setData({ sessionId: res.sessionId })
      if (!self._suggestionLoadingSeq && !self._suggestionFetchTimer && !(self.data.guideSuggestions || []).length) {
        self._loadSuggestions()
      }
      return true
    }).catch(function (err) {
      wx.hideLoading()
      console.warn('[tour] auto create session failed', err)
      wx.showToast({ title: '连接导览失败，请检查网络', icon: 'none', duration: 2200 })
      return false
    })
  },

  // ── Demo-mode mock reply (no session) ─────────────────────────────────────

  _mockReply: function (text) {
    var self  = this
    var reply = text || '（演示模式）'
    chatStore.startAssistantMessage()
    self.setData({ isThinking: false, isStreaming: true })

    var i    = 0
    var tick = setInterval(function () {
      if (i >= reply.length) {
        clearInterval(tick)
        self._forceFlush()
        chatStore.finishAssistantMessage({ content: reply })
        var aiMsg = { id: Date.now(), role: 'assistant', content: reply, ttsStatus: 'idle' }
        self._finalScrollPending = true
        self.setData({
          messages:         self.data.messages.concat(aiMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
        })
        self._syncHallChatAndSummary()
        self._scrollToBottomSettled()
        return
      }
      var ch = reply.charAt(i)
      chatStore.appendAssistantChunk(ch)
      self._chunkBuffer += ch
      self._scheduleFlush()
      i++
    }, 35)
  },

  // ── Scroll helper ─────────────────────────────────────────────────────────

  _scrollToBottomAfterRestore: function () {
    this._scrollToBottomSettled()
  },

  _scrollToBottomSettled: function () {
    var self = this
    self._clearScrollPulseTimers()
    self._scrollPulseTimers = []
    ;[0, 120, 320, 720].forEach(function (wait) {
      var timer = setTimeout(function () {
        self._scrollToBottom(0)
      }, wait)
      self._scrollPulseTimers.push(timer)
    })
  },

  _clearScrollPulseTimers: function () {
    if (!this._scrollPulseTimers) return
    this._scrollPulseTimers.forEach(function (timer) {
      clearTimeout(timer)
    })
    this._scrollPulseTimers = null
  },

  _scrollToBottom: function (delay) {
    var self = this
    if (self._scrollPending) return
    self._scrollPending = true
    setTimeout(function () {
      self._scrollPending = false
      var cur = self.data.scrollTarget
      var next = (cur === '' || cur === 'msg-bottom-a') ? 'msg-bottom-b' : 'msg-bottom-a'
      self.setData({ scrollTarget: next })
    }, typeof delay === 'number' ? delay : 80)
  },

  onMessageRendered: function (e) {
    var detail = (e && e.detail) || {}
    if (!this._finalScrollPending || detail.role !== 'assistant') return
    this._finalScrollPending = false
    this._scrollToBottomSettled()
  },

  // ── Exhibit context ───────────────────────────────────────────────────────

  _clearCurrentExhibitOnLeave: function () {
    this._exhibitContextActive = false
    if (tourStore.clearCurrentExhibit) tourStore.clearCurrentExhibit()
    if (tourStore.consumePendingDetailExhibit) tourStore.consumePendingDetailExhibit()
    this._invalidateSuggestionLoad()
  },

  clearExhibitContext: function () {
    this._exhibitContextActive = false
    tourStore.clearCurrentExhibit()
    if (tourStore.consumePendingDetailExhibit) tourStore.consumePendingDetailExhibit()
    this.setData({ currentExhibit: null })
    this._loadSuggestions()
  },

  // ── Navigation ────────────────────────────────────────────────────────────

  goBackFromTour: function () {
    this._syncHallChatAndSummary()
    this._clearCurrentExhibitOnLeave()
    tourSync.queueSessionSnapshot({ current_exhibit_id: null }, { defer: true, maxAttempts: 3 })
    var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    for (var i = pages.length - 2; i >= 0; i--) {
      if (pages[i] && pages[i].route === 'pages/hall/hall') {
        wx.navigateBack({ delta: pages.length - 1 - i })
        return
      }
    }
    wx.reLaunch({ url: '/pages/hall/hall' })
  },

  goScan: function () {
    wx.navigateTo({ url: '/pages/exhibit-scan/exhibit-scan' })
  },
})
