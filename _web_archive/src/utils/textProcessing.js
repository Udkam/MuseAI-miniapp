/**
 * Renumber ordered list items in LLM output.
 *
 * LLMs conventionally write every ordered-list item as "1." (valid CommonMark:
 * markdown renderers auto-increment regardless of the number used). When the
 * frontend shows plain text the result is "1. 1. 1." instead of "1. 2. 3.".
 *
 * Rules:
 *  - Consecutive lines matching /^\d+\. / are renumbered 1, 2, 3 …
 *  - A single blank line between items does NOT reset the counter
 *    (handles loose lists where each item is followed by a paragraph).
 *  - Two or more consecutive blank lines reset the counter
 *    (treats them as a new, separate list).
 */
export function fixOrderedListNumbers(text) {
  if (!text) return text
  const lines = text.split('\n')
  const result = []
  let counter = 0
  let blankRun = 0

  for (const line of lines) {
    const m = line.match(/^(\d+)\. (.*)/)
    if (m) {
      blankRun = 0
      counter++
      result.push(`${counter}. ${m[2]}`)
    } else if (line.trim() === '') {
      blankRun++
      if (blankRun >= 2) counter = 0
      result.push(line)
    } else {
      blankRun = 0
      result.push(line)
    }
  }

  return result.join('\n')
}
