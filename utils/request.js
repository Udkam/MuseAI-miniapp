const storage = require('./storage')

// Local development while banpo-museai.xyz is still waiting for ICP filing.
const BASE_URL = 'http://127.0.0.1:8000/api/v1'
// Production after ICP filing and WeChat request-domain approval:
// const BASE_URL = 'https://api.banpo-museai.xyz/api/v1'

const DEFAULT_TIMEOUT   = 10000
const DEFAULT_RETRIES   = 2
const DEFAULT_BASE_DELAY = 150

const HTTP_ERRORS = {
  400: '请求参数有误',
  401: '请先登录',
  403: '权限不足',
  404: '资源不存在',
  422: '数据格式错误',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误',
  503: '服务暂不可用，请稍后再试',
}

function buildHeaders(extra) {
  const headers = { 'Content-Type': 'application/json' }

  const authToken = storage.getToken()
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const { sessionToken } = storage.getTourSession()
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken
  }

  return Object.assign(headers, extra || {})
}

function wxRequestOnce(url, method, data, header, timeout) {
  return new Promise((resolve) => {
    wx.request({
      url,
      method,
      data,
      header,
      timeout,
      success: resolve,
      fail: function(err) {
        resolve({
          statusCode: 0,
          data: { detail: (err && err.errMsg) || '网络错误' },
        })
      },
    })
  })
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Core request with automatic auth injection and retry.
 *
 * @param {string} path            - API path (e.g. '/auth/login')
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.data]          - Request body (will be JSON-serialised by wx)
 * @param {object} [options.headers]       - Extra headers (merged after auth headers)
 * @param {number} [options.timeout]       - Per-attempt timeout in ms
 * @param {number} [options.retries]       - Max retry attempts on network/5xx/429 errors
 * @param {number} [options.baseDelayMs]   - Initial retry back-off delay in ms
 * @returns {Promise<{ok: boolean, status: number, data: object}>}
 */
async function request(path, options) {
  const {
    method      = 'GET',
    data,
    headers: extraHeaders,
    timeout     = DEFAULT_TIMEOUT,
    retries     = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY,
  } = options || {}

  const url    = `${BASE_URL}${path}`
  const header = buildHeaders(extraHeaders)

  let attempt = 0

  while (true) {
    let res

    res = await wxRequestOnce(url, method, data, header, timeout)

    const status       = res.statusCode
    const responseData = res.data || {}
    const ok           = status >= 200 && status < 300

    if (status === 401) {
      // Token expired or invalid — wipe local auth state
      storage.clearAuth()
    }

    if (!ok && HTTP_ERRORS[status]) {
      console.warn(`[request] ${method} ${path} → ${status}: ${HTTP_ERRORS[status]}`)
    }

    const retryable = status === 0 || status >= 500 || status === 429
    if (!retryable || attempt >= retries) {
      return { ok, status, data: responseData }
    }

    attempt++
    await wait(baseDelayMs * attempt)
  }
}

// Convenience wrappers

function get(path, options) {
  return request(path, Object.assign({}, options, { method: 'GET' }))
}

function post(path, data, options) {
  return request(path, Object.assign({}, options, { method: 'POST', data }))
}

function patch(path, data, options) {
  return request(path, Object.assign({}, options, { method: 'PATCH', data }))
}

// 'delete' is a reserved word — exported as 'del'
function del(path, options) {
  return request(path, Object.assign({}, options, { method: 'DELETE' }))
}

module.exports = { request, get, post, patch, del }
