Page({
  data: {
    step: 0,
    answers: [null, null, null],
    canNext: false,
    questions: [
      {
        text: '你更像哪种探索者？',
        options: [
          { key: 'A', label: '发掘者', desc: '喜欢深挖细节，不放过每一件器物' },
          { key: 'B', label: '生活者', desc: '感受半坡先民的日常烟火' },
          { key: 'C', label: '传授者', desc: '系统梳理，带走历史全貌' },
        ],
      },
      {
        text: '你最感兴趣的展品类型？',
        options: [
          { key: 'A', label: '陶器与工具', desc: '人面鱼纹盆、石斧、骨针' },
          { key: 'B', label: '住宅与聚落', desc: '半穴居复原、储粮窖穴' },
          { key: 'C', label: '历史与考古', desc: '文化分期、遗址发掘史' },
        ],
      },
      {
        text: '你理想的参观节奏？',
        options: [
          { key: 'A', label: '深度品味', desc: '放慢脚步，每件文物都细细看' },
          { key: 'B', label: '自由漫步', desc: '随感而发，走到哪聊到哪' },
          { key: 'C', label: '全面覆盖', desc: '按路线系统参观，不留遗漏' },
        ],
      },
    ],
  },

  selectOption: function (e) {
    var key = e.currentTarget.dataset.key
    var answers = this.data.answers.slice()
    answers[this.data.step] = key
    this.setData({ answers: answers, canNext: true })
  },

  goNext: function () {
    if (!this.data.canNext) return
    var nextStep = this.data.step + 1
    if (nextStep < 3) {
      this.setData({
        step: nextStep,
        canNext: !!this.data.answers[nextStep],
      })
    } else {
      this._finish()
    }
  },

  _finish: function () {
    var answers = this.data.answers
    var counts = { A: 0, B: 0, C: 0 }
    answers.forEach(function (v) { if (v) counts[v]++ })
    var persona = 'A'
    if (counts.B >= counts.A && counts.B >= counts.C) persona = 'B'
    if (counts.C > counts.B && counts.C > counts.A) persona = 'C'
    wx.navigateTo({ url: '/pages/persona-reveal/persona-reveal?persona=' + persona })
  },
})
