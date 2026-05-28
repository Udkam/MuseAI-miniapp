const tourStore = require('../../store/tour')
const api       = require('../../api/index')

// Q3 answer → style preferences stored in tour store
var STYLE_MAP = {
  A: { answerLength: 'brief',    depth: 'introductory', terminology: 'plain' },
  B: { answerLength: 'balanced', depth: 'standard',     terminology: 'plain' },
  C: { answerLength: 'detailed', depth: 'deep',         terminology: 'academic' },
}

Page({
  data: {
    step: 0,
    answers: [null, null, null],
    canNext: false,
    loading: false,
    questions: [
      {
        // Q1 → assumption（先验认知，决定 AI 挑战哪个观点）
        text: '关于 6000 年前的半坡先民，你最先想到的是？',
        hint: '你的直觉将影响 AI 导览员与你的对话方式',
        options: [
          { key: 'A', label: '朴素平等', desc: '那时候人们简单纯朴，应该平等和谐，没有压迫' },
          { key: 'B', label: '艰难求生', desc: '原始社会一定很艰难，食不果腹，危机四伏' },
          { key: 'C', label: '强弱自古', desc: '就算那么远古，社会也已经有了强者和弱者之分' },
        ],
      },
      {
        // Q2 → persona（叙事口吻，决定 AI 的讲故事方式）
        text: '参观博物馆时，你更喜欢哪种方式获取信息？',
        hint: '这决定了 AI 导览员的讲述风格',
        options: [
          { key: 'A', label: '考证派', desc: '看数据、看时间线，搞清楚来龙去脉，越严谨越好' },
          { key: 'B', label: '代入派', desc: '闭上眼睛想象当时的生活场景，用感受去理解历史' },
          { key: 'C', label: '思辨派', desc: '提出问题，自己思考，喜欢在讨论中发现新角度' },
        ],
      },
      {
        // Q3 → style（回答风格：长度/深度）
        text: '你希望 AI 导览员怎么和你说话？',
        hint: '这决定了 AI 的回答长度和讲解深度',
        options: [
          { key: 'A', label: '简洁直接', desc: '给我重点就好，不要太长，说完就行' },
          { key: 'B', label: '有故事有细节', desc: '正常节奏，既有叙述也有细节，不太短不太长' },
          { key: 'C', label: '深度详尽', desc: '越详细越好，我不怕长，喜欢深入了解每一个点' },
        ],
      },
    ],
  },

  selectOption: function (e) {
    var key     = e.currentTarget.dataset.key
    var answers = this.data.answers.slice()
    answers[this.data.step] = key
    this.setData({ answers: answers, canNext: true })
  },

  goNext: function () {
    if (!this.data.canNext || this.data.loading) return
    var nextStep = this.data.step + 1
    if (nextStep < 3) {
      this.setData({
        step:    nextStep,
        canNext: !!this.data.answers[nextStep],
      })
    } else {
      this._finish()
    }
  },

  _finish: function () {
    var self    = this
    var answers = this.data.answers

    // 直接映射，无需多数表决
    var assumption = answers[0] || 'A'  // Q1 → assumption
    var persona    = answers[1] || 'A'  // Q2 → persona
    var styleKey   = answers[2] || 'B'  // Q3 → style prefs

    // 保存风格偏好到 storage（tour.js 聊天时读取）
    var style = STYLE_MAP[styleKey] || STYLE_MAP.B
    tourStore.setStylePrefs(style)

    // 写入本地状态，确保后续页面有 persona/assumption 可用（即使 API 失败也能继续）
    tourStore.createLocalTourState({
      interestType: persona,
      persona:      persona,
      assumption:   assumption,
    })

    self.setData({ loading: true })

    var guestId = 'miniapp_guest_' + Date.now()

    api.tourApi.createSession({
      interest_type: persona,
      persona:       persona,
      assumption:    assumption,
      guest_id:      guestId,
    }).then(function (res) {
      self.setData({ loading: false })
      if (res.ok) {
        var d = res.data || {}
        tourStore.setTourSession({
          sessionId:    d.id || d.session_id || null,
          sessionToken: d.session_token      || null,
        })
        tourStore.updateTourState({
          interestType: persona,
          persona:      persona,
          assumption:   assumption,
        })
      } else {
        var msg = (res.data && res.data.detail) || ('创建会话失败 (' + res.status + ')')
        wx.showToast({ title: msg, icon: 'none', duration: 2500 })
      }
      wx.navigateTo({
        url: '/pages/persona-reveal/persona-reveal?persona=' + persona + '&assumption=' + assumption,
      })
    }).catch(function (err) {
      self.setData({ loading: false })
      var msg = (err && err.message) || '网络错误'
      wx.showToast({ title: msg + '，进入演示模式', icon: 'none', duration: 2500 })
      wx.navigateTo({
        url: '/pages/persona-reveal/persona-reveal?persona=' + persona + '&assumption=' + assumption,
      })
    })
  },
})
