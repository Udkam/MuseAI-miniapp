var exhibitIds = require('./exhibit-id')

var DEFAULT_PAGE_SIZE = 100
var DEFAULT_MAX_PAGES = 20
var DEFAULT_MAX_ITEMS = DEFAULT_PAGE_SIZE * DEFAULT_MAX_PAGES

function catalogError(code, message) {
  var error = new Error(message || code)
  error.code = code
  return error
}

function fetchAll(options) {
  var source = options || {}
  if (typeof source.fetchPage !== 'function') {
    return Promise.reject(catalogError('CATALOG_FETCH_MISSING', 'fetchPage is required'))
  }

  var pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(source.pageSize) || DEFAULT_PAGE_SIZE))
  var maxPages = Math.max(1, Number(source.maxPages) || DEFAULT_MAX_PAGES)
  var maxItems = Math.max(pageSize, Number(source.maxItems) || DEFAULT_MAX_ITEMS)
  var baseParams = Object.assign({}, source.params || {})
  delete baseParams.skip
  delete baseParams.limit

  var expectedTotal = null
  var items = []
  var seenIds = {}
  var pageCount = 0

  function loadPage(skip) {
    if (pageCount >= maxPages) {
      return Promise.reject(catalogError('CATALOG_PAGE_LIMIT', 'exhibit catalog exceeded the page safety limit'))
    }
    var params = Object.assign({}, baseParams, { skip: skip, limit: pageSize })
    pageCount += 1

    return Promise.resolve().then(function () {
      return source.fetchPage(params)
    }).then(function (res) {
      if (!res || !res.ok || !res.data || !Array.isArray(res.data.exhibits)) {
        throw catalogError('CATALOG_REQUEST_FAILED', 'exhibit catalog page request failed')
      }

      var page = res.data.exhibits
      var total = Number(res.data.total)
      if (!isFinite(total) || total < 0 || Math.floor(total) !== total) {
        throw catalogError('CATALOG_TOTAL_INVALID', 'exhibit catalog total must be a non-negative integer')
      }
      if (total > maxItems) {
        throw catalogError('CATALOG_ITEM_LIMIT', 'exhibit catalog exceeded the item safety limit')
      }
      if (expectedTotal === null) expectedTotal = total
      if (total !== expectedTotal) {
        throw catalogError('CATALOG_TOTAL_CHANGED', 'exhibit catalog total changed during pagination')
      }
      if (res.data.skip !== undefined && Number(res.data.skip) !== skip) {
        throw catalogError('CATALOG_SKIP_MISMATCH', 'exhibit catalog returned an unexpected page offset')
      }
      var expectedLength = Math.min(pageSize, Math.max(0, expectedTotal - skip))
      if (page.length !== expectedLength) {
        throw catalogError('CATALOG_PAGE_INCOMPLETE', 'exhibit catalog page length does not match total/skip/limit')
      }

      page.forEach(function (item) {
        if (!item || typeof item !== 'object') {
          throw catalogError('CATALOG_ITEM_INVALID', 'exhibit catalog contains a non-object item')
        }
        var id = exhibitIds.normalizeBackendExhibitUuid(item.id)
        if (!id) {
          throw catalogError('CATALOG_ID_INVALID', 'exhibit catalog item lacks a trusted backend id')
        }
        if (seenIds[id]) {
          throw catalogError('CATALOG_PAGE_REPEATED', 'exhibit catalog repeated an item across pages')
        }
        seenIds[id] = true
        items.push(item)
      })

      if (items.length === expectedTotal) {
        return { items: items, total: expectedTotal, pages: pageCount }
      }
      if (items.length > expectedTotal) {
        throw catalogError('CATALOG_TOTAL_OVERFLOW', 'exhibit catalog returned more items than total')
      }
      return loadPage(skip + pageSize)
    })
  }

  return loadPage(0)
}

module.exports = {
  DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_PAGES: DEFAULT_MAX_PAGES,
  DEFAULT_MAX_ITEMS: DEFAULT_MAX_ITEMS,
  fetchAll: fetchAll,
}
