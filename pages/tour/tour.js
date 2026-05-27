Page({
  data: {
    hallName: '展厅',
    messages: [
      {
        id: 1,
        role: 'assistant',
        content: '欢迎来到半坡遗址！我是你的 AI 导览伙伴 MuseAI。\n\n这里是距今约6000年的半坡先民聚居地，也是中国最早发掘、保存完整的新石器时代村落遗址之一。\n\n你想从哪里开始探索？',
      },
    ],
    inputText: '',
    isThinking: false,
    msgId: 2,
  },

  onLoad: function (options) {
    if (options.hall) {
      this.setData({ hallName: decodeURIComponent(options.hall) })
      wx.setNavigationBarTitle({ title: decodeURIComponent(options.hall) })
    }
  },

  onInputChange: function (e) {
    this.setData({ inputText: e.detail.value })
  },

  sendMessage: function () {
    var text = (this.data.inputText || '').trim()
    if (!text || this.data.isThinking) return

    var userMsg = { id: this.data.msgId, role: 'user', content: text }
    this.setData({
      messages: this.data.messages.concat(userMsg),
      inputText: '',
      isThinking: true,
      msgId: this.data.msgId + 1,
    })

    var self = this
    setTimeout(function () {
      var aiMsg = {
        id: self.data.msgId,
        role: 'assistant',
        content: '（AI 导览功能将在 Phase 6 接入后端后启用）',
      }
      self.setData({
        messages: self.data.messages.concat(aiMsg),
        isThinking: false,
        msgId: self.data.msgId + 1,
      })
    }, 800)
  },

  goScan: function () {
    wx.navigateTo({ url: '/pages/exhibit-scan/exhibit-scan' })
  },

  goReport: function () {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  goRoute: function () {
    wx.navigateTo({ url: '/pages/route/route' })
  },
})
