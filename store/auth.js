/**
 * store/auth.js — Authentication state (no Vue reactivity)
 *
 * Thin wrapper around utils/storage.  All auth state lives in wx.storage
 * so it survives page reloads and app restarts.  Pages read state by calling
 * getAuthState() and writing into their own data via setData().
 */

const storage = require('../utils/storage')

/**
 * Read the current auth state from persistent storage.
 * @returns {{ token: string|null, user: object|null, userRole: string|null }}
 */
function getAuthState() {
  return {
    token:    storage.getToken(),
    user:     storage.get(storage.KEYS.USER, null),
    userRole: storage.get(storage.KEYS.USER_ROLE, null),
  }
}

/**
 * Persist auth credentials after a successful login.
 * @param {{ token: string, user: object, role: string }} param
 */
function setAuth({ token, user, role }) {
  storage.setToken(token || null)

  if (user) {
    storage.set(storage.KEYS.USER, user)
  } else {
    storage.remove(storage.KEYS.USER)
  }

  if (role) {
    storage.set(storage.KEYS.USER_ROLE, role)
  } else {
    storage.remove(storage.KEYS.USER_ROLE)
  }
}

/**
 * Wipe all auth + tour state (called on logout or 401).
 */
function clearAuth() {
  storage.clearAuth()
}

/**
 * @returns {boolean}
 */
function isLoggedIn() {
  return !!storage.getToken()
}

/**
 * @returns {boolean}
 */
function isAdmin() {
  return storage.get(storage.KEYS.USER_ROLE, null) === 'admin'
}

/**
 * @returns {string|null}
 */
function getToken() {
  return storage.getToken()
}

module.exports = {
  getAuthState,
  setAuth,
  clearAuth,
  isLoggedIn,
  isAdmin,
  getToken,
}
