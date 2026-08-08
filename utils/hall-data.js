var banpoHalls = require('../constants/banpo-halls')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER

function _remoteSlug(item) {
  var raw = item && (item.slug || item.hall_slug || item.backendSlug)
  var canonical = banpoHalls.normalizeHallToSlug(raw || (item && (item.name || item.title)))
  if (canonical) return canonical
  raw = String(raw || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(raw) ? raw : ''
}

function _knownHallBySlug(slug) {
  var found = null
  DEFAULT_ORDER.some(function (id) {
    var hall = HALLS_MAP[id]
    if (hall && hall.backendSlug === slug) {
      found = hall
      return true
    }
    return false
  })
  return found
}

/**
 * Convert the structured hall endpoint into cards.
 *
 * A non-empty remote list is authoritative: only its active, valid entries are
 * rendered. Static hall definitions provide visual defaults for known slugs;
 * they are never content data and are never rendered without a backend row.
 */
function buildHallList(visitedSlugs, remoteHalls, options) {
  var visited = Array.isArray(visitedSlugs) ? visitedSlugs : []
  var remote = Array.isArray(remoteHalls) ? remoteHalls : []
  if (!remote.length) return []

  var seen = {}
  return remote.map(function (item, index) {
    if (!item || typeof item !== 'object') return null
    if (item.is_active === false || item.active === false) return null
    var slug = _remoteSlug(item)
    if (!slug || seen[slug]) return null
    seen[slug] = true

    var visual = _knownHallBySlug(slug) || {}
    var name = item.name || item.title || visual.name || banpoHalls.getHallDisplayName(slug) || slug
    return Object.assign({}, visual, {
      id: visual.id || slug,
      backendSlug: slug,
      name: name,
      short: item.short || visual.short || String(name).slice(0, 3),
      icon: item.icon || visual.icon || '🏛️',
      iconSrc: item.icon_src || item.iconSrc || visual.iconSrc || '',
      desc: item.description || item.desc || item.summary || '',
      highlights: Array.isArray(item.highlights) ? item.highlights.slice() : [],
      focus: item.focus || item.route_focus || item.routeFocus || '',
      suggestions: item.suggestions || item.suggested_questions || item.guide_suggestions || [],
      exhibitCount: Number(item.exhibit_count || item.exhibitCount || 0),
      estimatedDurationMinutes: Number(item.estimated_duration_minutes || item.estimatedDurationMinutes || 0),
      order: index + 1,
      isVisited: visited.indexOf(slug) !== -1,
    })
  }).filter(Boolean)
}

/** Build the authoritative slug -> display-name catalog returned by /tour/halls. */
function buildHallNameMap(remoteHalls) {
  var remote = Array.isArray(remoteHalls) ? remoteHalls : []
  if (!remote.length) return {}
  var names = {}
  buildHallList([], remote).forEach(function (hall) {
    if (!hall || !hall.backendSlug || !hall.name) return
    names[hall.backendSlug] = hall.name
  })
  return names
}

module.exports = {
  buildHallList: buildHallList,
  buildHallNameMap: buildHallNameMap,
}
