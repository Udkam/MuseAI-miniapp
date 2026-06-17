const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const API_ORIGIN = 'https://api.banpo-museai.xyz'
const API_BASE = API_ORIGIN + '/api/v1'
const LOCAL_API_BASE = 'http://127.0.0.1:8000/api/v1'

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
  'api/index.js',
  'api/stream.js',
  'utils/request.js',
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

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm' || entry.name === '_web_archive') return
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
  const requestUsesProd = requestJs.indexOf("const BASE_URL = '" + API_BASE + "'") >= 0
  const streamUsesProd = streamJs.indexOf("var BASE_URL = '" + API_BASE + "'") >= 0
  const requestUsesLocal = requestJs.indexOf("const BASE_URL = '" + LOCAL_API_BASE + "'") >= 0
  const streamUsesLocal = streamJs.indexOf("var BASE_URL = '" + LOCAL_API_BASE + "'") >= 0
  assert.ok(
    (requestUsesProd && streamUsesProd) || (requestUsesLocal && streamUsesLocal),
    'utils/request.js and api/stream.js must both use either local dev API or production HTTPS API'
  )
  if (requestUsesLocal || streamUsesLocal) {
    console.warn('[preflight warning] active API base is local dev:', LOCAL_API_BASE)
    console.warn('[preflight warning] switch both BASE_URL declarations back to ' + API_BASE + ' before release upload.')
    return LOCAL_API_BASE
  }
  return API_BASE
}

function checkHardcodedEndpoints(files) {
  const bad = []
  const allowedDevApi = new RegExp(LOCAL_API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
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
  checkSyntax()
  warnPrivateConfig()
  if (process.exitCode) process.exit(process.exitCode)
  console.log('wechat release preflight passed:', files.length, 'package files checked; active API base =', activeApiBase)
}

main()
