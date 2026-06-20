const tourStore = require('../../store/tour')
const api       = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')

var MOCK_EXHIBITS = {
  '人面鱼纹盆': {
    id: 'mock-1', name: '人面鱼纹盆', category: '彩陶', era: '距今约6000年',
    hall: 'basic-exhibition-hall', hallDisplay: '基本陈列展厅',
    description: '仰韶文化半坡类型彩陶的代表作。陶盆内壁绘有两组人面与鱼纹交错的纹样，人面额头绘鱼纹，嘴角伸出鱼，充满神秘的巫术意味，是研究半坡先民精神世界的重要实物。',
  },
  '尖底瓶': {
    id: 'mock-2', name: '尖底瓶', category: '汲水陶器', era: '距今约6000年',
    hall: 'basic-exhibition-hall', hallDisplay: '基本陈列展厅',
    description: '半坡遗址最具特色的日用陶器之一。尖底设计利用水的浮力自动扶正，是新石器时代先民的巧妙发明，体现了半坡人高超的物理智慧。',
  },
}

var DEFAULT_EXHIBIT = {
  id: '', name: '', category: '展品', objectKind: '展品', era: '新石器时代',
  hall: 'basic-exhibition-hall', hallDisplay: '基本陈列展厅',
  description: '该展品资料待馆方完整清单确认。你可以先围绕它的名称、所在展厅和现场观察向 MuseAI 追问。',
}

function buildFallbackExhibit(name) {
  var state = tourStore.getTourState()
  var hall = state.currentHall ? banpoHalls.normalizeHallToSlug(state.currentHall) : DEFAULT_EXHIBIT.hall
  return Object.assign({}, DEFAULT_EXHIBIT, {
    id: 'local-' + (name || 'unknown'),
    name: name || '未知展品',
    hall: hall,
    hallDisplay: banpoHalls.getHallDisplayName(hall),
  })
}

function reportableExhibitId(exhibit) {
  var id = exhibit && exhibit.id ? String(exhibit.id) : ''
  if (id && id.indexOf('local-') !== 0 && id.indexOf('mock-') !== 0) return id
  return undefined
}

function hallIdFromSlug(slug) {
  var normalized = banpoHalls.normalizeHallToSlug(slug)
  var order = banpoHalls.DEFAULT_ORDER || []
  var map = banpoHalls.HALLS_MAP || {}
  for (var i = 0; i < order.length; i++) {
    var id = order[i]
    var hall = map[id]
    if (hall && banpoHalls.normalizeHallToSlug(hall.backendSlug || hall.name) === normalized) {
      return id
    }
  }
  return ''
}

function resolveHallSlugForExhibit(exhibit) {
  var state = tourStore.getTourState()
  var saved = tourStore.getSavedCurrentHall ? tourStore.getSavedCurrentHall() : ''
  return banpoHalls.normalizeHallToSlug(exhibit && exhibit.hall) ||
    banpoHalls.normalizeHallToSlug(state.currentHall) ||
    banpoHalls.normalizeHallToSlug(saved) ||
    ''
}

function findBackDeltaToTour() {
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  for (var i = pages.length - 2; i >= 0; i--) {
    if (pages[i] && pages[i].route === 'pages/tour/tour') {
      return pages.length - 1 - i
    }
  }
  return 0
}

function makeClientEventId(prefix) {
  return String(Date.now()) + '-' + (prefix || 'evt') + '-' + Math.random().toString(36).slice(2, 10)
}

