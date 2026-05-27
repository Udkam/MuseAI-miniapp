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
    streamingContent: '',   // live content — updated on every chunk, NOT in messages[]
    isThinking:       false, // waiting for first chunk
    isStreaming:      false, // receiving chunks
    ragSteps:         [],    // RAG pipeline progress (from onEvent)
    inputText:        '',
    sessionId:        null,
    scrollTarget:     'msg-bottom-a',
  },

  // ── Instance vars (not reactive) ──────────────────────────────────────────
  _streamTask:    null,   // active RequestTask, for abort()
  _scrollPending: false,  // debounce flag

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

    // Append user message to page data immediately
    var userMsg = { id: Date.now(), role: 'user', content: text }
    chatStore.addUserMessage(text)
    self.setData({
      messages:         self.data.messages.concat(userMsg),
      inputText:        '',
      isThinking:       true,
      isStreaming:      false,
      streamingContent: '',
      ragSteps:         [],
    })
    self._scrollToBottom()

    // No session — show demo mode reply
    if (!id) {
      self._mockReply('未检测到导览会话，请先完成首页问卷。当前为演示模式。')
      return
    }

    // Start SSE stream
    self._streamTask = api.tourApi.chatStream(id, {
      message: text,
      token:   token,

      onChunk: function (chunk) {
        if (!chunk) return

        // Transition THINKING → STREAMING on first chunk
        if (!self.data.isStreaming) {
          chatStore.startAssistantMessage()
          self.setData({ isThinking: false, isStreaming: true })
        }

        // Partial path update: only update streamingContent, NOT messages[]
        chatStore.appendAssistantChunk(chunk)
        self.setData({ streamingContent: self.data.streamingContent + chunk })
        self._scrollToBottom()
      },

      onEvent: function (ev) {
        if (ev.type === 'rag_step') {
          chatStore.setRagStep(ev.step, ev.status, ev.message)
          // Partial path update: only ragSteps[]
          self.setData({ ragSteps: chatStore.getState().ragSteps })
        }
        // thinking events are visual-only — no extra action needed
      },

      onDone: function (payload) {
        self._streamTask = null

        // Resolve final content (three shapes the backend may send)
        var finalContent = payload.content
          || (payload.chunks && payload.chunks.join(''))
          || chatStore.getState().streamingBuffer
          || self.data.streamingContent
          || ''

        var traceId = payload.trace_id || null
        chatStore.finishAssistantMessage({ content: finalContent, traceId: traceId })

        // Commit streaming bubble into messages[], clear streaming state
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
        })
        self._scrollToBottom()
      },

      onError: function (err) {
        self._streamTask = null
        var msg = (err && err.message) || '连接中断'
        chatStore.setError(msg)

        wx.showToast({ title: msg, icon: 'none', duration: 2500 })

        var errMsg = {
          id:      Date.now(),
          role:    'assistant',
          content: '⚠ ' + msg,
          isError: true,
        }
        self.setData({
          messages:         self.data.messages.concat(errMsg),
          streamingContent: '',
          isThinking:       false,
          isStreaming:      false,
          ragSteps:         [],
        })
        self._scrollToBottom()
      },
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
      // Feed one character at a time to simulate streaming
      var chunk = reply.charAt(i)
      chatStore.appendAssistantChunk(chunk)
      self.setData({ streamingContent: self.data.streamingContent + chunk })
      if (i % 4 === 0) self._scrollToBottom()
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
