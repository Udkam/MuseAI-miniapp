var banpoHalls = require('../constants/banpo-halls')

function _safe(value, maxLength) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength || 255)
}

function _safeHall(value) {
  var canonical = banpoHalls.normalizeHallToSlug(value)
  if (canonical) return canonical
  var raw = _safe(value, 100).toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(raw) ? raw : ''
}

function _queryValue(value) {
  return encodeURIComponent(_safe(value, 255))
}

function hasQuestionnaireDraft(draft) {
  return !!(draft && typeof draft === 'object' && Object.keys(draft).length)
}

/** Build a route exclusively from persisted, allow-listed mini-program pages. */
function buildResumeUrl(state) {
  var snapshot = state || {}
  var route = snapshot.currentPage
  var params = snapshot.currentPageParams && typeof snapshot.currentPageParams === 'object'
    ? snapshot.currentPageParams
    : {}

  if (route === 'pages/tour/tour') {
    var hall = _safeHall(snapshot.currentHall || params.hall)
    var hallName = _safe(snapshot.currentHallName || params.hallName, 255)
    return hall
      ? '/pages/tour/tour?hall=' + encodeURIComponent(hall) +
        (hallName ? '&hallName=' + _queryValue(hallName) : '') + '&resume=1'
      : '/pages/hall/hall'
  }
  if (route === 'pages/exhibit-detail/exhibit-detail') {
    var exhibit = snapshot.currentExhibit && typeof snapshot.currentExhibit === 'object'
      ? snapshot.currentExhibit
      : {}
    var id = _safe(params.id || snapshot.currentExhibitId || exhibit.id, 100)
    var name = _safe(params.name || exhibit.name, 255)
    var query = []
    if (id) query.push('id=' + _queryValue(id))
    if (name) query.push('name=' + _queryValue(name))
    return query.length
      ? '/pages/exhibit-detail/exhibit-detail?' + query.join('&')
      : '/pages/exhibit-scan/exhibit-scan'
  }
  if (route === 'pages/exhibit-scan/exhibit-scan') return '/pages/exhibit-scan/exhibit-scan'
  if (route === 'pages/onboarding/onboarding') return '/pages/onboarding/onboarding'
  if (route === 'pages/report/report') return '/pages/report/report'
  if (route === 'pages/route/route') return '/pages/route/route'
  if (route === 'pages/persona-reveal/persona-reveal') return '/pages/persona-reveal/persona-reveal'
  if (route === 'pages/hall/hall') return '/pages/hall/hall'
  return '/pages/hall/hall'
}

module.exports = {
  buildResumeUrl: buildResumeUrl,
  hasQuestionnaireDraft: hasQuestionnaireDraft,
}
