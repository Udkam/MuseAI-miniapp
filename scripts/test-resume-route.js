const assert = require('assert')
const resumeRoute = require('../utils/resume-route')

assert.strictEqual(
  resumeRoute.buildResumeUrl({ currentPage: 'pages/tour/tour', currentHall: 'kiln-hall' }),
  '/pages/tour/tour?hall=kiln-hall&resume=1'
)
assert.strictEqual(
  resumeRoute.buildResumeUrl({
    currentPage: 'pages/tour/tour', currentHall: 'new-special-hall', currentHallName: '新专题展厅',
  }),
  '/pages/tour/tour?hall=new-special-hall&hallName=%E6%96%B0%E4%B8%93%E9%A2%98%E5%B1%95%E5%8E%85&resume=1',
  'dynamic hall display names should survive same-device resume'
)
assert.strictEqual(
  resumeRoute.buildResumeUrl({
    currentPage: 'pages/exhibit-detail/exhibit-detail',
    currentPageParams: { id: 'ex 1', name: '人面网纹盆', local: '1', token: 'must-not-leak' },
  }),
  '/pages/exhibit-detail/exhibit-detail?id=ex%201&name=%E4%BA%BA%E9%9D%A2%E7%BD%91%E7%BA%B9%E7%9B%86',
  'detail resume should rebuild only id/name parameters'
)
assert.strictEqual(
  resumeRoute.buildResumeUrl({ currentPage: 'pages/exhibit-detail/exhibit-detail' }),
  '/pages/exhibit-scan/exhibit-scan',
  'a detail route with no identity should fall back to the exhibit list'
)
assert.strictEqual(
  resumeRoute.buildResumeUrl({
    currentPage: 'pages/exhibit-scan/exhibit-scan',
    currentPageParams: { hall: 'kiln-hall', token: 'must-not-leak' },
  }),
  '/pages/exhibit-scan/exhibit-scan',
  'scan resume should not replay query parameters'
)
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/onboarding/onboarding' }), '/pages/onboarding/onboarding')
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/report/report' }), '/pages/report/report')
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/route/route' }), '/pages/route/route')
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/persona-reveal/persona-reveal' }), '/pages/persona-reveal/persona-reveal')
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/hall/hall' }), '/pages/hall/hall')
assert.strictEqual(resumeRoute.buildResumeUrl({ currentPage: 'pages/admin/secret' }), '/pages/hall/hall')
assert.strictEqual(resumeRoute.hasQuestionnaireDraft({ step: 2 }), true)
assert.strictEqual(resumeRoute.hasQuestionnaireDraft({}), false)
assert.strictEqual(resumeRoute.hasQuestionnaireDraft(null), false)

console.log('resume route checks passed')
