import { useEffect } from 'react'
import { BACKGROUND_RELOAD_MS, isReloadUnsafe } from '../utils/safeReload'

const RETRY_MS = 2000

// Al volver de segundo plano tras más de 15 minutos, recarga el panel para
// tomar la versión nueva y datos frescos. Si hay algo a medias (modal abierto,
// guardado en curso, texto escrito), espera y recarga cuando esté a salvo.
// Solo se monta en el panel; los tokens no se tocan.
function useReloadOnReturn() {
  useEffect(() => {
    let hiddenAt = document.hidden ? Date.now() : null
    let pending = false
    let timer = null

    const stop = () => {
      clearInterval(timer)
      timer = null
    }

    const tryReload = () => {
      if (document.hidden || !/^\/dashboard(\/|$)/.test(window.location.pathname)) {
        stop()
        return
      }
      if (isReloadUnsafe()) {
        timer ??= setInterval(tryReload, RETRY_MS)
        return
      }
      stop()
      window.location.reload()
    }

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        stop()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= BACKGROUND_RELOAD_MS) pending = true
      hiddenAt = null
      if (pending) tryReload()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      stop()
    }
  }, [])
}

export default useReloadOnReturn
