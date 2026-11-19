import { hasPendingRequests } from './pendingRequests'
import './safeReload.css'

// Recargas automáticas del panel (/login y /dashboard). Nunca tocan los tokens:
// viven en localStorage y una recarga no los borra.

const CHUNK_RELOAD_KEY = 'podogest_chunk_reload'
const CHUNK_RELOAD_WINDOW_MS = 30000

export const BACKGROUND_RELOAD_MS = 15 * 60 * 1000

const isPanelPath = () => /^\/(login|dashboard)(\/|$)/.test(window.location.pathname)

const TEXT_FIELD =
  'textarea, input:not([type="button"], [type="submit"], [type="checkbox"], [type="radio"], [type="hidden"])'

// ¿Hay algo que una recarga haría perder? Se mira lo que está a la vista, no el
// estado interno de cada componente, para que sirva con cualquier modal futuro.
// - Cualquier diálogo abierto: la ficha clínica, la atención manual, etc. (los
//   modales usan role="dialog"). La ficha además avisa con beforeunload cuando
//   hay cambios sin guardar; mientras esté abierta, no se recarga.
// - Una petición en curso (guardado, cambio de estado, descarga, renovación).
// - Un campo de texto con foco y contenido (algo a medio escribir).
export function isReloadUnsafe() {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true
  if (hasPendingRequests()) return true
  const active = document.activeElement
  return active instanceof HTMLElement && active.matches(TEXT_FIELD) && active.value !== ''
}

function showChunkNotice() {
  if (document.getElementById('app-reload-notice')) return
  const notice = document.createElement('div')
  notice.id = 'app-reload-notice'
  notice.className = 'app-reload-notice'
  notice.setAttribute('role', 'alert')

  const text = document.createElement('p')
  text.textContent =
    'No pudimos cargar una parte del panel. Revisa tu conexión e inténtalo de nuevo. Tu sesión sigue abierta.'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Reintentar'
  button.addEventListener('click', () => window.location.reload())

  notice.append(text, button)
  document.body.append(notice)
  button.focus()
}

// Un chunk que ya no existe (deploy nuevo con la pestaña abierta): se recarga
// UNA vez. Si falla otra vez dentro de la ventana, no hay bucle: se avisa.
function handlePreloadError(event) {
  if (!isPanelPath()) return // la landing y /reservar conservan su comportamiento

  let last
  try {
    last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
  } catch {
    // Sin sessionStorage no se puede llevar la marca: se avisa en vez de arriesgar un bucle.
    last = Date.now()
  }

  event.preventDefault()
  if (Date.now() - last < CHUNK_RELOAD_WINDOW_MS) {
    showChunkNotice()
    return
  }
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // El caso sin sessionStorage ya se resolvió arriba.
  }
  window.location.reload()
}

export function registerChunkReload() {
  window.addEventListener('vite:preloadError', handlePreloadError)
}
