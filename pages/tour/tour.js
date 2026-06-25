const api       = require('../../api/index')
const chatStore = require('../../store/chat')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')

const TOUR_TTS_STYLE = '请用清晰、自然、亲切的博物馆导览语气朗读；语速稍快，比常规讲解更利落，句间停顿短一些，尾音不要拖长。不要额外补充文字，只朗读给定内容。'
const TTS_SEGMENT_MAX_CHARS = 72
const TTS_SEGMENT_MAX_COUNT = 10
const STREAM_FLUSH_INTERVAL_MS = 80

function makeClientEventId(prefix) {
  return String(Date.now()) + '-' + (prefix || 'evt') + '-' + Math.random().toString(36).slice(2, 10)
}

// Safe-area inset is device-constant; cache it across page entries so we don't
// pay the synchronous system-info bridge cost during each slide-in transition.
var _safeAreaBottomCache = null

var HALL_WELCOME_COPY = {
  'basic-exhibition-hall': '这里是基本陈列展厅。先把半坡看成一个完整的生活系统：房屋、工具、陶器、装饰品，都在回答同一个问题：六千年前的人怎样组织日常生活。\n你可以从一件器物、一个纹样，或“他们怎么吃住劳动”问起。',
  'site-protection-hall': '这里是遗址保护大厅。这里看的不是单件文物，而是半坡聚落的真实空间：房址、墓葬、壕沟、作坊和灶址之间的关系。\n建议你先观察“什么在一起、什么被分开”，再问我这些空间关系说明了什么。',
  'kiln-hall': '这里是陶窑展厅。陶器不是凭空出现的，它要经过选泥、成型、干燥、装饰和烧成。\n你可以把这里当作“生产现场”来看：窑炉结构、火候痕迹和失败残片，都能解释一件陶器为什么会变成现在的样子。',
  'prehistoric-workshop': '这里是史前工坊。它适合把刚才看到的工具、陶器和材料，转化成可以亲手理解的过程。\n如果你正在研学，可以重点记录：哪一步最难、需要什么经验、它和展厅里的展品有什么对应关系。',
  'education-center': '这里是教研中心。它更适合整理问题，而不是只继续看展。\n你可以把前面看到的展厅内容变成三类记录：一个最有证据的发现、一个仍不确定的问题、一个可以继续讨论的观点。',
  'banpo-girl-sculpture': '这里是半坡姑娘雕塑。它不是考古原件，而是现代人根据半坡文化想象出的公共形象。\n我们可以一起区分：哪些来自考古证据，哪些属于艺术再现，哪些影响了今天观众对半坡人的第一印象。',
  'peony-garden': '这里是牡丹园，也是参观中的休整空间。\n如果你刚看完展厅，可以在这里做一次简短复盘：刚才哪个细节最有证据？哪个问题还没有答案？下一步要去哪里验证？',
  'temporary-hall-1': '这里是临展空间。当期主题和展品需要以现场展签与馆方清单为准。\n你可以把看到的展览标题、展签关键词或具体对象告诉我，我会基于现场信息帮你梳理。',
  'temporary-hall-2': '这里是临展空间。当期主题和展品需要以现场展签与馆方清单为准。\n你可以把看到的展览标题、展签关键词或具体对象告诉我，我会基于现场信息帮你梳理。',
}

function buildWelcomeMessage(hallSlug, hallName) {
  if (hallSlug && HALL_WELCOME_COPY[hallSlug]) return HALL_WELCOME_COPY[hallSlug]
  var name = hallName || '这个展厅'
  return '欢迎来到' + name + '。我会优先围绕你当前看到的展厅回答，不把其他展厅的内容混进来。\n你可以直接问一个展品、一个细节，或让 MuseAI 帮你整理观察重点。'
}

