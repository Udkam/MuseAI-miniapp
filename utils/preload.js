const HALL_ICON_ASSETS = [
  '/assets/icons/hall-basic.png',
  '/assets/icons/hall-site.png',
  '/assets/icons/hall-kiln.png',
  '/assets/icons/hall-workshop.png',
  '/assets/icons/hall-girl.png',
  '/assets/icons/hall-education.png',
  '/assets/icons/hall-peony.png',
  '/assets/icons/hall-temp-one.png',
  '/assets/icons/hall-temp-two.png',
]

const TOUR_ICON_ASSETS = [
  '/assets/icons/action-search-exhibit.png',
  '/assets/icons/exhibit-empty-search.png',
  '/assets/icons/exhibit-list-item.png',
  '/assets/icons/suggest-archaeology.png',
  '/assets/icons/suggest-artifacts.png',
  '/assets/icons/suggest-back.png',
  '/assets/icons/suggest-curation.png',
  '/assets/icons/suggest-detail.png',
  '/assets/icons/suggest-exhibit.png',
  '/assets/icons/suggest-figure.png',
  '/assets/icons/suggest-food.png',
  '/assets/icons/suggest-garden.png',
  '/assets/icons/suggest-hands.png',
  '/assets/icons/suggest-house.png',
  '/assets/icons/suggest-kiln.png',
  '/assets/icons/suggest-notes.png',
  '/assets/icons/suggest-overview.png',
  '/assets/icons/suggest-pattern.png',
  '/assets/icons/suggest-relation.png',
  '/assets/icons/suggest-settlement.png',
  '/assets/icons/suggest-tools.png',
]

const ENTRY_ICON_ASSETS = [
  '/assets/icons/focus-artifact.png',
  '/assets/icons/focus-history.png',
  '/assets/icons/focus-research.png',
  '/assets/icons/focus-study.png',
  '/assets/icons/persona-archaeologist.png',
  '/assets/icons/persona-artifact.png',
  '/assets/icons/persona-historian.png',
  '/assets/icons/persona-student.png',
  '/assets/icons/rhythm-deep.png',
  '/assets/icons/rhythm-dialogue.png',
  '/assets/icons/rhythm-notebook.png',
  '/assets/icons/rhythm-quick.png',
]

const ENABLE_PAGE_PRELOAD = false

function _later(fn, delay) {
  setTimeout(function () {
    try { fn() } catch (e) {}
  }, typeof delay === 'number' ? delay : 80)
}

function _unique(list) {
  var seen = {}
  var out = []
  ;(list || []).forEach(function (item) {
    if (!item || seen[item]) return
    seen[item] = true
    out.push(item)
  })
  return out
}

function preloadPages(urls, delay) {
  // Several MuseAI pages perform state changes or network requests in onLoad.
  // Keep page preload opt-in only; image preloading below is side-effect free.
  if (!ENABLE_PAGE_PRELOAD) return
  if (typeof wx === 'undefined' || typeof wx.preloadPage !== 'function') return
  var list = _unique(urls)
  if (!list.length) return
  _later(function () {
    list.forEach(function (url) {
      try { wx.preloadPage({ url: url }) } catch (e) {}
    })
  }, delay)
}

function preloadImages(srcs, delay) {
  if (typeof wx === 'undefined' || typeof wx.getImageInfo !== 'function') return
  var list = _unique(srcs)
  if (!list.length) return
  _later(function () {
    list.forEach(function (src) {
      try {
        wx.getImageInfo({
          src: src,
          fail: function () {},
        })
      } catch (e) {}
    })
  }, delay)
}

module.exports = {
  HALL_ICON_ASSETS: HALL_ICON_ASSETS,
  TOUR_ICON_ASSETS: TOUR_ICON_ASSETS,
  ENTRY_ICON_ASSETS: ENTRY_ICON_ASSETS,
  preloadPages: preloadPages,
  preloadImages: preloadImages,
}
