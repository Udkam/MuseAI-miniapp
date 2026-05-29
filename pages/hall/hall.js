const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var HALLS_MAP = {
  settlement: {
    id:   'settlement',
    name: '半坡聚落复原区',
    icon: '🏘️',
    desc: '还原六千年前半坡先民的居住场景，半穴居建筑、公共广场与围栏一一呈现。',
  },
  artifacts: {
    id:   'artifacts',
    name: '出土文物陈列区',
    icon: '🏺',
    desc: '收藏陶器、石器、骨器等珍贵文物，人面鱼纹盆为镇馆之宝。',
  },
  culture: {
    id:   'culture',
    name: '专题文化展区',
    icon: '📖',
    desc: '深度呈现半坡文化的历史地位、考古发掘历程与文化传承。',
  },
}

var DEFAULT_ORDER = ['settlement', 'artifacts', 'culture']

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

    var _navigateToHall = function () {
      tourStore.updateTourState({ currentHall: hall.name, status: 'touring' })
      // ── Record hall_enter event ───────────────────────────────────────────
      tourStore.addTourEvent({ eventType: 'hall_enter', hall: hall.name })
      wx.navigateTo({
        url: '/pages/tour/tour?hall=' + encodeURIComponent(hall.name) + '&hallId=' + hall.id,
      })
    }

    if (!id) {
      _navigateToHall()
      return
    }

    self.setData({ entering: true })

    api.tourApi.updateSession(id, {
      status:       'touring',
      current_hall: hall.name,
    }, token).then(function (res) {
      self.setData({ entering: false })
      if (!res.ok) {
        console.warn('[hall] updateSession failed:', res.status, res.data)
      }
      _navigateToHall()
    }).catch(function (err) {
      self.setData({ entering: false })
      console.warn('[hall] updateSession error — navigating anyway:', err)
      _navigateToHall()
    })
  },
})
