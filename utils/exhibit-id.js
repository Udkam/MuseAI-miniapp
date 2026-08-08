const BACKEND_EXHIBIT_ID_MAX_LENGTH = 36
const BACKEND_EXHIBIT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Return an ID that is safe to send to backend exhibit foreign-key fields.
 * Local/mock display objects deliberately keep their own IDs elsewhere.
 */
function normalizeBackendExhibitId(value) {
  var id = value === undefined || value === null ? '' : String(value).trim()
  var lower = id.toLowerCase()
  if (!id || id.length > BACKEND_EXHIBIT_ID_MAX_LENGTH) return null
  if (lower.indexOf('local-') === 0 || lower.indexOf('mock-') === 0) return null
  return id
}

function normalizeBackendExhibitUuid(value) {
  var id = normalizeBackendExhibitId(value)
  return id && BACKEND_EXHIBIT_UUID_RE.test(id) ? id : null
}

module.exports = {
  BACKEND_EXHIBIT_ID_MAX_LENGTH: BACKEND_EXHIBIT_ID_MAX_LENGTH,
  normalizeBackendExhibitId: normalizeBackendExhibitId,
  normalizeBackendExhibitUuid: normalizeBackendExhibitUuid,
}
