// Hall/visit-point definitions derived from 展厅信息.docx.
// Some points are service or temporary spaces rather than exhibit-rich halls.

var HALLS_MAP = {
  basic: {
    id: 'basic',
    backendSlug: 'basic-exhibition-hall',
    name: '基本陈列展厅',
    short: '陈列',
    icon: '🏺',
    desc: '以半坡遗址考古发现与研究成果为主线，系统呈现半坡文化的生活形态、生产方式与社会结构。',
    highlights: ['人面鱼纹彩陶盆', '尖底瓶', '彩陶与装饰品', '石器工具'],
    hallKey: '基本陈列展厅',
  },
  site: {
    id: 'site',
    backendSlug: 'site-protection-hall',
    name: '遗址保护大厅',
    short: '遗址',
    icon: '🏘️',
    desc: '强调原址呈现与保护展示，可观察墓葬、地面圆形房屋、烧制作坊、灶具灶台等关键遗存。',
    highlights: ['墓葬', '地面圆形房屋', '烧制作坊', '灶具灶台'],
    hallKey: '遗址保护大厅',
  },
  temp1: {
    id: 'temp1',
    backendSlug: 'temporary-hall-1',
    name: '临展厅一',
    short: '临展一',
    icon: '🖼️',
    desc: '承载阶段性专题展览，主题和展品随当期策展内容变化。',
    highlights: ['当期专题', '临时展品', '策展主题'],
    hallKey: '临展厅一',
  },
  temp2: {
    id: 'temp2',
    backendSlug: 'temporary-hall-2',
    name: '临展厅二',
    short: '临展二',
    icon: '🖼️',
    desc: '与临展厅一共同承担轮换展出，需要按馆方最新展览清单更新内容。',
    highlights: ['轮换展览', '阶段性专题', '馆方更新'],
    hallKey: '临展厅二',
  },
  banpoGirl: {
    id: 'banpoGirl',
    backendSlug: 'banpo-girl-sculpture',
    name: '半坡姑娘雕塑',
    short: '雕塑',
    icon: '🗿',
    desc: '以“半坡姑娘”为代表形象进行艺术化再现，是观众合影点和半坡人形象记忆入口。',
    highlights: ['人物形象', '文化象征', '观展地标'],
    hallKey: '半坡姑娘雕塑',
  },
  workshop: {
    id: 'workshop',
    backendSlug: 'prehistoric-workshop',
    name: '史前工坊',
    short: '工坊',
    icon: '🛠️',
    desc: '把制陶、材料、手作等史前生活知识转化为可参与的互动学习体验。',
    highlights: ['手作体验', '史前工艺', '互动学习'],
    hallKey: '史前工坊',
  },
  education: {
    id: 'education',
    backendSlug: 'education-center',
    name: '教研中心',
    short: '教研',
    icon: '📚',
    desc: '面向青少年和公众教育活动，适合承载研学课程、主题课堂与研究型活动。',
    highlights: ['教育研学', '主题课堂', '公众活动'],
    hallKey: '教研中心',
  },
  peony: {
    id: 'peony',
    backendSlug: 'peony-garden',
    name: '牡丹园',
    short: '牡丹',
    icon: '🌸',
    desc: '以牡丹为核心的园林休憩区域，适合在观展间隙停留并体验季节性自然景观。',
    highlights: ['植物景观', '园林休憩', '季节观赏'],
    hallKey: '牡丹园',
  },
  kiln: {
    id: 'kiln',
    backendSlug: 'kiln-hall',
    name: '陶窑展厅',
    short: '陶窑',
    icon: '🔥',
    desc: '以“陶器如何被制作出来”为核心叙事，解释制坯、装饰、干燥、入窑烧成等生产流程。',
    highlights: ['陶窑遗址', '火候工艺', '制陶流程'],
    hallKey: '陶窑展厅',
  },
}

var DEFAULT_ORDER = ['basic', 'site', 'kiln', 'workshop', 'banpoGirl', 'education', 'peony', 'temp1', 'temp2']
var LEGACY_HALL_SLUGS = {
  'relic-hall': 'basic-exhibition-hall',
  'pottery-spirit-hall': 'basic-exhibition-hall',
  'civilization-spark-hall': 'basic-exhibition-hall',
  'site-hall': 'site-protection-hall',
  'site-archaeology-hall': 'site-protection-hall',
  'bronze-a': 'basic-exhibition-hall',
  'bronze-b': 'basic-exhibition-hall',
  ceramics: 'kiln-hall',
  'painting-a': 'basic-exhibition-hall',
  'painting-b': 'basic-exhibition-hall',
  jade: 'basic-exhibition-hall',
  'gold-silver': 'basic-exhibition-hall',
  sculpture: 'banpo-girl-sculpture',
  special: 'temporary-hall-1',
}
var HALL_SLUG_NAMES = {}
var HALL_NAME_SLUGS = {}

Object.keys(HALLS_MAP).forEach(function (id) {
  var hall = HALLS_MAP[id]
  HALL_SLUG_NAMES[hall.backendSlug] = hall.name
  HALL_NAME_SLUGS[id] = hall.backendSlug
  HALL_NAME_SLUGS[hall.name] = hall.backendSlug
  HALL_NAME_SLUGS[hall.hallKey] = hall.backendSlug
})
Object.keys(LEGACY_HALL_SLUGS).forEach(function (slug) {
  HALL_SLUG_NAMES[slug] = HALL_SLUG_NAMES[LEGACY_HALL_SLUGS[slug]]
  HALL_NAME_SLUGS[slug] = LEGACY_HALL_SLUGS[slug]
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
  return HALL_NAME_SLUGS[raw] || LEGACY_HALL_SLUGS[raw] || (HALL_SLUG_NAMES[raw] ? raw : raw)
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

function getHallDesc(id) {
  var hall = getHall(id)
  return hall ? hall.desc : ''
}

module.exports = {
  HALLS_MAP: HALLS_MAP,
  DEFAULT_ORDER: DEFAULT_ORDER,
  HALL_SLUG_NAMES: HALL_SLUG_NAMES,
  HALL_NAME_SLUGS: HALL_NAME_SLUGS,
  LEGACY_HALL_SLUGS: LEGACY_HALL_SLUGS,
  getHall: getHall,
  getHallBySlug: getHallBySlug,
  getHallName: getHallName,
  getHallDesc: getHallDesc,
  normalizeHallToSlug: normalizeHallToSlug,
  getHallDisplayName: getHallDisplayName,
}
