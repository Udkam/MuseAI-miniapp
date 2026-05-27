const api       = require('../../api/index')
const chatStore = require('../../store/chat')
const tourStore = require('../../store/tour')

Page({
  data: {
    hallName:         '展厅',
    messages: [
      {
        id:      1,
        role:    'assistant',
        content: '欢迎来到半坡遗址！我是你的 AI 导览伙伴 MuseAI。\n\n这里是距今约6000年的半坡先民聚居地，也是中国最早发掘、保存完整的新石器时代村落遗址之一。\n\n你想从哪里开始探索？',
      },
    ],
    streamingContent: '',    // live text — throttled setData, NOT stored in messages[]
    isThinking:       false, // waiting for first chunk
    isStreaming:      false, // receiving chunks
    ragSteps:         [],    // RAG pipeline progress (from onEvent)
    inputText:        '',
    sessionId:        null,
    scrollTarget:     'msg-bottom-a',
    loadingHint:      '',    // progressive hint text while waiting for first chunk
  },

  // ── Instance vars (non-reactive) ──────────────────────────────────────────
  _streamTask:    null,   // active RequestTask — call .abort() to cancel
  _scrollPending: false,  // debounce flag for _scrollToBottom
  _perf:          null,   // { sendAt, streamStartAt, firstChunkAt, doneAt }
  _hintTimer3:    null,   // upgrades loadingHint text at 3 s
  _hintTimer8:    null,   // upgrades loadingHint text at 8 s
  _chunkBuffer:   '',     // chunk text accumulator pending the next 80 ms flush
  _flushTimer:    null,   // timer ID for scheduled _chunkBuffer flush

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onLoad: function (options) {
    var state = tourStore.getTourState()
    chatStore.resetChat()

    if (options.hall) {
      var hallName = decodeURIComponent(options.hall)
      wx.setNavigationBarTitle({ title: hallName })
      this.setData({ hallName: hallName, sessionId: state.sessionId || null })
    } else {
      this.setData({ sessionId: state.sessionId || null })
    }
  },

  onUnload: function () {
    this._clearHintTimers()
    this._clearFlushTimer()
    if (this._streamTask) {
      this._streamTask.abort()
      this._streamTask = null
    }
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

    // ── Start SSE stream ───────────────────────────────────────────────────
    self._streamTask = api.tourApi.chatStream(id, {
      message: text,
      token:   token,

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
        // thinking events are visual-only — thinking dots already shown
      },

      onDone: function (payload) {
        self._streamTask = null
        self._clearHintTimers()

        // ── Performance summary ────────────────────────────────────────────
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

        // Resolve final content (three shapes the backend may send)
        var finalContent = payload.content
          || (payload.chunks && payload.chunks.join(''))
          || chatStore.getState().streamingBuffer
          || self.data.streamingContent
          || ''

        var traceId = payload.trace_id || null
        chatStore.finishAssistantMessage({ content: finalContent, traceId: traceId })

        var aiMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: finalContent,
          traceId: traceId,
        }
        self.setData({
          messages:         self.data.messages.concat(aiMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
          ragSteps:         [],
          loadingHint:      '',
        })
        self._scrollToBottom()
      },

      onError: function (err) {
        self._streamTask = null
        self._clearHintTimers()
        self._forceFlush()

        // Preserve raw error in console for debugging
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
      console.log('[perf] stream aborted by user at',
        Date.now() - self._perf.sendAt, 'ms')
    }

    if (self._streamTask) {
      self._streamTask.abort()
      self._streamTask = null
    }
    self._clearHintTimers()
    self._forceFlush()

    // Preserve whatever was accumulated; append stop marker
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

  // ── Chunk-flush helpers ────────────────────────────────────────────────────

  /**
   * Schedule a 80 ms batch flush of _chunkBuffer → streamingContent setData.
   * Multiple chunk arrivals within the same 80 ms window are batched into one
   * setData call, reducing JS-to-renderer bridge traffic significantly.
   */
  _scheduleFlush: function () {
    var self = this
    if (self._flushTimer) return  // already scheduled; accumulate into buffer
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

  /** Synchronously flush _chunkBuffer (used on done / stop / error). */
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
    if (status >= 500) {
      return '服务器暂时繁忙，请稍后再试。'
    }
    if (status >= 400 && status < 500) {
      return '请求参数有误，请重试或刷新页面。'
    }
    // Network failures: wx errMsg contains 'request:fail', 'ERR_', etc.
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
        var aiMsg = { id: Date.now(), role: 'assistant', content: reply }
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
      var next = self.data.scrollTarget === 'msg-bottom-a' ? 'msg-bottom-b' : 'msg-bottom-a'
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

  // ── Navigation ────────────────────────────────────────────────────────────

  goScan:   function () { wx.navigateTo({ url: '/pages/exhibit-scan/exhibit-scan' }) },
  goReport: function () { wx.navigateTo({ url: '/pages/report/report' }) },
  goRoute:  function () { wx.navigateTo({ url: '/pages/route/route' }) },
})
