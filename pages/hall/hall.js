const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const hallData = require('../../utils/hall-data')
const tourSession = require('../../utils/tour-session')

function hallCatalogSignature(list) {
  return JSON.stringify((Array.isArray(list) ? list : []).map(function (item) {
    return {
      slug: item.slug || item.hall_slug || item.id || '',
      name: item.name || item.title || '',
      shortDescription: item.short_description || item.shortDescription || '',
      cardDescription: item.card_description || item.cardDescription || '',
      description: item.description || item.desc || '',
      exhibitCount: item.exhibit_count !== undefined ? item.exhibit_count : item.exhibitCount,
      active: item.is_active !== undefined ? item.is_active : item.active,
      iconSrc: item.icon_src || item.iconSrc || '',
    }
  }))
}

Page({
  data: {
    halls: [],
    loading: true,
    topbarStyle: '',
    topbarRowStyle: '',
  },

  _entering: false,
  _sessionEnsureAttempts: 0,
  _sessionRetryTimer: null,
  _remoteHalls: null,
  _remoteHallCatalogAuthoritative: false,
  _hallLoadFailed: false,

  onLoad: function () {
    tourStore.markCurrentPage('pages/hall/hall')
    var startedAt = tourStore.ensureTourStartedAt()
    tourSync.queueSessionSnapshot({
      tour_started_at: startedAt,
      status: 'opening',
    }, { defer: true, maxAttempts: 3 })
    this._initCustomTopbar()
    this._loadHallData()
    this._ensureSession()
    this._preloadNext()
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

  onShow: function () {
    tourStore.markCurrentPage('pages/hall/hall')
    if (this._remoteHallCatalogAuthoritative || this._hallLoadFailed) this._refresh()
    var forceRefresh = this._hasShownOnce === true
    this._hasShownOnce = true
    this._loadHallData(forceRefresh)
  },

  onUnload: function () {
    if (this._sessionRetryTimer) {
      clearTimeout(this._sessionRetryTimer)
      this._sessionRetryTimer = null
    }
  },

  _refresh: function () {
    var visited = tourStore.getTourState().visitedHalls || []
    var authoritative = this._remoteHallCatalogAuthoritative === true
    var key = visited.join(',') + '|' + (this._remoteHallSignature || '') + '|' + authoritative
    // Re-render only when the visited set actually changed (e.g. after the user
    // engaged with a hall and returned). Avoids a redundant setData of identical
    // data during every page-transition into this page.
    if (key === this._visitedKey) return
    this._visitedKey = key
    this.setData({
      halls: hallData.buildHallList(visited, this._remoteHalls || [], {
        authoritative: authoritative,
      }),
    })
  },

  _loadHallData: function (forceRefresh) {
    if (this._hallDataLoading || (!forceRefresh && this._remoteHalls)) return
    var self = this
    this._hallDataLoading = true
    return api.tourApi.getHalls().then(function (res) {
      self._hallDataLoading = false
      if (!res || !res.ok) throw new Error('hall catalog request failed')
      var list = Array.isArray(res.data)
        ? res.data
        : (res.data && (res.data.halls !== undefined ? res.data.halls : res.data.items))
      if (!Array.isArray(list) || list.some(function (item) { return !item || typeof item !== 'object' })) {
        throw new Error('hall catalog response must contain an array of objects')
      }
      self._remoteHalls = list
      self._remoteHallCatalogAuthoritative = true
      self._hallLoadFailed = false
      self._remoteHallSignature = hallCatalogSignature(list)
      self.setData({ loading: false })
      self._refresh()
    }).catch(function (err) {
      self._hallDataLoading = false
      self._remoteHalls = null
      self._remoteHallCatalogAuthoritative = false
      self._hallLoadFailed = true
      self.setData({ loading: false })
      console.warn('[hall] structured hall data unavailable; showing an empty catalog', err)
      self._refresh()
    })
  },

  _ensureSession: function () {
    if (tourStore.getTourState().sessionId) {
      tourSync.flushPendingSessionSync({ maxAttempts: 3 })
      return
    }
    this._sessionEnsureAttempts += 1
    var self = this
    tourSession.ensureTourSession().then(function (res) {
      if (res && res.ok) {
        tourSync.flushPendingSessionSync({ maxAttempts: 3 })
      } else {
        console.warn('[hall] guest session bootstrap remains queued:', res && res.status)
        if (self._sessionEnsureAttempts < 2 && !self._sessionRetryTimer) {
          self._sessionRetryTimer = setTimeout(function () {
            self._sessionRetryTimer = null
            self._ensureSession()
          }, 500)
        }
      }
    })
  },

  _preloadNext: function () {
    preload.preloadPages([
      '/pages/tour/tour',
      '/pages/route/route',
      '/pages/exhibit-scan/exhibit-scan',
      '/pages/report/report',
    ], 120)
    preload.preloadImages(preload.TOUR_ICON_ASSETS, 160)
  },

  onHallIconError: function (event) {
    var index = Number(event && event.currentTarget && event.currentTarget.dataset.index)
    var hall = Array.isArray(this.data.halls) ? this.data.halls[index] : null
    if (!hall || !hall.iconFallbackSrc || hall.iconSrc === hall.iconFallbackSrc) return
    var key = 'halls[' + index + '].iconSrc'
    var patch = {}
    patch[key] = hall.iconFallbackSrc
    this.setData(patch)
  },

  selectHall: function (e) {
    if (this._entering) return
    var self = this
    var hall = e.currentTarget.dataset.hall
    self._entering = true

    var hallSlug = hall.backendSlug || banpoHalls.normalizeHallToSlug(hall.name)
    tourStore.updateTourState({
      currentHall: hallSlug,
      currentHallName: hall.name || '',
      currentHallDescription: hall.desc || '',
      currentHallCardDescription: hall.cardDesc || '',
      currentHallFocus: hall.focus || '',
      status: 'touring',
    }, { deferPersist: true })

    wx.navigateTo({
      url: '/pages/tour/tour?hall=' + encodeURIComponent(hallSlug) +
        '&hallName=' + encodeURIComponent(hall.name || ''),
      complete: function () {
        setTimeout(function () { self._entering = false }, 300)
      },
    })

    setTimeout(function () {
      tourStore.addTourEvent({ eventType: 'hall_enter', hall: hallSlug })
    }, 0)

    tourSync.queueSessionSnapshot({
      status: 'touring',
      current_hall: hallSlug,
      current_exhibit_id: null,
    }, { defer: true, maxAttempts: 3 })
  },

  goRoute: function () {
    wx.navigateTo({ url: '/pages/route/route' })
  },

  goReport: function () {
    var self = this
    if (self._reportNavigating) return
    self._reportNavigating = true
    tourStore.summarizeStoredHallRecords()
    wx.navigateTo({
      url: '/pages/report/report',
      complete: function () {
        setTimeout(function () { self._reportNavigating = false }, 600)
      },
    })
  },

  goBackFromHall: function () {
    var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages && pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.reLaunch({ url: '/pages/home/home' })
  },
})
