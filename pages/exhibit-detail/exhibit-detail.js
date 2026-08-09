const tourStore = require('../../store/tour')
const api       = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const tourSession = require('../../utils/tour-session')

const ENABLE_DEV_MOCK_EXHIBITS = false

var DEFAULT_EXHIBIT = {
  id: '', name: '', category: '展品', objectKind: '展品', era: '',
  hall: '', hallDisplay: '', description: '', imageUrl: '',
}

var DEFAULT_EXHIBIT_IMAGE = '/assets/icons/exhibit-list-item.png'

function reportableExhibitId(exhibit) {
  var id = tourStore.normalizeBackendExhibitUuid
    ? tourStore.normalizeBackendExhibitUuid(exhibit && exhibit.id)
    : null
  return id || undefined
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
    loadError: false,
    errorMessage: '',
    exhibitImageSrc: DEFAULT_EXHIBIT_IMAGE,
    usingDefaultImage: true,
  },

  _enterAt: 0,
  _viewRecorded: false,

  onLoad: function (options) {
    var self = this
    var id   = options.id   ? decodeURIComponent(options.id)   : ''
    var name = options.name ? decodeURIComponent(options.name) : ''
    var local = options.local === '1'
    var cached = tourStore.consumePendingDetailExhibit
      ? tourStore.consumePendingDetailExhibit(name)
      : null
    tourStore.markCurrentPage('pages/exhibit-detail/exhibit-detail', {
      id: id,
      name: name,
      local: local ? '1' : '0',
    })

    this._enterAt = Date.now()
    this._preloadNext()
    wx.setNavigationBarTitle({ title: name || '展品详情' })

    if (local) {
      var cachedTrustedId = tourStore.normalizeBackendExhibitUuid
        ? tourStore.normalizeBackendExhibitUuid(cached && cached.id)
        : null
      if (cachedTrustedId && (!name || cached.name === name)) {
        self._showExhibit(cached)
      } else {
        self._showUnavailable(name)
      }
    } else if (id) {
      var trustedId = tourStore.normalizeBackendExhibitUuid
        ? tourStore.normalizeBackendExhibitUuid(id)
        : null
      var cachedId = tourStore.normalizeBackendExhibitUuid
        ? tourStore.normalizeBackendExhibitUuid(cached && cached.id)
        : null
      var trustedCached = trustedId && cachedId === trustedId ? cached : null
      if (!trustedId) {
        self._showUnavailable(name)
        return
      }
      api.exhibitsApi.get(id).then(function (res) {
        if (res.ok && res.data) {
          var ex = api.normalizeExhibit(res.data)
          if (ex) self._showExhibit(ex)
          else self._showTrustedOrUnavailable(trustedCached, name)
        } else {
          self._showTrustedOrUnavailable(trustedCached, name)
        }
      }).catch(function () { self._showTrustedOrUnavailable(trustedCached, name) })
    } else if (name) {
      self._loadByName(name, cached)
    } else {
      self._showUnavailable('')
    }
  },

  _preloadNext: function () {
    preload.preloadPages(['/pages/tour/tour', '/pages/exhibit-scan/exhibit-scan'], 120)
    preload.preloadImages(preload.TOUR_ICON_ASSETS, 160)
  },

  _loadByName: function (name, cached) {
    var self = this
    var cachedId = tourStore.normalizeBackendExhibitUuid
      ? tourStore.normalizeBackendExhibitUuid(cached && cached.id)
      : null
    var trustedCached = cachedId ? cached : null
    if (!name) { self._showTrustedOrUnavailable(trustedCached, name); return }
    api.exhibitsApi.search(name).then(function (res) {
      if (res.ok && res.data && res.data.exhibits && res.data.exhibits.length) {
        var best = res.data.exhibits[0]
        var bestId = tourStore.normalizeBackendExhibitUuid
          ? tourStore.normalizeBackendExhibitUuid(best && best.id)
          : null
        if (!bestId) {
          self._showTrustedOrUnavailable(trustedCached, name)
          return
        }
        return api.exhibitsApi.get(best.id).then(function (dr) {
          if (dr.ok && dr.data) {
            var ex = api.normalizeExhibit(dr.data)
            if (ex) self._showExhibit(ex)
            else self._showTrustedOrUnavailable(trustedCached, name)
          } else {
            self._showTrustedOrUnavailable(trustedCached, name)
          }
        }).catch(function () { self._showTrustedOrUnavailable(trustedCached, name) })
      }
      self._showTrustedOrUnavailable(trustedCached, name)
    }).catch(function () { self._showTrustedOrUnavailable(trustedCached, name) })
  },

  _showExhibit: function (exhibit) {
    var self = this
    var imageUrl = exhibit && exhibit.imageUrl ? exhibit.imageUrl : ''
    self.setData({
      exhibit: exhibit,
      exhibitImageSrc: imageUrl || DEFAULT_EXHIBIT_IMAGE,
      usingDefaultImage: !imageUrl,
      loading: false,
      loadError: false,
      errorMessage: '',
    }, function () {
      self._recordExhibitView(exhibit, null, 'detail_enter')
    })
    wx.setNavigationBarTitle({ title: exhibit.name || '展品详情' })
  },

  _showTrustedOrUnavailable: function (cached, name) {
    if (cached) {
      this._showExhibit(cached)
      return
    }
    this._showUnavailable(name)
  },

  _showUnavailable: function (name) {
    this.setData({
      exhibit: Object.assign({}, DEFAULT_EXHIBIT, {
        id: '',
        name: name || '展品资料',
        description: '',
      }),
      loading: false,
      loadError: true,
      errorMessage: '馆方展品资料暂不可用，请返回后重试。',
      exhibitImageSrc: DEFAULT_EXHIBIT_IMAGE,
      usingDefaultImage: true,
    })
  },

  onExhibitImageError: function () {
    if (this.data.usingDefaultImage) return
    this.setData({
      exhibitImageSrc: DEFAULT_EXHIBIT_IMAGE,
      usingDefaultImage: true,
    })
  },

  _recordExhibitView: function (exhibit, durationSeconds, source) {
    var state = tourStore.getTourState()
    if (!exhibit || !exhibit.name) return
    if (this._viewRecorded) return
    var hall = resolveHallSlugForExhibit(exhibit) || state.currentHall || ''
    if (!state.sessionId && !hall) return
    this._viewRecorded = true
    var realId = reportableExhibitId(exhibit) || null
    tourStore.updateTourState({
      currentHall: hall || state.currentHall || null,
      currentExhibitId: realId,
    })
    tourSync.queueSessionSnapshot({
      status: 'touring',
      current_hall: hall || state.currentHall || null,
      current_exhibit_id: realId,
    }, { defer: true, maxAttempts: 3 })
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
    if (this.data.loading || this.data.loadError) return
    if (this._viewRecorded) return
    var duration = this._enterAt
      ? Math.max(1, Math.round((Date.now() - this._enterAt) / 1000))
      : null
    var exhibit  = this.data.exhibit
    this._recordExhibitView(exhibit, duration, 'detail_leave')
  },

  goDeeper: function () {
    if (this.data.loading || this.data.loadError) return
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
            exhibitId: tourStore.getTourState().currentExhibitId || undefined,
            hall:      hallSlug || exhibit.hall || state.currentHall || '',
            metadata:  { exhibit_name: exhibit.name },
          })
        }, 0)
      }
      navigateToTour()
    }

    if (!state.sessionId) {
      // No session: create a quick-start one before entering the tour page.
      tourStore.setStylePrefs({ answerLength: 'balanced', depth: 'standard', terminology: 'plain' })
      tourStore.createLocalTourState({ interestType: 'default', persona: 'default', assumption: 'D', personaId: 'default' })
      tourStore.setCurrentExhibit(exhibit, hallSlug)
      tourSession.ensureTourSession()
        .then(function (res) {
          var newId = null
          if (res.ok) {
            newId = res.sessionId || null
            tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
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
