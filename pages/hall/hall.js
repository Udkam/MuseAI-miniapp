const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER

function _buildHallList() {
  return DEFAULT_ORDER.map(function (id, index) {
    var hall = HALLS_MAP[id]
    if (!hall) return null
    return Object.assign({}, hall, {
      order: index + 1,
      isVisited: false,
    })
  }).filter(function (hall) {
    return !!hall
  })
}

Page({
  data: {
    halls: [],
    entering: false,
  },

  onLoad: function () {
    this._refresh()
  },

  onShow: function () {
    this._refresh()
  },

  _refresh: function () {
    this.setData({ halls: _buildHallList() })
  },

  selectHall: function (e) {
    if (this.data.entering) return
    var self = this
    var hall = e.currentTarget.dataset.hall
    var state = tourStore.getTourState()
    var id = state.sessionId
    var token = state.sessionToken

    self.setData({ entering: true })

    var hallSlug = hall.backendSlug || banpoHalls.normalizeHallToSlug(hall.name)
    tourStore.updateTourState({ currentHall: hallSlug, status: 'touring' })
    tourStore.addTourEvent({ eventType: 'hall_enter', hall: hallSlug })

    wx.navigateTo({
      url: '/pages/tour/tour?hall=' + encodeURIComponent(hall.name) + '&hallId=' + hall.id,
      complete: function () { self.setData({ entering: false }) },
    })

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
