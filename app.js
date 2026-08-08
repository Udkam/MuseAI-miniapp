const storage   = require('./utils/storage')

App({
  onLaunch: function () {
    storage.clearLegacyAuth()
    storage.ensureTourCacheSchema()
  },

  globalData: {
    tourSession: null,
  },
})
