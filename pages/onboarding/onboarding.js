var tourStore = require('../../store/tour')
var api       = require('../../api/index')

var PERSONA_NAMES = {
  student: '研学记录员',
  A: '考古研究员',
  historian: '历史追问者',
  artifact: '器物研究员',
}

var FOCUS_OPTIONS = [
  {
    id: 'study',
    icon: '📝',
    title: '带着任务研学',
    desc: '边看边记，把展厅整理成可复盘的笔记',
    persona: 'B',
    personaId: 'student',
    prompt: '请优先给出观察任务、记录要点和适合研学汇报的清晰小结。',
    preferredHallOrder: ['site', 'basic', 'education'],
  },
  {
    id: 'research',
    icon: '🔎',
    title: '证据怎样成史',
    desc: '像研究者一样，看证据、推理和不确定性',
    persona: 'A',
    personaId: 'A',
    prompt: '请优先说明证据来源、推理过程和目前仍不确定的地方。',
    preferredHallOrder: ['basic', 'site', 'kiln'],
  },
  {
    id: 'history',
    icon: '🧭',
    title: '历史问题追问',
    desc: '把半坡放进更大的史前中国和今天来理解',
    persona: 'C',
    personaId: 'historian',
    prompt: '请优先围绕文明起源、社会变化、公共生活和今天的关系展开追问。',
    preferredHallOrder: ['basic', 'site', 'education'],
  },
  {
    id: 'artifact',
    icon: '🏺',
    title: '器物细节观察',
    desc: '从材料、器形、纹饰和工艺读懂文物',
    persona: 'D',
    personaId: 'artifact',
    prompt: '请优先从材料、器形、纹饰、制作工艺和使用痕迹解释问题。',
    preferredHallOrder: ['basic', 'kiln', 'workshop'],
  },
]

var ASSUMPTION_OPTIONS = [
  {
    id: 'A',
    title: '更像平等互助的共同体',
    desc: '我想看看公共空间、协作和共享生活的证据',
  },
  {
    id: 'B',
    title: '艰难但有烟火气的生活',
    desc: '我更关心他们怎样吃饭、居住、制作工具',
  },
  {
    id: 'C',
    title: '已经出现分工和规则',
    desc: '我想知道组织、仪式或差异有没有线索',
  },
  {
    id: 'D',
    title: '先不下判断，跟证据走',
    desc: '我想先收集材料，再形成自己的观点',
  },
]

var RHYTHM_OPTIONS = [
  {
    id: 'notebook',
    icon: '📝',
    title: '研学记录模式',
    desc: '每段给观察任务和可写进笔记的要点',
    answerLength: 'balanced',
    depth: 'standard',
    terminology: 'plain',
    prompt: '用户正在做研学记录，请在回答中给出清晰观察任务和可整理成笔记的小结。',
  },
  {
    id: 'quick',
    icon: '⏱',
    title: '30 分钟抓重点',
    desc: '少铺垫，直接讲关键展品和结论',
    answerLength: 'brief',
    depth: 'introductory',
    terminology: 'plain',
    prompt: '用户时间有限，请优先给清晰结论和少量观察任务。',
  },
  {
    id: 'dialogue',
    icon: '💬',
    title: '1 小时边看边问',
    desc: '正常节奏，讲清楚也留一点追问空间',
    answerLength: 'balanced',
    depth: 'standard',
    terminology: 'plain',
    prompt: '用户希望边看边问，请在回答末尾自然给一个可继续观察的问题。',
  },
  {
    id: 'research',
    icon: '📚',
    title: '研究深挖模式',
    desc: '多给证据比较、术语解释和延伸问题',
    answerLength: 'detailed',
    depth: 'deep',
    terminology: 'professional',
    prompt: '用户愿意深入研究，请适当加入证据比较、术语解释和进一步追问。',
  },
]

var DEFAULT_FOCUS = FOCUS_OPTIONS[0]
var DEFAULT_ASSUMPTION = ASSUMPTION_OPTIONS[3]
var DEFAULT_RHYTHM = RHYTHM_OPTIONS[0]

