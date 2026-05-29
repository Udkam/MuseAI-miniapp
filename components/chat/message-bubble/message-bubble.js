var parseMarkdown = require('../../../utils/markdown').parseMarkdown

Component({
  properties: {
    role:    { type: String,  value: 'user'  },
    content: { type: String,  value: ''      },
    isError: { type: Boolean, value: false   },
  },

  data: {
    blocks: [],
  },

  observers: {
    // Re-parse whenever role or content changes.
    // User messages keep blocks empty → plain text fallback.
    // Error messages are parsed too (they're plain text, parse is harmless).
    'role, content': function (role, content) {
      if (role === 'assistant' && content) {
        this.setData({ blocks: parseMarkdown(content) })
      } else {
        this.setData({ blocks: [] })
      }
    },
  },
})