Page({
  data: {
    exhibit: DEFAULT_EXHIBIT,
    loading: true,
  },

  _enterAt: 0,
  _viewRecorded: false,

  onLoad: function (options) {
    var self = this
    var id   = options.id   ? decodeURIComponent(options.id)   : ''
    var name = options.name ? decodeURIComponent(options.name) : ''
    var local = options.local === '1'

    this._enterAt = Date.now()
    this._preloadNext()
    wx.setNavigationBarTitle({ title: name || '展品详情' })

    if (local) {
      var cached = tourStore.consumePendingDetailExhibit
        ? tourStore.consumePendingDetailExhibit(name)
        : null
      if (cached && (!name || cached.name === name)) {
        self.setData({ exhibit: cached, loading: false }, function () {
          self._recordExhibitView(cached, null, 'detail_enter')
        })
        wx.setNavigationBarTitle({ title: cached.name || '展品详情' })
      } else {
        self._useMock(name)
      }
    } else if (id) {
      api.exhibitsApi.get(id).then(function (res) {
        if (res.ok && res.data) {
          var ex = api.normalizeExhibit(res.data)
          self.setData({ exhibit: ex, loading: false }, function () {
            self._recordExhibitView(ex, null, 'detail_enter')
          })
          wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
        } else {
          self._loadByName(name)
        }
      }).catch(function () { self._loadByName(name) })
    } else if (name) {
      self._loadByName(name)
    } else {
      self.setData({ exhibit: DEFAULT_EXHIBIT, loading: false })
    }
  },

  _preloadNext: function () {
    preload.preloadPages(['/pages/tour/tour', '/pages/exhibit-scan/exhibit-scan'], 120)
    preload.preloadImages(preload.TOUR_ICON_ASSETS, 160)
  },

  _loadByName: function (name) {
    var self = this
    if (!name) { self.setData({ exhibit: DEFAULT_EXHIBIT, loading: false }); return }
    api.exhibitsApi.search(name).then(function (res) {
      if (res.ok && res.data && res.data.exhibits && res.data.exhibits.length) {
        var best = res.data.exhibits[0]
        return api.exhibitsApi.get(best.id).then(function (dr) {
          if (dr.ok && dr.data) {
            var ex = api.normalizeExhibit(dr.data)
            self.setData({ exhibit: ex, loading: false }, function () {
              self._recordExhibitView(ex, null, 'detail_enter')
            })
            wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
          } else {
            self._useMock(name)
          }
        })
      }
      self._useMock(name)
    }).catch(function () { self._useMock(name) })
  },

  _useMock: function (name) {
    var self = this
    var ex = MOCK_EXHIBITS[name] || buildFallbackExhibit(name)
    this.setData({ exhibit: ex, loading: false }, function () {
      self._recordExhibitView(ex, null, 'detail_enter')
    })
    wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
  },

  _recordExhibitView: function (exhibit, durationSeconds, source) {
    var state = tourStore.getTourState()
    if (!exhibit || !exhibit.name) return
    if (this._viewRecorded) return
    var hall = resolveHallSlugForExhibit(exhibit) || state.currentHall || ''
    if (!state.sessionId && !hall) return
    this._viewRecorded = true
    tourStore.addTourEvent({
      eventType:       'exhibit_view',
      exhibitId:       reportableExhibitId(exhibit),
      hall:            hall,
      durationSeconds: durationSeconds || null,
      metadata: {
        client_event_id: makeClientEventId('exhibit-view'),
        exhibit_name: exhibit.name,
        view_source: source || 'detail_enter',
      },
    })
  },

  onUnload: function () {
    if (this._viewRecorded) return
    var duration = this._enterAt
      ? Math.max(1, Math.round((Date.now() - this._enterAt) / 1000))
      : null
    var exhibit  = this.data.exhibit
    this._recordExhibitView(exhibit, duration, 'detail_leave')
  },

  goDeeper: function () {
    var self = this
    var exhibit = this.data.exhibit
    var state   = tourStore.getTourState()
    var hallSlug = resolveHallSlugForExhibit(exhibit)

    // Always set exhibit context before navigating so tour page can inject it.
    var contextExhibit = Object.assign({}, exhibit, {
      hall: hallSlug || exhibit.hall || '',
      hallDisplay: hallSlug ? banpoHalls.getHallDisplayName(hallSlug) : exhibit.hallDisplay,
    })
    tourStore.setCurrentExhibit(contextExhibit, hallSlug)
    if (tourStore.setPendingDetailExhibit) {
      tourStore.setPendingDetailExhibit(contextExhibit)
    }
    if (hallSlug) {
      tourStore.updateTourState({ currentHall: hallSlug, status: 'touring' }, { deferPersist: true })
    }

    var doNavigate = function (sid) {
      function navigateToTour() {
        var hallId = hallIdFromSlug(hallSlug)
        var url = '/pages/tour/tour?fromExhibit=1&directFromDetail=1&exhibit=' + encodeURIComponent(exhibit.name || '')
        if (hallId) {
          url += '&hallId=' + encodeURIComponent(hallId)
        } else if (hallSlug) {
          url += '&hall=' + encodeURIComponent(hallSlug)
        }
        var deltaToTour = findBackDeltaToTour()
        if (deltaToTour > 0) {
          wx.navigateBack({ delta: deltaToTour })
          return
        }
        wx.navigateTo({ url: url })
      }
      if (sid) {
        self._recordExhibitView(exhibit, null, 'detail_enter')
        setTimeout(function () {
          tourStore.addTourEvent({
            eventType: 'exhibit_deep_dive',
            exhibitId: exhibit.id   || exhibit.name || undefined,
            hall:      hallSlug || exhibit.hall || state.currentHall || '',
            metadata:  { exhibit_name: exhibit.name },
          })
        }, 0)
      }
      navigateToTour()
    }

    if (!state.sessionId) {
      // No session: create a quick-start one before entering the tour page.
      var guestId = 'miniapp_guest_' + Date.now()
      tourStore.setStylePrefs({ answerLength: 'balanced', depth: 'standard', terminology: 'plain' })
      tourStore.createLocalTourState({ interestType: 'B', persona: 'B', assumption: 'D', personaId: 'B' })
      tourStore.setCurrentExhibit(exhibit, hallSlug)
      api.tourApi.createSession({ interest_type: 'B', persona: 'B', assumption: 'D', guest_id: guestId })
        .then(function (res) {
          var newId = null
          if (res.ok) {
            var d = res.data || {}
            newId = d.id || d.session_id || null
            tourStore.setTourSession({ sessionId: newId, sessionToken: d.session_token || null })
          }
          doNavigate(newId)
        })
        .catch(function () { doNavigate(null) })
      return
    }

    doNavigate(state.sessionId)
  },

  goNext: function () {
    wx.navigateBack({ delta: 1 })
  },
})
