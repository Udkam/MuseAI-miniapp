const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const recognition = require('../../utils/exhibit-recognition')
const exhibitCatalog = require('../../utils/exhibit-catalog')
const preload = require('../../utils/preload')
const tourSync = require('../../utils/tour-sync')

const ENABLE_HALL_DISCOVERY_LOG = false
const ENABLE_DEV_MOCK_EXHIBITS = false

function getFallbackExhibits() {
  // Keep the development switch structurally available without retaining any
  // stale museum facts. Real exhibit data is always supplied by the backend.
  return []
}

function dedupeExhibits(list) {
  const seen = {}
  const out = []
  ;(list || []).forEach(function (ex) {
    const key = ex && (ex.id || ex.name)
    if (ex && api.isDisplayableExhibitName && !api.isDisplayableExhibitName(ex.name)) return
    if (!key || seen[key]) return
    seen[key] = true
    out.push(ex)
  })
  return out
}

function matchesKeyword(ex, keyword) {
  const text = [
    ex.name,
    ex.category,
    ex.hallDisplay,
    ex.era,
    ex.description,
  ].join(' ')
  return text.indexOf(keyword) >= 0
}

function chooseImageFile() {
  return new Promise(function (resolve, reject) {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: function (res) {
          const file = res.tempFiles && res.tempFiles[0]
          const path = file && (file.tempFilePath || file.path)
          if (!path) {
            reject(new Error('NO_IMAGE'))
            return
          }
          resolve(path)
        },
        fail: function (err) {
          const msg = err && err.errMsg ? err.errMsg : String(err || '')
          reject(new Error(msg.indexOf('cancel') >= 0 ? 'USER_CANCEL' : msg || 'CAMERA_FAILED'))
        },
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: function (res) {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) {
          reject(new Error('NO_IMAGE'))
          return
        }
        resolve(path)
      },
      fail: function (err) {
        const msg = err && err.errMsg ? err.errMsg : String(err || '')
        reject(new Error(msg.indexOf('cancel') >= 0 ? 'USER_CANCEL' : msg || 'CAMERA_FAILED'))
      },
    })
  })
}

function confirmCameraUsage() {
  return new Promise(function (resolve) {
    wx.showModal({
      title: '开始拍摄',
      content: '将打开相机拍摄展签或展品名称',
      confirmText: '确认',
      cancelText: '取消',
      success: function (res) { resolve(!!res.confirm) },
      fail: function () { resolve(false) },
    })
  })
}

function readFileBase64(filePath) {
  return new Promise(function (resolve, reject) {
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (res) { resolve(res.data || '') },
      fail: reject,
    })
  })
}

