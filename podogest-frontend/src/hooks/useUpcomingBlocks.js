import { useEffect, useState } from 'react'
import { fetchBlocksRange } from '../utils/blocks'
import { addDays } from '../utils/schedule'

// Días hacia adelante que cubre la lista (desde mañana).
export const UPCOMING_DAYS = 60

// [{ date: "2026-11-18", times: ["10:00", "11:30"] }], por fecha y hora.
function groupByDate(blocks) {
  const groups = new Map()
  for (const block of [...blocks].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))) {
    if (!groups.has(block.date)) groups.set(block.date, [])
    groups.get(block.date).push(block.time)
  }
  return [...groups].map(([date, times]) => ({ date, times }))
}

// Próximos bloqueos (de mañana a UPCOMING_DAYS días) agrupados por fecha.
// - `today`: hoy en Chile; si cambia, se vuelve a cargar con el rango nuevo.
// - `refreshKey`: al cambiar (tras bloquear o liberar) se relee sin vaciar la lista.
// - `onSessionExpired()`: 401.
// Devuelve { groups, status: 'loading' | 'ok' | 'error', retry }.
export default function useUpcomingBlocks(today, { enabled = true, refreshKey = 0, onSessionExpired } = {}) {
  const from = addDays(today, 1)
  const to = addDays(today, UPCOMING_DAYS)
  const [attempt, setAttempt] = useState(0)
  // El resultado va atado a su rango: uno de otro rango no se muestra.
  const [state, setState] = useState({ from: '', groups: [], status: 'loading' })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    fetchBlocksRange(from, to, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthorized') {
        onSessionExpired?.()
        return
      }
      setState((prev) =>
        result.status === 'ok'
          ? { from, groups: groupByDate(result.blocks), status: 'ok' }
          : // Con datos previos se conservan; solo se avisa del fallo.
            { from, groups: prev.from === from ? prev.groups : [], status: 'error' },
      )
    })
    return () => controller.abort()
    // onSessionExpired cambia en cada render del padre y no debe relanzar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, from, to, refreshKey, attempt])

  const current = state.from === from
  return {
    groups: current ? state.groups : [],
    status: current ? state.status : 'loading',
    retry: () => setAttempt((count) => count + 1),
  }
}
