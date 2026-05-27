const api = require('../../api/index')

Page({
  data: {
    hallName:   '展厅',
    messages: [
      {
        id:      1,
        role:    'assistant',
        content: '欢迎来到半坡遗址！我是你的 AI 导览伙伴 MuseAI。\n\n这里是距今约6000年的半坡先民聚居地，也是中国最早发掘、保存完整的新石器时代村落遗址之一。\n\n你想从哪里开始探索？',
      },
    ],
    inputText:  '',
    isThinking: false,
    msgId:      2,
    sessionId:  null,
  },

  onLoad: function (options) {
    var store = require('../../store/tour')
    var state = store.getTourState()
    if (options.hall) {
      var hallName = decodeURIComponent(options.hall)
      this.setData({ hallName: hallName, sessionId: state.sessionId || null })
      wx.setNavigationBarTitle({ title: hallName })
    } else {
      this.setData({ sessionId: state.sessionId || null })
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
      messages:   this.data.messages.concat(userMsg),
      inputText:  '',
      isThinking: true,
      msgId:      this.data.msgId + 1,
    })

    var self = this
    setTimeout(function () {
      var aiMsg = {
        id:      self.data.msgId,
        role:    'assistant',
        content: '（AI 导览功能将在 Phase 6 接入后端后启用）',
      }
      self.setData({
        messages:   self.data.messages.concat(aiMsg),
        isThinking: false,
        msgId:      self.data.msgId + 1,
      })
    }, 800)
  },

  // 后端连接测试
  checkHealth: function () {
    var self = this
    wx.showLoading({ title: '检测中…', mask: false })
    api.healthApi.check().then(function (res) {
      wx.hideLoading()
      if (res.ok) {
        var status = (res.data && res.data.status) || 'ok'
        wx.showToast({
          title:    '后端连接正常 · ' + status,
          icon:     'success',
          duration: 2000,
        })
      } else {
        wx.showToast({
          title:    '后端返回 ' + res.status,
          icon:     'none',
          duration: 2500,
        })
      }
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({
        title:    (err && err.message) || '连接失败',
        icon:     'none',
        duration: 2500,
      })
    })
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