function buildExhibitContextForRequest(exhibit) {
  if (!exhibit) return ''
  var parts = []
  if (exhibit.name) parts.push('名称：' + exhibit.name)
  var hallDisplay = exhibit.hallDisplay || (exhibit.hall ? banpoHalls.getHallDisplayName(exhibit.hall) : '')
  if (hallDisplay || exhibit.hall) parts.push('展厅：' + (hallDisplay || exhibit.hall))
  var objectKind = exhibit.objectKind || exhibit.kind || ''
  if (objectKind) parts.push('对象类型：' + objectKind)
  if (exhibit.category) parts.push('类别：' + exhibit.category)
  if (exhibit.era) parts.push('年代：' + exhibit.era)
  var desc = exhibit.description || exhibit.summary || exhibit.desc || ''
  if (desc) parts.push('简介：' + String(desc).replace(/\s+/g, ' ').slice(0, 360))
  return parts.join('\n').slice(0, 1000)
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
  _flushTimer:    null,   // timer ID for scheduled _chunkBuffer flush
  _loadedAt:      0,      // timestamp (ms) of last onLoad/onShow — ghost-tap guard
  _suggestionSeq: 0,      // prevents stale Phase-2 suggestions from overwriting the next hall/exhibit
  _ttsAudioCtx:   null,
  _ttsAudioCache: null,
  _ttsQueue:      null,
  _ttsRequestSeq: 0,
  _keyboardHandler: null,
  _safeAreaBottom: 0,
  _keyboardLift: 0,
  _sessionRecoveryRetrying: false,
  _suggestionFetchTimer: null,
  _suggestionShowTimer: null,
  _guideSuggestionsSig: '',
  _postEnterTimer: null,
  _scrollPulseTimers: null,
  _resendWithoutQuestionCount: false,

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onLoad: function (options) {
    this._loadedAt = Date.now()
    var self = this
    var state   = tourStore.getTourState()
    var fromExhibitDetail = !!(options && (options.directFromDetail === '1' || options.exhibit))
    var exhibit = fromExhibitDetail ? (state.currentExhibit || null) : null
    var exhibitNameFromQuery = options && options.exhibit ? decodeURIComponent(options.exhibit) : ''
    var ttsPrefs = tourStore.getTtsPrefs()
    var pendingDeepDiveExhibit = options && options.directFromDetail === '1' && tourStore.consumePendingDetailExhibit
      ? tourStore.consumePendingDetailExhibit(exhibitNameFromQuery)
      : null
    if (pendingDeepDiveExhibit) exhibit = pendingDeepDiveExhibit
    if (!this._ttsAudioCache) this._ttsAudioCache = {}
    this._initCustomTopbar()
    this._initSafeArea()
    // Only reset chat on a fresh tour entry (hall page → tour).
    // When coming from exhibit-detail goDeeper(), options.exhibit is set —
    // preserve history so the user can still ask "我们刚才在讨论什么".
    var freshEntry = !fromExhibitDetail
    if (freshEntry) {
      chatStore.resetChat()
    }

    if (!exhibit && exhibitNameFromQuery) {
      var fallbackHall = state.currentHall || (options.hall ? decodeURIComponent(options.hall) : '')
      tourStore.setCurrentExhibit({
        id: exhibitNameFromQuery,
        name: exhibitNameFromQuery,
        hall: fallbackHall ? banpoHalls.normalizeHallToSlug(fallbackHall) : '',
        hallDisplay: fallbackHall ? banpoHalls.getHallDisplayName(fallbackHall) : '',
        objectKind: '展品',
      })
      exhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : tourStore.getTourState().currentExhibit || null
    }

    // URL param takes priority; fallback to saved canonical hall slug.
    var hallFromId = options.hallId ? banpoHalls.getHall(options.hallId) : null
    var rawHall = hallFromId
      ? hallFromId.backendSlug
      : (options.hall ? decodeURIComponent(options.hall) : (tourStore.getSavedCurrentHall() || null))
    var hallSlug = rawHall ? banpoHalls.normalizeHallToSlug(rawHall) : null
    var hallName = hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : null

    if (freshEntry) {
      if (tourStore.clearCurrentExhibit) {
        tourStore.clearCurrentExhibit()
      }
      exhibit = null
    } else if (exhibit && hallSlug && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit(exhibit, hallSlug)
      exhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : exhibit
    } else if (!freshEntry && exhibitNameFromQuery && hallSlug && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit({
        id: exhibitNameFromQuery,
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
      tourStore.updateTourState({ currentHall: hallSlug }, { deferPersist: true })
      patch.hallName = hallName
    } else {
      hallName = this.data.hallName
    }
    if (freshEntry) {
      var cachedMessages = hallSlug ? tourStore.getHallChatMessages(hallSlug) : []
      var messagesForPage = cachedMessages.length
        ? cachedMessages
        : [{ id: 1, role: 'assistant', content: buildWelcomeMessage(hallSlug, hallName), ttsStatus: 'idle' }]
      chatStore.setMessages(messagesForPage)
      patch.messages = messagesForPage
      if (!cachedMessages.length && hallSlug) {
        tourStore.saveHallChatMessages(hallSlug, messagesForPage, { defer: true })
      }
    } else {
      var storedMessages = chatStore.getState().messages
      if (storedMessages && storedMessages.length) {
        patch.messages = storedMessages
      } else if (hallSlug) {
        var cachedDeepDiveMessages = tourStore.getHallChatMessages(hallSlug)
        if (cachedDeepDiveMessages.length) {
          chatStore.setMessages(cachedDeepDiveMessages)
          patch.messages = cachedDeepDiveMessages
        } else {
          var welcomeForDeepDive = [{ id: 1, role: 'assistant', content: buildWelcomeMessage(hallSlug, hallName), ttsStatus: 'idle' }]
          chatStore.setMessages(welcomeForDeepDive)
          patch.messages = welcomeForDeepDive
          tourStore.saveHallChatMessages(hallSlug, welcomeForDeepDive, { defer: true })
        }
      }
    }
    patch.ttsEnabled = ttsPrefs.enabled !== false
    var shouldScrollToBottom = !!(patch.messages && patch.messages.length)
    this.setData(patch, function () {
      self._deferPostEnterWork()
      if (shouldScrollToBottom) self._scrollToBottomAfterRestore()
    })
  },

  // Refresh exhibit context when navigating back to this page (also after goDeeper)
  onShow: function () {
    this._loadedAt = Date.now()
    var self = this
    var state = tourStore.getTourState()
    var hallSlug = state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : null
    var hallName = hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : this.data.hallName
    var ttsPrefs = tourStore.getTtsPrefs()
    var patch = {}
    var pendingDeepDiveExhibit = tourStore.consumePendingDetailExhibit
      ? tourStore.consumePendingDetailExhibit()
      : null
    if (pendingDeepDiveExhibit) {
      var pendingHall = pendingDeepDiveExhibit.hall ? banpoHalls.normalizeHallToSlug(pendingDeepDiveExhibit.hall) : hallSlug
      if (pendingHall) {
        hallSlug = pendingHall
        hallName = banpoHalls.getHallDisplayName(hallSlug)
        tourStore.updateTourState({ currentHall: hallSlug }, { deferPersist: true })
      }
      if (tourStore.setCurrentExhibit) {
        tourStore.setCurrentExhibit(pendingDeepDiveExhibit, hallSlug)
      }
      state = tourStore.getTourState()
    }
    var hallChanged = hallSlug && this.data.hallName !== hallName
    var stateExhibit = state.currentExhibit || null
    if (stateExhibit && hallSlug) {
      var stateExhibitHall = stateExhibit.hall ? banpoHalls.normalizeHallToSlug(stateExhibit.hall) : hallSlug
      if (stateExhibitHall && stateExhibitHall !== hallSlug) stateExhibit = null
    }
    var nextExhibit = pendingDeepDiveExhibit || stateExhibit || null
    var nextSessionId = state.sessionId || null
    var nextTtsEnabled = ttsPrefs.enabled !== false
    var shouldScrollToBottom = false
    if (hallChanged) {
      var cachedMessages = tourStore.getHallChatMessages(hallSlug)
      var messagesForPage = cachedMessages.length
        ? cachedMessages
        : [{ id: 1, role: 'assistant', content: buildWelcomeMessage(hallSlug, hallName), ttsStatus: 'idle' }]
      chatStore.setMessages(messagesForPage)
      patch.messages = messagesForPage
      shouldScrollToBottom = !!messagesForPage.length
      wx.setNavigationBarTitle({ title: hallName })
      if (!cachedMessages.length) {
        tourStore.saveHallChatMessages(hallSlug, messagesForPage, { defer: true })
      }
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
    var state = tourStore.getTourState()
    var hall = state.currentHall || banpoHalls.normalizeHallToSlug(this.data.hallName) || null
    if (!hall) return []
    return tourStore.saveHallChatMessages(hall, chatStore.getState().messages, { defer: true })
  },

  _syncHallChatAndSummary: function () {
    this._persistCurrentHallChat()
    tourStore.summarizeCurrentHallRecord(chatStore.getState().messages)
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
    var h = Math.max(0, Number(height) || 0)
    // True-device keyboard height already includes the visible keyboard area.
    // Keep only the input bar above the keyboard; hide suggestions while typing
    // so iOS candidate bars and safe area do not stack into a large blank gap.
    var lift = h ? Math.max(0, h - (this._safeAreaBottom || 0)) : 0
    if (this._keyboardLift === lift && this.data.keyboardVisible === !!lift) return
    this._keyboardLift = lift
    var inputStyle = lift ? ('transform: translate3d(0,-' + lift + 'px,0);') : ''
    // The input bar is translated above the keyboard, but the message list should
    // reserve only the bar itself. Reserving keyboard height again creates a large
    // blank area and pushes the last AI bubble too far up on real devices.
    var messageListStyle = lift ? 'padding-bottom:176rpx;' : ''
    this.setData({
      inputPanelStyle: inputStyle,
      suggestionsPanelStyle: '',
      messageListStyle: messageListStyle,
      keyboardVisible: !!lift,
    })
    if (h) this._scrollToBottom()
  },

  // ── Send message ──────────────────────────────────────────────────────────

  sendMessage: function () {
    var text = (this.data.inputText || '').trim()
    if (!text || this.data.isThinking || this.data.isStreaming) return

    var self  = this
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken
    var isCtxQ = tourStore.isContextQuestion(text)
    var recentMsgsBeforeSend = isCtxQ ? chatStore.getRecentMessages(6) : []

    if (!id) {
      self._ensureTourSession().then(function (created) {
        if (!created) return
        self.setData({ inputText: text })
        self.sendMessage()
      })
      return
    }

    // ── Performance clock ──────────────────────────────────────────────────
    var now = Date.now()
    self._perf = { sendAt: now, streamStartAt: now, firstChunkAt: 0, doneAt: 0 }
    self._streamText = ''
    var questionClientEventId = makeClientEventId('question')

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
    var currentExhibit = state.currentExhibit || self.data.currentExhibit || null
    var currentHall = state.currentHall
      || (currentExhibit && currentExhibit.hall)
      || banpoHalls.normalizeHallToSlug(self.data.hallName)
      || ''
    currentHall = banpoHalls.normalizeHallToSlug(currentHall) || currentHall || ''
    if (currentExhibit && currentHall && tourStore.setCurrentExhibit) {
      tourStore.setCurrentExhibit(currentExhibit, currentHall)
      currentExhibit = tourStore.getCurrentExhibit ? tourStore.getCurrentExhibit() : currentExhibit
    }

    // ── Record exhibit_question event ──────────────────────────────────────
    var shouldCountQuestion = !self._resendWithoutQuestionCount
    self._resendWithoutQuestionCount = false
    tourStore.addTourEvent({
      eventType: 'exhibit_question',
      exhibitId: currentExhibit ? (currentExhibit.id || undefined) : undefined,
      hall:      currentHall,
      metadata:  {
        client_event_id: questionClientEventId,
        message: text.slice(0, 200),
        exhibit_name: currentExhibit ? (currentExhibit.name || '') : '',
        exhibit_kind: currentExhibit ? (currentExhibit.objectKind || currentExhibit.kind || '') : '',
      },
    })
    if (shouldCountQuestion) {
      tourStore.incrementAiConversationCount()
    }

    // ── Start SSE stream ───────────────────────────────────────────────────
    var stylePrefs = tourStore.getStylePrefs()
    var style = stylePrefs.enabled !== false
      ? { answer_length: stylePrefs.answerLength, depth: stylePrefs.depth, terminology: stylePrefs.terminology }
      : null

    // Detect referential questions and inject prior history only. The current
    // question is already sent as `message`; duplicating it in history can make
    // the backend take the slower context-rewrite path before the first token.
    var recentMsgs     = recentMsgsBeforeSend

    // Keep the retrieval query clean: send the user's original question as message.
    // Context and onboarding preferences are sent separately so they guide the answer
    // without polluting vector retrieval or forcing a fixed response template.
    var clientContext = tourStore.buildClientContext(text, {
      recentMessages: recentMsgs.length ? recentMsgs : (isCtxQ ? [] : null),
    })
    var _DEBUG_PROMPT = false   // set true locally to dump full prompt text
    console.log('[tour] context build', {
      hasExhibit:  !!currentExhibit,
      exhibitName: currentExhibit ? currentExhibit.name : '(none)',
      isCtxQ:      isCtxQ,
      recentCount: recentMsgs.length,
      contextLen:  clientContext.length,
    })
    if (_DEBUG_PROMPT) { console.log('[tour] client context', clientContext) }

    self._streamTask = api.tourApi.chatStream(id, {
      message:   text,
      token:     token,
      style:     style,
      clientContext: clientContext,
      conversationHistory: recentMsgs.length ? recentMsgs : null,
      clientEventId: questionClientEventId,
      exhibitId: currentExhibit ? currentExhibit.id : undefined,
      exhibitContext: buildExhibitContextForRequest(currentExhibit),

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
        var answerHall = currentHall || state.currentHall || banpoHalls.normalizeHallToSlug(self.data.hallName) || ''
        tourStore.addTourEvent({
          eventType: 'assistant_answer',
          exhibitId: currentExhibit ? (currentExhibit.id || undefined) : undefined,
          hall:      answerHall,
          metadata: {
            question_client_event_id: questionClientEventId,
            question: text.slice(0, 200),
            answer:   plainTextForTts(finalContent).slice(0, 600),
            trace_id: traceId,
            is_ceramic_question: !!(payload && payload.is_ceramic_question),
            exhibit_name: currentExhibit ? (currentExhibit.name || '') : '',
            exhibit_kind: currentExhibit ? (currentExhibit.objectKind || currentExhibit.kind || '') : '',
          },
        })
        self._dropPendingQuestionEvent(text, answerHall, questionClientEventId)

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
        })
        self._syncHallChatAndSummary()
        self._scrollToBottomSettled()
      },

      onError: function (err) {
        self._streamTask = null
        self._clearHintTimers()
        self._forceFlush()

        console.error('[stream] error at',
          self._perf ? (Date.now() - self._perf.sendAt) + ' ms' : '?',
          '| raw:', err)

        if (self._isRecoverableSessionError(err) && !self._sessionRecoveryRetrying) {
          self._recoverSessionAndRetry(text, state)
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
    })
    self._syncHallChatAndSummary()
    self._scrollToBottomSettled()
  },

  // ── TTS playback ─────────────────────────────────────────────────────────

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
        console.warn('[tts] synthesize failed', err)
        self._setMessageTtsStatus(messageId, 'idle')
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
        var audioBuffer = wx.base64ToArrayBuffer(audioBase64)
        var suffix = ext || 'wav'
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
      this._playTtsFile(q.messageId, q.paths[index], { queued: true })
      this._preloadNextTtsSegment()
      return
    }
    this._setMessageTtsStatus(q.messageId, 'loading')
    this._ensureTtsSegmentPath(index).then(function () {
      if (!q || q.seq !== this._ttsRequestSeq) return
      this._playTtsQueueIndex(index)
    }.bind(this)).catch(function (err) {
      console.warn('[tts] queued synthesize failed', err)
      this._setMessageTtsStatus(q.messageId, 'idle')
      wx.showToast({ title: '语音生成失败', icon: 'none', duration: 2000 })
      this._ttsQueue = null
    }.bind(this))
  },

  _preloadNextTtsSegment: function () {
    var q = this._ttsQueue
    if (!q) return
    var next = q.index + 1
    if (next >= q.segments.length || q.paths[next] || q.preloading[next]) return
    this._ensureTtsSegmentPath(next).catch(function (err) {
      console.warn('[tts] preload failed', err)
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

  _playTtsFile: function (messageId, filePath, options) {
    var self = this
    var opts = options || {}
    self._destroyTtsAudio()

    var ctx = wx.createInnerAudioContext()
    self._ttsAudioCtx = ctx
    self.setData({
      ttsState: {
        playingMessageId: messageId,
        loadingMessageId: null,
        audioPath: filePath,
      },
    })
    self._setMessageTtsStatus(messageId, 'playing')

    ctx.src = filePath
    ctx.onEnded(function () {
      if (opts.queued && self._ttsQueue && String(self._ttsQueue.messageId) === String(messageId)) {
        self._playTtsQueueIndex(self._ttsQueue.index + 1)
        return
      }
      self._setMessageTtsStatus(messageId, 'idle')
      self.setData({
        ttsState: { playingMessageId: null, loadingMessageId: null, audioPath: null },
      })
      self._destroyTtsAudio()
    })
    ctx.onStop(function () {
      self._setMessageTtsStatus(messageId, 'idle')
    })
    ctx.onError(function (err) {
      console.warn('[tts] playback failed', err)
      self._setMessageTtsStatus(messageId, 'idle')
      self.setData({
        ttsState: { playingMessageId: null, loadingMessageId: null, audioPath: null },
      })
      wx.showToast({ title: '语音播放失败', icon: 'none', duration: 2000 })
      self._destroyTtsAudio()
    })
    ctx.play()
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
    this.setData({
      ttsState: { playingMessageId: null, loadingMessageId: null, audioPath: null },
    })
  },

  _destroyTtsAudio: function () {
    if (!this._ttsAudioCtx) return
    try { this._ttsAudioCtx.destroy() } catch (_) {}
    this._ttsAudioCtx = null
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
   * Build guide suggestions for the current hall/exhibit context.
   * Phase 1 (instant): rule-based templates from tourStore.
   * Phase 2 (async):   enrich with real API exhibit data, update in place.
   */
  _loadSuggestions: function () {
    var self    = this
    var seq     = ++this._suggestionSeq
    var exhibit = this.data.currentExhibit || null
    var state   = tourStore.getTourState()
    var hall    = this.data.hallName || banpoHalls.getHallDisplayName(state.currentHall) || null

    // Phase 1 — instant rule-based suggestions
    var initial = tourStore.generateGuideSuggestions({
      currentExhibit: exhibit,
      currentHall:    hall,
      exhibits:       [],
    })
    self._applyGuideSuggestions(initial)

    // Phase 2 — enrich with real exhibit data from API (non-blocking)
    // exhibit.hall is already a backend slug; otherwise convert hall display name to slug.
    var hallSlug = exhibit
      ? (exhibit.hall || null)
      : (state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : (hall ? api.hallNameToSlug(hall) : null))
    if (!hallSlug) return

    if (self._suggestionFetchTimer) clearTimeout(self._suggestionFetchTimer)
    self._suggestionFetchTimer = setTimeout(function () {
      self._suggestionFetchTimer = null
      api.exhibitsApi.listByHall(hallSlug)
      .then(function (res) {
        if (seq !== self._suggestionSeq) return
        if (!res.ok || !res.data) return
        var rawList    = res.data.exhibits || res.data.items || (Array.isArray(res.data) ? res.data : [])
        var normalized = rawList.map(function (e) { return api.normalizeExhibit(e) })
        var enhanced   = tourStore.generateGuideSuggestions({
          currentExhibit: self.data.currentExhibit || null,
          currentHall:    self.data.hallName || banpoHalls.getHallDisplayName(tourStore.getTourState().currentHall) || null,
          exhibits:       normalized,
        })
        self._applyGuideSuggestions(enhanced)
      })
      .catch(function (err) {
        console.warn('[tour] suggestions: exhibit fetch failed', err)
        // Keep phase-1 suggestions — no user-visible error
      })
    }, 160)
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
    var state  = tourStore.getTourState()
    var events = tourStore.drainPendingEvents()

    if (!events.length || !state.sessionId) {
      if (callback) callback()
      return
    }

    api.tourApi.recordEvents(state.sessionId, events, state.sessionToken)
      .then(function (res) {
        if (!res || !res.ok) {
          console.warn('[tour] flush events returned non-ok, restoring:', res && res.status)
          tourStore.restorePendingEvents(events)
        }
        if (callback) callback()
      })
      .catch(function (err) {
        console.warn('[tour] flush events failed, restoring:', err)
        tourStore.restorePendingEvents(events)
        if (callback) callback()
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

  _dropPendingQuestionEvent: function (text, hall, clientEventId) {
    var events = tourStore.drainPendingEvents()
    if (!events.length) return
    var targetHall = hall ? banpoHalls.normalizeHallToSlug(hall) : ''
    var targetClientEventId = clientEventId ? String(clientEventId) : ''
    var targetQuestion = String(text || '').slice(0, 200)
    var removed = false
    var kept = events.filter(function (event) {
      if (removed || event.event_type !== 'exhibit_question') return true
      var metadata = event.metadata || {}
      var question = metadata.message || metadata.question || ''
      var eventHall = event.hall ? banpoHalls.normalizeHallToSlug(event.hall) : ''
      if (targetClientEventId && metadata.client_event_id === targetClientEventId) {
        removed = true
        return false
      }
      if (question === targetQuestion && (!targetHall || eventHall === targetHall)) {
        removed = true
        return false
      }
      return true
    })
    if (kept.length) tourStore.restorePendingEvents(kept)
  },

  _recoverSessionAndRetry: function (text, previousState) {
    var self = this
    var prev = previousState || tourStore.getTourState()
    var hall = prev.currentHall || banpoHalls.normalizeHallToSlug(self.data.hallName) || null
    var persona = prev.persona || tourStore.getBackendPersona() || 'B'
    var personaId = prev.personaId || persona || 'default'

    self._sessionRecoveryRetrying = true
    self._removeLastUserMessage(text)
    self._dropPendingQuestionEvent(text, hall)
    self.setData({
      inputText: text,
      streamingContent: '',
      isThinking: false,
      isStreaming: false,
      ragSteps: [],
      loadingHint: '',
    })

    tourStore.createLocalTourState({
      interestType: prev.interestType || persona || 'B',
      persona: persona,
      assumption: prev.assumption || prev.assumptionText || 'default',
      personaId: personaId,
    })
    if (hall) {
      tourStore.updateTourState({ currentHall: hall, status: 'touring' })
    }

    self._ensureTourSession().then(function (created) {
      self._sessionRecoveryRetrying = false
      if (created) {
        self._resendWithoutQuestionCount = true
        self.sendMessage()
        return
      }
      self._resendWithoutQuestionCount = false
      wx.showToast({ title: '会话恢复失败，请稍后重试', icon: 'none', duration: 2200 })
    }).catch(function (err) {
      self._sessionRecoveryRetrying = false
      self._resendWithoutQuestionCount = false
      console.warn('[tour] session recovery failed', err)
      wx.showToast({ title: '会话恢复失败，请稍后重试', icon: 'none', duration: 2200 })
    })
  },

  _ensureTourSession: function () {
    var self = this
    var state = tourStore.getTourState()
    if (state.sessionId) return Promise.resolve(true)

    wx.showLoading({ title: '正在连接导览…', mask: false })
    var persona = tourStore.getBackendPersona ? tourStore.getBackendPersona() : 'B'
    return api.tourApi.createSession({
      interest_type: state.interestType || persona || 'B',
      persona: persona || 'B',
      assumption: state.assumption || state.assumptionText || 'default',
      guest_id: 'wechat-mini',
    }).then(function (res) {
      wx.hideLoading()
      if (!res || !res.ok || !res.data) throw new Error('create session failed')
      var d = res.data
      tourStore.setTourSession({
        sessionId: d.id || d.session_id,
        sessionToken: d.session_token || null,
      })
      if (state.currentHall) tourStore.updateTourState({ currentHall: state.currentHall })
      self.setData({ sessionId: d.id || d.session_id || null })
      return !!(d.id || d.session_id)
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
    if (!this.data.currentExhibit && !(tourStore.getTourState().currentExhibit)) return
    tourStore.clearCurrentExhibit()
  },

  clearExhibitContext: function () {
    tourStore.clearCurrentExhibit()
    this.setData({ currentExhibit: null })
    this._loadSuggestions()
  },

  // ── Navigation ────────────────────────────────────────────────────────────

  goBackFromTour: function () {
    this._syncHallChatAndSummary()
    this._clearCurrentExhibitOnLeave()
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
