const authStore = require('./store/auth')

App({
  onLaunch: function () {
    this.globalData.authState = authStore.getAuthState()
  },

  onShow: function () {
    this.globalData.authState = authStore.getAuthState()
  },

  globalData: {
    authState: null,
    tourSession: null,
  },
})
