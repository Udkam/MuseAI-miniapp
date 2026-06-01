var parseMarkdown = require('../../../utils/markdown').parseMarkdown

function toPlainText(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, function (block) {
      return block.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '')
    })
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

Component({
  properties: {
    role:        { type: String,  value: 'user'  },
    content:     { type: String,  value: ''      },
    isError:     { type: Boolean, value: false   },
    isStreaming: { type: Boolean, value: false   },
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

  methods: {
    copyContent: function () {
      var text = toPlainText(this.properties.content)
      if (!text) return
      wx.setClipboardData({
        data: text,
        success: function () {
          wx.showToast({ title: '已复制回答', icon: 'success', duration: 1200 })
        },
      })
    },
  },
})
