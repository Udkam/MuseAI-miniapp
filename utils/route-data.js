var hallData = require('./hall-data')
var banpoHalls = require('../constants/banpo-halls')

function normalizeHallSlug(value) {
  var canonical = banpoHalls.normalizeHallToSlug(value)
  if (canonical) return canonical
  var raw = String(value || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(raw) ? raw : ''
}

function hallCards(remoteHalls, options) {
  var remote = Array.isArray(remoteHalls) ? remoteHalls : []
  return hallData.buildHallList([], remote, options)
}

function availableHallSlugs(remoteHalls) {
  return hallCards(remoteHalls).map(function (hall) {
    return hall.backendSlug
  }).filter(Boolean)
}

function findHall(remoteHalls, slug) {
  var target = normalizeHallSlug(slug)
  var cards = hallCards(remoteHalls)
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].backendSlug === target) return cards[i]
  }
  return null
}

function isKnownEmptyTemporaryHall(hall) {
  if (!hall) return false
  var slug = hall.backendSlug
  var isTemporary = slug === 'temporary-hall-1' || slug === 'temporary-hall-2'
  return isTemporary && hall.exhibitCountKnown === true && Number(hall.exhibitCount) === 0
}

function buildBaseSteps(remoteHalls, metaById, options) {
  var remote = Array.isArray(remoteHalls) ? remoteHalls : []
  var remoteIsAuthoritative = remote.length > 0 || !!(options && options.authoritative === true)
  var routeHalls = hallCards(remote, options).filter(function (hall) {
    return !isKnownEmptyTemporaryHall(hall)
  })
  return routeHalls.map(function (hall, index) {
    var meta = (metaById && metaById[hall.id]) || {}
    var rawMinutes = remoteIsAuthoritative
      ? Number(hall.estimatedDurationMinutes)
      : Number(meta.minutes)
    var minutes = Number.isFinite(rawMinutes) && rawMinutes > 0
      ? Math.round(rawMinutes)
      : 0
    return {
      order: index + 1,
      hallId: hall.id || hall.backendSlug,
      hallSlug: hall.backendSlug,
      name: hall.name,
      short: hall.short || String(hall.name || '').slice(0, 2),
      highlights: hall.highlights || [],
      duration: minutes > 0 ? ('约 ' + minutes + ' 分钟') : '时长待确认',
      estimatedMinutes: minutes,
      exhibitCount: hall.exhibitCount,
      exhibitCountKnown: hall.exhibitCountKnown === true,
      reason: remoteIsAuthoritative
        ? (hall.cardDesc || hall.desc || '')
        : (meta.reason || hall.desc || ''),
      focus: remoteIsAuthoritative && hallData.isDistinctHallFocus(hall.desc, hall.focus)
        ? hallData.compactHallDescription(hall.focus)
        : (remoteIsAuthoritative ? '' : (meta.focus || '')),
      status: 'upcoming',
      isVisited: false,
      isCurrent: false,
    }
  })
}

/**
 * Build a deterministic directory sequence from the active hall catalog.
 * Questionnaire persona, preferred hall order, and time budget are deliberately
 * ignored: this page is an open-hall directory, not a museum-approved route.
 * Preserve backend display order. A temporary hall is omitted only when the
 * authoritative catalog explicitly reports exhibit_count=0; missing counts
 * remain compatible with older APIs and do not hide the hall.
 */
function buildDeterministicSteps(remoteHalls, options, metaById) {
  var source = options || {}
  return buildBaseSteps(remoteHalls, metaById, {
    authoritative: source.authoritative === true,
  })
}

module.exports = {
  normalizeHallSlug: normalizeHallSlug,
  availableHallSlugs: availableHallSlugs,
  findHall: findHall,
  buildBaseSteps: buildBaseSteps,
  buildDeterministicSteps: buildDeterministicSteps,
}
