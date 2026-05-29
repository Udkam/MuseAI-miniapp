const tourStore = require('../../store/tour')
const api       = require('../../api/index')

var MOCK_EXHIBITS = {
  '人面鱼纹盆': {
    id: 'mock-1', name: '人面鱼纹盆', category: '彩陶', era: '距今约6000年',
    hall: '出土文物陈列区',
    description: '仰韶文化半坡类型彩陶的代表作。陶盆内壁绘有两组人面与鱼纹交错的纹样，人面额头绘鱼纹，嘴角伸出鱼，充满神秘的巫术意味，是研究半坡先民精神世界的重要实物。',
  },
  '尖底瓶': {
    id: 'mock-2', name: '尖底瓶', category: '汲水陶器', era: '距今约6000年',
    hall: '出土文物陈列区',
    description: '半坡遗址最具特色的日用陶器之一。尖底设计利用水的浮力自动扶正，是新石器时代先民的巧妙发明，体现了半坡人高超的物理智慧。',
  },
}

var DEFAULT_EXHIBIT = {
  id: '', name: '', category: '展品', era: '新石器时代',
  hall: '半坡遗址', description: '关于此展品的详细介绍。',
}

Page({
  data: {
    exhibit: DEFAULT_EXHIBIT,
    loading: true,
  },

  _enterAt: 0,

  onLoad: function (options) {
    var self = this
    var id   = options.id   ? decodeURIComponent(options.id)   : ''
    var name = options.name ? decodeURIComponent(options.name) : ''

    this._enterAt = Date.now()
    wx.setNavigationBarTitle({ title: name || '展品详情' })

    if (id) {
      api.exhibitsApi.get(id).then(function (res) {
        if (res.ok && res.data) {
          var ex = api.normalizeExhibit(res.data)
          self.setData({ exhibit: ex, loading: false })
          wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
        } else {
          self._loadByName(name)
        }
      }).catch(function () { self._loadByName(name) })
    } else if (name) {
      self._loadByName(name)
    } else {
      self.setData({ exhibit: DEFAULT_EXHIBIT, loading: false })
    }
  },

  _loadByName: function (name) {
    var self = this
    if (!name) { self.setData({ exhibit: DEFAULT_EXHIBIT, loading: false }); return }
    api.exhibitsApi.search(name).then(function (res) {
      if (res.ok && res.data && res.data.exhibits && res.data.exhibits.length) {
        var best = res.data.exhibits[0]
        return api.exhibitsApi.get(best.id).then(function (dr) {
          if (dr.ok && dr.data) {
            var ex = api.normalizeExhibit(dr.data)
            self.setData({ exhibit: ex, loading: false })
            wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
          } else {
            self._useMock(name)
          }
        })
      }
      self._useMock(name)
    }).catch(function () { self._useMock(name) })
  },

  _useMock: function (name) {
    var ex = MOCK_EXHIBITS[name] || Object.assign({}, DEFAULT_EXHIBIT, { name: name || '未知展品' })
    this.setData({ exhibit: ex, loading: false })
    wx.setNavigationBarTitle({ title: ex.name || '展品详情' })
  },

  onUnload: function () {
    var duration = this._enterAt
      ? Math.max(1, Math.round((Date.now() - this._enterAt) / 1000))
      : null
    var exhibit  = this.data.exhibit
    var state    = tourStore.getTourState()
    if (state.sessionId) {
      tourStore.addTourEvent({
        eventType:       'exhibit_view',
        exhibitId:       exhibit.id   || undefined,
        hall:            exhibit.hall || state.currentHall || '',
        durationSeconds: duration,
        metadata:        { exhibit_name: exhibit.name },
      })
    }
  },

  goDeeper: function () {
    var exhibit = this.data.exhibit
    var state   = tourStore.getTourState()
    if (state.sessionId) {
      tourStore.addTourEvent({
        eventType: 'exhibit_deep_dive',
        exhibitId: exhibit.id   || undefined,
        hall:      exhibit.hall || state.currentHall || '',
        metadata:  { exhibit_name: exhibit.name },
      })
    }
    wx.navigateTo({
      url: '/pages/tour/tour?exhibit=' + encodeURIComponent(exhibit.name),
    })
  },

  goNext: function () {
    wx.navigateBack({ delta: 1 })
  },
})
