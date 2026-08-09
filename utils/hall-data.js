var banpoHalls = require('../constants/banpo-halls')

var HALLS_MAP = banpoHalls.HALLS_MAP
var DEFAULT_ORDER = banpoHalls.DEFAULT_ORDER
var HALL_CARD_FALLBACK = '可从现场展品与展签开始了解本厅'

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

function _finishCompactSentence(value) {
  var text = String(value || '').trim().replace(/[，,：:、；;\s]+$/, '')
  if (!text) return ''
  return /[。！？!?]$/.test(text) ? text : text + '。'
}

/**
 * Build a short, factual card introduction from one trusted backend field.
 * Prefer complete sentences, then complete comma-delimited phrases. The hard
 * limit fallback never adds an ellipsis or a new fact; it closes the retained
 * source prefix as a display sentence.
 */
function compactHallDescription(value, maxLength) {
  var limit = Math.max(18, Number(maxLength) || 36)
  var text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:本展厅|该展厅|本厅)\s*(?:主要)?\s*(展示|介绍|呈现)/, '$1')
  if (!text) return ''
  if (text.length <= limit) return _finishCompactSentence(text)

  var sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || []
  var complete = ''
  for (var i = 0; i < sentences.length; i++) {
    var sentence = sentences[i].trim()
    if (!sentence) continue
    var candidate = complete + sentence
    var hasEnding = /[。！？!?；;]$/.test(sentence)
    if (candidate.length <= limit && hasEnding) {
      complete = candidate
      continue
    }
    break
  }
  if (complete) return _finishCompactSentence(complete)

  var first = (sentences[0] || text).trim()
  var phrases = first.match(/[^，,：:]+[，,：:]?/g) || []
  var phraseText = ''
  for (var j = 0; j < phrases.length; j++) {
    var next = phraseText + phrases[j].trim()
    if (next.length > limit - 1) break
    phraseText = next
  }
  if (phraseText) return _finishCompactSentence(phraseText)

  return _finishCompactSentence(first.slice(0, limit - 1))
}

function _comparableHallText(value) {
  return String(value || '')
    .replace(/[\s，,。！？!?；;：:“”'‘’（）()、]/g, '')
    .toLowerCase()
}

function isDistinctHallFocus(description, focus) {
  var descriptionKey = _comparableHallText(description)
  var focusKey = _comparableHallText(focus)
  if (!focusKey) return false
  if (!descriptionKey) return true
  return !(
    focusKey === descriptionKey ||
    descriptionKey.indexOf(focusKey) === 0 ||
    focusKey.indexOf(descriptionKey) === 0
  )
}

function _structuredCardDescription(item) {
  if (!item || typeof item !== 'object') return ''
  return item.short_description || item.shortDescription ||
    item.card_description || item.cardDescription || ''
}

/**
 * Resolve visitor-facing card copy without changing the full Agent context.
 * Every hall remains data driven: a structured short field is displayed as-is
 * apart from surrounding whitespace. Missing short copy receives one neutral
 * visitor-facing sentence instead of reinterpreting the long Agent context.
 */
function resolveHallCardDescription(item, slug, fullDescription) {
  var structured = _structuredCardDescription(item)
  return structured ? String(structured).trim() : HALL_CARD_FALLBACK
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
    var fullDescription = item.description || item.desc || ''
    var conciseDescription = _structuredCardDescription(item)
    var hasExhibitCount = Object.prototype.hasOwnProperty.call(item, 'exhibit_count') ||
      Object.prototype.hasOwnProperty.call(item, 'exhibitCount')
    var rawExhibitCount = Object.prototype.hasOwnProperty.call(item, 'exhibit_count')
      ? item.exhibit_count
      : item.exhibitCount
    var parsedExhibitCount = Number(rawExhibitCount)
    var exhibitCountKnown = hasExhibitCount && rawExhibitCount !== null && rawExhibitCount !== '' &&
      Number.isFinite(parsedExhibitCount) && parsedExhibitCount >= 0
    return Object.assign({}, visual, {
      id: visual.id || slug,
      backendSlug: slug,
      name: name,
      short: item.short || visual.short || String(name).slice(0, 3),
      icon: item.icon || visual.icon || '🏛️',
      iconSrc: item.icon_src || item.iconSrc || visual.iconSrc || '',
      iconFallbackSrc: item.icon_fallback_src || item.iconFallbackSrc || visual.iconFallbackSrc || '',
      desc: fullDescription || conciseDescription,
      cardDesc: resolveHallCardDescription(item, slug, fullDescription),
      highlights: Array.isArray(item.highlights) ? item.highlights.slice() : [],
      focus: item.focus || item.route_focus || item.routeFocus || '',
      suggestions: item.suggestions || item.suggested_questions || item.guide_suggestions || [],
      exhibitCount: exhibitCountKnown ? parsedExhibitCount : 0,
      exhibitCountKnown: exhibitCountKnown,
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
  compactHallDescription: compactHallDescription,
  resolveHallCardDescription: resolveHallCardDescription,
  isDistinctHallFocus: isDistinctHallFocus,
}
