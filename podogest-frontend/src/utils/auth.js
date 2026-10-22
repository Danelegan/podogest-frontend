import API_BASE_URL from '../config/api'

const REFRESH_URL = `${API_BASE_URL}/api/token/refresh/`
const LOGOUT_URL = `${API_BASE_URL}/api/logout/`
const ACCESS_KEY = 'podogest_token'
const REFRESH_KEY = 'podogest_refresh'
const REFRESH_LOCK = 'podogest-token-refresh'
const REFRESH_TIMEOUT_MS = 15000
const LOGOUT_TIMEOUT_MS = 8000

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.'
export const SESSION_EXPIRED_UNSAVED_MESSAGE =
  'Tu sesión expiró. Copia o anota tus cambios y vuelve a iniciar sesión.'

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY)

export function saveTokens(access, refresh) {
  localStorage.setItem(ACCESS_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// The logout endpoint is public: it only needs the refresh token to revoke.
const postLogout = (refresh, options) =>
  fetch(LOGOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
    ...options,
  })

// Best effort, not awaited: invalidates a refresh token nobody will use.
// keepalive lets it finish even if the page navigates away.
function revokeRefresh(refresh) {
  postLogout(refresh, { keepalive: true }).catch(() => {})
}

// Lets a caller stop waiting (its timeout or unmount) without cancelling a
// renewal that other requests share.
function untilAborted(promise, signal) {
  if (!signal) return promise
  const abortError = () => new DOMException('Aborted', 'AbortError')
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

// Runs inside the cross-tab lock. localStorage is shared by every tab, so if the
// stored access token is no longer the one that failed, another request or tab
// already renewed it (or the session was closed): use that instead of spending
// the refresh token, which the backend invalidates on each rotation.
async function renew(failedAccess) {
  const current = getAccessToken()
  if (current !== failedAccess) return current

  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return null

  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(), REFRESH_TIMEOUT_MS)
  try {
    const response = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
      signal: timeout.signal,
    })
    // Expired, rotated or revoked refresh token: the session is over.
    if (response.status === 400 || response.status === 401) return null
    // Server or network trouble is not an expired session: keep the tokens.
    if (!response.ok) throw new Error(`Token refresh failed (${response.status})`)

    const data = await response.json()
    if (!data?.access) throw new Error('Token refresh returned no access token')
    // The session was closed while renewing (logout here or in another tab):
    // don't bring the tokens back, and revoke the refresh just issued.
    if (localStorage.getItem(REFRESH_KEY) !== refresh) {
      if (data.refresh) revokeRefresh(data.refresh)
      return null
    }
    saveTokens(data.access, data.refresh)
    return data.access
  } catch (error) {
    // Its own deadline must not look like the caller's AbortError, which
    // callers treat as an unmount and ignore.
    if (timeout.signal.aborted) throw new Error('Token refresh timed out', { cause: error })
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Web Locks keeps tabs from renewing in parallel with the same refresh token;
// where it is missing, renewals are still shared within this tab.
const withRefreshLock = (task) =>
  navigator.locks?.request ? navigator.locks.request(REFRESH_LOCK, task) : task()

let pendingRefresh = null

// Concurrent 401s in this tab share one renewal. Resolves to the new access
// token, or null when the session can't be renewed.
export function refreshAccessToken(failedAccess) {
  if (!pendingRefresh) {
    pendingRefresh = withRefreshLock(() => renew(failedAccess)).finally(() => {
      pendingRefresh = null
    })
  }
  return pendingRefresh
}

// fetch with the access token. On a 401 it renews the token once and repeats
// the request; a 401 here means it was rejected before being processed, so the
// repeat is safe even for a POST. Without an access token it renews before
// sending. A 401 coming back from authFetch (real, or made up when nothing was
// sent) means the session expired.
export async function authFetch(url, options = {}) {
  const send = (token) =>
    fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    })

  const token = getAccessToken()
  // Without an access token, skip the request bound to fail and renew first;
  // with no refresh token either, renew resolves to null without a request.
  const response = token ? await send(token) : null
  if (response && response.status !== 401) return response

  const renewed = await untilAborted(refreshAccessToken(token), options.signal)
  const retried = renewed
    ? await send(renewed)
    : response ?? new Response(null, { status: 401 })
  // Only remove the tokens this request used: another tab may have signed in
  // meanwhile, and its new session must survive.
  const stored = getAccessToken()
  if (retried.status === 401 && (stored === (renewed ?? token) || stored === null)) clearTokens()
  return retried
}

// Revokes the refresh token on the backend, then removes both tokens. If the
// backend can't be reached in time, the tokens are removed anyway.
export async function logout() {
  const refresh = localStorage.getItem(REFRESH_KEY)
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(), LOGOUT_TIMEOUT_MS)

  try {
    if (refresh) await postLogout(refresh, { signal: timeout.signal })
  } catch {
    // Offline or timed out: nothing else to do but forget the tokens.
  } finally {
    clearTimeout(timeoutId)
    // A renewal that finished meanwhile rotated the refresh token: revoke the
    // new one too. Renewals finishing after this are handled in renew.
    const current = localStorage.getItem(REFRESH_KEY)
    if (current && current !== refresh) revokeRefresh(current)
    clearTokens()
  }
}
