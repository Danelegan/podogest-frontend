import API_BASE_URL from '../../config/api'
import { authFetch } from '../../utils/auth'
import { readJson } from '../../utils/blocks'

const VALES_URL = `${API_BASE_URL}/api/vales/`
const REQUEST_TIMEOUT_MS = 20000

// Una llamada a /api/vales/<path> con la sesión del panel. Nunca lanza:
//  { ok, status, data, retryAfter }  respuesta del servidor
//  { network: true }                 sin conexión o sin respuesta a tiempo
//  { aborted: true }                 la pantalla se cerró y canceló la llamada
// `path` termina en barra (""  = la lista). Los 401 los maneja authFetch (renueva
// la sesión una vez); si aun así llega un 401, la pantalla manda al login.
// No se registra nada en consola: las respuestas traen códigos y saldos.
export async function valesRequest(path, { method = 'GET', body, signal } = {}) {
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => timeout.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    const hasBody = body !== undefined
    const response = await authFetch(`${VALES_URL}${path}`, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    })
    const data = await readJson(response)
    const retryAfter = Number(response.headers.get('Retry-After')) || null
    return { ok: response.ok, status: response.status, data, retryAfter }
  } catch {
    return signal?.aborted ? { aborted: true } : { network: true }
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}
