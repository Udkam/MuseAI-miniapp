const assert = require('assert')
const routeData = require('../utils/route-data')

const remote = [
  { slug: 'kiln-hall', name: '真实陶窑', short_description: '真实短简介', description: '真实描述', estimated_duration_minutes: 21, highlights: ['真实重点'], focus: '真实观察方向' },
  { slug: 'basic-exhibition-hall', name: '真实基本陈列', description: '第二站', estimated_duration_minutes: 35 },
  { slug: 'new-special-hall', name: '新专题厅', description: '第三站', estimated_duration_minutes: 12 },
]
const steps = routeData.buildBaseSteps(remote, {
  kiln: { minutes: 99, reason: '旧陶窑说明', focus: '旧陶窑重点' },
  basic: { minutes: 99, reason: '旧基本陈列说明', focus: '旧基本陈列重点' },
})
assert.deepStrictEqual(
  steps.map(function (step) { return step.hallSlug }),
  ['kiln-hall', 'basic-exhibition-hall', 'new-special-hall'],
  'base route must preserve backend display_order and must not append static halls'
)
assert.deepStrictEqual(steps.map(function (step) { return step.estimatedMinutes }), [21, 35, 12])
assert.strictEqual(steps[0].reason, '真实短简介', 'route cards should reuse the backend structured short description without punctuation changes')
assert.deepStrictEqual(steps[0].highlights, ['真实重点'])
assert.strictEqual(steps[0].focus, '真实观察方向。')
assert.deepStrictEqual(steps[1].highlights, [], 'authoritative halls without highlights must not inherit static highlights')
assert.strictEqual(steps[1].focus, '', 'authoritative halls without focus must not inherit HALL_ROUTE_META')
assert.deepStrictEqual(routeData.availableHallSlugs(remote), [
  'kiln-hall', 'basic-exhibition-hall', 'new-special-hall',
])
assert.strictEqual(routeData.findHall(remote, 'new-special-hall').name, '新专题厅')
assert.strictEqual(routeData.normalizeHallSlug('unsafe slug'), '')
assert.strictEqual(routeData.buildBaseSteps([], {}).length, 0, 'API failure/empty response must not use static hall facts')
assert.strictEqual(
  routeData.buildBaseSteps([], {}, { authoritative: true }).length,
  0,
  'a successful empty hall catalog must not invent static active halls'
)

const questionnaireRemote = [
  { slug: 'site-protection-hall', name: '真实遗址大厅', description: '遗址说明', estimated_duration_minutes: 18 },
  { slug: 'new-special-hall', name: '馆方新专题厅', description: '动态专题说明', estimated_duration_minutes: 12 },
  { slug: 'kiln-hall', name: '真实陶窑展厅', description: '陶窑说明', estimated_duration_minutes: 14 },
  { slug: 'basic-exhibition-hall', name: '真实基本陈列', description: '陈列说明', estimated_duration_minutes: 18 },
  { slug: 'closed-special-hall', name: '已关闭专题厅', is_active: false, estimated_duration_minutes: 5 },
]
const directoryWithIgnoredPreferences = routeData.buildDeterministicSteps(questionnaireRemote, {
  authoritative: true,
  persona: 'D',
  preferredHallOrder: ['new-special-hall', 'site'],
  timeBudget: 'quick',
}, {})
assert.deepStrictEqual(
  directoryWithIgnoredPreferences.map(function (step) { return step.hallSlug }),
  ['site-protection-hall', 'new-special-hall', 'kiln-hall', 'basic-exhibition-hall'],
  'persona, preferredHallOrder, and time budget must not reorder or truncate the backend hall directory'
)

const temporaryHallDirectory = routeData.buildDeterministicSteps([
  { slug: 'temporary-hall-1', name: '旧接口临展厅', description: '旧接口未提供展品数量。' },
  { slug: 'temporary-hall-2', name: '空临展厅', description: '当前没有展品。', exhibit_count: 0 },
  { slug: 'research-center', name: '教研中心', description: '永久展厅允许暂时没有展品。', exhibit_count: 0 },
], { authoritative: true }, {})
assert.deepStrictEqual(
  temporaryHallDirectory.map(function (step) { return step.hallSlug }),
  ['temporary-hall-1', 'research-center'],
  'only a temporary hall with an explicit zero exhibit_count should be omitted from the route list'
)
assert.strictEqual(temporaryHallDirectory[0].exhibitCountKnown, false, 'missing exhibit_count must remain compatible with older hall APIs')
assert.strictEqual(temporaryHallDirectory[1].exhibitCountKnown, true, 'an explicit permanent-hall count must be preserved')
assert.strictEqual(temporaryHallDirectory[1].exhibitCount, 0, 'permanent halls must not be hidden merely because the current count is zero')
const populatedTemporaryHall = routeData.buildDeterministicSteps([
  { slug: 'temporary-hall-1', name: '有展品的临展厅', exhibit_count: 2 },
], { authoritative: true }, {})
assert.strictEqual(populatedTemporaryHall.length, 1, 'a temporary hall with exhibits must remain in the route list')
assert.strictEqual(populatedTemporaryHall[0].exhibitCount, 2, 'route snapshots must preserve the authoritative exhibit count')
assert.deepStrictEqual(
  directoryWithIgnoredPreferences.map(function (step) { return step.name }),
  ['真实遗址大厅', '馆方新专题厅', '真实陶窑展厅', '真实基本陈列'],
  'dynamic unknown slugs must retain backend Chinese display names'
)
assert.strictEqual(
  directoryWithIgnoredPreferences.some(function (step) { return step.hallSlug === 'closed-special-hall' }),
  false,
  'inactive halls must never enter the directory'
)

