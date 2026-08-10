const assert = require('assert')
const fs = require('fs')
const path = require('path')

const storage = {}
let lastRelaunchUrl = ''
let copiedReportText = ''
let lastToastTitle = ''
let clipboardShouldFail = false
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
  showToast: function (options) { lastToastTitle = options && options.title || '' },
  setClipboardData: function (options) {
    copiedReportText = options && options.data || ''
    if (clipboardShouldFail) {
      if (options && options.fail) options.fail({ errMsg: 'setClipboardData:fail' })
    } else if (options && options.success) {
      options.success()
    }
  },
  reLaunch: function (options) { lastRelaunchUrl = options && options.url || '' },
}

var pageConfig = null
global.Page = function (config) {
  pageConfig = config
}

const tourStore = require('../store/tour')
const api = require('../api/index')
const tourSession = require('../utils/tour-session')
const tourSync = require('../utils/tour-sync')
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
const reportWxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'report', 'report.wxml'), 'utf8')
assert.strictEqual(reportWxml.indexOf('到访展厅'), -1, 'the report page must not render a visited-hall section')
assert.strictEqual(reportWxml.indexOf('stats.halls'), -1, 'the report page must not render a visited-hall count')
assert.strictEqual(reportWxml.indexOf('次问答'), -1, 'the report header must not repeat the question count as copy')
assert.strictEqual(reportWxml.indexOf('下一步怎么看'), -1, 'the report must not retain generic next-step guidance')
assert.ok(reportWxml.indexOf('保存本次记录') >= 0, 'the report should replace generic guidance with a real save action')
assert.strictEqual(pageConfig.copyGuidanceQuestion, undefined, 'the removed guidance box must not retain its old clipboard handler')
assert.ok(pageConfig.saveReportNote, 'the report should expose the new save-record action')

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
  highlights: ['本次共到访 2 个展厅', '共提出 3 个导览问题', '重点查看 2 件展品'],
  reflection: {
    initial_assumption: '先从器物细节进入。',
    observed_focus: '关注点集中在器物工艺。',
    change_summary: '已经开始把用途和制作痕迹联系起来。',
  },
  exploration_guidance: {
    title: '带着证据继续观察',
    summary: '把器物用途与制作痕迹放在一起核对。',
    next_step: '比较两件器物的口沿与底部制作痕迹。',
    actions: [
      {
        title: '比较两件器物',
        description: '选择同类器物，比较口沿、腹部与底部的制作痕迹。',
        question: '哪些制作痕迹最能说明两件器物用途不同？',
        hall_id: 'basic-exhibition-hall',
      },
    ],
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
assert.deepStrictEqual(mapped.recordNotes, [
  {
    question: '记录摘要',
    point: '陶器和石器的用途、制作痕迹与展厅位置是这次记录的重点。',
  },
])
assert.deepStrictEqual(mapped.highlights, ['共提出 3 个导览问题', '重点查看 2 件展品'])
assert.strictEqual(mapped.canSaveReport, true)
assert.strictEqual(mapped.explorationGuidance, undefined, 'backend guidance must no longer drive report UI')
page.setData(mapped)
copiedReportText = ''
lastToastTitle = ''
page.saveReportNote()
assert.strictEqual(lastToastTitle, '记录已复制')
assert.ok(copiedReportText.indexOf('半坡器物观察报告') === 0)
assert.ok(copiedReportText.indexOf('观察身份：器物研究员') >= 0)
assert.ok(copiedReportText.indexOf('展品 2 件 · 问题 3 个 · 时长 6 分钟') >= 0)
assert.ok(copiedReportText.indexOf('陶器和石器的用途、制作痕迹与展厅位置') >= 0)
assert.strictEqual(copiedReportText.indexOf('比较两件器物'), -1, 'saved notes must not copy the discarded generic guidance')
clipboardShouldFail = true
lastToastTitle = ''
page.saveReportNote()
clipboardShouldFail = false
assert.strictEqual(lastToastTitle, '保存失败，请重试', 'clipboard failure must not be silent on a real device')

tourStore.setTourSession({ sessionId: 'report-return-session', sessionToken: 'report-return-token' })
tourStore.updateTourState({
  currentHall: 'basic-exhibition-hall',
  currentPage: 'pages/report/report',
  tourStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
})
tourStore.addTourEvent({
  eventType: 'exhibit_question',
  hall: 'basic-exhibition-hall',
  metadata: { client_event_id: 'report-return-question' },
})
const beforeReturnHome = tourStore.getTourState()
lastRelaunchUrl = ''
page.goHome()
const afterReturnHome = tourStore.getTourState()
assert.strictEqual(lastRelaunchUrl, '/pages/home/home')
assert.strictEqual(afterReturnHome.localTourId, beforeReturnHome.localTourId, 'returning home must retain the local tour generation')
assert.strictEqual(afterReturnHome.sessionId, 'report-return-session', 'returning home must retain the guest session')
assert.strictEqual(afterReturnHome.sessionToken, 'report-return-token', 'returning home must retain the guest token')
assert.strictEqual(afterReturnHome.personaId, 'D', 'returning home must retain the questionnaire persona')
assert.strictEqual(afterReturnHome.currentHall, 'basic-exhibition-hall', 'returning home must retain the report context')
assert.strictEqual(afterReturnHome.pendingEvents.length, beforeReturnHome.pendingEvents.length, 'returning home must retain pending tour events')

resetTour('B')
tourStore.addTourEvent({
  eventType: 'exhibit_view',
  hall: 'basic-exhibition-hall',
  metadata: { exhibit_name: 'local detail exhibit' },
})
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
assert.strictEqual(mapped.stats.exhibits, '0', 'local/name-only exhibit views must not inflate trusted report counts')
assert.strictEqual(mapped.canSaveReport, true, 'old reports without guidance must still support saving the record')

page = makePage()
mapped = page._mapReportData({
  total_questions: 0,
  total_exhibits_viewed: 0,
  halls_visited: [],
  reflection: {
    initial_assumption: '',
    observed_focus: '有效互动较少，暂时不生成判断型总结',
    change_summary: '',
  },
}, '')
assert.strictEqual(mapped.canSaveReport, true)
assert.strictEqual(mapped.explorationGuidance, undefined)

page = makePage()
page._applyUnavailable('服务器报告暂不可用，请稍后重试。', false)
assert.strictEqual(page.data.loadError, true)
assert.strictEqual(page.data.recordNotes.length, 0)
assert.strictEqual(page.data.dataNotice, '服务器报告暂不可用，请稍后重试。')
assert.strictEqual(page.data.canSaveReport, false)

resetTour('B')
const realNow = Date.now
const startedAt = Date.parse('2026-07-15T01:00:00.000Z')
let simulatedNow = startedAt + 10 * 60 * 1000
Date.now = function () { return simulatedNow }
tourStore.updateTourState({ tourStartedAt: new Date(startedAt).toISOString() })
page = makePage()
const firstOpen = page._mapReportData({ total_duration_minutes: 1, halls_visited: [] }, '')
simulatedNow = startedAt + 25 * 60 * 1000
const secondOpen = page._mapReportData({ total_duration_minutes: 25, halls_visited: [] }, '')
Date.now = realNow
assert.strictEqual(firstOpen.stats.duration, '1 分钟', 'successful report data must use the backend-authoritative duration')
assert.strictEqual(
  secondOpen.stats.duration,
  '25 分钟',
  'reopening may show a larger duration when the newer backend report returns the increased total'
)

async function verifyReportUsesRecoveredSession() {
  resetTour('B')
  tourStore.setTourSession({ sessionId: 'old-report-session', sessionToken: 'old-token' })

  const originalEnsure = tourSession.ensureTourSession
  const originalQueue = tourSync.queueSessionSnapshot
  const originalGenerate = api.tourApi.generateReport
  let generatedSessionId = null

  try {
    tourSession.ensureTourSession = function () {
      return Promise.resolve({ ok: true, sessionId: 'old-report-session' })
    }
    tourSync.queueSessionSnapshot = function () {
      tourStore.invalidateTourSession()
      tourStore.setTourSession({ sessionId: 'replacement-report-session', sessionToken: 'replacement-token' })
      return Promise.resolve({ ok: true, status: 200 })
    }
    api.tourApi.generateReport = function (id) {
      generatedSessionId = id
      return Promise.resolve({
        ok: true,
        data: { total_duration_minutes: 1, halls_visited: [], report_theme: 'field_study' },
      })
    }

    tourStore.updateTourState({ tourStartedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() })
    const runtimePage = makePage()
    runtimePage.onLoad()
    assert.strictEqual(runtimePage.data.stats.duration, '10 分钟', 'local duration may be shown only while the server report is loading')
    await new Promise(function (resolve) { setTimeout(resolve, 120) })
    assert.strictEqual(
      generatedSessionId,
      'replacement-report-session',
      'report generation must read credentials after session synchronization/recovery'
    )
    assert.strictEqual(runtimePage.data.loadError, false)
    assert.strictEqual(runtimePage.data.stats.duration, '1 分钟', 'server report duration must replace the loading placeholder')
  } finally {
    tourSession.ensureTourSession = originalEnsure
    tourSync.queueSessionSnapshot = originalQueue
    api.tourApi.generateReport = originalGenerate
  }
}

verifyReportUsesRecoveredSession().then(function () {
  console.log('report mapper checks passed')
}).catch(function (error) {
  console.error(error)
  process.exitCode = 1
})
