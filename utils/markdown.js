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
 *   { type: 'list',      id: n, ordered: bool, items: Segment[][] }
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

  return segments.length ? segments : [{ text: rawText, bold: false, code: false }]
}

function parseMarkdown(mdText) {
  if (!mdText) return []

  var blocks = []
  var idCounter = 0
  var lines = mdText.replace(/\r\n/g, '\n').split('\n')
  var listBuffer = null  // { ordered: bool, items: Segment[][] }

  function flushList() {
    if (!listBuffer) return
    blocks.push({
      type: 'list',
      id: idCounter++,
      ordered: listBuffer.ordered,
      items: listBuffer.items,
    })
    listBuffer = null
  }

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim()

    // Heading: # / ## / ###
    var headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushList()
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
      if (listBuffer && listBuffer.ordered) flushList()
      if (!listBuffer) listBuffer = { ordered: false, items: [] }
      listBuffer.items.push(parseInline(ulMatch[1]))
      continue
    }

    // Ordered list: 1. / 2. / ...
    var olMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (olMatch) {
      if (listBuffer && !listBuffer.ordered) flushList()
      if (!listBuffer) listBuffer = { ordered: true, items: [] }
      listBuffer.items.push(parseInline(olMatch[1]))
      continue
    }

    // Empty line → flush list, don't create a block
    if (trimmed === '') {
      flushList()
      continue
    }

    // Plain paragraph line
    flushList()
    blocks.push({
      type: 'paragraph',
      id: idCounter++,
      segments: parseInline(trimmed),
    })
  }

  flushList()

  // Final fallback: if nothing parsed, return whole text as one paragraph
  return blocks.length
    ? blocks
    : [{ type: 'paragraph', id: 0, segments: [{ text: mdText, bold: false, code: false }] }]
}

module.exports = { parseMarkdown: parseMarkdown }