const personaRouteOptions = {
  authoritative: true,
  persona: 'D',
  preferredHallOrder: [],
  timeBudget: 90,
}
const personaRoute = routeData.buildDeterministicSteps(questionnaireRemote, personaRouteOptions, {})
assert.deepStrictEqual(
  personaRoute.map(function (step) { return step.hallSlug }),
  ['site-protection-hall', 'new-special-hall', 'kiln-hall', 'basic-exhibition-hall'],
  'a different persona and budget must still preserve backend directory order'
)
assert.deepStrictEqual(
  routeData.buildDeterministicSteps(questionnaireRemote, personaRouteOptions, {}),
  personaRoute,
  'the same hall catalog and questionnaire must always produce the same route'
)

const unknownDurationDirectory = routeData.buildDeterministicSteps([
  { slug: 'site-protection-hall', name: '遗址大厅', estimated_duration_minutes: 0 },
  { slug: 'new-special-hall', name: '新专题厅' },
  { slug: 'kiln-hall', name: '陶窑展厅', estimated_duration_minutes: 14 },
], {
  authoritative: true,
  persona: 'A',
  preferredHallOrder: ['kiln-hall'],
  timeBudget: 'quick',
}, {})
assert.deepStrictEqual(
  unknownDurationDirectory.map(function (step) { return step.hallSlug }),
  ['site-protection-hall', 'new-special-hall', 'kiln-hall'],
  'unknown durations must not trigger sorting or budget truncation'
)
assert.deepStrictEqual(
  unknownDurationDirectory.map(function (step) { return step.estimatedMinutes }),
  [0, 0, 14],
  'missing or zero duration must remain unknown instead of using a client default'
)
assert.deepStrictEqual(
  unknownDurationDirectory.map(function (step) { return step.duration }),
  ['时长待确认', '时长待确认', '约 14 分钟'],
  'unknown durations must be labelled as pending confirmation'
)
const memory = {}
global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
  },
  setStorageSync: function (key, value) { memory[key] = value },
  removeStorageSync: function (key) { delete memory[key] },
}
let routePageConfig = null
global.Page = function (config) { routePageConfig = config }
require('../pages/route/route')
const tourStore = require('../store/tour')
tourStore.clearTour()
tourStore.createLocalTourState({ interestType: 'default', persona: 'default', assumption: 'D', personaId: 'default' })
const routePage = Object.assign({}, routePageConfig, {
  data: JSON.parse(JSON.stringify(routePageConfig.data)),
  _availableHalls: null,
  _hallCatalogAuthoritative: false,
  setData: function (patch) { this.data = Object.assign({}, this.data, patch || {}) },
})
routePage._refresh()
assert.deepStrictEqual(routePage.data.steps, [], 'production route must fail closed when /tour/halls is unavailable')
assert.strictEqual(routePage.data.routeSource, 'unavailable')
const unavailableRouteText = JSON.stringify(routePage.data)
;['石器工具', '彩陶与装饰品', '半地穴', '壕沟', '陶窑结构'].forEach(function (term) {
  assert.strictEqual(unavailableRouteText.indexOf(term), -1, 'failed route catalog must not leak hardcoded exhibit facts: ' + term)
})

routePage._availableHalls = questionnaireRemote
routePage._hallCatalogAuthoritative = true
routePage._refresh()
assert.deepStrictEqual(
  routePage.data.steps.map(function (step) { return step.hallSlug }),
  ['site-protection-hall', 'new-special-hall', 'kiln-hall', 'basic-exhibition-hall'],
  'route page must render the complete open-hall directory in backend order'
)
assert.strictEqual(routePage.data.routeSource, 'hall-directory-v2')
assert.strictEqual(routePage.data.routeSourceLabel, '开放展厅目录')
assert.strictEqual(routePage.data.tagline, '按馆内标识选择下一处展厅。', 'route page copy should give one short on-site action')
assert.strictEqual(routePage.data.routeNotice, '', 'a populated route list should not repeat the heading instruction')
assert.strictEqual(/策展路线/.test(JSON.stringify(routePage.data)), false, 'route page must not present the directory as a curated route')

console.log('route data contract checks passed')
