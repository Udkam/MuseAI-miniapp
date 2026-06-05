const api       = require('../../api/index')
const chatStore = require('../../store/chat')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')

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
    scrollTarget:     '',    // intentionally empty; set by _scrollToBottom() on first send
    loadingHint:      '',    // progressive hint text while waiting for first chunk
    currentExhibit:   null,  // set by exhibit-detail goDeeper; null = general tour mode
    guideSuggestions: [],   // array of { id, type, icon, title, actionType, payload }
    showSuggestions:  false,
    ttsEnabled:       true,
    ttsState: {
      playingMessageId: null,
      loadingMessageId: null,
      audioPath: null,
    },
  },

  // ── Instance vars (non-reactive) ──────────────────────────────────────────
  _streamTask:    null,   // active RequestTask — call .abort() to cancel
  _scrollPending: false,  // debounce flag for _scrollToBottom
  _perf:          null,   // { sendAt, streamStartAt, firstChunkAt, doneAt }
  _hintTimer3:    null,   // upgrades loadingHint text at 3 s
  _hintTimer8:    null,   // upgrades loadingHint text at 8 s
  _chunkBuffer:   '',     // chunk text accumulator pending the next 80 ms flush
  _flushTimer:    null,   // timer ID for scheduled _chunkBuffer flush
  _loadedAt:      0,      // timestamp (ms) of last onLoad/onShow — ghost-tap guard
  _suggestionSeq: 0,      // prevents stale Phase-2 suggestions from overwriting the next hall/exhibit
  _ttsAudioCtx:   null,
  _ttsAudioCache: null,
  _ttsRequestSeq: 0,

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onLoad: function (options) {
    this._loadedAt = Date.now()
    var state   = tourStore.getTourState()
    var exhibit = state.currentExhibit || null
    var ttsPrefs = tourStore.getTtsPrefs()
    if (!this._ttsAudioCache) this._ttsAudioCache = {}
    // Only reset chat on a fresh tour entry (hall page → tour).
    // When coming from exhibit-detail goDeeper(), options.exhibit is set —
    // preserve history so the user can still ask "我们刚才在讨论什么".
    var freshEntry = !options.exhibit
    if (freshEntry) {
      chatStore.resetChat()
    }

    // URL param takes priority; fallback to saved canonical hall slug.
    var hallFromId = options.hallId ? banpoHalls.getHall(options.hallId) : null
    var rawHall = hallFromId
      ? hallFromId.backendSlug
      : (options.hall ? decodeURIComponent(options.hall) : (tourStore.getSavedCurrentHall() || null))
    var hallSlug = rawHall ? banpoHalls.normalizeHallToSlug(rawHall) : null
    var hallName = hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : null

    var patch = { sessionId: state.sessionId || null, currentExhibit: exhibit }
    if (hallName) {
      wx.setNavigationBarTitle({ title: hallName })
      tourStore.updateTourState({ currentHall: hallSlug })
      patch.hallName = hallName
    } else {
      hallName = this.data.hallName
    }
    if (freshEntry) {
      var welcomeMsg = { id: 1, role: 'assistant', content: buildWelcomeMessage(hallSlug, hallName), ttsStatus: 'idle' }
      chatStore.setMessages([welcomeMsg])
      patch.messages = [welcomeMsg]
    } else {
      var storedMessages = chatStore.getState().messages
      if (storedMessages && storedMessages.length) patch.messages = storedMessages
    }
    patch.ttsEnabled = ttsPrefs.enabled !== false
    this.setData(patch)
  },

  // Refresh exhibit context when navigating back to this page (also after goDeeper)
  onShow: function () {
    this._loadedAt = Date.now()
    var state = tourStore.getTourState()
    var hallName = state.currentHall ? banpoHalls.getHallDisplayName(state.currentHall) : this.data.hallName
    var ttsPrefs = tourStore.getTtsPrefs()
    this.setData({ currentExhibit: state.currentExhibit || null, sessionId: state.sessionId || null, hallName: hallName, ttsEnabled: ttsPrefs.enabled !== false })
    this._loadSuggestions()
  },

  onUnload: function () {
    this._clearHintTimers()
    this._clearFlushTimer()
    if (this._streamTask) {
      this._streamTask.abort()
      this._streamTask = null
    }
    this._stopTtsPlayback()
    this._destroyTtsAudio()
    // Fire-and-forget: best-effort flush of pending events on page leave
    this._flushEvents(null)
  },

  // ── Input ─────────────────────────────────────────────────────────────────

  onInputChange: function (e) {
    this.setData({ inputText: e.detail.value })
  },

  // ── Send message ──────────────────────────────────────────────────────────

  sendMessage: function () {
    var text = (this.data.inputText || '').trim()
    if (!text || this.data.isThinking || this.data.isStreaming) return

    var self  = this
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken

    // ── Performance clock ──────────────────────────────────────────────────
    var now = Date.now()
    self._perf = { sendAt: now, streamStartAt: now, firstChunkAt: 0, doneAt: 0 }

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
    })
    self._scrollToBottom()

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

    // No session — demo mode
    if (!id) {
      self._clearHintTimers()
      self.setData({ loadingHint: '' })
      self._mockReply('未检测到导览会话，请先完成首页问卷。当前为演示模式。')
      return
    }

    // ── Record exhibit_question event ──────────────────────────────────────
    tourStore.addTourEvent({
      eventType: 'exhibit_question',
      hall:      state.currentHall || banpoHalls.normalizeHallToSlug(self.data.hallName) || '',
      metadata:  { message: text.slice(0, 200) },
    })

    // ── Start SSE stream ───────────────────────────────────────────────────
    var stylePrefs = tourStore.getStylePrefs()
    var style = stylePrefs.enabled !== false
      ? { answer_length: stylePrefs.answerLength, depth: stylePrefs.depth, terminology: stylePrefs.terminology }
      : null

    // Detect referential questions (e.g. "我们在讨论什么") and inject recent history
    var currentExhibit = state.currentExhibit || null
    var isCtxQ         = tourStore.isContextQuestion(text)
    var recentMsgs     = chatStore.getRecentMessages(6)

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
      conversationHistory: recentMsgs,
      exhibitId: currentExhibit ? currentExhibit.id : undefined,

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
          self.setData({ isThinking: false, isStreaming: true, loadingHint: '' })
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
          || self.data.streamingContent
          || ''

        var traceId = payload.trace_id || null
        chatStore.finishAssistantMessage({ content: finalContent, traceId: traceId })
        tourStore.incrementAiConversationCount()

        var aiMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: finalContent,
          traceId: traceId,
          ttsStatus: 'idle',
        }
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
        self._scrollToBottom()
      },

      onError: function (err) {
        self._streamTask = null
        self._clearHintTimers()
        self._forceFlush()

        console.error('[stream] error at',
          self._perf ? (Date.now() - self._perf.sendAt) + ' ms' : '?',
          '| raw:', err)

        var friendly = self._friendlyError(err)
        chatStore.setError(friendly)
        wx.showToast({ title: friendly, icon: 'none', duration: 2500 })

        var errMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: '⚠ ' + friendly,
          isError: true,
        }
        self.setData({
          messages:         self.data.messages.concat(errMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
          ragSteps:         [],
          loadingHint:      '',
          showSuggestions:  self.data.guideSuggestions.length > 0,
        })
        self._scrollToBottom()
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

    var accumulated  = self.data.streamingContent
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
    self.setData({
      messages:         self.data.messages.concat(stoppedMsg),
      streamingContent: '',
      isThinking:       false,
      isStreaming:      false,
      ragSteps:         [],
      loadingHint:      '',
    })
    self._scrollToBottom()
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

    var cachedPath = self._ttsAudioCache[cacheKey]
    if (cachedPath) {
      self._playTtsFile(messageId, cachedPath)
      return
    }

    self._setMessageTtsStatus(messageId, 'loading')
    var prefs = tourStore.getTtsPrefs()
    var persona = tourStore.getBackendPersona()

    api.ttsApi.synthesize(content, prefs.voice || '冰糖', null, persona)
      .then(function (res) {
        if (!res || !res.ok || !res.data || !res.data.audio) {
          throw new Error('TTS synthesize failed')
        }
        if (res.data.format && res.data.format !== 'pcm16') {
          throw new Error('Unsupported TTS format: ' + res.data.format)
        }
        return self._writePcm16AsWav(messageId, res.data.audio)
      })
      .then(function (filePath) {
        if (seq !== self._ttsRequestSeq) {
          self._setMessageTtsStatus(messageId, 'idle')
          return
        }
        self._ttsAudioCache[cacheKey] = filePath
        self._playTtsFile(messageId, filePath)
      })
      .catch(function (err) {
        if (seq !== self._ttsRequestSeq) return
        console.warn('[tts] synthesize failed', err)
        self._setMessageTtsStatus(messageId, 'idle')
        wx.showToast({ title: '语音生成失败', icon: 'none', duration: 2000 })
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

  _playTtsFile: function (messageId, filePath) {
    var self = this
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
    self.setData({ guideSuggestions: initial, showSuggestions: initial.length > 0 })

    // Phase 2 — enrich with real exhibit data from API (non-blocking)
    // exhibit.hall is already a backend slug; otherwise convert hall display name to slug.
    var hallSlug = exhibit
      ? (exhibit.hall || null)
      : (state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : (hall ? api.hallNameToSlug(hall) : null))
    if (!hallSlug) return

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
        if (enhanced.length > 0) {
          self.setData({ guideSuggestions: enhanced, showSuggestions: true })
        }
      })
      .catch(function (err) {
        console.warn('[tour] suggestions: exhibit fetch failed', err)
        // Keep phase-1 suggestions — no user-visible error
      })
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
   *   'navigate_back'  — wx.navigateBack
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

      case 'navigate_back':
        wx.navigateBack({ delta: 1 })
        break

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
        var next = self.data.streamingContent + self._chunkBuffer
        self._chunkBuffer = ''
        self.setData({ streamingContent: next })
        self._scrollToBottom()
      }
    }, 80)
  },

  _forceFlush: function () {
    this._clearFlushTimer()
    if (this._chunkBuffer) {
      var next = this.data.streamingContent + this._chunkBuffer
      this._chunkBuffer = ''
      this.setData({ streamingContent: next })
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
        self.setData({
          messages:         self.data.messages.concat(aiMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
        })
        self._scrollToBottom()
        return
      }
      var ch = reply.charAt(i)
      chatStore.appendAssistantChunk(ch)
      self._chunkBuffer += ch
      self._scheduleFlush()
      i++
    }, 35)
  },

  // ── Scroll helper (debounced, toggles anchor ID to force re-scroll) ────────

  _scrollToBottom: function () {
    var self = this
    if (self._scrollPending) return
    self._scrollPending = true
    setTimeout(function () {
      self._scrollPending = false
      var cur  = self.data.scrollTarget
      var next = (cur === '' || cur === 'msg-bottom-a') ? 'msg-bottom-b' : 'msg-bottom-a'
      self.setData({ scrollTarget: next })
    }, 80)
  },

  // ── Health check ──────────────────────────────────────────────────────────

  checkHealth: function () {
    var self = this
    wx.showLoading({ title: '检测中…', mask: false })
    api.healthApi.check().then(function (res) {
      wx.hideLoading()
      if (res.ok) {
        var status = (res.data && res.data.status) || 'ok'
        wx.showToast({ title: '后端正常 · ' + status, icon: 'success', duration: 2000 })
      } else {
        wx.showToast({ title: '后端返回 ' + res.status, icon: 'none', duration: 2500 })
      }
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '连接失败', icon: 'none', duration: 2500 })
    })
  },

  // ── Exhibit context ───────────────────────────────────────────────────────

  clearExhibitContext: function () {
    tourStore.clearCurrentExhibit()
    this.setData({ currentExhibit: null })
    this._loadSuggestions()
  },

  // ── Navigation ────────────────────────────────────────────────────────────

  goScan: function () {
    wx.navigateTo({ url: '/pages/exhibit-scan/exhibit-scan' })
  },

  goReport: function () {
    var self = this
    if (self._reportNavigating) return
    self._reportNavigating = true

    if (self.data.isThinking || self.data.isStreaming) {
      self.stopStream()
    }

    // Navigate first so a slow/cancelled event upload never makes the button feel dead.
    wx.navigateTo({
      url: '/pages/report/report',
      complete: function () {
        setTimeout(function () { self._reportNavigating = false }, 600)
      },
    })

    // Best-effort background flush; report page also merges local pending events.
    setTimeout(function () {
      self._flushEvents(null)
    }, 0)
  },
})
