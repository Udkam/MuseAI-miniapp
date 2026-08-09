var tourStore = require('../../store/tour')
var api       = require('../../api/index')
var preload   = require('../../utils/preload')
var tourSync  = require('../../utils/tour-sync')
var resumeRoute = require('../../utils/resume-route')
var tourSession = require('../../utils/tour-session')
var storage = require('../../utils/storage')

Page({
  data: {
    hasTourSession: false,
    resumeHallName: '',
    aiConversationCount: 0,
    starting:       false,  // debounce goQuickStart
    resuming:       false,
  },

  _resumeRequestSeq: 0,
  _resumeInFlight: false,
  _resumeNavigationInFlight: false,
  _resumeNavigationSeq: 0,

  onShow: function () {
    var state = tourStore.getTourState()
    var canResume = tourStore.hasResumableConversation
      ? tourStore.hasResumableConversation()
      : false
    var lastAnsweredHallName = canResume && tourStore.getLastAnsweredHallDisplayName
      ? tourStore.getLastAnsweredHallDisplayName()
      : ''
    this.setData({
      hasTourSession: canResume,
      resumeHallName: canResume ? lastAnsweredHallName : '',
      aiConversationCount: state.aiConversationCount || 0,
    })
    this._preloadNext()
  },

  _preloadNext: function () {
    preload.preloadPages([
      '/pages/onboarding/onboarding',
      '/pages/hall/hall',
      '/pages/persona-reveal/persona-reveal',
      '/pages/route/route',
    ], 120)
    preload.preloadImages(preload.ENTRY_ICON_ASSETS.concat(preload.HALL_ICON_ASSETS), 160)
  },

  goOnboarding: function () {
    this._invalidateResumeRequest()
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  // Skip all onboarding: use the default persona and create a backend session.
  goQuickStart: function () {
    if (this.data.starting) return
    var self = this
    self._invalidateResumeRequest()
    self.setData({ starting: true })

    tourStore.setStylePrefs({ answerLength: 'balanced', depth: 'standard', terminology: 'plain' })
    tourStore.createLocalTourState({ interestType: 'default', persona: 'default', assumption: 'D', personaId: 'default' })
    tourStore.setOnboardingExtras({
      intentText:         '',
      preferredHallOrder: [],
      timeBudget:         null,
      focusId:            'default',
      focusTitle:         '默认参观',
      focusPrompt:        '请按普通游客第一次参观的节奏，先建立整体印象，再给出最值得看的重点。',
      assumptionText:     '先不下判断，跟证据走',
      guideModeId:        'default',
      guideModeTitle:     '默认讲解',
      guideModePrompt:    '用户是直接开始的游客，请用清晰、友好、不过度学术的方式讲重点。',
    })

    // Navigation is immediate; the hall page and this continuation share one
    // deduplicated session bootstrap. Failed creation leaves the full local
    // snapshot queued, and the tour page retries before the first chat.
    wx.navigateTo({
      url: '/pages/hall/hall',
      fail: function () { self.setData({ starting: false }) },
    })

    tourSession.ensureTourSession().then(function (res) {
      self.setData({ starting: false })
      if (res.ok) {
        tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
      } else {
        console.warn('[home] default guest session remains queued for retry:', res.status)
      }
    })
  },

  _invalidateResumeRequest: function () {
    this._resumeRequestSeq += 1
    this._resumeInFlight = false
    this._resumeNavigationInFlight = false
    this._resumeNavigationSeq = 0
    if (this.data.resuming) this.setData({ resuming: false })
  },

  _beginResumeRequest: function (state) {
    var snapshot = state || tourStore.getTourState()
    var localTourId = snapshot.localTourId || (
      tourStore.ensureLocalTourId ? tourStore.ensureLocalTourId() : null
    )
    snapshot = tourStore.getTourState()
    var owner = {
      requestSeq: ++this._resumeRequestSeq,
      localTourId: localTourId || snapshot.localTourId || null,
      sessionId: snapshot.sessionId || null,
      sessionToken: snapshot.sessionToken || null,
      resumeUrl: resumeRoute.buildResumeUrl(snapshot),
    }
    this._resumeInFlight = true
    this.setData({ resuming: true })
    return owner
  },

  _isResumeGenerationCurrent: function (owner) {
    if (!owner || owner.requestSeq !== this._resumeRequestSeq) return false
    var current = tourStore.getTourState()
    return !owner.localTourId || current.localTourId === owner.localTourId
  },

  _isResumeSourceCurrent: function (owner) {
    if (!this._isResumeGenerationCurrent(owner)) return false
    var current = tourStore.getTourState()
    return current.sessionId === owner.sessionId && current.sessionToken === owner.sessionToken
  },

  _finishResumeRequest: function (owner) {
    if (!owner || owner.requestSeq !== this._resumeRequestSeq) return
    this._resumeInFlight = false
    if (!this._resumeNavigationInFlight && this.data.resuming) this.setData({ resuming: false })
  },

  _finishResumeNavigation: function (owner) {
    if (!owner || owner.requestSeq !== this._resumeNavigationSeq) return
    this._resumeNavigationInFlight = false
    this._resumeNavigationSeq = 0
    if (this.data.resuming) this.setData({ resuming: false })
  },

  _navigateResumedTour: function (owner) {
    if (!this._isResumeGenerationCurrent(owner) || this._resumeNavigationInFlight) return false
    var self = this
    this._resumeNavigationInFlight = true
    this._resumeNavigationSeq = owner.requestSeq
    if (!this.data.resuming) this.setData({ resuming: true })
    try {
      wx.navigateTo({
        url: owner.resumeUrl,
        fail: function () {
          if (owner.requestSeq === self._resumeNavigationSeq) self._invalidateResumeRequest()
        },
        complete: function () {
          self._finishResumeNavigation(owner)
        },
      })
    } catch (err) {
      self._invalidateResumeRequest()
      return false
    }
    return true
  },

  _updateResumeActivity: function (owner, payload) {
    if (!this._isResumeSourceCurrent(owner)) return false
    var usedServerActivity = storage.updateTourSessionActivity
      ? storage.updateTourSessionActivity(payload || {})
      : false
    if (!usedServerActivity && storage.touchTourSession) storage.touchTourSession()
    return true
  },

  _notifyResumedPage: function (owner, payload) {
    if (!this._isResumeGenerationCurrent(owner) || typeof getCurrentPages !== 'function') return false
    var pages = getCurrentPages() || []
    var currentPage = pages.length ? pages[pages.length - 1] : null
    if (!currentPage || currentPage.route !== 'pages/tour/tour' ||
        typeof currentPage._applyBackgroundResumeState !== 'function') return false
    return currentPage._applyBackgroundResumeState({
      localTourId: owner.localTourId || null,
      sessionId: owner.sessionId || null,
      payload: payload || {},
    }) !== false
  },

  resumeTour: function () {
    if (this._resumeInFlight || this._resumeNavigationInFlight || this.data.resuming) return
    var hasConversation = tourStore.hasResumableConversation
      ? tourStore.hasResumableConversation()
      : false
    if (!hasConversation) {
      this.setData({ hasTourSession: false })
      wx.showToast({ title: '当前没有可继续的对话', icon: 'none' })
      return
    }
    var hasSession = tourStore.hasResumableTourSession(0)
    var canRecoverSession = tourStore.hasRecoverableTourState
      ? tourStore.hasRecoverableTourState()
      : false
    if (!hasSession && !canRecoverSession) {
      this.setData({ hasTourSession: false })
      wx.showToast({ title: '当前没有可继续的导览', icon: 'none' })
      return
    }
    var self = this
    var state = tourStore.getTourState()
    var owner = this._beginResumeRequest(state)
    if (!self._navigateResumedTour(owner)) {
      self._finishResumeRequest(owner)
      return
    }
    if (!hasSession && canRecoverSession) {
      // Preserve page-first navigation during local recovery. Destination
      // pages share the same deduplicated bootstrap and retry before AI calls.
      tourSession.ensureTourSession().then(function (created) {
        if (self._isResumeGenerationCurrent(owner) && created && created.ok) {
          tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
        }
      }).catch(function (err) {
        if (self._isResumeGenerationCurrent(owner)) {
          console.warn('[home] guest-session recovery remains queued:', err)
        }
      }).then(function () {
        self._finishResumeRequest(owner)
      }, function () {
        self._finishResumeRequest(owner)
      })
      return
    }
    api.tourApi.getSession(owner.sessionId, owner.sessionToken, {
      skipActivityUpdate: true,
      expectedSessionId: owner.sessionId,
      expectedSessionToken: owner.sessionToken,
    })
      .then(function (res) {
        if (!self._isResumeSourceCurrent(owner)) return null
        if (res && res.ok) {
          self._updateResumeActivity(owner, res.data)
          if (res.data && tourStore.applyServerResumeState) {
            tourStore.applyServerResumeState(res.data)
          }
          self._notifyResumedPage(owner, res.data || {})
        } else if (
          res &&
          tourSession.isRecoverableSessionStatus &&
          tourSession.isRecoverableSessionStatus(res.status)
        ) {
          return tourSession.recoverTourSession(owner.sessionId, owner.localTourId).then(function (created) {
            if (!self._isResumeGenerationCurrent(owner)) return null
            var current = tourStore.getTourState()
            if (
              created && created.ok && created.sessionId &&
              current.sessionId === created.sessionId
            ) {
              tourSync.queueSessionSnapshot({}, { defer: true, maxAttempts: 3 })
            }
            return created
          })
        }
        tourSync.flushPendingSessionSync({ maxAttempts: 3 })
        return res
      })
      .catch(function (err) {
        // Local persisted state remains a valid same-device fallback.
        if (self._isResumeSourceCurrent(owner)) {
          console.warn('[home] server resume unavailable; using local snapshot:', err)
        }
      })
      .then(function () {
        self._finishResumeRequest(owner)
      }, function () {
        self._finishResumeRequest(owner)
      })
  },
})
