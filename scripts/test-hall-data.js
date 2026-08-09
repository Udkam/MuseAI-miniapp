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
assert.strictEqual(remote[0].iconSrc, '/assets/icons/hall-kiln.svg', 'known slugs should use the new vector visual default')
assert.strictEqual(remote[0].iconFallbackSrc, '/assets/icons/hall-kiln.png', 'legacy PNG should remain available as a runtime fallback')
assert.strictEqual(remote[0].desc, '馆方导入的描述')
assert.strictEqual(remote[0].cardDesc, '可从现场展品与展签开始了解本厅')
assert.deepStrictEqual(remote[0].highlights, ['馆方陶窑重点'])
assert.strictEqual(remote[0].focus, '馆方陶窑观察方向')
assert.strictEqual(remote[0].exhibitCount, 12)
assert.strictEqual(remote[0].estimatedDurationMinutes, 18)
assert.strictEqual(remote[0].isVisited, true)
assert.strictEqual(remote[1].id, 'new-special-hall', 'unknown backend slugs should remain navigable')
assert.deepStrictEqual(remote[1].highlights, [], 'missing remote highlights must stay empty instead of using canonical facts')
assert.strictEqual(remote[1].focus, '', 'missing remote focus must stay empty instead of using hardcoded route meta')

const conciseFromSummary = hallData.buildHallList([], [{
  slug: 'summary-hall',
  name: '摘要专题厅',
  description: '这是一段需要完整保留给入场欢迎消息的馆方原始简介，其中包含更多背景、范围与参观信息。',
  summary: '馆方提供的可信短简介',
}])[0]
assert.strictEqual(
  conciseFromSummary.desc,
  '这是一段需要完整保留给入场欢迎消息的馆方原始简介，其中包含更多背景、范围与参观信息。',
  'the full trusted description must remain available outside the compact card copy'
)
assert.strictEqual(
  conciseFromSummary.cardDesc,
  '可从现场展品与展签开始了解本厅',
  'legacy summary must not masquerade as the structured short-description field'
)

const conciseFromShort = hallData.buildHallList([], [{
  slug: 'short-hall',
  name: '短简介专题厅',
  description: '馆方完整简介仍用于进入展厅后的欢迎消息。',
  short_description: '馆方短简介',
  summary: '次优先摘要',
}])[0]
assert.strictEqual(conciseFromShort.desc, '馆方完整简介仍用于进入展厅后的欢迎消息。')
assert.strictEqual(conciseFromShort.cardDesc, '馆方短简介', 'short_description must display without added punctuation')

const conciseFromCardAlias = hallData.buildHallList([], [{
  slug: 'card-alias-hall',
  name: '卡片字段专题厅',
  description: '馆方完整简介。',
  card_description: '馆方卡片短简介',
  summary: '次优先摘要',
}])[0]
assert.strictEqual(
  conciseFromCardAlias.cardDesc,
  '馆方卡片短简介',
  'backend card_description should be accepted as a structured short-copy alias'
)

const knownShortRows = [
  ['basic-exhibition-hall', '串联半坡遗址发现、研究与聚落生活'],
  ['site-protection-hall', '原址展示房屋、墓葬与生产遗存'],
  ['kiln-hall', '讲解陶器制坯、装饰与入窑烧成'],
  ['prehistoric-workshop', '通过手作体验认识史前制陶与材料'],
  ['banpo-girl-sculpture', '以雕塑再现半坡女性形象与生活记忆'],
  ['education-center', '开展青少年研学、主题课堂与公众教育'],
  ['peony-garden', '提供园林休憩与季节性牡丹观赏'],
  ['temporary-hall-1', '集中呈现当期专题展览的主题内容'],
  ['temporary-hall-2', '配合临展厅一轮换展示当期展品'],
]
const structuredCards = hallData.buildHallList([], knownShortRows.map(function (entry) {
  return {
    slug: entry[0],
    name: entry[0],
    description: '同一行中供 Agent 使用的完整展厅介绍。',
    short_description: entry[1],
  }
}))
assert.strictEqual(structuredCards.length, 9)
assert.strictEqual(
  new Set(structuredCards.map(function (hall) { return hall.cardDesc })).size,
  9,
  'the nine backend rows need distinct structured short copy instead of one truncated template'
)
structuredCards.forEach(function (hall, index) {
  assert.strictEqual(hall.cardDesc, knownShortRows[index][1])
  assert.strictEqual(hall.desc, '同一行中供 Agent 使用的完整展厅介绍。')
  assert.ok(hall.cardDesc.length <= 48)
  assert.strictEqual(hall.cardDesc.indexOf('…'), -1)
})

