const tourStore = require('../../store/tour')
const api       = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER

function _buildOrderedHalls(preferredOrder) {
  var order  = (preferredOrder && preferredOrder.length) ? preferredOrder : DEFAULT_ORDER
  var result = []
  order.forEach(function (id, idx) {
    var hall = HALLS_MAP[id]
    if (hall) result.push(Object.assign({}, hall, { isRecommended: idx === 0 }))
  })
  // Append any halls not in order (safety net)
  DEFAULT_ORDER.forEach(function (id) {
    if (order.indexOf(id) === -1 && HALLS_MAP[id]) {
      result.push(Object.assign({}, HALLS_MAP[id], { isRecommended: false }))
    }
  })
  return result
}

Page({
  data: {
    halls:    [],
    entering: false,
  },

  onLoad: function () {
    var state = tourStore.getTourState()
    var halls = _buildOrderedHalls(state.preferredHallOrder)
    this.setData({ halls: halls })
  },

  selectHall: function (e) {
    if (this.data.entering) return
    var self  = this
    var hall  = e.currentTarget.dataset.hall
    var state = tourStore.getTourState()
    var id    = state.sessionId
    var token = state.sessionToken

    self.setData({ entering: true })

    // Update local state and navigate immediately — no waiting for API
    var hallSlug = hall.backendSlug || banpoHalls.normalizeHallToSlug(hall.name)
    tourStore.updateTourState({ currentHall: hallSlug, status: 'touring' })
    tourStore.addTourEvent({ eventType: 'hall_enter', hall: hallSlug })
    wx.navigateTo({
      url: '/pages/tour/tour?hall=' + encodeURIComponent(hall.name) + '&hallId=' + hall.id,
      complete: function () { self.setData({ entering: false }) },
    })

    // Fire-and-forget: sync backend state in background
    if (id) {
      api.tourApi.updateSession(id, {
        status:       'touring',
        current_hall: hallSlug,
      }, token).catch(function (err) {
        console.warn('[hall] updateSession error (background):', err)
      })
    }
  },
})
