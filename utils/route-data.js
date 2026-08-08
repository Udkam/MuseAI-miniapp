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

function buildBaseSteps(remoteHalls, metaById, options) {
  var remote = Array.isArray(remoteHalls) ? remoteHalls : []
  var remoteIsAuthoritative = remote.length > 0 || !!(options && options.authoritative === true)
  return hallCards(remote, options).map(function (hall, index) {
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
      reason: remoteIsAuthoritative
        ? (hall.desc || '')
        : (meta.reason || hall.desc || ''),
      focus: remoteIsAuthoritative ? (hall.focus || '') : (meta.focus || ''),
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
 * Always preserve backend display order and never omit an active hall.
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
