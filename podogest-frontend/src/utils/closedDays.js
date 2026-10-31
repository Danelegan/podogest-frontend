// Closed days (holidays and days closed from the panel) for the calendars.
// Public endpoint, read per visible month and cached for the session; the
// panel invalidates the cache after closing or opening a day.
import { useEffect, useState } from 'react'
import API_BASE_URL from '../config/api'
import { formatDate, monthKey } from './schedule'

const CLOSED_URL = `${API_BASE_URL}/api/calendario/cerrados/`

// monthKey -> Promise<{ "YYYY-MM-DD": motivo }>.
const cache = new Map()
let version = 0
const listeners = new Set()

// After closing or opening a day: every mounted calendar reloads its month.
export function invalidateClosedDays() {
  cache.clear()
  version += 1
  listeners.forEach((listener) => listener(version))
}

// { "2026-11-01": "Feriado: Día de Todos los Santos" } for that month ('' when
// it was closed without a reason). Sundays are not included: the calendars
// already disable them. On error, {}: the backend still rejects closed days.
function loadMonth(month) {
  const key = monthKey(month)
  if (!cache.has(key)) {
    const { year, monthIndex } = month
    const lastDay = new Date(year, monthIndex + 1, 0).getDate()
    const params = new URLSearchParams({
      desde: formatDate(year, monthIndex, 1),
      hasta: formatDate(year, monthIndex, lastDay),
    })
    const request = fetch(`${CLOSED_URL}?${params}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data) =>
        Object.fromEntries(
          (Array.isArray(data) ? data : [])
            .filter((item) => typeof item?.fecha === 'string')
            .map((item) => [item.fecha, typeof item.motivo === 'string' ? item.motivo : '']),
        ),
      )
      .catch(() => {
        cache.delete(key) // try again next time
        return {}
      })
    cache.set(key, request)
  }
  return cache.get(key)
}

// Closed days of `month` ({ year, monthIndex } or null), reloaded when the
// month changes or the panel invalidates the cache.
export function useClosedDays(month) {
  const key = month ? monthKey(month) : null
  const [currentVersion, setCurrentVersion] = useState(version)
  const [loaded, setLoaded] = useState({ key: null, days: {} })

  useEffect(() => {
    listeners.add(setCurrentVersion)
    return () => listeners.delete(setCurrentVersion)
  }, [])

  useEffect(() => {
    if (key == null) return undefined
    let isActive = true
    loadMonth({ year: Math.floor(key / 12), monthIndex: key % 12 }).then((days) => {
      if (isActive) setLoaded({ key, days })
    })
    return () => {
      isActive = false
    }
  }, [key, currentVersion])

  // Until the month arrives, nothing is marked (the old month is not shown).
  return loaded.key === key ? loaded.days : {}
}

// "Feriado: Navidad" -> "Feriado (Navidad)", for "…, cerrado: Feriado (Navidad)".
export const spokenClosedReason = (reason) => String(reason ?? '').replace(/^Feriado: (.+)$/, 'Feriado ($1)')
