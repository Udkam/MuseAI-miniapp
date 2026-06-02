const tourStore = require('../../store/tour')
const api = require('../../api/index')
const banpoHalls = require('../../constants/banpo-halls')

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

Page({
  data: {
    exhibits: [],
    loading: true,
    searchText: '',
    hallHint: '',
    dataNotice: '',
    empty: false,
  },

  _searchTimer: null,
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
    if (ENABLE_HALL_DISCOVERY_LOG) this._discoverHallSlugs()
    this._loadExhibits()
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

    self._cachedAll = fullNorm
    self.setData({
      exhibits: localMatches,
      loading: false,
      empty: localMatches.length === 0,
      dataNotice: localMatches.length ? '' : '本地代表展项未命中，正在尝试从服务器搜索完整清单。',
    })

    api.exhibitsApi.search(keyword).then(function (apiRes) {
      if (seq !== self._reqSeq) return
      let apiList = []
      if (apiRes.ok && apiRes.data && Array.isArray(apiRes.data.exhibits)) {
        apiList = apiRes.data.exhibits.map(api.normalizeExhibit).filter(Boolean)
      }
      const merged = dedupeExhibits(apiList.concat(localMatches))
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
    this.setData({ searchText: '' })
    this._loadExhibits()
  },

  selectExhibit: function (e) {
    const ex = e.currentTarget.dataset.exhibit
    let url = '/pages/exhibit-detail/exhibit-detail?name=' + encodeURIComponent(ex.name)
    if (ex.id && ex.id.indexOf('local-') !== 0 && ex.id.indexOf('mock-') !== 0) {
      url += '&id=' + encodeURIComponent(ex.id)
    } else {
      tourStore.setCurrentExhibit(ex)
      url += '&local=1'
    }
    wx.navigateTo({ url: url })
  },
})
