const api = require('../../api/index')
const tourStore = require('../../store/tour')
const banpoHalls = require('../../constants/banpo-halls')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')
const routeData = require('../../utils/route-data')

function _buildRouteSteps(availableHalls, authoritative) {
  return routeData.buildDeterministicSteps(availableHalls, {
    authoritative: authoritative === true,
  }, {})
}

function _buildFloorItems(steps) {
  var items = steps.slice(0, 3).map(function (step) {
    var hall = banpoHalls.getHallBySlug(step.hallSlug)
    return {
      id: step.hallId,
      short: step.short || (hall ? hall.short : String(step.name || '').slice(0, 2)),
      status: 'upcoming',
    }
  })
  while (items.length < 3) {
    items.push({ id: 'placeholder-' + items.length, short: '待定', status: 'upcoming' })
  }
  return items
}

function _durationSummary(steps) {
  var knownMinutes = 0
  var unknownCount = 0
  steps.forEach(function (step) {
    var minutes = Number(step.estimatedMinutes)
    if (Number.isFinite(minutes) && minutes > 0) knownMinutes += minutes
    else unknownCount += 1
  })
  if (!knownMinutes) return '以现场安排为准'
  if (unknownCount) return '约 ' + knownMinutes + ' 分钟起'
  return '约 ' + knownMinutes + ' 分钟'
}

function _routeSnapshot(data) {
  var source = data || {}
  return {
    steps: Array.isArray(source.steps) ? source.steps : [],
    floorItems: Array.isArray(source.floorItems) ? source.floorItems : [],
    totalDesc: source.totalDesc || '',
    personaLabel: source.personaLabel || '',
    tagline: source.tagline || '',
    stepsCount: Number(source.stepsCount) || 0,
    routeSource: source.routeSource || 'hall-directory-v2',
    routeSourceLabel: source.routeSourceLabel || '',
    planSummary: source.planSummary || '',
    routeNotice: source.routeNotice || '',
  }
}

function _isRestorableCatalogRoute(route) {
  if (!route || !Array.isArray(route.steps)) return false
  return route.routeSource === 'hall-directory-v2'
}

Page({
  data: {
    steps: [],
    floorItems: [],
    totalDesc: '',
    personaLabel: '默认导览',
    tagline: '按馆内标识选择下一处展厅。',
    stepsCount: 0,
    routeSource: 'hall-directory-v2',
    routeSourceLabel: '开放展厅目录',
    planSummary: '',
    routeNotice: '',
    loaded: false,
  },

  _availableHalls: null,
  _hallCatalogAuthoritative: false,
  _hallDataLoading: false,
  _hasRestoredRoutePlan: false,
  onLoad: function () {
    tourStore.markCurrentPage('pages/route/route')
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    this._preloadNext()
    this._renderInitialRoute()
    this._loadHallData()
  },

  onShow: function () {
    tourStore.markCurrentPage('pages/route/route')
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    if (!this.data.loaded || (!this._hallDataLoading && this._availableHalls === null)) {
      this._loadHallData()
      return
    }
    if (this._hallCatalogAuthoritative) this._refresh()
  },

  _renderInitialRoute: function () {
    var saved = tourStore.getTourState().routePlan
    if (_isRestorableCatalogRoute(saved)) {
      this._hasRestoredRoutePlan = true
      this.setData(Object.assign({}, _routeSnapshot(saved), { loaded: true }))
      return
    }
    this._refresh()
  },

  _loadHallData: function () {
    if (this._hallDataLoading || this._availableHalls) return
    var self = this
    this._hallDataLoading = true
    api.tourApi.getHalls().then(function (res) {
      self._hallDataLoading = false
      if (!res || !res.ok) throw new Error('hall catalog request failed')
      var list = Array.isArray(res.data)
        ? res.data
        : (res.data && (res.data.halls !== undefined ? res.data.halls : res.data.items))
      if (!Array.isArray(list)) throw new Error('hall catalog response must contain an array')
      self._availableHalls = list
      self._hallCatalogAuthoritative = true
      self._hasRestoredRoutePlan = false
      self._refresh()
    }).catch(function (err) {
      self._hallDataLoading = false
      self._availableHalls = null
      self._hallCatalogAuthoritative = false
      console.warn('[route] structured hall data unavailable', err)
      if (self._hasRestoredRoutePlan) return
      self._refresh()
    })
  },

  _refresh: function () {
    // Route page is intentionally presentation-only. Do not consume stale
    // visited/current hall cache here, otherwise old sessions can mark halls
    // as visited before the user enters them in the current run.
    var personaDef = tourStore.getPersonaDef()
    var usingCatalog = this._hallCatalogAuthoritative
    var steps = usingCatalog
      ? _buildRouteSteps(this._availableHalls, usingCatalog)
      : []
    var nextRoute = {
      steps: steps,
      stepsCount: steps.length,
      floorItems: _buildFloorItems(steps),
      totalDesc: steps.length ? _durationSummary(steps) : '-',
      personaLabel: (personaDef && personaDef.name) || tourStore.getPersonaLabel() || '默认导览',
      tagline: '按馆内标识选择下一处展厅。',
      routeSource: usingCatalog ? 'hall-directory-v2' : 'unavailable',
      routeSourceLabel: usingCatalog ? '开放展厅目录' : '目录暂不可用',
      planSummary: usingCatalog ? '按展厅目录逐项查看简介。' : '',
      routeNotice: usingCatalog
        ? (!steps.length
          ? '当前没有可用的开放展厅'
          : '')
        : '展厅目录暂不可用，请稍后重试',
      loaded: true,
    }
    this.setData(nextRoute)
    tourStore.updateTourState({ routePlan: _routeSnapshot(nextRoute) }, { deferPersist: true })
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
  },

  _preloadNext: function () {
    preload.preloadPages(['/pages/hall/hall', '/pages/tour/tour'], 120)
    preload.preloadImages(preload.HALL_ICON_ASSETS.concat(preload.TOUR_ICON_ASSETS), 160)
  },

  startTour: function () {
    wx.redirectTo({ url: '/pages/hall/hall' })
  },
})
