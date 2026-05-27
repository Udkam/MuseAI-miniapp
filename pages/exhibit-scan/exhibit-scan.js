Page({
  data: {
    exhibitName: '',
  },

  onNameInput: function (e) {
    this.setData({ exhibitName: e.detail.value })
  },

  takePhoto: function () {
    wx.showToast({ title: '拍照识别将在 Phase 6 接入', icon: 'none' })
  },

  submitName: function () {
    var name = (this.data.exhibitName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入展品名称', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/exhibit-detail/exhibit-detail?name=' + encodeURIComponent(name),
    })
  },
})