Page({
  data: {
    exhibits: [],
    loading: true,
    scanning: false,
    searchText: '',
    hallHint: '',
    dataNotice: '',
    scanNotice: '',
    ocrText: '',
    scanResult: null,
    empty: false,
  },

  _searchTimer: null,
  _loadTimer: null,
  _reqSeq: 0,
  _cachedAll: null,
  _remoteCatalogAuthoritative: false,
  _fallbackCatalogActive: false,
  _currentHallSlug: '',
  _currentHallName: '',

  onLoad: function () {
    const state = tourStore.getTourState()
    const storedHall = tourStore.getSavedCurrentHall ? tourStore.getSavedCurrentHall() : state.currentHall
    this._currentHallSlug = storedHall ? banpoHalls.normalizeHallToSlug(storedHall) : ''
    this._currentHallName = state.currentHallName ||
      (this._currentHallSlug ? banpoHalls.getHallDisplayName(this._currentHallSlug) : '')
    tourStore.markCurrentPage('pages/exhibit-scan/exhibit-scan', {
      hall: this._currentHallSlug || '',
    })
    tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
    this.setData({
      hallHint: this._currentHallName ? '当前展厅：' + this._currentHallName : '半坡博物馆全部展品',
    })
    this._preloadNext()
    if (ENABLE_HALL_DISCOVERY_LOG) this._discoverHallSlugs()
    var self = this
    this._loadTimer = setTimeout(function () {
      self._loadTimer = null
      self._loadExhibits()
    }, 80)
  },

  onUnload: function () {
    if (this._loadTimer) {
      clearTimeout(this._loadTimer)
      this._loadTimer = null
    }
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
  },

  _preloadNext: function () {
    preload.preloadPages(['/pages/exhibit-detail/exhibit-detail', '/pages/tour/tour'], 120)
    preload.preloadImages(preload.TOUR_ICON_ASSETS, 160)
  },

  _discoverHallSlugs: function () {
    api.exhibitsApi.listHalls().then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return
      console.log('[halls/list]', res.data)
      res.data.forEach(function (slug) {
        if (!api.HALL_SLUG_NAMES[slug]) {
          console.warn('[halls] unknown slug, add to HALL_SLUG_NAMES in api/index.js:', slug)
        }
      })
    }).catch(function () {})
  },

  _loadExhibits: function () {
    const self = this
    const slug = this._currentHallSlug
    const seq = ++self._reqSeq
    self._remoteCatalogAuthoritative = false
    self._fallbackCatalogActive = false
    self._cachedAll = null
    self.setData({
      exhibits: [],
      loading: true,
      empty: false,
      dataNotice: '',
    })

    return exhibitCatalog.fetchAll({
      params: {},
      fetchPage: function (params) {
        if (slug) {
          return api.exhibitsApi.listByHall(slug, params, { timeout: 3000, retries: 0 })
        }
        return api.exhibitsApi.list(params, { timeout: 3000, retries: 0 })
      },
    }).then(function (catalog) {
      if (seq !== self._reqSeq) return
      const list = catalog.items.map(api.normalizeExhibit).filter(Boolean)
      if (list.length !== catalog.items.length) {
        throw new Error('exhibit catalog contains an invalid display item')
      }
      self._remoteCatalogAuthoritative = true
      self._fallbackCatalogActive = false
      self._cachedAll = list
      self.setData({
        exhibits: list,
        loading: false,
        empty: list.length === 0,
        dataNotice: '',
      })
    }).catch(function (err) {
      if (seq !== self._reqSeq) return
      console.warn('[exhibit-scan] complete exhibit catalog unavailable', err)
      self._useFallback('展品目录暂不可用，请稍后重试。')
    })
  },

  startPhotoScan: function () {
    const self = this
    if (self.data.scanning) return

    let selectedPath = ''
    confirmCameraUsage()
      .then(function (confirmed) {
        if (!confirmed) throw new Error('USER_CANCEL')
        return chooseImageFile()
      })
      .then(function (filePath) {
        if (!filePath) throw new Error('NO_IMAGE')
        selectedPath = filePath
        self.setData({
          scanning: true,
          scanNotice: '识别中…',
          dataNotice: '',
          scanResult: null,
          ocrText: '',
        })
        return readFileBase64(filePath)
      })
      .then(function (base64) {
        if (!base64) throw new Error('NO_IMAGE')
        return api.ocrApi.recognizeImage(selectedPath, base64)
      })
      .then(function (res) {
        if (!res || !res.ok) {
          const code = res && res.code
          if (code === 'OCR_NOT_CONFIGURED' || code === 'OCR_UNAVAILABLE') {
            self.setData({ scanNotice: '当前环境未配置 OCR 服务，可先用文字搜索展品。' })
          }
          throw new Error(code || 'OCR_FAILED')
        }
        const text = recognition.extractOcrText(res.data)
        if (!text) throw new Error('NO_TEXT')
        self.setData({ ocrText: text, searchText: text })
        return self._matchRecognizedText(text)
      })
      .then(function (matched) {
        if (!matched) throw new Error('NO_MATCH')
        self._showScanMatch(matched.exhibit, matched.score)
      })
      .catch(function (err) {
        const msg = err && err.message ? err.message : String(err || '')
        if (msg === 'USER_CANCEL' || msg === 'NO_IMAGE' || msg.indexOf('cancel') >= 0) {
          self.setData({ scanning: false, scanNotice: '', ocrText: '' })
          return
        }
        console.warn('[exhibit-scan] photo recognition failed:', err)
        wx.showToast({ title: '未识别到展品，请重试', icon: 'none', duration: 2000 })
        self.setData({
          scanning: false,
          scanNotice: self.data.scanNotice || '未识别到展品。可以换个角度重拍，或直接输入展品名称。',
        })
      })
  },

  _candidatePool: function () {
    if (this._remoteCatalogAuthoritative) {
      return dedupeExhibits(this._cachedAll || [])
    }
    if (!this._fallbackCatalogActive) return []
    return dedupeExhibits((this._cachedAll || []).concat(getFallbackExhibits('')))
  },

  _matchRecognizedText: function (text) {
    const self = this
    const aliases = api.resolveAliases(text)
    const localRanked = recognition.rankExhibits(self._candidatePool(), text, aliases)
    return Promise.resolve(localRanked.length ? localRanked[0] : null)
  },

  _showScanMatch: function (exhibit, score) {
    const confidence = score >= 100 ? '高' : (score >= 70 ? '中' : '低')
    const list = dedupeExhibits([exhibit].concat(this.data.exhibits || []))
    tourStore.setCurrentScannedExhibit(exhibit)
    this.setData({
      scanning: false,
      scanResult: Object.assign({}, exhibit, { confidence: confidence }),
      exhibits: list,
      empty: false,
      scanNotice: '已匹配到最接近的展品。',
    })
  },

  _useFallback: function (notice) {
    const list = ENABLE_DEV_MOCK_EXHIBITS ? getFallbackExhibits(this._currentHallSlug) : []
    this._remoteCatalogAuthoritative = false
    this._fallbackCatalogActive = ENABLE_DEV_MOCK_EXHIBITS
    this._cachedAll = list
    this.setData({
      exhibits: list,
      loading: false,
      empty: list.length === 0,
      dataNotice: notice || '',
    })
  },

  onSearchInput: function (e) {
    const val = e.detail.value
    this.setData({ searchText: val })
    if (this._loadTimer) {
      clearTimeout(this._loadTimer)
      this._loadTimer = null
    }
    clearTimeout(this._searchTimer)
    ++this._reqSeq
    if (!val.trim()) {
      if (this._remoteCatalogAuthoritative) {
        this.setData({
          exhibits: (this._cachedAll || []).slice(),
          loading: false,
          empty: !(this._cachedAll || []).length,
          dataNotice: '',
        })
      } else {
        this._loadExhibits()
      }
      return
    }
    const self = this
    this._searchTimer = setTimeout(function () { self._enhancedSearch(val.trim()) }, 180)
  },

  doSearch: function () {
    const keyword = (this.data.searchText || '').trim()
    if (keyword) this._enhancedSearch(keyword)
  },

  _enhancedSearch: function (keyword) {
    const self = this
    ++self._reqSeq
    const fullNorm = self._candidatePool()
    const aliasNames = api.resolveAliases(keyword)
    const exactMatches = fullNorm.filter(function (ex) {
      return matchesKeyword(ex, keyword) || (ex.name && aliasNames.indexOf(ex.name) >= 0)
    })
    const rankedMatches = recognition.rankExhibits(fullNorm, keyword, aliasNames).map(function (item) { return item.exhibit })
    const matches = dedupeExhibits(rankedMatches.concat(exactMatches))

    self.setData({
      exhibits: matches,
      loading: false,
      empty: matches.length === 0,
      scanResult: null,
      scanNotice: '',
      dataNotice: self._fallbackCatalogActive
        ? '当前搜索结果来自带有本地标记的开发兜底数据。'
        : '',
    })
    return Promise.resolve(matches)
  },

  clearSearch: function () {
    this.setData({ searchText: '', scanResult: null, scanNotice: '', ocrText: '' })
    if (this._remoteCatalogAuthoritative) {
      const list = (this._cachedAll || []).slice()
      this.setData({ exhibits: list, loading: false, empty: !list.length, dataNotice: '' })
      return
    }
    this._loadExhibits()
  },

  openScanResult: function () {
    if (!this.data.scanResult) return
    this._goExhibitDetail(this.data.scanResult)
  },

  selectExhibit: function (e) {
    const ex = e.currentTarget.dataset.exhibit
    this._goExhibitDetail(ex)
  },

  _goExhibitDetail: function (ex) {
    if (ex && ex.isLocalFallback && !ENABLE_DEV_MOCK_EXHIBITS) return
    let url = '/pages/exhibit-detail/exhibit-detail?name=' + encodeURIComponent(ex.name)
    if (tourStore.setPendingDetailExhibit) tourStore.setPendingDetailExhibit(ex)
    if (ex.id && ex.id.indexOf('local-') !== 0 && ex.id.indexOf('mock-') !== 0) {
      url += '&id=' + encodeURIComponent(ex.id)
    } else {
      url += '&local=1'
    }
    wx.navigateTo({ url: url })
  },
})