Page({
  data: {
    step: 1,
    focusOptions: FOCUS_OPTIONS,
    assumptionOptions: ASSUMPTION_OPTIONS,
    rhythmOptions: RHYTHM_OPTIONS,
    selectedFocusId: DEFAULT_FOCUS.id,
    selectedAssumptionId: DEFAULT_ASSUMPTION.id,
    selectedRhythmId: DEFAULT_RHYTHM.id,
    selectedPersonaName: PERSONA_NAMES[DEFAULT_FOCUS.personaId],
    intentText: '',
    loading: false,
  },

  _navigating: false,

  onShow: function () {
    this._navigating = false
    if (this.data.loading) this.setData({ loading: false })
  },

  selectFocus: function (e) {
    if (this.data.loading) return
    var id = e.currentTarget.dataset.id
    var item = this._findFocus(id)
    this.setData({
      selectedFocusId: id,
      selectedPersonaName: item ? PERSONA_NAMES[item.personaId] : '',
    })
  },

  selectAssumption: function (e) {
    if (this.data.loading) return
    this.setData({ selectedAssumptionId: e.currentTarget.dataset.id })
  },

  selectRhythm: function (e) {
    if (this.data.loading) return
    this.setData({ selectedRhythmId: e.currentTarget.dataset.id })
  },

  onIntentInput: function (e) {
    if (this.data.loading) return
    this.setData({ intentText: e.detail.value || '' })
  },

  goNext: function () {
    if (this.data.loading) return
    if (this.data.step < 3) {
      this.setData({ step: this.data.step + 1 })
    } else {
      var self = this
      if (wx.nextTick) {
        wx.nextTick(function () { self._finish() })
      } else {
        setTimeout(function () { self._finish() }, 0)
      }
    }
  },

  goBack: function () {
    if (this.data.loading) return
    if (this.data.step > 1) this.setData({ step: this.data.step - 1 })
  },

  skipProfile: function () {
    if (this.data.loading) return
    this.setData({
      selectedFocusId: null,
      selectedAssumptionId: null,
      selectedRhythmId: null,
      intentText: '',
    })
    this._finish()
  },

  noop: function () {},

  _findFocus: function (id) {
    for (var i = 0; i < FOCUS_OPTIONS.length; i++) {
      if (FOCUS_OPTIONS[i].id === id) return FOCUS_OPTIONS[i]
    }
    return null
  },

  _findAssumption: function (id) {
    for (var i = 0; i < ASSUMPTION_OPTIONS.length; i++) {
      if (ASSUMPTION_OPTIONS[i].id === id) return ASSUMPTION_OPTIONS[i]
    }
    return null
  },

  _findRhythm: function (id) {
    for (var i = 0; i < RHYTHM_OPTIONS.length; i++) {
      if (RHYTHM_OPTIONS[i].id === id) return RHYTHM_OPTIONS[i]
    }
    return null
  },

  _finish: function () {
    if (this._navigating) return
    this._navigating = true

    var self = this
    var focus = this._findFocus(this.data.selectedFocusId) || DEFAULT_FOCUS
    var assumption = this._findAssumption(this.data.selectedAssumptionId) || DEFAULT_ASSUMPTION
    var rhythm = this._findRhythm(this.data.selectedRhythmId) || DEFAULT_RHYTHM
    var intentText = (this.data.intentText || '').trim()

    var persona = focus.persona
    var personaId = focus.personaId || focus.persona
    var backendPersona = ['A', 'B', 'C', 'D'].indexOf(persona) >= 0 ? persona : 'B'

    tourStore.setStylePrefs({
      answerLength: rhythm.answerLength,
      depth: rhythm.depth,
      terminology: rhythm.terminology || 'plain',
    })
    tourStore.createLocalTourState({
      interestType: persona,
      persona: persona,
      assumption: assumption.id,
      personaId: personaId,
    })
    tourStore.setOnboardingExtras({
      intentText: intentText,
      preferredHallOrder: focus.preferredHallOrder,
      timeBudget: rhythm.id,
      focusId: focus.id,
      focusTitle: focus.title,
      focusPrompt: focus.prompt,
      assumptionText: assumption.title,
      guideModeId: rhythm.id,
      guideModeTitle: rhythm.title,
      guideModePrompt: rhythm.prompt,
    })

    self.setData({ loading: true })

    var go = function () {
      wx.redirectTo({
        url: '/pages/persona-reveal/persona-reveal?persona=' + personaId + '&assumption=' + assumption.id,
        fail: function () {
          self._navigating = false
          self.setData({ loading: false })
        },
      })
    }

    var startSession = function () {
      api.tourApi.createSession({
        interest_type: backendPersona,
        persona: backendPersona,
        assumption: assumption.id,
        guest_id: 'miniapp_guest_' + Date.now(),
      }).then(function (res) {
        if (res.ok) {
          var d = res.data || {}
          tourStore.setTourSession({
            sessionId: d.id || d.session_id || null,
            sessionToken: d.session_token || null,
          })
          tourStore.updateTourState({
            interestType: persona,
            persona: persona,
            assumption: assumption.id,
            personaId: personaId,
          })
        } else {
          var msg = (res.data && res.data.detail) || ('创建会话失败 (' + res.status + ')')
          wx.showToast({ title: msg, icon: 'none', duration: 2500 })
        }
        go()
      }).catch(function () {
        wx.showToast({ title: '网络异常，进入演示模式', icon: 'none', duration: 2000 })
        go()
      })
    }

    if (wx.nextTick) {
      wx.nextTick(startSession)
    } else {
      setTimeout(startSession, 0)
    }
  },
})