const knownStructuredOverride = hallData.buildHallList([], [{
  slug: 'kiln-hall',
  name: '陶窑展厅',
  description: '馆方完整简介。',
  short_description: '馆方新短简介',
}])[0]
assert.strictEqual(
  knownStructuredOverride.cardDesc,
  '馆方新短简介',
  'known halls must use new backend structured copy without a static frontend catalogue'
)

const unknownAutomaticFallback = hallData.buildHallList([], [{
  slug: 'future-hall',
  name: '未来展厅',
  description: '介绍未来展厅的核心主题，补充说明不会进入卡片并继续添加更长的背景信息；第二句也不应进入卡片。',
}])[0]
assert.strictEqual(
  unknownAutomaticFallback.cardDesc,
  '可从现场展品与展签开始了解本厅',
  'missing structured short copy must use the fixed neutral fallback instead of compressing the old description'
)

const verbatimStructuredShort = '第一句原样保留。第二句也不应被截断或补标点'
const verbatimCard = hallData.buildHallList([], [{
  slug: 'verbatim-hall',
  name: '原样专题厅',
  description: '供 Agent 使用的完整介绍。',
  short_description: verbatimStructuredShort,
}])[0]
assert.strictEqual(verbatimCard.cardDesc, verbatimStructuredShort)

const compacted = hallData.compactHallDescription(
  '本展厅主要介绍遗址发现过程与保护工作，结合现场材料说明研究方法；第二句不应进入卡片。'
)
assert.ok(compacted.length <= 36, 'deterministic card copy should stay within the two-line target')
assert.ok(/[。！？]$/.test(compacted), 'compacted copy should close as a complete display sentence')
assert.strictEqual(compacted.indexOf('…'), -1, 'compacted copy must not use a half-sentence ellipsis')
assert.ok(compacted.indexOf('遗址发现过程') >= 0, 'compacted copy must retain factual source content')

;[
  ['基本陈列展厅', '以半坡遗址考古发现与研究成果为主线，系统呈现半坡文化的生活形态、生产方式与社会结构。', '以半坡遗址考古发现与研究成果为主线。'],
  ['遗址保护大厅', '强调原址呈现与保护展示，可观察墓葬、地面圆形房屋、烧制作坊、灶具灶台等关键遗存。', '强调原址呈现与保护展示。'],
  ['陶窑展厅', '以“陶器如何被制作出来”为核心叙事，解释制坯、装饰、干燥、入窑烧成等生产流程。', '以“陶器如何被制作出来”为核心叙事。'],
  ['史前工坊', '把制陶、材料、手作等史前生活知识转化为可参与的互动学习体验。', '把制陶、材料、手作等史前生活知识转化为可参与的互动学习体验。'],
  ['半坡姑娘雕塑', '以“半坡姑娘”为代表形象进行艺术化再现，是观众合影点和半坡人形象记忆入口。', '以“半坡姑娘”为代表形象进行艺术化再现。'],
  ['教研中心', '面向青少年和公众教育活动，适合承载研学课程、主题课堂与研究型活动。', '面向青少年和公众教育活动，适合承载研学课程、主题课堂与研究型活动。'],
  ['牡丹园', '以牡丹为核心的园林休憩区域，适合在观展间隙停留并体验季节性自然景观。', '以牡丹为核心的园林休憩区域，适合在观展间隙停留并体验季节性自然景观。'],
  ['临展厅一', '承载阶段性专题展览，主题和展品随当期策展内容变化。', '承载阶段性专题展览，主题和展品随当期策展内容变化。'],
  ['临展厅二', '与临展厅一共同承担轮换展出，需要按馆方最新展览清单更新内容。', '与临展厅一共同承担轮换展出，需要按馆方最新展览清单更新内容。'],
].forEach(function (entry) {
  const actual = hallData.compactHallDescription(entry[1])
  assert.strictEqual(actual, entry[2], entry[0] + ' card copy must remain a coherent factual phrase')
  assert.strictEqual(actual.indexOf('…'), -1, entry[0] + ' card copy must not end in an ellipsis')
})

