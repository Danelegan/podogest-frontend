import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../utils/auth'
import { formatWeekdayDate } from '../utils/schedule'
import {
  BLOCK_CONNECTION_MESSAGE,
  BLOCK_TIMEOUT_MESSAGE,
  BLOCK_TIMEOUT_MS,
  BLOCKS_LOAD_MESSAGE,
  BLOCKS_URL,
  blockFailureMessage,
  collectMessages,
  fetchBlocks,
  normalizeBlock,
  readJson,
} from '../utils/blocks'

// Todo el estado va junto y atado a la fecha: si la fecha cambia, el estado se
// reinicia y cualquier respuesta tardía de la fecha anterior se descarta.
const freshState = (date) => ({
  date,
  blocks: [],
  ready: false,
  error: '',
  // Por hora ("11:30"): acción en curso y último mensaje.
  busy: {},
  messages: {},
  // Texto para un aviso de voz (aria-live) tras bloquear o liberar.
  announcement: '',
})

const without = (map, key) => Object.fromEntries(Object.entries(map).filter(([item]) => item !== key))

// Bloqueos de horas de UN día ("YYYY-MM-DD"): carga, bloquear, liberar y sus mensajes.
// - `enabled`: solo se cargan cuando es true (la pestaña está a la vista).
// - `onSessionExpired()`: 401 en cualquier petición.
// - `onReloadAppointments()`: se llama tras un 400/409 al bloquear (puede haber una
//   cita nueva en esa hora); su promesa se espera.
// Cada acción captura la fecha al tocarla: una respuesta tardía nunca escribe en otro día.
export default function useDayBlocks(date, { enabled = true, onSessionExpired, onReloadAppointments } = {}) {
  const [state, setState] = useState(() => freshState(date))
  // Sube tras cada acción terminada: otras listas (próximos bloqueos) se releen.
  const [changeCount, setChangeCount] = useState(0)
  // Una acción a la vez por día y hora ("2026-10-25 11:30"): evita el doble toque.
  const busyRef = useRef(new Set())

  // Últimos manejadores, sin que cambien las funciones de abajo en cada render.
  const handlersRef = useRef({ onSessionExpired, onReloadAppointments })
  useEffect(() => {
    handlersRef.current = { onSessionExpired, onReloadAppointments }
  })

  // Cambió la fecha (p. ej. pasó la medianoche): se parte de cero.
  if (state.date !== date) setState(freshState(date))
  const view = state.date === date ? state : freshState(date)

  // Aplica un cambio solo si el estado sigue siendo de ese día.
  const patch = useCallback(
    (day, change) => setState((prev) => (prev.date === day ? { ...prev, ...change(prev) } : prev)),
    [],
  )

  const setMessage = (day, time, message) =>
    patch(day, (prev) => {
      if (!message) return time in prev.messages ? { messages: without(prev.messages, time) } : {}
      return { messages: { ...prev.messages, [time]: message } }
    })

  const announce = (day, time, outcome) =>
    patch(day, () => ({ announcement: `La hora de las ${time} del ${formatWeekdayDate(day)} ${outcome}.` }))

  // Aplica la respuesta de fetchBlocks. Devuelve la lista, o null si falló.
  const applyResult = useCallback(
    (day, result) => {
      if (result.status === 'unauthorized') {
        handlersRef.current.onSessionExpired?.()
        return null
      }
      if (result.status === 'error') {
        patch(day, () => ({ error: BLOCKS_LOAD_MESSAGE }))
        return null
      }
      patch(day, () => ({ blocks: result.blocks, error: '', ready: true }))
      return result.blocks
    },
    [patch],
  )

  const refresh = async (day) => applyResult(day, await fetchBlocks(day))

  // Se lee al activarse y cada vez que cambia la fecha; lo anterior se aborta.
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    fetchBlocks(date, controller.signal).then((result) => {
      if (!controller.signal.aborted) applyResult(date, result)
    })
    return () => controller.abort()
  }, [enabled, date, applyResult])

  // Una acción por hora a la vez, con límite de 20 s y sin reintento automático.
  const runRequest = async (day, time, request) => {
    const busyKey = `${day} ${time}`
    if (busyRef.current.has(busyKey)) return
    busyRef.current.add(busyKey)
    patch(day, (prev) => ({ busy: { ...prev.busy, [time]: true }, announcement: '' }))
    setMessage(day, time, null)

    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), BLOCK_TIMEOUT_MS)
    try {
      await request(timeout.signal)
    } catch {
      const timedOut = timeout.signal.aborted
      setMessage(day, time, {
        kind: 'error',
        text: timedOut ? BLOCK_TIMEOUT_MESSAGE : BLOCK_CONNECTION_MESSAGE,
      })
      // Sin saber si llegó a guardarse: se vuelve a leer lo que tiene el servidor.
      if (timedOut) refresh(day)
    } finally {
      clearTimeout(timeoutId)
      busyRef.current.delete(busyKey)
      patch(day, (prev) => ({ busy: without(prev.busy, time) }))
      setChangeCount((count) => count + 1)
    }
  }

  // Bloquea la franja de ese día a esa hora.
  const blockSlot = (time) => {
    const day = date
    return runRequest(day, time, async (signal) => {
      const response = await authFetch(BLOCKS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: day, hora: time }),
        signal,
      })
      if (response.status === 401) {
        handlersRef.current.onSessionExpired?.()
        return
      }
      const data = await readJson(response)

      if (response.ok) {
        const created = normalizeBlock(data)
        if (created) {
          patch(day, (prev) => ({ blocks: [...prev.blocks.filter((block) => block.id !== created.id), created] }))
        }
        await refresh(day)
        announce(day, time, 'quedó bloqueada')
        return
      }

      if (response.status === 400 || response.status === 409) {
        // Ya hay una cita, o ya estaba bloqueada: se lee de nuevo qué hay.
        const [loaded] = await Promise.all([refresh(day), handlersRef.current.onReloadAppointments?.()])
        if (loaded?.some((block) => block.time === time)) {
          setMessage(day, time, { kind: 'notice', text: 'Esa hora ya estaba bloqueada.' })
        } else {
          setMessage(day, time, {
            kind: 'error',
            text:
              collectMessages(data).join(' ') ||
              'No se pudo bloquear esa hora. Revisa la agenda antes de volver a intentarlo.',
          })
        }
        return
      }

      setMessage(day, time, { kind: 'error', text: blockFailureMessage(response.status) })
    })
  }

  // Libera un bloqueo. 404: ya no existía, la fila se actualiza sin error.
  const releaseSlot = (block) => {
    const day = date
    return runRequest(day, block.time, async (signal) => {
      const response = await authFetch(`${BLOCKS_URL}${block.id}/`, { method: 'DELETE', signal })
      if (response.status === 401) {
        handlersRef.current.onSessionExpired?.()
        return
      }
      if (response.ok || response.status === 404) {
        patch(day, (prev) => ({ blocks: prev.blocks.filter((item) => item.id !== block.id) }))
        await refresh(day)
        announce(day, block.time, 'quedó libre')
        return
      }
      const explained = response.status === 400 || response.status === 409
      const data = explained ? await readJson(response) : null
      setMessage(day, block.time, {
        kind: 'error',
        text: (explained && collectMessages(data).join(' ')) || blockFailureMessage(response.status),
      })
      if (explained) refresh(day)
    })
  }

  // Vuelve a "sin cargar" (por ejemplo, al salir de una vista que pudo cambiar este día).
  const invalidate = () => setState(freshState(date))

  return {
    blocks: view.blocks,
    blocksReady: view.ready,
    blocksError: view.error,
    blockBusy: view.busy,
    blockMessages: view.messages,
    announcement: view.announcement,
    changeCount,
    blockSlot,
    releaseSlot,
    invalidate,
  }
}
