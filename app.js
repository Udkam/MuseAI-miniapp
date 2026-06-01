const authStore = require('./store/auth')
const storage   = require('./utils/storage')

App({
  onLaunch: function () {
    storage.ensureTourCacheSchema()
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
