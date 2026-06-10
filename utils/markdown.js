/**
 * Lightweight Markdown parser for WeChat mini-program.
 * No external dependencies. Converts a Markdown string into a blocks array
 * that can be rendered by WXML wx:for loops.
 *
 * Supported syntax:
 *   # / ## / ###   headings
 *   **text**        bold inline
 *   `text`          inline code
 *   - / * / +       unordered list items
 *   1. 2. ...       ordered list items
 *   blank line      paragraph separator
 *   plain text      paragraph
 *
 * Block shape:
 *   { type: 'heading',   id: n, level: 1|2|3, text: '...' }
 *   { type: 'paragraph', id: n, segments: Segment[] }
 *   { type: 'list',      id: n, ordered: bool, start: number, items: Segment[][] }
 *
 * Segment shape:
 *   { text: '...', bold: bool, code: bool }
 */

function parseInline(rawText) {
  var segments = []
  var re = /\*\*(.+?)\*\*|`([^`]+)`/g
  var lastIndex = 0
  var match

  re.lastIndex = 0
  while ((match = re.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: rawText.slice(lastIndex, match.index), bold: false, code: false })
    }
    if (match[1] !== undefined) {
      // **bold**
      segments.push({ text: match[1], bold: true, code: false })
    } else {
      // `code`
      segments.push({ text: match[2], bold: false, code: true })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < rawText.length) {
    segments.push({ text: rawText.slice(lastIndex), bold: false, code: false })
  }

  return normalizePunctuationSegments(
    segments.length ? segments : [{ text: rawText, bold: false, code: false }]
  )
}

function normalizePunctuationSegments(segments) {
  var out = []
  ;(segments || []).forEach(function (seg) {
    if (!seg || !seg.text) return
    var current = {
      text: seg.text,
      bold: !!seg.bold,
      code: !!seg.code,
    }
    var prev = out[out.length - 1]
    if (prev && prev.bold && !current.bold && !current.code) {
      var leading = current.text.match(/^[，。；：、！？,.!?;:）】》\)\]\}]+/)
      if (leading) {
        prev.text += leading[0]
        current.text = current.text.slice(leading[0].length)
      }
    }
    if (current.text) out.push(current)
  })
  return out
}

function needsAsciiSpace(left, right) {
  return /[A-Za-z0-9]$/.test(left || '') && /^[A-Za-z0-9]/.test(right || '')
}

function lastSegmentText(segments) {
  if (!segments || !segments.length) return ''
  return segments[segments.length - 1].text || ''
}

function appendSoftLine(segments, rawText) {
  if (!segments || !segments.length) return parseInline(rawText)
  if (needsAsciiSpace(lastSegmentText(segments), rawText)) {
    segments.push({ text: ' ', bold: false, code: false })
  }
  return segments.concat(parseInline(rawText))
}

function joinSoftLines(lines) {
  var segments = []
  lines.forEach(function (line) {
    segments = appendSoftLine(segments, line)
  })
  return segments
}

function parseMarkdown(mdText) {
  if (!mdText) return []

  var blocks = []
  var idCounter = 0
  var lines = mdText.replace(/\r\n/g, '\n').split('\n')
  var listBuffer = null  // { ordered: bool, start: number, items: Segment[][] }
  var paragraphLines = []
  var orderedCounter = 1
  var orderedSeriesOpen = false

  function flushParagraph() {
    if (!paragraphLines.length) return
    blocks.push({
      type: 'paragraph',
      id: idCounter++,
      segments: joinSoftLines(paragraphLines),
    })
    paragraphLines = []
  }

  function flushList() {
    if (!listBuffer) return
    blocks.push({
      type: 'list',
      id: idCounter++,
      ordered: listBuffer.ordered,
      start: listBuffer.start || 1,
      items: listBuffer.items,
    })
    listBuffer = null
  }

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim()

    // Heading: # / ## / ###
    var headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      orderedCounter = 1
      orderedSeriesOpen = false
      blocks.push({
        type: 'heading',
        id: idCounter++,
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      })
      continue
    }

    // Unordered list: - / * / +
    var ulMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    if (ulMatch) {
      flushParagraph()
      if (listBuffer && listBuffer.ordered) flushList()
      orderedCounter = 1
      orderedSeriesOpen = false
      if (!listBuffer) listBuffer = { ordered: false, items: [] }
      listBuffer.items.push(parseInline(ulMatch[1]))
      continue
    }

    // Ordered list: 1. / 2. / ...
    var olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
    if (olMatch) {
      flushParagraph()
      if (listBuffer && !listBuffer.ordered) flushList()
      if (!listBuffer) {
        var rawStart = parseInt(olMatch[1], 10) || 1
        var start = orderedSeriesOpen ? orderedCounter : rawStart
        listBuffer = { ordered: true, start: start, items: [] }
        orderedCounter = start
      }
      listBuffer.items.push(parseInline(olMatch[2]))
      orderedCounter += 1
      orderedSeriesOpen = true
      continue
    }

    // Empty line → flush list, don't create a block
    if (trimmed === '') {
      flushParagraph()
      flushList()
      continue
    }

    // Single newlines are Markdown soft breaks, not forced paragraph breaks.
    if (listBuffer && listBuffer.items.length) {
      var lastIndex = listBuffer.items.length - 1
      listBuffer.items[lastIndex] = appendSoftLine(listBuffer.items[lastIndex], trimmed)
    } else {
      paragraphLines.push(trimmed)
    }
  }

  flushParagraph()
  flushList()

  // Final fallback: if nothing parsed, return whole text as one paragraph
  return blocks.length
    ? blocks
    : [{ type: 'paragraph', id: 0, segments: [{ text: mdText, bold: false, code: false }] }]
}

module.exports = { parseMarkdown: parseMarkdown }