const noBoundarySource = '馆方提供的连续说明文字用于验证没有标点边界时仍只保留来源前缀且绝不追加未经提供的新事实内容'
const noBoundaryFallback = hallData.compactHallDescription(noBoundarySource)
assert.strictEqual(noBoundaryFallback, noBoundarySource.slice(0, 35) + '。')
assert.strictEqual(noBoundaryFallback.indexOf('…'), -1, 'no-boundary fallback must close with a full stop instead of an ellipsis')
assert.strictEqual(hallData.isDistinctHallFocus('馆方简介。', '馆方简介'), false)
assert.strictEqual(hallData.isDistinctHallFocus('馆方完整简介及补充。', '馆方完整简介'), false)
assert.strictEqual(hallData.isDistinctHallFocus('馆方简介。', '留意展项之间的证据关系'), true)

assert.deepStrictEqual(
  hallData.buildHallList([], [
    { slug: 'bad slug', name: '非法展厅' },
    { slug: 'kiln-hall', name: '陶窑一' },
    { slug: 'kiln-hall', name: '陶窑二' },
  ]).map(function (item) { return item.name }),
  ['陶窑一'],
  'invalid and duplicate remote slugs should not create cards'
)

async function verifyHallCatalogRefresh() {
  const runtimeStorage = {}
  global.wx = {
    getStorageSync: function (key) { return runtimeStorage[key] || '' },
    setStorageSync: function (key, value) { runtimeStorage[key] = value },
    removeStorageSync: function (key) { delete runtimeStorage[key] },
  }
  let pageConfig = null
  global.Page = function (config) { pageConfig = config }
  delete require.cache[require.resolve('../pages/hall/hall')]
  require('../pages/hall/hall')
  assert.ok(pageConfig, 'hall page config should load for refresh checks')

  const api = require('../api/index')
  const originalGetHalls = api.tourApi.getHalls
  let requestCount = 0
  const responses = [
    [{
      slug: 'temporary-hall-1',
      name: '临展厅一',
      short_description: '临展原短简介',
      description: '临展原完整介绍。',
      exhibit_count: 3,
    }],
    [{
      slug: 'temporary-hall-1',
      name: '临展厅一',
      short_description: '临展更新短简介',
      description: '临展更新后的完整介绍。',
      exhibit_count: 0,
    }],
  ]

  const page = Object.assign({}, pageConfig, {
    data: { halls: [], loading: true },
    setData: function (patch) { this.data = Object.assign({}, this.data, patch || {}) },
  })

  try {
    api.tourApi.getHalls = function () {
      const payload = responses[Math.min(requestCount, responses.length - 1)]
      requestCount += 1
      return Promise.resolve({ ok: true, data: payload })
    }
    await page._loadHallData(false)
    const firstSignature = page._remoteHallSignature
    assert.strictEqual(page.data.halls[0].cardDesc, '临展原短简介')
    assert.strictEqual(page.data.halls[0].exhibitCount, 3)

    await page._loadHallData(true)
    assert.strictEqual(requestCount, 2, 'a forced return-page refresh should refetch the hall catalog')
    assert.notStrictEqual(page._remoteHallSignature, firstSignature, 'content/count changes must change the render signature')
    assert.strictEqual(page.data.halls[0].cardDesc, '临展更新短简介')
    assert.strictEqual(page.data.halls[0].desc, '临展更新后的完整介绍。')
    assert.strictEqual(page.data.halls[0].exhibitCount, 0)

    await page._loadHallData(false)
    assert.strictEqual(requestCount, 2, 'an ordinary duplicate load should still reuse the current catalog')
  } finally {
    api.tourApi.getHalls = originalGetHalls
  }
}

verifyHallCatalogRefresh().then(function () {
  console.log('hall data contract checks passed')
}).catch(function (error) {
  console.error(error)
  process.exitCode = 1
})
