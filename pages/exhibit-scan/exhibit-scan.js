const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')
const recognition = require('../../utils/exhibit-recognition')
const preload = require('../../utils/preload')

const ENABLE_HALL_DISCOVERY_LOG = false

function makeFallbackExhibit(id, hall, name, category, description, importance) {
  return {
    id: 'local-' + id,
    name: name,
    category: category || '代表性展项',
    hall: hall,
    hallDisplay: banpoHalls.getHallDisplayName(hall),
    era: '新石器时代·仰韶文化',
    importance: importance || 3,
    description: description || '',
    floor: null,
    isLocalFallback: true,
  }
}

const FALLBACK_EXHIBITS_BY_HALL = {
  'basic-exhibition-hall': [
    makeFallbackExhibit('basic-site-plan', 'basic-exhibition-hall', '半坡遗址平面分布图', '遗址信息', '理解居住区、墓葬区、制陶区和壕沟等空间关系，是进入半坡叙事的基础。', 5),
    makeFallbackExhibit('basic-stone-tools', 'basic-exhibition-hall', '石器工具', '生产工具', '磨制石器反映半坡人的耕作、采集和加工活动。', 4),
    makeFallbackExhibit('basic-bone-tools', 'basic-exhibition-hall', '骨角器', '生产工具', '骨针、骨锥等器物能看到材料利用和手工技术。', 4),
    makeFallbackExhibit('basic-tao-zeng', 'basic-exhibition-hall', '陶甑', '炊煮器', '陶甑与蒸煮方式有关，可从饮食结构和生活技术角度观察。', 4),
    makeFallbackExhibit('basic-pointed-bottle', 'basic-exhibition-hall', '尖底瓶', '汲水陶器', '尖底瓶常被用来讨论取水方式、重心和半坡人的生活智慧。', 5),
    makeFallbackExhibit('basic-deer-basin', 'basic-exhibition-hall', '鹿纹彩陶盆', '彩陶', '鹿纹彩陶盆能连接动物图像、审美表达和半坡人的精神世界。', 5),
    makeFallbackExhibit('basic-face-basin', 'basic-exhibition-hall', '人面网纹彩陶盆', '彩陶', '彩陶盆上的人面与纹样是理解半坡图像表达的重要线索。', 5),
    makeFallbackExhibit('basic-ornaments', 'basic-exhibition-hall', '装饰品与身份标识物', '装饰品', '发饰、陶饰和骨器残片有助于观察审美与社会身份差异。', 3),
  ],
  'site-protection-hall': [
    makeFallbackExhibit('site-strata', 'site-protection-hall', '堆积层剖面', '遗址保护', '地层关系能帮助理解考古发掘怎样判断年代和活动顺序。', 5),
    makeFallbackExhibit('site-round-house', 'site-protection-hall', '地面圆形房屋遗迹', '居址遗存', '房屋遗迹展示居住空间、柱洞和灶址等生活痕迹。', 5),
    makeFallbackExhibit('site-semi-house', 'site-protection-hall', '半地穴式方形房屋遗迹', '居址遗存', '半地穴式房屋有助于观察半坡人的居住结构和聚落组织。', 5),
    makeFallbackExhibit('site-kiln-area', 'site-protection-hall', '制陶区与窑场遗迹', '生产遗存', '制陶区能把陶器成品和烧制现场联系起来。', 4),
    makeFallbackExhibit('site-burial', 'site-protection-hall', '仰身直肢葬', '墓葬遗存', '墓葬形态和随葬现象是理解社会关系与生命观的重要材料。', 4),
    makeFallbackExhibit('site-child-burial', 'site-protection-hall', '小女孩墓', '墓葬遗存', '儿童墓葬能引出半坡社会中的年龄、亲属和礼俗问题。', 4),
    makeFallbackExhibit('site-urn-burial', 'site-protection-hall', '瓮棺葬', '墓葬遗存', '瓮棺葬反映儿童葬俗和陶器的特殊使用方式。', 4),
    makeFallbackExhibit('site-ditch', 'site-protection-hall', '大围沟', '聚落设施', '壕沟可以讨论聚落边界、防护和公共劳动组织。', 4),
  ],
  'kiln-hall': [
    makeFallbackExhibit('kiln-body', 'kiln-hall', '陶窑', '制陶遗存', '陶窑展示烧成空间，是理解陶器生产流程的关键。', 5),
    makeFallbackExhibit('kiln-structure', 'kiln-hall', '横穴窑结构', '制陶技术', '观察火膛、窑室和烟道，可以理解温度控制和烧制技术。', 4),
    makeFallbackExhibit('kiln-traces', 'kiln-hall', '烧成痕迹', '工艺痕迹', '器表颜色、火候差异和残片能帮助判断烧制过程。', 4),
  ],
  'prehistoric-workshop': [
    makeFallbackExhibit('workshop-stone', 'prehistoric-workshop', '石器打磨体验', '研学体验', '通过打磨动作理解工具制作的时间成本和手工精度。', 4),
    makeFallbackExhibit('workshop-pottery', 'prehistoric-workshop', '陶器纹饰拓印', '研学体验', '从纹样复制和观察中理解彩陶装饰的结构。', 4),
    makeFallbackExhibit('workshop-bone', 'prehistoric-workshop', '骨针制作体验', '研学体验', '把手作体验和骨器、纺织、缝缀等生活技术联系起来。', 3),
  ],
  'education-center': [
    makeFallbackExhibit('edu-task', 'education-center', '研学任务卡', '研学材料', '把观察点整理成问题、证据和小结，适合做参观复盘。', 4),
    makeFallbackExhibit('edu-template', 'education-center', '观察记录模板', '研学材料', '帮助记录展品名称、用途、材料、证据和仍需追问的问题。', 3),
  ],
  'banpo-girl-sculpture': [
    makeFallbackExhibit('girl-sculpture', 'banpo-girl-sculpture', '半坡姑娘雕塑', '公共艺术', '以现代艺术方式呈现半坡人物形象，适合作为导览入口或合影点。', 3),
  ],
  'peony-garden': [
    makeFallbackExhibit('peony-garden', 'peony-garden', '牡丹园', '公共空间', '园区休憩空间，可作为路线中的缓冲点和复盘点。', 2),
  ],
  'temporary-hall-1': [
    makeFallbackExhibit('temp1-theme', 'temporary-hall-1', '临展厅一当期主题', '临时展览', '临展内容需要以现场展签和馆方清单为准，系统暂不编造具体展品。', 2),
  ],
  'temporary-hall-2': [
    makeFallbackExhibit('temp2-theme', 'temporary-hall-2', '临展厅二当期主题', '临时展览', '临展内容需要以现场展签和馆方清单为准，系统暂不编造具体展品。', 2),
  ],
}

