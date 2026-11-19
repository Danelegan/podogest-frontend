// Cuenta las peticiones del panel que van en vuelo (authFetch). Lo lee la
// recarga automática para no cortar un guardado, una descarga o una
// renovación de sesión. Módulo mínimo: no depende de nada más.
let inFlight = 0

export function beginRequest() {
  inFlight += 1
  let finished = false
  return () => {
    if (finished) return
    finished = true
    inFlight -= 1
  }
}

export const hasPendingRequests = () => inFlight > 0
