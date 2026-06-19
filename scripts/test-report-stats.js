const assert = require('assert')

const storage = {}
global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : ''
  },
  setStorageSync: function (key, value) {
    storage[key] = value
  },
  removeStorageSync: function (key) {
    delete storage[key]
  },
  request: function () {},
  showLoading: function () {},
  hideLoading: function () {},
  showToast: function () {},
  reLaunch: function () {},
}

var pageConfig = null
global.Page = function (config) {
  pageConfig = config
}

const tourStore = require('../store/tour')
require('../pages/report/report')

function resetTour(personaId) {
  Object.keys(storage).forEach(function (key) { delete storage[key] })
  tourStore.clearTour()
  tourStore.createLocalTourState({
    interestType: personaId || 'B',
    persona: personaId || 'B',
    assumption: 'A',
    personaId: personaId || 'B',
  })
}

function makePage() {
  var data = JSON.parse(JSON.stringify(pageConfig.data || {}))
  return Object.assign({}, pageConfig, {
    data: data,
    setData: function (patch) {
      this.data = Object.assign({}, this.data, patch || {})
    },
  })
}

assert.ok(pageConfig && pageConfig._mapReportData, 'report page should expose backend report mapper')
assert.strictEqual(pageConfig._buildExperience, undefined, 'legacy local report generator should be removed')

resetTour('D')
var page = makePage()
var mapped = page._mapReportData({
  total_duration_minutes: 6.4,
  total_questions: 3,
  total_exhibits_viewed: 2,
  halls_visited: ['basic-exhibition-hall', 'kiln-hall', 'kiln-hall'],
  report_theme: 'artifact_study',
  record_summary: '陶器和石器的用途、制作痕迹与展厅位置是这次记录的重点。',
  record_notes: [
    { question: '旧摘要', point: 'record_summary 存在时不应使用这条。' },
  ],
  highlights: ['共提出 3 个导览问题', '重点查看 2 件展品'],
  reflection: {
    initial_assumption: '先从器物细节进入。',
    observed_focus: '关注点集中在器物工艺。',
    change_summary: '已经开始把用途和制作痕迹联系起来。',
  },
}, '')

assert.strictEqual(mapped.reportTitle, '半坡器物观察报告')
assert.strictEqual(mapped.persona, '器物研究员')
assert.deepStrictEqual(mapped.stats, {
  halls: '2',
  exhibits: '2',
  messages: '3',
  duration: '6 分钟',
})
assert.deepStrictEqual(
  mapped.visitedHallCards.map(function (item) { return item.name }),
  ['基本陈列展厅', '陶窑展厅'],
  'halls should come from backend halls_visited and be deduped'
)
assert.deepStrictEqual(mapped.recordNotes, [
  {
    question: '记录摘要',
    point: '陶器和石器的用途、制作痕迹与展厅位置是这次记录的重点。',
  },
])
assert.deepStrictEqual(mapped.highlights, ['共提出 3 个导览问题', '重点查看 2 件展品'])
assert.deepStrictEqual(mapped.reflection, {
  initial_assumption: '先从器物细节进入。',
  observed_focus: '关注点集中在器物工艺。',
  change_summary: '已经开始把用途和制作痕迹联系起来。',
})

resetTour('B')
page = makePage()
mapped = page._mapReportData({
  total_duration_minutes: null,
  total_questions: 1,
  total_exhibits_viewed: 0,
  halls_visited: [],
  report_theme: 'field_study',
  record_notes: [
    { question: '游览记录摘要', point: '后端在无 LLM 摘要时返回的摘要。' },
    { question: '多余项', point: '页面只展示一条摘要。' },
  ],
}, '游览记录上传失败，请检查网络后重试。')

assert.strictEqual(mapped.reportTitle, '半坡研学记录报告')
assert.deepStrictEqual(mapped.recordNotes, [
  { question: '游览记录摘要', point: '后端在无 LLM 摘要时返回的摘要。' },
])
assert.strictEqual(mapped.dataNotice, '游览记录上传失败，请检查网络后重试。')
assert.strictEqual(mapped.stats.duration, '-')

page = makePage()
page._applyUnavailable('服务器报告暂不可用，请稍后重试。', false)
assert.strictEqual(page.data.loadError, true)
assert.strictEqual(page.data.recordNotes.length, 0)
assert.strictEqual(page.data.dataNotice, '服务器报告暂不可用，请稍后重试。')

console.log('report mapper checks passed')
