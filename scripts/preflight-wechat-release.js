const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const API_ORIGIN = 'https://api.banpo-museai.xyz'
const API_BASE = API_ORIGIN + '/api/v1'
const LOCAL_API_BASE = 'http://127.0.0.1:8000/api/v1'
const PUBLIC_DEV_API_BASE = 'http://122.152.232.190:3000/api/v1'

const CODE_SCAN_ROOTS = [
  'api',
  'utils',
  'pages',
  'store',
  'constants',
  'components',
]

const EXTRA_SCAN_FILES = [
  'app.js',
  'app.json',
  'project.config.json',
  'sitemap.json',
]

const SYNTAX_FILES = [
  'app.js',
  'api/index.js',
  'api/stream.js',
  'utils/request.js',
  'utils/storage.js',
  'utils/hall-data.js',
  'utils/exhibit-id.js',
  'utils/exhibit-catalog.js',
  'utils/tts-audio.js',
  'utils/event-flush.js',
  'utils/resume-route.js',
  'utils/route-data.js',
  'utils/tour-sync.js',
  'utils/tour-session.js',
  'store/tour.js',
  'pages/home/home.js',
  'pages/onboarding/onboarding.js',
  'pages/persona-reveal/persona-reveal.js',
  'pages/route/route.js',
  'pages/hall/hall.js',
  'pages/tour/tour.js',
  'pages/exhibit-scan/exhibit-scan.js',
  'pages/exhibit-detail/exhibit-detail.js',
  'pages/report/report.js',
]

const VECTOR_ICON_FILES = [
  'hall-basic.svg',
  'hall-site.svg',
  'hall-kiln.svg',
  'hall-workshop.svg',
  'hall-girl.svg',
  'hall-education.svg',
  'hall-peony.svg',
  'hall-temp-one.svg',
  'hall-temp-two.svg',
  'persona-historian.svg',
]

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') return
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.(js|json|wxml|wxss)$/.test(entry.name)) {
      out.push(full)
    }
  })
  return out
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function collectScanFiles() {
  const files = []
  CODE_SCAN_ROOTS.forEach(function (dir) {
    walk(path.join(ROOT, dir), files)
  })
  EXTRA_SCAN_FILES.forEach(function (file) {
    const full = path.join(ROOT, file)
    if (fs.existsSync(full)) files.push(full)
  })
  return files
}

function failWithList(title, items) {
  if (!items.length) return
  console.error('\n' + title)
  items.slice(0, 30).forEach(function (item) {
    console.error(' - ' + item)
  })
  if (items.length > 30) console.error(' - ... and ' + (items.length - 30) + ' more')
  process.exitCode = 1
}

function checkApiBase() {
  const requestJs = read('utils/request.js')
  const streamJs = read('api/stream.js')
  function hasActiveBase(content, declaration, value) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp('^\\s*' + declaration + "\\s*=\\s*'" + escaped + "'", 'm').test(content)
  }
  const requestUsesProd = hasActiveBase(requestJs, 'const BASE_URL', API_BASE)
  const streamUsesProd = hasActiveBase(streamJs, 'var BASE_URL', API_BASE)
  const requestUsesLocal = hasActiveBase(requestJs, 'const BASE_URL', LOCAL_API_BASE)
  const streamUsesLocal = hasActiveBase(streamJs, 'var BASE_URL', LOCAL_API_BASE)
  const requestUsesPublicDev = hasActiveBase(requestJs, 'const BASE_URL', PUBLIC_DEV_API_BASE)
  const streamUsesPublicDev = hasActiveBase(streamJs, 'var BASE_URL', PUBLIC_DEV_API_BASE)
  assert.ok(
    (requestUsesProd && streamUsesProd) ||
      (requestUsesLocal && streamUsesLocal) ||
      (requestUsesPublicDev && streamUsesPublicDev),
    'utils/request.js and api/stream.js must both use the same API base: local dev, public dev, or production HTTPS'
  )
  if (requestUsesLocal || streamUsesLocal) {
    console.warn('[preflight warning] active API base is local dev:', LOCAL_API_BASE)
    console.warn('[preflight warning] switch both BASE_URL declarations back to ' + API_BASE + ' before release upload.')
    return LOCAL_API_BASE
  }
  if (requestUsesPublicDev || streamUsesPublicDev) {
    console.warn('[preflight warning] active API base is temporary public HTTP dev:', PUBLIC_DEV_API_BASE)
    console.warn('[preflight warning] switch both BASE_URL declarations back to ' + API_BASE + ' before release upload.')
    return PUBLIC_DEV_API_BASE
  }
  return API_BASE
}

