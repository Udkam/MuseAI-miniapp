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
  },

  _entering: false,

  onLoad: function () {
    this._refresh()
    this._preloadNext()
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
})
