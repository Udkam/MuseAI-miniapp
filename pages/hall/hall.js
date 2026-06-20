const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER

function _buildHallList(visitedSlugs) {
  var visited = visitedSlugs || []
  return DEFAULT_ORDER.map(function (id, index) {
    var hall = HALLS_MAP[id]
    if (!hall) return null
    var slug = hall.backendSlug || banpoHalls.normalizeHallToSlug(hall.name)
    return Object.assign({}, hall, {
      order: index + 1,
      isVisited: visited.indexOf(slug) !== -1,
    })
  }).filter(function (hall) {
    return !!hall
  })
}

Page({
  data: {
    halls: [],
    topbarStyle: '',
    topbarRowStyle: '',
  },

  _entering: false,

  onLoad: function () {
    this._initCustomTopbar()
    this._refresh()
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
    this._refresh()
  },

  _refresh: function () {
    var visited = tourStore.getTourState().visitedHalls || []
    var key = visited.join(',')
    // Re-render only when the visited set actually changed (e.g. after the user
    // engaged with a hall and returned). Avoids a redundant setData of identical
    // data during every page-transition into this page.
    if (key === this._visitedKey && this.data.halls.length) return
    this._visitedKey = key
    this.setData({ halls: _buildHallList(visited) })
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

  selectHall: function (e) {
    if (this._entering) return
    var self = this
    var hall = e.currentTarget.dataset.hall
    var state = tourStore.getTourState()
    var id = state.sessionId
    var token = state.sessionToken

    self._entering = true

    var hallSlug = hall.backendSlug || banpoHalls.normalizeHallToSlug(hall.name)
    tourStore.updateTourState({ currentHall: hallSlug, status: 'touring' }, { deferPersist: true })

    wx.navigateTo({
      url: '/pages/tour/tour?hallId=' + hall.id,
      complete: function () {
        setTimeout(function () { self._entering = false }, 300)
      },
    })

    setTimeout(function () {
      tourStore.addTourEvent({ eventType: 'hall_enter', hall: hallSlug })
    }, 0)

    if (id) {
      api.tourApi.updateSession(id, {
        status: 'touring',
        current_hall: hallSlug,
      }, token).catch(function (err) {
        console.warn('[hall] updateSession error (background):', err)
      })
    }
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
