const assert = require('assert')
const hallData = require('../utils/hall-data')

const fallback = hallData.buildHallList([], [])
assert.deepStrictEqual(fallback, [], 'empty/failed remote data must not restore static hall records')
assert.deepStrictEqual(
  hallData.buildHallList([], [], { authoritative: true }),
  [],
  'a successful empty hall catalog must remain empty instead of restoring static halls'
)

const remote = hallData.buildHallList(['kiln-hall'], [
  {
    slug: 'kiln-hall',
    name: '真实陶窑展厅',
    description: '馆方导入的描述',
    highlights: ['馆方陶窑重点'],
    focus: '馆方陶窑观察方向',
    exhibit_count: 12,
    estimated_duration_minutes: 18,
  },
  {
    slug: 'new-special-hall',
    name: '新专题展厅',
    description: '动态展厅',
  },
  {
    slug: 'site-protection-hall',
    name: '已停用展厅',
    is_active: false,
  },
])

assert.deepStrictEqual(
  remote.map(function (item) { return item.backendSlug }),
  ['kiln-hall', 'new-special-hall'],
  'a non-empty remote response must not append static halls and must exclude inactive rows'
)
assert.strictEqual(remote[0].name, '真实陶窑展厅')
assert.strictEqual(remote[0].iconSrc, '/assets/icons/hall-kiln.png', 'known slugs should reuse only visual defaults')
assert.strictEqual(remote[0].desc, '馆方导入的描述')
assert.deepStrictEqual(remote[0].highlights, ['馆方陶窑重点'])
assert.strictEqual(remote[0].focus, '馆方陶窑观察方向')
assert.strictEqual(remote[0].exhibitCount, 12)
assert.strictEqual(remote[0].estimatedDurationMinutes, 18)
assert.strictEqual(remote[0].isVisited, true)
assert.strictEqual(remote[1].id, 'new-special-hall', 'unknown backend slugs should remain navigable')
assert.deepStrictEqual(remote[1].highlights, [], 'missing remote highlights must stay empty instead of using canonical facts')
assert.strictEqual(remote[1].focus, '', 'missing remote focus must stay empty instead of using hardcoded route meta')

assert.deepStrictEqual(
  hallData.buildHallList([], [
    { slug: 'bad slug', name: '非法展厅' },
    { slug: 'kiln-hall', name: '陶窑一' },
    { slug: 'kiln-hall', name: '陶窑二' },
  ]).map(function (item) { return item.name }),
  ['陶窑一'],
  'invalid and duplicate remote slugs should not create cards'
)

console.log('hall data contract checks passed')
