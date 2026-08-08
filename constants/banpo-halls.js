// Canonical hall identity and presentation metadata only. Names/slugs are the
// trusted fixed contract; descriptions and highlights must come from
// /tour/halls so this file can never overwrite current museum content.

var HALLS_MAP = {
  basic: {
    id: 'basic',
    backendSlug: 'basic-exhibition-hall',
    name: '基本陈列展厅',
    short: '陈列',
    icon: '🏺',
    iconKey: 'hall-basic',
    hallKey: '基本陈列展厅',
  },
  site: {
    id: 'site',
    backendSlug: 'site-protection-hall',
    name: '遗址保护大厅',
    short: '遗址',
    icon: '🏘️',
    iconKey: 'hall-site',
    hallKey: '遗址保护大厅',
  },
  temp1: {
    id: 'temp1',
    backendSlug: 'temporary-hall-1',
    name: '临展厅一',
    short: '临展一',
    icon: '🖼️',
    iconKey: 'hall-temp-one',
    hallKey: '临展厅一',
  },
  temp2: {
    id: 'temp2',
    backendSlug: 'temporary-hall-2',
    name: '临展厅二',
    short: '临展二',
    icon: '🖼️',
    iconKey: 'hall-temp-two',
    hallKey: '临展厅二',
  },
  banpoGirl: {
    id: 'banpoGirl',
    backendSlug: 'banpo-girl-sculpture',
    name: '半坡姑娘雕塑',
    short: '雕塑',
    icon: '🗿',
    iconKey: 'hall-girl',
    hallKey: '半坡姑娘雕塑',
  },
  workshop: {
    id: 'workshop',
    backendSlug: 'prehistoric-workshop',
    name: '史前工坊',
    short: '工坊',
    icon: '🛠️',
    iconKey: 'hall-workshop',
    hallKey: '史前工坊',
  },
  education: {
    id: 'education',
    backendSlug: 'education-center',
    name: '教研中心',
    short: '教研',
    icon: '📚',
    iconKey: 'hall-education',
    hallKey: '教研中心',
  },
  peony: {
    id: 'peony',
    backendSlug: 'peony-garden',
    name: '牡丹园',
    short: '牡丹',
    icon: '🌸',
    iconKey: 'hall-peony',
    hallKey: '牡丹园',
  },
  kiln: {
    id: 'kiln',
    backendSlug: 'kiln-hall',
    name: '陶窑展厅',
    short: '陶窑',
    icon: '🔥',
    iconKey: 'hall-kiln',
    hallKey: '陶窑展厅',
  },
}

var DEFAULT_ORDER = ['basic', 'site', 'kiln', 'workshop', 'banpoGirl', 'education', 'peony', 'temp1', 'temp2']
var HALL_SLUG_NAMES = {}
var HALL_NAME_SLUGS = {}

Object.keys(HALLS_MAP).forEach(function (id) {
  var hall = HALLS_MAP[id]
  if (hall.iconKey) hall.iconSrc = '/assets/icons/' + hall.iconKey + '.png'
  HALL_SLUG_NAMES[hall.backendSlug] = hall.name
  HALL_NAME_SLUGS[id] = hall.backendSlug
  HALL_NAME_SLUGS[hall.name] = hall.backendSlug
  HALL_NAME_SLUGS[hall.hallKey] = hall.backendSlug
})

function getHall(id) {
  return HALLS_MAP[id] || null
}

function getHallBySlug(slug) {
  var canonical = normalizeHallToSlug(slug)
  if (!canonical) return null
  var found = null
  Object.keys(HALLS_MAP).some(function (id) {
    if (HALLS_MAP[id].backendSlug === canonical) {
      found = HALLS_MAP[id]
      return true
    }
    return false
  })
  return found
}

function normalizeHallToSlug(value) {
  if (!value) return null
  var raw = String(value).trim()
  var known = HALL_NAME_SLUGS[raw] || (HALL_SLUG_NAMES[raw] ? raw : null)
  if (known) return known
  var safeSlug = raw.toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(safeSlug) ? safeSlug : null
}

function getHallDisplayName(value) {
  if (!value) return ''
  var slug = normalizeHallToSlug(value)
  var hall = getHallBySlug(slug)
  if (hall) return hall.name
  return HALL_SLUG_NAMES[value] || String(value)
}

function getHallName(id) {
  var hall = getHall(id)
  return hall ? hall.name : ''
}

module.exports = {
  HALLS_MAP: HALLS_MAP,
  DEFAULT_ORDER: DEFAULT_ORDER,
  HALL_SLUG_NAMES: HALL_SLUG_NAMES,
  HALL_NAME_SLUGS: HALL_NAME_SLUGS,
  getHall: getHall,
  getHallBySlug: getHallBySlug,
  getHallName: getHallName,
  normalizeHallToSlug: normalizeHallToSlug,
  getHallDisplayName: getHallDisplayName,
}
