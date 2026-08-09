const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function readHead(relativePath) {
  return childProcess.execFileSync('git', ['show', 'HEAD:' + relativePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function normalized(value) {
  return String(value || '').replace(/\r\n/g, '\n')
}

function cssBlock(source, selector) {
  const start = source.indexOf(selector + ' {')
  assert.ok(start >= 0, 'missing CSS selector: ' + selector)
  const end = source.indexOf('\n}', start)
  assert.ok(end >= 0, 'unterminated CSS selector: ' + selector)
  return source.slice(start, end + 2)
}

const hallWxml = read('pages/hall/hall.wxml')
const hallWxss = read('pages/hall/hall.wxss')
const hallJs = read('pages/hall/hall.js')
assert.ok(hallWxml.includes('已访问'), 'visited hall cards should use the approved 已访问 label')
assert.ok(!hallWxml.includes('已记录'), 'visited hall cards must not use the old 已记录 label')
assert.ok(!hallWxml.includes('展厅名称与简介来自'), 'hall page must not expose directory provenance copy')
assert.ok(!hallWxml.includes('hall-order'), 'hall cards must not render decorative sequence nodes')
assert.ok(hallWxml.includes('{{item.cardDesc}}'), 'hall cards should render the deterministic concise description')
assert.ok(!hallWxml.includes('{{item.desc}}'), 'hall cards must not render the full introduction directly')
const hallDescriptionStyle = hallWxss.slice(
  hallWxss.indexOf('.hall-desc {'),
  hallWxss.indexOf('.hall-arrow {')
)
const hallCardStyle = cssBlock(hallWxss, '.hall-card')
const hallIconStyle = cssBlock(hallWxss, '.hall-icon-wrap')
const hallInfoStyle = cssBlock(hallWxss, '.hall-info')
const hallNameStyle = cssBlock(hallWxss, '.hall-name')
assert.ok(hallCardStyle.includes('height: 154rpx'), 'hall cards should use the approved 148–156rpx relaxed height')
assert.ok(hallCardStyle.includes('padding: 22rpx 24rpx'), 'hall cards should retain generous inner spacing')
assert.ok(hallIconStyle.includes('width: 76rpx') && hallIconStyle.includes('height: 76rpx'), 'hall icons should use the approved 72–76rpx frame')
assert.ok(hallIconStyle.includes('border: 0'), 'hall icon backgrounds should not add a competing outline')
assert.ok(hallInfoStyle.includes('gap: 12rpx'), 'hall title and description should have the approved internal breathing room')
assert.ok(hallNameStyle.includes('font-size: 32rpx') && hallNameStyle.includes('font-weight: 700'), 'hall titles should remain prominent')
assert.ok(hallDescriptionStyle.includes('font-size: 24rpx') && hallDescriptionStyle.includes('line-height: 34rpx'), 'hall short descriptions should remain comfortably readable')
assert.ok(hallDescriptionStyle.includes('white-space: nowrap'), 'structured short descriptions should occupy one complete line')
assert.ok(!hallDescriptionStyle.includes('line-clamp'), 'hall descriptions must not be line-clamped')
assert.ok(!hallDescriptionStyle.includes('text-overflow'), 'hall descriptions must not use ellipsis')
assert.ok(!hallDescriptionStyle.includes('overflow: hidden'), 'structured short descriptions must not be silently clipped')
assert.ok(hallWxml.includes('class="hall-trailing"') && !hallWxml.includes('hall-name-row'), 'visited state should use a separate trailing rail instead of squeezing the title')
assert.ok(
  /currentHallDescription:\s*hall\.desc/.test(hallJs) &&
    /currentHallCardDescription:\s*hall\.cardDesc/.test(hallJs) &&
    /currentHallFocus:\s*hall\.focus/.test(hallJs),
  'hall selection must retain full Agent context separately from visitor-facing short copy'
)

const routeWxml = read('pages/route/route.wxml')
assert.ok(!routeWxml.includes('展厅 {{item.order}}'), 'route cards must not repeat 展厅 x beside the numbered rail')
assert.ok(routeWxml.includes('<text class="route-title">展厅列表</text>'), 'route page should use the concise 展厅列表 heading')
assert.ok(!routeWxml.includes('route-subtitle'), 'route heading must not add an extra instruction below 展厅列表')
assert.ok(!routeWxml.includes('stats-row'), 'route page must not render the duration/persona stats card')
assert.ok(!routeWxml.includes('ai-badge'), 'route page must not render the directory badge card')
assert.ok(!routeWxml.includes('section-label'), 'route page must not repeat 展厅列表 above the steps')
assert.ok(!routeWxml.includes('重点关注') && !routeWxml.includes('step-focus-row'), 'route cards must not render a focus label or row')

const personaRevealWxml = read('pages/persona-reveal/persona-reveal.wxml')
assert.ok(personaRevealWxml.includes('提问和报告会按这个视角组织'), 'persona reveal should describe only the content that persona actually affects')
assert.ok(personaRevealWxml.includes('先看展厅') && personaRevealWxml.includes('选择参观区域'), 'persona reveal should lead into hall selection')
assert.ok(personaRevealWxml.includes('查看展厅列表'), 'persona reveal CTA should name the actual destination')
;['路线、提问和报告都会按这个视角组织', '先看路线', '确认参观顺序', '查看个性化路线'].forEach(function (copy) {
  assert.ok(!personaRevealWxml.includes(copy), 'persona reveal must not imply persona-based route reordering: ' + copy)
})

const reportWxml = read('pages/report/report.wxml')
const reportJs = read('pages/report/report.js')
assert.ok(!reportWxml.includes('次问答'), 'report header must not repeat the question count')
assert.ok(reportWxml.includes('{{explorationGuidance.suggestion}}'), 'report should render exactly one concise next step')
assert.strictEqual((reportWxml.match(/explorationGuidance\.suggestion/g) || []).length, 1)
assert.ok(!reportWxml.includes('section-index') && !reportWxml.includes('guidance-index'), 'report guidance must not render sequence numbers')
assert.ok(!reportWxml.includes('guidance-action') && !reportWxml.includes('可直接追问'), 'report guidance must not render the old action-card list')
assert.ok(!reportWxml.includes('复制') && !reportJs.includes('copyGuidanceQuestion'), 'report guidance must not retain clipboard copy UI')

const homeWxml = read('pages/home/home.wxml')
const homeWxss = read('pages/home/home.wxss')
const homeJs = read('pages/home/home.js')
const onboardingJs = read('pages/onboarding/onboarding.js')
const headHomeWxml = readHead('pages/home/home.wxml')
const headHomeWxss = readHead('pages/home/home.wxss')
assert.strictEqual(
  normalized(homeWxml.slice(homeWxml.indexOf('<!-- Hero -->'), homeWxml.indexOf('<!-- Actions -->'))),
  normalized(headHomeWxml.slice(headHomeWxml.indexOf('<!-- Hero -->'), headHomeWxml.indexOf('<!-- Actions -->'))),
  'home hero markup must remain at the baseline'
)
assert.strictEqual(
  normalized(homeWxml.slice(homeWxml.indexOf('<!-- Footer note -->'))),
  normalized(headHomeWxml.slice(headHomeWxml.indexOf('<!-- Footer note -->'))),
  'home footer markup must remain at the baseline'
)
;[
  '.home', '.hero', '.hero-emblem', '.hero-title', '.hero-sub', '.hero-tagline',
  '.actions', '.resume-card', '.resume-copy', '.resume-label', '.resume-title',
  '.resume-meta', '.resume-arrow', '.footer-note',
].forEach(function (selector) {
  assert.strictEqual(cssBlock(homeWxss, selector), cssBlock(headHomeWxss, selector), selector + ' must retain baseline home layout semantics')
})
assert.ok(homeWxml.includes('定制导览'), 'the questionnaire entry should use the approved short label')
assert.ok(homeWxml.includes('直接参观'), 'the direct entry should use the approved short label')
assert.strictEqual((homeWxml.match(/定制导览/g) || []).length, 1)
assert.strictEqual((homeWxml.match(/直接参观/g) || []).length, 1)
const entryButtons = homeWxml.match(/<button[\s\S]*?<\/button>/g) || []
assert.strictEqual(entryButtons.length, 2, 'home should retain exactly two primary entry buttons')
assert.deepStrictEqual(entryButtons.map(function (block) {
  return block.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
}), ['定制导览›', '直接参观›'], 'home entries must contain only the approved label and thin direction mark')
assert.ok(!homeWxml.includes('entry-portal') && !homeWxml.includes('entry-threshold') && !homeWxml.includes('entry-gates'), 'rejected doorway and ticket decoration must not return')
assert.ok(homeWxml.includes('hover-class="entry-primary-pressed"') && homeWxml.includes('hover-class="entry-secondary-pressed"'), 'both entries need a pressed state')
const entryBaseStyle = homeWxss.slice(homeWxss.indexOf('.entry-primary,'), homeWxss.indexOf('.entry-primary::after'))
const entryPrimaryStyle = cssBlock(homeWxss, '.entry-primary')
const entrySecondaryStyle = cssBlock(homeWxss.slice(homeWxss.indexOf('.entry-primary {')), '.entry-secondary')
assert.ok(entryBaseStyle.includes('min-height: 88rpx'), 'home entry controls must retain the 44px tap target')
assert.ok(entryPrimaryStyle.includes('height: 104rpx') && entryPrimaryStyle.includes('background: #5A3E2B'), 'the primary entry should be a restrained deep-brown action')
assert.ok(entryPrimaryStyle.includes('border-radius: 6rpx') && entryPrimaryStyle.includes('inset 7rpx 0 0 #A85732'), 'the primary entry should use only a low radius and clay side marker')
assert.ok(entrySecondaryStyle.includes('height: 88rpx') && entrySecondaryStyle.includes('background: transparent'), 'the secondary entry should remain lightweight')
assert.ok(entrySecondaryStyle.includes('border-bottom: 2rpx solid #D8C8B4') && entrySecondaryStyle.includes('border-radius: 0'), 'the secondary entry must not become a second heavy rounded button')
assert.ok(cssBlock(homeWxss, '.entry-primary-pressed').includes('transform:') && cssBlock(homeWxss, '.entry-secondary-pressed').includes('transform:'), 'pressed feedback must be visually explicit')
assert.ok(!homeWxml.includes('默认体验'), 'home must not expose technical default-experience wording')
assert.ok(!homeJs.includes('默认体验') && !onboardingJs.includes('默认体验'), 'stored display labels must use 默认讲解')
assert.ok(homeWxml.includes('继续上次导览'), 'a recoverable completed conversation should use one stable resume label')
assert.ok(!homeWxml.includes('resumeIsDraft') && !homeWxml.includes('继续填写问卷') && !homeWxml.includes('已保存当前填写进度'), 'home must not retain an unreachable questionnaire-draft resume branch')
assert.ok(homeWxml.includes('hero-emblem') && homeWxml.includes('AI 智慧导览'), 'home should retain its original emblem and product title')
assert.ok(homeWxss.includes('align-items: center'), 'home should retain the original centred composition')
assert.ok(homeWxss.includes('background: #F8F3EA'), 'home should retain the original background colour')

const appWxss = read('app.wxss')
const onboardingWxss = read('pages/onboarding/onboarding.wxss')
const personaWxss = read('pages/persona-reveal/persona-reveal.wxss')
const routeWxss = read('pages/route/route.wxss')
const tourWxss = read('pages/tour/tour.wxss')
const bubbleWxss = read('components/chat/message-bubble/message-bubble.wxss')
assert.ok(appWxss.includes('min-height: 88rpx'), 'shared actions should retain the simplified minimum tap target')
assert.ok(!appWxss.includes('.home .btn-primary') && !appWxss.includes('.home .btn-secondary'), 'home-specific entrance geometry must stay out of global button styles')
assert.ok(cssBlock(appWxss, '.btn-primary').includes('border-radius: 6rpx'), 'shared primary actions should retain the recovered square geometry')
assert.ok(cssBlock(appWxss, '.card').includes('border-radius: 4rpx'), 'shared cards should retain the recovered square geometry')
assert.ok(cssBlock(onboardingWxss, '.progress-dot').includes('border-radius: 0'), 'questionnaire progress should retain the recovered straight rail')
assert.ok(cssBlock(onboardingWxss, '.profile-card').includes('border-radius: 4rpx'), 'questionnaire cards should retain the recovered square geometry')
assert.ok(cssBlock(personaWxss, '.pass-card').includes('border-radius: 4rpx') && cssBlock(personaWxss, '.pass-card').includes('box-shadow: none'), 'persona result should retain the recovered flat treatment')
assert.ok(cssBlock(hallWxss, '.hall-list').includes('gap: 0'), 'hall cards should remain a continuous list')
assert.ok(hallWxss.includes('.hall-card + .hall-card') && hallWxss.includes('border-top: 0'), 'adjacent hall cards should share one boundary')
assert.ok(cssBlock(hallWxss, '.hall-card').includes('border-radius: 4rpx'), 'hall cards should retain a restrained outline')
assert.ok(cssBlock(routeWxss, '.step-card').includes('border-radius: 2rpx'), 'route cards should retain the recovered square outline')
assert.ok(cssBlock(routeWxss, '.step-card-upcoming').includes('box-shadow: none'), 'route cards should retain the recovered flat treatment')
assert.ok(cssBlock(tourWxss, '.rag-bar').includes('border-radius: 2rpx') && cssBlock(tourWxss, '.rag-bar').includes('box-shadow: none'), 'tour status should retain the recovered flat treatment')
assert.ok(cssBlock(tourWxss, '.input-field').includes('min-height: 88rpx'), 'tour input should retain the 44px tap target')
assert.ok(cssBlock(bubbleWxss, '.bubble').includes('border-radius: 2rpx'), 'chat bubbles should retain the recovered square geometry')
const routeHeaderStyle = routeWxss.slice(routeWxss.indexOf('.route-header {'), routeWxss.indexOf('.ai-badge {'))
assert.ok(routeHeaderStyle.includes('background: transparent') && routeHeaderStyle.includes('border: 0'), 'route heading must not be presented as a card')
const suggestionChipStyle = tourWxss.slice(tourWxss.indexOf('.suggestion-chip {'), tourWxss.indexOf('.suggestion-chip:active'))
assert.ok(suggestionChipStyle.includes('min-height: 88rpx') && suggestionChipStyle.includes('border-radius: 2rpx'), 'suggestion chips should retain the recovered tap target and geometry')
assert.ok(suggestionChipStyle.includes('padding: 12rpx 16rpx'), 'suggestion chips should keep compact horizontal padding for complete short questions')
assert.ok(suggestionChipStyle.includes('white-space: nowrap'), 'short suggestions should remain complete on one horizontally scrollable line')
assert.ok(!suggestionChipStyle.includes('line-clamp') && !suggestionChipStyle.includes('text-overflow'), 'suggestion chips must not visually truncate server questions')
const suggestionTitleStyle = tourWxss.slice(tourWxss.indexOf('.sg-title {'), tourWxss.indexOf('.suggestions-dismiss {'))
assert.ok(suggestionTitleStyle.includes('font-size: 22rpx'), 'suggestion text should fit the common 375px viewport without shrinking the tap target')

const hallSvgFiles = [
  'hall-basic.svg', 'hall-site.svg', 'hall-kiln.svg', 'hall-workshop.svg', 'hall-girl.svg',
  'hall-education.svg', 'hall-peony.svg', 'hall-temp-one.svg', 'hall-temp-two.svg',
]
hallSvgFiles.forEach(function (name) {
  const svg = read('assets/icons/' + name)
  assert.ok(svg.includes('viewBox="0 0 128 128"'), name + ' should share the 128-unit vector grid')
  assert.ok(svg.includes('#5A3E2B') && svg.includes('#A85732'), name + ' should use the shared brown and clay palette')
  const colours = Array.from(new Set(svg.match(/#[0-9A-Fa-f]{6}/g) || []))
  assert.deepStrictEqual(colours.sort(), ['#5A3E2B', '#A85732'].sort(), name + ' should stay strictly two-tone')
  const strokeWidths = Array.from(svg.matchAll(/stroke-width="([0-9.]+)"/g)).map(function (match) { return Number(match[1]) })
  assert.ok(strokeWidths.every(function (width) { return width >= 9 }), name + ' must avoid thin detail strokes')
  assert.ok((svg.match(/<(?:path|rect|circle)\b/g) || []).length <= 7, name + ' should remain a minimal symbol')
})
assert.ok(!read('assets/icons/hall-basic.svg').includes('<circle'), 'the basic hall vessel must not resemble a smiling face')
assert.notStrictEqual(read('assets/icons/hall-temp-one.svg'), read('assets/icons/hall-temp-two.svg'), 'temporary hall frames must remain distinguishable')
const historianSvg = read('assets/icons/persona-historian.svg')
const personaRevealJs = read('pages/persona-reveal/persona-reveal.js')
assert.ok(historianSvg.includes('viewBox="0 0 128 128"') && historianSvg.includes('#FFF9F1'), 'historian icon should use a white 128-unit vector drawing for the blue persona block')
assert.ok(!historianSvg.includes('A43 43') && !historianSvg.includes('stroke-width="11"'), 'historian icon must not resemble a refresh or return control')
assert.ok(/M15 49c18-5/.test(historianSvg) && /M51 24c2-12/.test(historianSvg), 'historian icon should combine one open-book outline with one large question mark')
assert.ok((historianSvg.match(/<(?:path|circle)\b/g) || []).length <= 3, 'historian icon should not add small text, feather or timeline detail')
assert.ok(/persona-historian'[\s\S]{0,200}\.svg/.test(personaRevealJs), 'historian persona should load the new vector source')
assert.ok(personaRevealJs.includes('persona.iconFallbackSrc'), 'historian persona should retain its PNG runtime fallback')
assert.ok(/shortDescription:[\s\S]{0,250}description:[\s\S]{0,250}exhibitCount:/.test(hallJs), 'hall cache signature must include short copy, full description and exhibit count')
assert.ok(/_loadHallData\(forceRefresh\)/.test(hallJs), 'returning to the hall page should safely refetch updated temporary-hall data')

const visitorWxml = [
  'pages/exhibit-detail/exhibit-detail.wxml',
  'pages/exhibit-scan/exhibit-scan.wxml',
  'pages/hall/hall.wxml',
  'pages/home/home.wxml',
  'pages/onboarding/onboarding.wxml',
  'pages/persona-reveal/persona-reveal.wxml',
  'pages/report/report.wxml',
  'pages/route/route.wxml',
  'pages/tour/tour.wxml',
].map(read).join('\n')

;[
  'OPEN HALLS',
  'HALL DIRECTORY',
  'FIELD GUIDE',
  'VISIT REPORT',
  'REPORT /',
  'OBJECT RECORD',
  'OBJECT INDEX',
  'VISITOR PROFILE',
  'GUIDE IDENTITY',
  'COLLECTION VIEW',
].forEach(function (label) {
  assert.ok(!visitorWxml.includes(label), 'visitor UI must not contain decorative English label: ' + label)
})

const visualSources = [
  'app.json',
  'app.wxss',
  'pages/exhibit-detail/exhibit-detail.wxss',
  'pages/exhibit-scan/exhibit-scan.wxss',
  'pages/hall/hall.wxss',
  'pages/home/home.wxss',
  'pages/onboarding/onboarding.wxss',
  'pages/persona-reveal/persona-reveal.wxss',
  'pages/report/report.wxss',
  'pages/route/route.wxss',
  'pages/tour/tour.wxss',
].map(read).join('\n')

;[
  '#F4EFE5', '#FCF8F0', '#24211E', '#5F574F', '#63705A', '#6F665C',
  '#9D8E7B', '#A2482E', '#CFC3B2', '#EEE8DD', '#DED6C8', '#E6DFD4',
].forEach(function (colour) {
  assert.ok(!visualSources.includes(colour), 'field-journal palette colour must not remain: ' + colour)
})

console.log('UI copy and baseline palette checks passed')