function cloneExhibits(list) {
  return list
    .filter(function (item) { return api.isDisplayableExhibitName ? api.isDisplayableExhibitName(item.name) : true })
    .map(function (item) { return Object.assign({}, item) })
}

function getFallbackExhibits(hallSlug) {
  if (hallSlug && FALLBACK_EXHIBITS_BY_HALL[hallSlug]) {
    return cloneExhibits(FALLBACK_EXHIBITS_BY_HALL[hallSlug])
  }
  let all = []
  Object.keys(FALLBACK_EXHIBITS_BY_HALL).forEach(function (slug) {
    all = all.concat(FALLBACK_EXHIBITS_BY_HALL[slug])
  })
  return cloneExhibits(all)
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
      content: '将打开相机拍摄展签或展项名称',
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
  _currentHallSlug: '',
  _currentHallName: '',

  onLoad: function () {
    const state = tourStore.getTourState()
    const storedHall = tourStore.getSavedCurrentHall ? tourStore.getSavedCurrentHall() : state.currentHall
    this._currentHallSlug = storedHall ? banpoHalls.normalizeHallToSlug(storedHall) : ''
    this._currentHallName = this._currentHallSlug ? banpoHalls.getHallDisplayName(this._currentHallSlug) : ''
    this.setData({
      hallHint: this._currentHallName ? '当前展厅：' + this._currentHallName : '半坡博物馆全部展项',
    })
    this._preloadNext()
    if (ENABLE_HALL_DISCOVERY_LOG) this._discoverHallSlugs()
    var self = this
    this._loadTimer = setTimeout(function () {
      self._loadTimer = null
      self._loadExhibits()
    }, 80)
  },

  onShow: function () {
    if (!tourStore.consumeSkipToHallOnReturn) return
    var pending = tourStore.consumeSkipToHallOnReturn()
    if (!pending || !pending.hall) return
    tourStore.updateTourState({ currentHall: pending.hall, status: 'touring' }, { deferPersist: true })
    setTimeout(function () {
      wx.navigateBack({ delta: 1 })
    }, 0)
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
    const params = { limit: 100 }
    const slug = this._currentHallSlug
    const localList = getFallbackExhibits(slug)

    if (slug) params.hall = slug

    const seq = ++self._reqSeq
    self._cachedAll = localList
    self.setData({
      exhibits: localList,
      loading: false,
      empty: localList.length === 0,
      dataNotice: '',
    })

    api.exhibitsApi.list(params, { timeout: 3000, retries: 0 }).then(function (res) {
      if (seq !== self._reqSeq) return
      if (res.ok && res.data && Array.isArray(res.data.exhibits)) {
        const list = res.data.exhibits.map(api.normalizeExhibit).filter(Boolean)
        if (list.length) {
          self._cachedAll = list
          self.setData({ exhibits: list, loading: false, empty: false, dataNotice: '' })
        } else if (!localList.length) {
          self._useFallback('当前展厅数据库暂无馆方展品清单，先展示可用于导览的代表性展项。')
        }
      } else if (!localList.length) {
        self._useFallback('展品接口暂时不可用，先展示本地代表性展项。')
      }
    }).catch(function () {
      if (seq !== self._reqSeq) return
      if (!localList.length) self._useFallback('展品接口暂时不可用，先展示本地代表性展项。')
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
            self.setData({ scanNotice: '当前环境未配置 OCR 服务，可先用文字搜索展项。' })
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
    return dedupeExhibits((this._cachedAll || []).concat(getFallbackExhibits('')))
  },

  _matchRecognizedText: function (text) {
    const self = this
    const aliases = api.resolveAliases(text)
    const localRanked = recognition.rankExhibits(self._candidatePool(), text, aliases)
    if (localRanked.length && localRanked[0].score >= 75) {
      return Promise.resolve(localRanked[0])
    }

    return api.exhibitsApi.search(text).then(function (res) {
      let apiList = []
      if (res.ok && res.data && Array.isArray(res.data.exhibits)) {
        apiList = res.data.exhibits.map(api.normalizeExhibit).filter(Boolean)
      }
      const ranked = recognition.rankExhibits(dedupeExhibits(apiList.concat(self._candidatePool())), text, aliases)
      return ranked.length ? ranked[0] : (localRanked[0] || null)
    }).catch(function () {
      return localRanked[0] || null
    })
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
      scanNotice: '已匹配到最接近的展项。',
    })
  },

  _useFallback: function (notice) {
    const list = getFallbackExhibits(this._currentHallSlug)
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
      this._loadExhibits()
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
    const seq = ++self._reqSeq
    const localFallback = getFallbackExhibits(self._currentHallSlug)
    const fullNorm = dedupeExhibits((self._cachedAll || []).concat(localFallback))
    const aliasNames = api.resolveAliases(keyword)
    const localMatches = fullNorm.filter(function (ex) {
      return matchesKeyword(ex, keyword) || (ex.name && aliasNames.indexOf(ex.name) >= 0)
    })
    const rankedMatches = recognition.rankExhibits(fullNorm, keyword, aliasNames).map(function (item) { return item.exhibit })
    const mergedLocal = dedupeExhibits(rankedMatches.concat(localMatches))

    self._cachedAll = fullNorm
    self.setData({
      exhibits: mergedLocal,
      loading: false,
      empty: mergedLocal.length === 0,
      scanResult: null,
      scanNotice: '',
      dataNotice: mergedLocal.length ? '' : '本地代表展项未命中，正在尝试从服务器搜索完整清单。',
    })

    api.exhibitsApi.search(keyword).then(function (apiRes) {
      if (seq !== self._reqSeq) return
      let apiList = []
      if (apiRes.ok && apiRes.data && Array.isArray(apiRes.data.exhibits)) {
        apiList = apiRes.data.exhibits.map(api.normalizeExhibit).filter(Boolean)
      }
      const apiRanked = recognition.rankExhibits(apiList.concat(fullNorm), keyword, aliasNames).map(function (item) { return item.exhibit })
      const merged = dedupeExhibits(apiRanked.concat(apiList).concat(mergedLocal))
      merged.sort(function (a, b) { return (b.importance || 0) - (a.importance || 0) })
      self.setData({
        exhibits: merged,
        loading: false,
        empty: merged.length === 0,
        dataNotice: merged.some(function (ex) { return ex.isLocalFallback })
          ? '部分结果来自本地代表性展项；完整展品清单仍需馆方数据导入。'
          : '',
      })
    }).catch(function (err) {
      if (seq !== self._reqSeq) return
      console.error('[search] error:', err)
      if (!localMatches.length) {
        self.setData({ dataNotice: '展品接口暂时不可用，本地代表展项也没有匹配结果。' })
      }
    })
  },

  clearSearch: function () {
    this.setData({ searchText: '', scanResult: null, scanNotice: '', ocrText: '' })
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
    let url = '/pages/exhibit-detail/exhibit-detail?name=' + encodeURIComponent(ex.name)
    if (ex.id && ex.id.indexOf('local-') !== 0 && ex.id.indexOf('mock-') !== 0) {
      url += '&id=' + encodeURIComponent(ex.id)
    } else {
      if (tourStore.setPendingDetailExhibit) tourStore.setPendingDetailExhibit(ex)
      url += '&local=1'
    }
    wx.navigateTo({ url: url })
  },
})
