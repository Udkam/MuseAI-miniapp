const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var MOCK_FALLBACK = [
  { id: 'mock-1', name: '人面网纹彩陶盆', category: '陶器与艺术', hall: 'pottery-spirit-hall', hallDisplay: '出土文物陈列区', era: '新石器时代·仰韶文化', importance: 5, description: '', floor: null },
  { id: 'mock-2', name: '鹿纹彩陶盆',     category: '陶器与艺术', hall: 'pottery-spirit-hall', hallDisplay: '出土文物陈列区', era: '新石器时代·仰韶文化', importance: 5, description: '', floor: null },
]

Page({
  data: {
    exhibits:   [],
    loading:    true,
    searchText: '',
    hallHint:   '',
    empty:      false,
  },

  _searchTimer: null,
  _reqSeq:      0,       // monotonic counter — stale async results are discarded
  _cachedAll:   null,    // full exhibit list for client-side search merge
  _currentHall: '',      // Chinese hall name from tourStore

  onLoad: function () {
    var state = tourStore.getTourState()
    this._currentHall = state.currentHall || ''
    this.setData({ hallHint: this._currentHall ? '当前展厅：' + this._currentHall : '半坡博物馆全部展品' })
    this._discoverHallSlugs()
    this._loadExhibits()
  },

  // ── Hall slug discovery ──────────────────────────────────────────────────
  _discoverHallSlugs: function () {
    api.exhibitsApi.listHalls().then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return
      console.log('[halls/list]', res.data)
      res.data.forEach(function (slug) {
        if (!api.HALL_SLUG_NAMES[slug]) {
          console.warn('[halls] unknown slug — add to HALL_SLUG_NAMES in api/index.js:', slug)
        }
      })
    }).catch(function () {})
  },

  // ── Load exhibit list ───────────────────────────────────────────────────
  _loadExhibits: function () {
    var self   = this
    var params = { limit: 100 }
    var slug   = api.hallNameToSlug(this._currentHall)

    if (slug) {
      params.hall = slug
      console.log('[load] hall filter slug=' + slug + ' (from "' + this._currentHall + '")')
    } else if (this._currentHall) {
      console.warn('[load] no slug mapping for "' + this._currentHall + '" — loading all exhibits')
    }

    var seq = ++self._reqSeq
    self.setData({ loading: true, empty: false })

    api.exhibitsApi.list(params).then(function (res) {
      if (seq !== self._reqSeq) return
      console.log('[load raw] status=' + (res.status || res.ok))
      if (res.ok && res.data && res.data.exhibits) {
        var list = res.data.exhibits.map(api.normalizeExhibit)
        console.log('[load normalized]', list.map(function (e) { return e.name + ' (' + e.hall + ')' }))
        self._cachedAll = list
        self.setData({ exhibits: list, loading: false, empty: list.length === 0 })
      } else {
        self._useFallback()
      }
    }).catch(function () {
      if (seq !== self._reqSeq) return
      self._useFallback()
    })
  },

  _useFallback: function () {
    this.setData({ exhibits: MOCK_FALLBACK, loading: false, empty: false })
  },

  // ── Search ───────────────────────────────────────────────────────────────
  onSearchInput: function (e) {
    var val = e.detail.value
    this.setData({ searchText: val })
    clearTimeout(this._searchTimer)
    ++this._reqSeq
    if (!val.trim()) {
      this._loadExhibits()
      return
    }
    var self = this
    this._searchTimer = setTimeout(function () { self._enhancedSearch(val.trim()) }, 400)
  },

  doSearch: function () {
    var keyword = (this.data.searchText || '').trim()
    if (keyword) this._enhancedSearch(keyword)
  },

  // Enhanced search:
  //   1. Backend ILIKE search (handles server-indexed data).
  //   2. Client-side includes() on cached full list (catches short CJK keywords).
  //   3. Alias expansion: resolveAliases() finds canonical names for user aliases.
  //   4. Merge: API results first, then client-side extras (dedup by id).
  //   5. Sort by importance descending.
  _enhancedSearch: function (keyword) {
    var self = this
    var seq  = ++self._reqSeq
    self.setData({ loading: true, empty: false })

    var searchP   = api.exhibitsApi.search(keyword)
    var fullListP = self._cachedAll
      ? Promise.resolve({ ok: true, data: { exhibits: self._cachedAll.map(function (e) {
          return { id: e.id, name: e.name, hall: e.hall, category: e.category, era: e.era, importance: e.importance, estimated_visit_time: e.estimatedVisitTime, floor: e.floor }
        }) } })
      : api.exhibitsApi.list({ limit: 100 })

    Promise.all([searchP, fullListP]).then(function (results) {
      if (seq !== self._reqSeq) return

      var apiRes  = results[0]
      var fullRes = results[1]

      var apiList = []
      if (apiRes.ok && apiRes.data && apiRes.data.exhibits) {
        apiList = apiRes.data.exhibits.map(api.normalizeExhibit)
        console.log('[search raw] keyword=' + keyword + ', api returned:', apiList.map(function (e) { return e.name }))
      }

      var extraList = []
      if (fullRes.ok && fullRes.data && fullRes.data.exhibits) {
        var fullNorm = fullRes.data.exhibits.map(api.normalizeExhibit)
        if (!self._cachedAll) self._cachedAll = fullNorm

        // Direct name includes
        var clientMatched = fullNorm.filter(function (ex) {
          return ex.name && ex.name.indexOf(keyword) >= 0
        })

        // Alias expansion: also match canonical names for known aliases
        var aliasNames   = api.resolveAliases(keyword)
        var aliasMatched = []
        if (aliasNames.length) {
          aliasMatched = fullNorm.filter(function (ex) {
            return ex.name && aliasNames.indexOf(ex.name) >= 0
          })
          if (aliasMatched.length) {
            console.log('[search alias] keyword="' + keyword + '" resolved to', aliasNames, '→', aliasMatched.map(function (e) { return e.name }))
          }
        }

        // Union of direct + alias matches
        var seenExtra = {}
        clientMatched.concat(aliasMatched).forEach(function (ex) {
          if (!seenExtra[ex.id]) { seenExtra[ex.id] = true; extraList.push(ex) }
        })
        console.log('[search client-filter] found:', extraList.map(function (e) { return e.name }))
      }

      // Merge: API first, client-side extras appended (dedup by id)
      var seen   = {}
      var merged = []
      apiList.forEach(function (ex) {
        if (!seen[ex.id]) { seen[ex.id] = true; merged.push(ex) }
      })
      extraList.forEach(function (ex) {
        if (!seen[ex.id]) { seen[ex.id] = true; merged.push(ex) }
      })

      merged.sort(function (a, b) { return (b.importance || 0) - (a.importance || 0) })
      console.log('[search merged]', merged.map(function (e) { return e.name }))
      self.setData({ exhibits: merged, loading: false, empty: merged.length === 0 })
    }).catch(function (err) {
      if (seq !== self._reqSeq) return
      console.error('[search] error:', err)
      self.setData({ exhibits: [], loading: false, empty: true })
    })
  },

  clearSearch: function () {
    this.setData({ searchText: '' })
    this._loadExhibits()
  },

  // ── Navigation ──────────────────────────────────────────────────────────
  selectExhibit: function (e) {
    var ex = e.currentTarget.dataset.exhibit
    wx.navigateTo({
      url: '/pages/exhibit-detail/exhibit-detail?id=' + encodeURIComponent(ex.id)
        + '&name=' + encodeURIComponent(ex.name),
    })
  },
})
