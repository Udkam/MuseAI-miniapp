var tourStore = require('../../store/tour')
var api       = require('../../api/index')

var PERSONA_NAMES = { A: '考古队长', B: '半坡原住民', C: '历史老师' }

var INTENT_CARDS = [
  {
    id:                 'immerse',
    icon:               '🏺',
    title:              '穿越到六千年前',
    desc:               '用想象力感受那时人们的日常',
    persona:            'B',
    personaId:          'B',       // 半坡原住民 — backend handles system prompt
    assumption:         'B',
    answerLength:       'balanced',
    depth:              'standard',
    preferredHallOrder: ['settlement', 'artifacts', 'culture'],
  },
  {
    id:                 'evidence',
    icon:               '🔬',
    title:              '跟着考古证据走',
    desc:               '细看文物，还原有据可查的历史',
    persona:            'A',
    personaId:          'A',       // 考古队长 — backend handles system prompt
    assumption:         'C',
    answerLength:       'balanced',
    depth:              'deep',
    preferredHallOrder: ['artifacts', 'settlement', 'culture'],
  },
  {
    id:                 'reflect',
    icon:               '💡',
    title:              '提问，找新启发',
    desc:               '用现代眼光反思古人留下了什么',
    persona:            'C',
    personaId:          'C',       // 历史老师 — backend handles system prompt
    assumption:         'A',
    answerLength:       'balanced',
    depth:              'deep',
    preferredHallOrder: ['culture', 'artifacts', 'settlement'],
  },
  {
    id:                 'artisan',
    icon:               '🏛️',
    title:              '以陶器工匠视角看',
    desc:               '从制作工艺和匠人视角感受文物',
    persona:            'B',
    personaId:          'artisan', // 前端 prompt prefix 注入，backend 用 B 作基础
    assumption:         'B',
    answerLength:       'balanced',
    depth:              'standard',
    preferredHallOrder: ['artifacts', 'culture', 'settlement'],
  },
]

var TIME_OPTIONS = [
  { id: '30min',     icon: '⏱',  title: '30 分钟', desc: '精华优先，重点展品',     answerLength: 'brief',    overrideDepth: 'introductory' },
  { id: '1hour',     icon: '⏰',  title: '1 小时',  desc: '正常节奏，有故事有细节', answerLength: 'balanced', overrideDepth: null          },
  { id: 'unlimited', icon: '🕐',  title: '随便逛',  desc: '不限时，越详细越好',     answerLength: 'detailed', overrideDepth: 'deep'         },
]

var DEFAULT_CARD = {
  persona:            'B',
  personaId:          'default',
  assumption:         'B',
  answerLength:       'balanced',
  depth:              'standard',
  preferredHallOrder: ['settlement', 'artifacts', 'culture'],
}

Page({
  data: {
    step:                    1,
    intentCards:             INTENT_CARDS,
    timeOptions:             TIME_OPTIONS,
    selectedCardId:          null,
    selectedCardPersonaName: '',
    intentText:              '',
    selectedTimeId:          null,
    loading:                 false,
  },

  selectCard: function (e) {
    var id   = e.currentTarget.dataset.id
    var card = this._findCard(id)
    this.setData({
      selectedCardId:          id,
      selectedCardPersonaName: card ? PERSONA_NAMES[card.persona] : '',
    })
  },

  onIntentInput: function (e) {
    this.setData({ intentText: e.detail.value || '' })
  },

  goToStep2: function () {
    this.setData({ step: 2 })
  },

  selectTime: function (e) {
    this.setData({ selectedTimeId: e.currentTarget.dataset.id })
  },

  confirmTime: function () {
    this._finish()
  },

  skipTime: function () {
    this.setData({ selectedTimeId: null })
    this._finish()
  },

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _findCard: function (id) {
    for (var i = 0; i < INTENT_CARDS.length; i++) {
      if (INTENT_CARDS[i].id === id) return INTENT_CARDS[i]
    }
    return null
  },

  _findTime: function (id) {
    for (var i = 0; i < TIME_OPTIONS.length; i++) {
      if (TIME_OPTIONS[i].id === id) return TIME_OPTIONS[i]
    }
    return null
  },

  _finish: function () {
    if (this.data.loading) return
    var self    = this
    var card    = this._findCard(this.data.selectedCardId) || DEFAULT_CARD
    var timeSel = this._findTime(this.data.selectedTimeId)

    var persona            = card.persona
    var personaId          = card.personaId || card.persona
    var assumption         = card.assumption
    var preferredHallOrder = card.preferredHallOrder
    var intentText         = this.data.intentText.trim()

    // Time selection overrides answerLength; overrideDepth replaces card depth when set
    var answerLength = timeSel ? timeSel.answerLength : card.answerLength
    var depth        = (timeSel && timeSel.overrideDepth) ? timeSel.overrideDepth : card.depth

    tourStore.setStylePrefs({ answerLength: answerLength, depth: depth, terminology: 'plain' })
    tourStore.createLocalTourState({ interestType: persona, persona: persona, assumption: assumption, personaId: personaId })
    tourStore.setOnboardingExtras({
      intentText:         intentText,
      preferredHallOrder: preferredHallOrder,
      timeBudget:         timeSel ? timeSel.id : null,
    })

    self.setData({ loading: true })

    var guestId = 'miniapp_guest_' + Date.now()
    // For artisan persona, use 'B' as backend persona (backend only knows A/B/C)
    var backendPersona = (persona === 'artisan') ? 'B' : persona

    api.tourApi.createSession({
      interest_type: backendPersona,
      persona:       backendPersona,
      assumption:    assumption,
      guest_id:      guestId,
    }).then(function (res) {
      if (res.ok) {
        var d = res.data || {}
        tourStore.setTourSession({
          sessionId:    d.id || d.session_id || null,
          sessionToken: d.session_token      || null,
        })
        tourStore.updateTourState({ interestType: persona, persona: persona, assumption: assumption, personaId: personaId })
      } else {
        var msg = (res.data && res.data.detail) || ('创建会话失败 (' + res.status + ')')
        wx.showToast({ title: msg, icon: 'none', duration: 2500 })
      }
      // Navigate without resetting loading state — avoids a rerender during transition animation
      wx.navigateTo({
        url: '/pages/persona-reveal/persona-reveal?persona=' + persona + '&assumption=' + assumption,
      })
    }).catch(function (err) {
      wx.showToast({ title: '网络错误，进入演示模式', icon: 'none', duration: 2000 })
      wx.navigateTo({
        url: '/pages/persona-reveal/persona-reveal?persona=' + persona + '&assumption=' + assumption,
      })
    })
  },
})
