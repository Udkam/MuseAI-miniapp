const assert = require('assert')
const parseMarkdown = require('../utils/markdown').parseMarkdown

const blocks = parseMarkdown([
  '这个展厅的展品可以这样看：',
  '',
  '1. **人骨与体质人类学标本**',
  '',
  '你可以看到头骨、肢骨和牙齿。',
  '',
  '1. **生活场景复原与复原人像**',
  '',
  '这些内容用于理解家庭日常分工。',
  '',
  '1. **装饰品与身份标识物**',
  '',
  '发饰、陶饰和骨器残片可作为观察线索。',
].join('\n'))

const orderedLists = blocks.filter(function (block) {
  return block.type === 'list' && block.ordered
})

assert.strictEqual(orderedLists.length, 3)
assert.strictEqual(orderedLists[0].start, 1)
assert.strictEqual(orderedLists[1].start, 2)
assert.strictEqual(orderedLists[2].start, 3)

const compact = parseMarkdown('1. A\n2. B\n3. C')
assert.strictEqual(compact.length, 1)
assert.strictEqual(compact[0].start, 1)
assert.strictEqual(compact[0].items.length, 3)

console.log('markdown parser checks passed')
