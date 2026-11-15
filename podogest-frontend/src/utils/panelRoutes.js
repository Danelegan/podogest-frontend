// Vistas del panel que se pueden abrir con /dashboard?vista=... (atajos de la
// app instalada) y rutas de retorno tras iniciar sesión.

const PANEL_VIEWS = ['agenda', 'citas', 'cerrados', 'resumen', 'bloqueos']

// Devuelve la vista pedida en la URL, o null si falta o no es válida.
export function panelViewFromSearch(search) {
  const value = new URLSearchParams(search).get('vista')
  return PANEL_VIEWS.includes(value) ? value : null
}

// Ruta interna a la que volver tras el login. Solo se aceptan rutas del panel
// (/dashboard con su ?vista=): cualquier otra cosa, y en especial una URL
// externa, devuelve null y el login usa /dashboard.
export function safeReturnPath(value) {
  if (typeof value !== 'string' || value.length > 200 || !value.startsWith('/dashboard')) return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || url.pathname !== '/dashboard') return null
    const vista = panelViewFromSearch(url.search)
    return vista ? `/dashboard?vista=${vista}` : '/dashboard'
  } catch {
    return null
  }
}
