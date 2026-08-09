const assert = require('assert')

const memory = {}
global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
  setNavigationBarTitle: function () {},
  showToast: function () {},
}

const exhibitCatalog = require('../utils/exhibit-catalog')
const api = require('../api/index')
const tourStore = require('../store/tour')

let pageConfig = null
global.Page = function (config) { pageConfig = config }
require('../pages/exhibit-scan/exhibit-scan')
const scanPageConfig = pageConfig

function makePage(config) {
  const data = JSON.parse(JSON.stringify(config.data || {}))
  return Object.assign({}, config, {
    data: data,
    setData: function (patch, callback) {
      this.data = Object.assign({}, this.data, patch || {})
      if (callback) callback()
    },
  })
}

function rawExhibit(index, hall, name) {
  const suffix = String(index).padStart(12, '0')
  return {
    id: '00000000-0000-4000-8000-' + suffix,
    name: name || ('馆方展品-' + index),
    hall: hall || 'new-special-hall',
    category: '馆方分类',
    importance: index % 5,
  }
}

async function expectCatalogError(task, code) {
  try {
    await task
  } catch (err) {
    assert.strictEqual(err && err.code, code)
    return
  }
  assert.fail('expected catalog error: ' + code)
}

async function run() {
  api._rememberHallCatalog({
    halls: [{ slug: 'new-special-hall', name: '馆方缓存专题厅' }],
  })
  const namedByResponse = api.normalizeExhibit(Object.assign(rawExhibit(900), {
    hall: 'new-special-hall',
    hall_name: '馆方响应专题厅',
  }))
  assert.strictEqual(namedByResponse.hall, 'new-special-hall', 'the exhibit machine hall must remain the backend slug')
  assert.strictEqual(namedByResponse.hallDisplay, '馆方响应专题厅', 'response hall_name should be the first display-name source')

  const namedByCatalog = api.normalizeExhibit(rawExhibit(901, 'new-special-hall'))
  assert.strictEqual(namedByCatalog.hall, 'new-special-hall')
  assert.strictEqual(namedByCatalog.hallDisplay, '馆方缓存专题厅', 'catalog name should display when the exhibit omits hall_name')

  const nameWithoutSlug = api.normalizeExhibit(Object.assign(rawExhibit(902), {
    hall: '',
    hall_name: '仅有显示名称的专题厅',
  }))
  assert.strictEqual(nameWithoutSlug.hall, '', 'hall_name must never be promoted into a machine slug')
  assert.strictEqual(nameWithoutSlug.hallDisplay, '仅有显示名称的专题厅')

  const uploadedImage = api.normalizeExhibit(Object.assign(rawExhibit(903), {
    image_url: '/api/v1/exhibits/00000000-0000-4000-8000-000000000903/image',
  }))
  assert.strictEqual(
    uploadedImage.imageUrl,
    'https://api.banpo-museai.xyz/api/v1/exhibits/00000000-0000-4000-8000-000000000903/image',
    'root-relative uploaded images should use the active API origin'
  )
  const importedImage = api.normalizeExhibit(Object.assign(rawExhibit(904), {
    image_url: 'https://museum.example.org/images/object-904.webp',
  }))
  assert.strictEqual(importedImage.imageUrl, 'https://museum.example.org/images/object-904.webp')
  const unsafeImage = api.normalizeExhibit(Object.assign(rawExhibit(905), {
    image_url: 'javascript:alert(1)',
  }))
  assert.strictEqual(unsafeImage.imageUrl, '', 'unsupported image schemes must fall back locally')

  const paginationCalls = []
  const all205 = []
  for (let i = 0; i < 205; i++) all205.push(rawExhibit(i))
  const paginated = await exhibitCatalog.fetchAll({
    fetchPage: function (params) {
      paginationCalls.push({ skip: params.skip, limit: params.limit })
      return Promise.resolve({
        ok: true,
        data: {
          exhibits: all205.slice(params.skip, params.skip + params.limit),
          total: all205.length,
          skip: params.skip,
          limit: params.limit,
        },
      })
    },
  })
  assert.strictEqual(paginated.items.length, 205)
  assert.deepStrictEqual(paginationCalls, [
    { skip: 0, limit: 100 },
    { skip: 100, limit: 100 },
    { skip: 200, limit: 100 },
  ], '205 exhibits must be loaded sequentially in three ordered pages')

  await expectCatalogError(exhibitCatalog.fetchAll({
    fetchPage: function (params) {
      const page = params.skip === 0 ? all205.slice(0, 100) : [all205[0]]
      return Promise.resolve({ ok: true, data: { exhibits: page, total: 101, skip: params.skip, limit: params.limit } })
    },
  }), 'CATALOG_PAGE_REPEATED')
  await expectCatalogError(exhibitCatalog.fetchAll({
    fetchPage: function (params) {
      return Promise.resolve({ ok: true, data: { exhibits: all205.slice(0, 100), total: 2001, skip: params.skip, limit: params.limit } })
    },
  }), 'CATALOG_ITEM_LIMIT')

  const originalList = api.exhibitsApi.list
  const originalListByHall = api.exhibitsApi.listByHall
  const originalGet = api.exhibitsApi.get
  const originalSearch = api.exhibitsApi.search

  let page = makePage(scanPageConfig)
  page._currentHallSlug = ''
  api.exhibitsApi.list = function (params) {
    return Promise.resolve({
      ok: true,
      data: { exhibits: [], total: 0, skip: params.skip, limit: params.limit },
    })
  }
  await page._loadExhibits()
  assert.strictEqual(page._remoteCatalogAuthoritative, true)
  assert.strictEqual(page._fallbackCatalogActive, false)
  assert.deepStrictEqual(page.data.exhibits, [], 'a successful empty exhibit catalog must stay empty')
  assert.deepStrictEqual(page._candidatePool(), [], 'photo candidates must stay empty for an authoritative empty catalog')

  const dynamicReal = [
    rawExhibit(1, 'new-special-hall', '馆方动态陶盆'),
    rawExhibit(2, 'new-special-hall', '馆方动态石器'),
    rawExhibit(3, 'new-special-hall', '半坡人'),
  ]
  const hallCalls = []
  page = makePage(scanPageConfig)
  page._currentHallSlug = 'new-special-hall'
  api.exhibitsApi.listByHall = function (hall, params) {
    hallCalls.push({ hall: hall, skip: params.skip, limit: params.limit })
    return Promise.resolve({
      ok: true,
      data: { exhibits: dynamicReal, total: 3, skip: params.skip, limit: params.limit },
    })
  }
  await page._loadExhibits()
  assert.deepStrictEqual(hallCalls, [{ hall: 'new-special-hall', skip: 0, limit: 100 }])
  assert.deepStrictEqual(
    page.data.exhibits.map(function (item) { return item.name }),
    ['馆方动态陶盆', '馆方动态石器', '半坡人']
  )
  assert.ok(page.data.exhibits.some(function (item) { return item.name === '半坡人' }), 'a legitimate imported exhibit must not be hidden by a client-side name blacklist')
  assert.ok(page.data.exhibits.every(function (item) { return !item.isLocalFallback }), 'real catalogs must never mix local fallback exhibits')
  page.data.exhibits[0] = Object.assign({}, page.data.exhibits[0], { imageUrl: 'https://museum.example.org/broken.jpg' })
  page.onExhibitImageError({ currentTarget: { dataset: { id: page.data.exhibits[0].id } } })
  assert.strictEqual(page.data.exhibits[0].imageUrl, '', 'a failed list thumbnail should switch to the bundled default image')
  const matches = await page._enhancedSearch('动态陶盆')
  assert.deepStrictEqual(matches.map(function (item) { return item.name }), ['馆方动态陶盆'])
  assert.ok(page._candidatePool().every(function (item) { return item.hall === 'new-special-hall' }), 'photo candidates must preserve dynamic backend hall slugs')
  assert.ok(page._candidatePool().every(function (item) { return !item.isLocalFallback }), 'photo candidates must not mix fake exhibits into a real catalog')

  page = makePage(scanPageConfig)
  page._currentHallSlug = ''
  api.exhibitsApi.list = function (params) {
    if (params.skip === 0) {
      return Promise.resolve({
        ok: true,
        data: { exhibits: all205.slice(0, 100), total: 205, skip: 0, limit: 100 },
      })
    }
    return Promise.resolve({ ok: false, status: 503, data: {} })
  }
  const originalWarn = console.warn
  console.warn = function () {}
  await page._loadExhibits()
  console.warn = originalWarn
  assert.strictEqual(page._remoteCatalogAuthoritative, false)
  assert.strictEqual(page._fallbackCatalogActive, false, 'production must keep the development mock catalog disabled')
  assert.deepStrictEqual(page.data.exhibits, [], 'mid-pagination failure must discard partial real data without exposing mock exhibits')
  assert.strictEqual(page.data.exhibits.some(function (item) { return item.id === all205[0].id }), false)

  pageConfig = null
  delete require.cache[require.resolve('../pages/exhibit-detail/exhibit-detail')]
  require('../pages/exhibit-detail/exhibit-detail')
  const detailPage = makePage(pageConfig)
  tourStore.clearTour()
  api.exhibitsApi.get = function () {
    return Promise.resolve({ ok: false, status: 404, data: {} })
  }
  let searchCalled = false
  api.exhibitsApi.search = function () {
    searchCalled = true
    return Promise.resolve({ ok: true, data: { exhibits: [] } })
  }
  detailPage.onLoad({
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: encodeURIComponent('人面鱼纹盆'),
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.strictEqual(detailPage.data.loadError, true, 'trusted-id 404 must show an unavailable state')
  assert.strictEqual(searchCalled, false, 'trusted-id failure must not downgrade to a same-name search/mock path')
  assert.strictEqual(detailPage.data.exhibit.description, '', 'trusted-id failure must not display hardcoded mock facts')
  assert.strictEqual(detailPage._viewRecorded, false)

  const cachedDetail = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: '馆方缓存展品',
    hall: 'new-special-hall',
    description: '来自完整远端目录的可信缓存。',
  }
  tourStore.setPendingDetailExhibit(cachedDetail)
  const cachedDetailPage = makePage(pageConfig)
  cachedDetailPage.onLoad({
    id: cachedDetail.id,
    name: encodeURIComponent(cachedDetail.name),
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.strictEqual(cachedDetailPage.data.loadError, false)
  assert.strictEqual(cachedDetailPage.data.exhibit.description, cachedDetail.description, 'same-UUID cached real data may be used when detail GET fails')
  cachedDetailPage.setData({ exhibitImageSrc: 'https://museum.example.org/broken.jpg', usingDefaultImage: false })
  cachedDetailPage.onExhibitImageError()
  assert.strictEqual(cachedDetailPage.data.exhibitImageSrc, '/assets/icons/exhibit-list-item.png')
  assert.strictEqual(cachedDetailPage.data.usingDefaultImage, true)

  const localDetailPage = makePage(pageConfig)
  localDetailPage.onLoad({ local: '1', name: encodeURIComponent('人面鱼纹盆') })
  assert.strictEqual(localDetailPage.data.loadError, true, 'production must not expose static mock details through a local query flag')
  assert.strictEqual(localDetailPage.data.exhibit.description, '')

  api.exhibitsApi.list = originalList
  api.exhibitsApi.listByHall = originalListByHall
  api.exhibitsApi.get = originalGet
  api.exhibitsApi.search = originalSearch
  console.log('exhibit catalog authority and pagination checks passed')
}

run().catch(function (err) {
  console.error(err)
  process.exitCode = 1
})