function checkHardcodedEndpoints(files) {
  const bad = []
  const allowedDevApis = [LOCAL_API_BASE, PUBLIC_DEV_API_BASE]
    .map(function (value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
  const allowedDevApi = new RegExp(allowedDevApis.join('|'), 'g')
  const patterns = [
    { name: 'old public IP', regex: /122\.152\.232\.190/g },
    { name: 'localhost', regex: /\blocalhost\b/g },
    { name: 'loopback IP', regex: /\b127\.0\.0\.1\b/g },
    { name: 'plain http', regex: /http:\/\//g },
    { name: 'port 3000', regex: /:3000\b/g },
  ]
  files.forEach(function (file) {
    const content = fs.readFileSync(file, 'utf8').replace(allowedDevApi, '')
    patterns.forEach(function (item) {
      if (item.regex.test(content)) bad.push(rel(file) + ' contains ' + item.name)
      item.regex.lastIndex = 0
    })
  })
  failWithList('Release preflight failed: development endpoint remains in mini-program package files.', bad)
}

function checkSuspiciousSecrets(files) {
  const suspicious = []
  const assignment = /\b(?:APPSECRET|JWT_SECRET|API_KEY|SECRET|PASSWORD)\b\s*[:=]\s*['"]([^'"]{12,})['"]/gi
  files.forEach(function (file) {
    const content = fs.readFileSync(file, 'utf8')
    let match
    while ((match = assignment.exec(content)) !== null) {
      const value = match[1]
      if (/^(<.*>|your_|test|mock|demo|placeholder|example|Bearer\s*)/i.test(value)) continue
      suspicious.push(rel(file) + ' has a suspicious secret-like assignment')
    }
  })
  failWithList('Release preflight failed: suspicious secret-like literals found.', suspicious)
}

function checkGuestSessionBoundary() {
  const requestJs = read('utils/request.js')
  const apiJs = read('api/index.js')
  const tourStoreJs = read('store/tour.js')
  const appJs = read('app.js')
  const tourSessionJs = read('utils/tour-session.js')
  const tourPageJs = read('pages/tour/tour.js')
  assert.ok(!fs.existsSync(path.join(ROOT, 'store/auth.js')), 'mini-program auth store must remain removed')
  assert.strictEqual(/\bAuthorization\b/.test(requestJs), false, 'mini-program requests must not inject Bearer auth')
  assert.strictEqual(/authStore|authApi|authState/.test(appJs + apiJs), false, 'mini-program must not restore ordinary-user login state')
  assert.ok(/storage\.clearLegacyAuth\(\)/.test(appJs), 'mini-program launch must clear legacy ordinary-user auth storage')
  assert.strictEqual(/body\.questionnaire/.test(apiJs), false, 'chat must read questionnaire/persona from the backend session')
  assert.strictEqual(/client_context|exhibit_context/.test(apiJs), false, 'chat must not send client-built prompt prose')
  assert.strictEqual(/buildClientContext|buildStyledPrompt|promptPrefix/.test(tourStoreJs), false, 'client system-like prompt builders must stay removed')
  assert.ok(/backendPersona:\s*'default'/.test(tourStoreJs), 'default persona must stay independent from B')
  assert.ok(/persona:\s*'default'/.test(read('pages/home/home.js')), 'quick start local state must use the default persona')
  assert.ok(/\|\|\s*'default'/.test(tourSessionJs), 'guest-session bootstrap must preserve the default persona')
  assert.ok(/state\.sessionId\s*&&\s*state\.sessionToken/.test(tourSessionJs), 'a reusable guest session must require both ID and token')
  assert.strictEqual(/applyServerResumeState\(data\)/.test(tourSessionJs), false, 'fresh POST defaults must not overwrite the local page-first snapshot')
  assert.ok(/id:\s*localExhibitIdFromName\(exhibitNameFromQuery\)/.test(tourPageJs), 'query-only exhibit fallbacks must use local- IDs')
  assert.ok(/automaticRetryCount\s*<\s*1/.test(tourPageJs), 'each chat message must have a finite one-retry recovery budget')
  assert.ok(/recoverTourSession\([^,]+,\s*expectedLocalTourId\)/.test(tourPageJs), 'chat recovery must bind both failed session and local tour generation')
}

function checkRouteCatalogBoundary() {
  const apiJs = read('api/index.js')
  const routePageJs = read('pages/route/route.js')
  assert.strictEqual(/planTour|plan-tour|curator/i.test(routePageJs), false, 'route runtime must not call or reference the legacy curator plan')
  assert.strictEqual(/\/curator\/plan-tour/.test(apiJs), false, 'mini-program API must not expose the legacy curator plan endpoint')
  assert.ok(/tourApi\.getHalls\(\)/.test(routePageJs), 'route runtime must load the active /tour/halls catalog')
  assert.ok(/routeData\.buildDeterministicSteps\(/.test(routePageJs), 'route runtime must preserve the active hall catalog as a deterministic directory')
  assert.strictEqual(/HALL_ROUTE_META|ENABLE_DEV_ROUTE_FALLBACK/.test(routePageJs), false, 'route page must not retain hardcoded hall facts or a fallback switch')
}

function checkMuseumCatalogAuthorityBoundary() {
  const apiJs = read('api/index.js')
  const scanJs = read('pages/exhibit-scan/exhibit-scan.js')
  const hallJs = read('pages/hall/hall.js')
  const detailJs = read('pages/exhibit-detail/exhibit-detail.js')
  const tourPageJs = read('pages/tour/tour.js')
  const tourStoreJs = read('store/tour.js')
  assert.ok(/exhibitCatalog\.fetchAll\(/.test(scanJs), 'exhibit scan must load the complete paginated remote catalog')
  assert.ok(/_remoteCatalogAuthoritative/.test(scanJs), 'exhibit scan must track authoritative remote catalog state')
  assert.ok(/ENABLE_DEV_MOCK_EXHIBITS\s*=\s*false/.test(scanJs), 'production exhibit scan must keep mock catalogs disabled')
  assert.ok(/ENABLE_DEV_MOCK_EXHIBITS\s*=\s*false/.test(detailJs), 'production exhibit detail must keep mock facts disabled')
  assert.strictEqual(/exhibitsApi\.search\(/.test(scanJs), false, 'search and photo matching must use the already-authoritative catalog')
  assert.strictEqual(/listByHall:[\s\S]{0,300}limit:\s*50/.test(apiJs), false, 'hall exhibit listing must not retain a fixed 50-item truncation')
  assert.ok(/_remoteHallCatalogAuthoritative/.test(hallJs), 'hall page must distinguish successful empty catalogs from request fallback')
  assert.ok(/shortDescription:[\s\S]{0,260}description:[\s\S]{0,260}exhibitCount:/.test(hallJs), 'hall refresh signature must include short copy, full description and exhibit count')
  assert.ok(/_loadHallData\(forceRefresh\)/.test(hallJs), 'hall page must refetch the catalog after returning from temporary-hall maintenance')
  assert.ok(
    /function buildWelcomeMessage\([^)]*hallName[^)]*hallDescription[^)]*hallCardDescription[^)]*\)[\s\S]{0,1200}先选一件展品或一处遗迹/.test(tourPageJs),
    'production tour welcome must use the trusted hall name and concise card description with a concrete start hint'
  )
  assert.ok(/currentHallDescription:\s*hall\.desc/.test(hallJs), 'hall selection must retain the backend hall description')
  assert.ok(/currentHallCardDescription:\s*hall\.cardDesc/.test(hallJs), 'hall selection must retain visitor-facing short copy')
  assert.strictEqual(tourPageJs.indexOf('不把其他展厅的内容混进来'), -1, 'visitor welcome must not expose an internal isolation rule')
  assert.strictEqual(/ENABLE_DEV_HALL_WELCOME_COPY/.test(tourPageJs), false, 'production tour must not retain a dead bundled-welcome feature flag')
  assert.strictEqual(/HALL_WELCOME_COPY/.test(tourPageJs), false, 'production tour must not retain bundled hall welcome facts')
  assert.ok(/var HALL_SLUG_NAMES\s*=\s*Object\.assign\(\{\},\s*banpoHalls\.HALL_SLUG_NAMES\)/.test(apiJs), 'API hall slug compatibility mapping must come from the shared catalogue')
  assert.ok(/var HALL_NAME_SLUGS\s*=\s*Object\.assign\(\{\},\s*banpoHalls\.HALL_NAME_SLUGS\)/.test(apiJs), 'API hall name compatibility mapping must come from the shared catalogue')
  assert.strictEqual((apiJs.match(/var HALL_SLUG_NAMES\s*=/g) || []).length, 1, 'API must not define a duplicate hall slug map before loading the shared catalogue')
  assert.strictEqual((apiJs.match(/var HALL_NAME_SLUGS\s*=/g) || []).length, 1, 'API must not define a duplicate hall name map before loading the shared catalogue')
  assert.ok(/_showTrustedOrUnavailable/.test(detailJs), 'trusted exhibit detail failures must use cached real data or an unavailable state')
  assert.strictEqual(/return 'name:'/.test(tourStoreJs), false, 'local name-only exhibit views must not enter trusted report counts')
  assert.strictEqual(/NON_EXHIBIT_NAMES/.test(apiJs), false, 'real imported exhibits must not be hidden by a client-side name blacklist')
}

function checkEventBatchBoundary() {
  const eventFlushJs = read('utils/event-flush.js')
  const tourPageJs = read('pages/tour/tour.js')
  const reportPageJs = read('pages/report/report.js')
  assert.ok(/EVENT_BATCH_SIZE\s*=\s*50/.test(eventFlushJs), 'tour event batches must stay within the backend max of 50')
  assert.ok(/eventFlush\.flushPendingEvents\(/.test(tourPageJs), 'tour page ordinary event flush must use the shared batcher')
  assert.ok(/eventFlush\.flushPendingEvents\(/.test(reportPageJs), 'report generation must use the shared event batcher first')
  assert.ok(/if \(result\.ok\)[\s\S]{0,120}generate\(''\)/.test(reportPageJs), 'report generation must wait for all event batches to succeed')
  assert.ok(/client_event_id:\s*assistantClientEventId\(questionClientEventId\)/.test(tourPageJs), 'assistant events must use a stable client event ID derived from the question')
  assert.strictEqual(/_dropPendingQuestionEvent/.test(tourPageJs), false, 'completed chat must keep the question pending alongside its answer')
  assert.ok(/_applyStreamStateVersion\(payload\)/.test(tourPageJs), 'SSE done state_version must update the local OCC version')
}

function checkSuggestionAuthorityBoundary() {
  const tourStoreJs = read('store/tour.js')
  const tourPageJs = read('pages/tour/tour.js')
  assert.strictEqual(/ENABLE_DEV_HALL_SUGGESTIONS/.test(tourStoreJs), false, 'tour store must not retain a dead bundled-suggestion feature flag')
  assert.strictEqual(/_HALL_SUGGEST_TEMPLATES/.test(tourStoreJs), false, 'tour store must not retain bundled hall suggestion facts')
  assert.ok(/buildServerGuideSuggestions\(/.test(tourPageJs), 'tour suggestion chips must be built from backend response strings')
  assert.ok(/text\.length < 8 \|\| text\.length > 18/.test(tourStoreJs), 'suggestions must keep the 8–18 character frontend boundary')
  assert.ok(/!\/\[？\?\]\$\/\.test\(text\)/.test(tourStoreJs), 'suggestions must end with a question mark')
  assert.ok(/var sessionReady[\s\S]{0,220}tourSession\.ensureTourSession\(\)/.test(tourPageJs), 'page-first suggestion loading must join the shared guest-session bootstrap')
  assert.strictEqual(/tourStore\.generateGuideSuggestions\(/.test(tourPageJs), false, 'tour runtime must not pre-show bundled suggestion templates')
  assert.strictEqual(/exhibitsApi\.listByHall\(/.test(tourPageJs), false, 'tour runtime must not replace failed backend suggestions with exhibit-derived static chips')
  assert.ok(/catch\(function \(err\) \{[\s\S]{0,220}_applyGuideSuggestions\(\[\]\)/.test(tourPageJs), 'failed suggestion requests must clear the suggestion bar')
}

function checkVectorIconAssets() {
  VECTOR_ICON_FILES.forEach(function (name) {
    const relative = 'assets/icons/' + name
    const full = path.join(ROOT, relative)
    assert.ok(fs.existsSync(full), relative + ' must be packaged')
    const svg = fs.readFileSync(full, 'utf8')
    assert.ok(/<svg[^>]+viewBox="0 0 128 128"/.test(svg), relative + ' must use the shared 128-unit viewBox')
  })
  const halls = read('constants/banpo-halls.js')
  const persona = read('pages/persona-reveal/persona-reveal.js')
  assert.ok(/hall\.iconSrc = '[^']*' \+ hall\.iconKey \+ '\.svg'/.test(halls), 'hall visual defaults must use vector assets')
  assert.ok(/iconFallbackSrc = '[^']*' \+ hall\.iconKey \+ '\.png'/.test(halls), 'hall vector assets must retain PNG fallback paths')
  assert.ok(/persona-historian'[\s\S]{0,700}\.svg/.test(persona), 'historian persona must use its vector source')
}

function checkTtsPlaybackBoundary() {
  const tourPageJs = read('pages/tour/tour.js')
  const ttsAudioJs = read('utils/tts-audio.js')
  const packageJson = JSON.parse(read('package.json'))
  const playbackStart = tourPageJs.indexOf('_playTtsFile: function')
  const playbackEnd = tourPageJs.indexOf('_stopTtsPlayback: function', playbackStart)
  const playback = tourPageJs.slice(playbackStart, playbackEnd)
  const callbackMarkers = ['ctx.onError(', 'ctx.onCanplay(', 'ctx.onPlay(', 'ctx.onEnded(', 'ctx.onStop(']
  const callbackIndexes = callbackMarkers.map(function (marker) { return playback.indexOf(marker) })
  const srcIndex = playback.indexOf('ctx.src = filePath')
  const directPlayIndex = playback.lastIndexOf("requestPlay('play')")

  assert.ok(/require\('\.\.\/\.\.\/utils\/tts-audio'\)/.test(tourPageJs), 'tour playback must use the shared WAV validator')
  assert.ok(/decodeAndValidateWavBase64\(/.test(tourPageJs), 'base64 WAV must be decoded and validated before writeFile')
  assert.ok(/INVALID_WAV_AUDIO/.test(ttsAudioJs), 'invalid WAV data must expose INVALID_WAV_AUDIO')
  assert.ok(/RIFF/.test(ttsAudioJs) && /WAVE/.test(ttsAudioJs), 'WAV validation must require RIFF....WAVE')
  assert.ok(/byteLength\s*<\s*44/.test(ttsAudioJs), 'WAV validation must reject containers shorter than 44 bytes')
  assert.ok(/riffEnd[\s\S]{0,180}bytes\.byteLength/.test(ttsAudioJs), 'WAV validation must enforce the RIFF declared range')
  assert.ok(/chunkEnd\s*>\s*riffEnd/.test(ttsAudioJs), 'WAV validation must reject chunks outside the RIFF range')
  assert.ok(/chunkSize\s*%\s*2/.test(ttsAudioJs), 'WAV chunk traversal must account for odd-byte padding')
  assert.ok(/foundFmt/.test(ttsAudioJs) && /foundAudio/.test(ttsAudioJs), 'WAV validation must require fmt and non-empty data chunks')
  assert.ok(callbackIndexes.every(function (index) { return index >= 0 }), 'all InnerAudioContext callbacks must be registered')
  assert.deepStrictEqual(callbackIndexes.slice().sort(function (a, b) { return a - b }), callbackIndexes, 'audio callbacks must retain the audited registration order')
  assert.ok(callbackIndexes[callbackIndexes.length - 1] < srcIndex, 'audio callbacks must be registered before ctx.src')
  assert.ok(srcIndex < directPlayIndex, 'ctx.src must be assigned only after callbacks and before direct play')
  assert.ok(/ctx\.onPlay\([\s\S]{0,180}_setMessageTtsStatus\(messageId, 'playing'\)/.test(playback), 'playing state must start only inside onPlay')
  assert.ok(/playAttempts\s*>=\s*2/.test(playback), 'play/canplay retry must stay bounded to two attempts')
  assert.ok(/canplayPending/.test(playback) && /srcAssigned/.test(playback), 'synchronous src canplay must be deferred until after the direct play attempt')
  assert.ok(/TTS_PLAY_START_TIMEOUT_MS\s*=\s*5000/.test(tourPageJs), 'silent playback start must have a bounded watchdog')
  assert.ok(/failPlayback\('play_start_timeout'/.test(playback), 'silent playback must reset through a structured timeout failure')
  assert.ok(/self\._ttsAudioCtx\s*!==\s*ctx/.test(playback), 'stale audio callbacks must be isolated by context identity')
  assert.ok(/obeyMuteSwitch' in ctx\) ctx\.obeyMuteSwitch = false/.test(playback), 'manual playback must opt out of the mute switch when supported')
  assert.ok(/api\.ttsApi\.synthesize\(/.test(tourPageJs), 'manual TTS button must use the standalone synthesize endpoint')
  assert.strictEqual(/onEvent:\s*function \(ev\) \{[\s\S]{0,300}(?:audio|tts)/i.test(tourPageJs), false, 'chat SSE events must not drive manual TTS playback')
  assert.strictEqual(packageJson.scripts['test:tts-audio'], 'node scripts/test-tts-audio.js', 'TTS lifecycle simulation must stay independently runnable')
  assert.ok(packageJson.scripts['test:all'].indexOf('test:tts-audio') >= 0, 'TTS lifecycle simulation must remain in test:all')
}

function checkLegacyAuthCleanup() {
  const memory = {}
  const removedKeys = []
  const previousWx = global.wx
  const storageModulePath = require.resolve(path.join(ROOT, 'utils/storage.js'))
  const expectedLegacyKeys = ['auth_token', 'user', 'user_role']

  try {
    global.wx = {
      getStorageSync: function (key) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''
      },
      setStorageSync: function (key, value) {
        memory[key] = value
      },
      removeStorageSync: function (key) {
        removedKeys.push(key)
        delete memory[key]
      },
    }
    delete require.cache[storageModulePath]
    const storageUtil = require(storageModulePath)
    assert.deepStrictEqual(storageUtil.LEGACY_AUTH_KEYS, expectedLegacyKeys, 'legacy auth cleanup key list must remain complete')
    memory[storageUtil.KEYS.TOUR_CACHE_SCHEMA_VERSION] = storageUtil.TOUR_CACHE_SCHEMA_VERSION
    memory.auth_token = 'legacy-auth-token'
    memory.user = { id: 'legacy-user' }
    memory.user_role = 'admin'

    assert.strictEqual(storageUtil.ensureTourCacheSchema(), false, 'current cache schema must not bypass legacy auth cleanup')
    expectedLegacyKeys.forEach(function (key) {
      assert.strictEqual(memory[key], undefined, 'legacy auth key must be removed at runtime: ' + key)
      assert.ok(removedKeys.indexOf(key) >= 0, 'wx.removeStorageSync must be called for legacy auth key: ' + key)
    })

    storageUtil.clearLegacyAuth()
    storageUtil.clearLegacyAuth()
  } finally {
    delete require.cache[storageModulePath]
    if (previousWx === undefined) {
      delete global.wx
    } else {
      global.wx = previousWx
    }
  }
}

function checkSyntax() {
  const failures = []
  SYNTAX_FILES.forEach(function (file) {
    const full = path.join(ROOT, file)
    if (!fs.existsSync(full)) {
      failures.push(file + ' is missing')
      return
    }
    const result = childProcess.spawnSync(process.execPath, ['--check', full], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      failures.push(file + ': ' + (result.stderr || result.stdout || '').trim())
    }
  })
  failWithList('Release preflight failed: JavaScript syntax check failed.', failures)
}

function warnPrivateConfig() {
  const privateConfig = path.join(ROOT, 'project.private.config.json')
  if (!fs.existsSync(privateConfig)) return
  try {
    const parsed = JSON.parse(fs.readFileSync(privateConfig, 'utf8'))
    if (parsed.setting && parsed.setting.urlCheck === false) {
      console.warn('[preflight warning] project.private.config.json has setting.urlCheck=false; release validation must turn legal-domain checking back on in DevTools.')
    }
  } catch (err) {
    console.warn('[preflight warning] project.private.config.json is not valid JSON:', err.message)
  }
}

function main() {
  const files = collectScanFiles()
  const activeApiBase = checkApiBase()
  checkHardcodedEndpoints(files)
  checkSuspiciousSecrets(files)
  checkGuestSessionBoundary()
  checkRouteCatalogBoundary()
  checkMuseumCatalogAuthorityBoundary()
  checkEventBatchBoundary()
  checkSuggestionAuthorityBoundary()
  checkVectorIconAssets()
  checkTtsPlaybackBoundary()
  checkLegacyAuthCleanup()
  checkSyntax()
  warnPrivateConfig()
  if (process.exitCode) process.exit(process.exitCode)
  console.log('wechat release preflight passed:', files.length, 'package files checked; active API base =', activeApiBase)
}

main()
