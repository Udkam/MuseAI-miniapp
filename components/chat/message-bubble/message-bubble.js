var parseMarkdown = require('../../../utils/markdown').parseMarkdown

function normalizeAssistantContent(content) {
  return String(content || '')
    .replace(/^(#{1,6}\s*)?(?:我的分析|说明了什么|为什么重要|下一步(?:推荐)?观察)[？?：:]?\s*$/gm, '')
    .replace(/^(\s*(?:[-*+]\s*)?)(?:\*\*)?(?:我的分析|说明了什么|为什么重要)[？?：:]?(?:\*\*)?\s*/gm, '$1可以这样理解：')
    .replace(/^(\s*(?:[-*+]\s*)?)(?:\*\*)?下一步(?:推荐)?观察[？?：:]?(?:\*\*)?\s*/gm, '$1')
    .replace(/\n{3,}/g, '\n\n')
}

function toPlainText(content) {
  return normalizeAssistantContent(content)
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
    messageId:   { type: String,  value: ''      },
    ttsStatus:   { type: String,  value: 'idle'  },
    showTts:     { type: Boolean, value: false   },
  },

  data: {
    blocks: [],
  },

  observers: {
    // Parse Markdown only for finalized assistant messages.
    // While streaming, skip parsing and let the wxml render `content` as plain
    // text (the blocks-empty fallback). The live bubble's content grows on every
    // ~80ms chunk flush; re-parsing the whole answer each time is O(n²). The
    // final committed message (non-streaming, in the messages list) parses once.
    // User messages keep blocks empty → plain text fallback.
    'role, content, isStreaming': function (role, content, isStreaming) {
      if (role === 'assistant' && content && !isStreaming) {
        var self = this
        this.setData({ blocks: parseMarkdown(normalizeAssistantContent(content)) }, function () {
          self.triggerEvent('contentrendered', {
            role: role,
            messageId: self.properties.messageId,
          })
        })
      } else if (this.data.blocks.length) {
        this.setData({ blocks: [] })
      }
    },
  },

  methods: {
    requestTts: function () {
      if (this.properties.isStreaming || this.properties.isError || !this.properties.content) return
      this.triggerEvent('playtts', {
        messageId: this.properties.messageId,
        content: this.properties.content,
        status: this.properties.ttsStatus,
      })
    },

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
