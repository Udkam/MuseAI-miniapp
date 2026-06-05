function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。、“”‘’！!？?：:；;（）()\[\]【】《》<>]/g, '')
    .replace(/\s+/g, '')
    .replace(/展品|名称|编号|说明|介绍|复制品|模型/g, '')
}

function collectStrings(value, out) {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim())
    return
  }
  if (Array.isArray(value)) {
    value.forEach(function (item) { collectStrings(item, out) })
    return
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(function (key) {
      if (/text|word|words|detected|itemstring|content|result|name/i.test(key)) {
        collectStrings(value[key], out)
      } else if (Array.isArray(value[key]) || typeof value[key] === 'object') {
        collectStrings(value[key], out)
      }
    })
  }
}

function extractOcrText(raw) {
  var strings = []
  collectStrings(raw, strings)
  return strings
    .filter(function (text) { return text && normalizeText(text).length >= 2 })
    .join('\n')
    .trim()
}

function levenshtein(a, b) {
  a = normalizeText(a)
  b = normalizeText(b)
  if (!a || !b) return Math.max(a.length, b.length)
  var prev = []
  var curr = []
  for (var j = 0; j <= b.length; j++) prev[j] = j
  for (var i = 1; i <= a.length; i++) {
    curr[0] = i
    for (var k = 1; k <= b.length; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1
      curr[k] = Math.min(curr[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost)
    }
    var tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[b.length]
}

function similarity(a, b) {
  a = normalizeText(a)
  b = normalizeText(b)
  if (!a || !b) return 0
  if (a === b) return 1
  var maxLen = Math.max(a.length, b.length)
  return maxLen ? Math.max(0, 1 - levenshtein(a, b) / maxLen) : 0
}

function scoreExhibit(exhibit, query, aliases) {
  var q = normalizeText(query)
  if (!exhibit || !q) return 0

  var name = normalizeText(exhibit.name)
  var aliasList = (aliases || []).map(normalizeText).filter(Boolean)
  var haystack = normalizeText([
    exhibit.name,
    exhibit.category,
    exhibit.hallDisplay,
    exhibit.era,
    exhibit.description,
    (exhibit.tags || []).join(' '),
  ].join(' '))

  var score = 0
  if (name && q === name) score += 120
  if (name && (q.indexOf(name) >= 0 || name.indexOf(q) >= 0)) score += 85
  if (aliasList.indexOf(name) >= 0) score += 90
  if (haystack.indexOf(q) >= 0) score += 35

  var sim = similarity(name, q)
  score += Math.round(sim * 70)

  aliasList.forEach(function (alias) {
    var aliasSim = similarity(alias, name)
    if (aliasSim > 0.78) score += Math.round(aliasSim * 20)
  })

  score += Math.min(10, Number(exhibit.importance || 0))
  return score
}

function rankExhibits(exhibits, query, aliases) {
  return (exhibits || [])
    .map(function (exhibit) {
      return {
        exhibit: exhibit,
        score: scoreExhibit(exhibit, query, aliases),
      }
    })
    .filter(function (item) { return item.score >= 45 })
    .sort(function (a, b) { return b.score - a.score })
}

module.exports = {
  normalizeText: normalizeText,
  extractOcrText: extractOcrText,
  rankExhibits: rankExhibits,
}
