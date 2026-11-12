// Bloqueos de horas de la agenda: URL, lectura de datos, errores y la línea
// de tiempo del día. Sin estado de React; lo usan Dashboard y DailyAgenda.
import API_BASE_URL from '../config/api'
import { authFetch } from './auth'
import { SLOT_MINUTES, slotsForDate, toMinutes } from './schedule'

export const BLOCKS_URL = `${API_BASE_URL}/api/bloqueos/`
export const BLOCK_TIMEOUT_MS = 20000
export const BLOCK_TIMEOUT_MESSAGE =
  'No se pudo confirmar el cambio. Revisa la agenda antes de volver a intentarlo.'
export const BLOCKS_LOAD_MESSAGE =
  'No se pudieron cargar los bloqueos de hoy. Las horas bloqueadas podrían verse como libres.'

// DRF manda { campo: ["msg"] }, { detail: "msg" } o una lista; quedan solo los textos.
export function collectMessages(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages)
  return []
}

export const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const formatMinutes = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

// { id, fecha, hora, hora_fin } -> { id, date, time: "11:30", endTime: "13:00" }.
// null si no trae id y hora (no se inventa un bloqueo).
export function normalizeBlock(raw) {
  if (raw?.id == null || typeof raw.hora !== 'string') return null
  const time = raw.hora.slice(0, 5)
  const endTime =
    typeof raw.hora_fin === 'string'
      ? raw.hora_fin.slice(0, 5)
      : formatMinutes(toMinutes(time) + SLOT_MINUTES)
  return { id: raw.id, date: raw.fecha ?? '', time, endTime }
}

export const normalizeBlocks = (data) =>
  (Array.isArray(data) ? data : (data?.results ?? [])).map(normalizeBlock).filter(Boolean)

// Bloqueos de un día. { status: 'ok', blocks } | { status: 'unauthorized' } | { status: 'error' }.
export async function fetchBlocks(date, signal) {
  try {
    const params = new URLSearchParams({ desde: date, hasta: date })
    const response = await authFetch(`${BLOCKS_URL}?${params}`, { signal })
    if (response.status === 401) return { status: 'unauthorized' }
    if (!response.ok) return { status: 'error' }
    return { status: 'ok', blocks: normalizeBlocks(await readJson(response)) }
  } catch {
    return { status: 'error' }
  }
}

// Mensaje para un fallo que el backend no explicó (403, 5xx, otros).
export function blockFailureMessage(status) {
  if (status === 403) return 'No tienes permiso para hacer este cambio.'
  return `No se pudo guardar el cambio (error ${status}). Revisa la agenda antes de volver a intentarlo.`
}

// La franja ya terminó (hora_fin <= ahora, en hora de Chile): misma regla que el
// backend para bloquear. isSlotPast de schedule.js mira el inicio y lo usan
// otras pantallas, por eso no se reutiliza.
export function isSlotEnded(date, time, now) {
  if (date !== now.date) return date < now.date
  return toMinutes(time) + SLOT_MINUTES <= toMinutes(now.time)
}

// Una cita no cancelada a menos de SLOT_MINUTES de la hora la ocupa.
const isOccupied = (appointments, time) =>
  appointments.some(
    (appointment) =>
      appointment.status !== 'cancelada' &&
      Math.abs(toMinutes(appointment.appointment_time) - toMinutes(time)) < SLOT_MINUTES,
  )

const KIND_ORDER = { appointment: 0, block: 1, free: 2 }

// Línea de tiempo del día, ordenada por hora:
// - cada cita, como tarjeta (también las que están fuera de la grilla);
// - cada bloqueo, salvo que una cita ocupe esa franja (se muestra solo la cita);
// - cada franja de la grilla libre y no terminada ("Libre"), si includeFree.
export function buildTimeline({ date, appointments, blocks, now, includeFree }) {
  const items = appointments.map((appointment) => ({
    kind: 'appointment',
    key: `appointment-${appointment.id}`,
    minutes: toMinutes(appointment.appointment_time),
    appointment,
  }))

  for (const block of blocks) {
    if (isOccupied(appointments, block.time)) continue
    items.push({
      kind: 'block',
      key: `block-${block.id}`,
      time: block.time,
      minutes: toMinutes(block.time),
      block,
      isEnded: isSlotEnded(date, block.time, now),
    })
  }

  if (includeFree) {
    for (const time of slotsForDate(date)) {
      if (isOccupied(appointments, time)) continue
      if (blocks.some((block) => block.time === time)) continue
      if (isSlotEnded(date, time, now)) continue
      items.push({ kind: 'free', key: `free-${time}`, time, minutes: toMinutes(time) })
    }
  }

  return items.sort((a, b) => a.minutes - b.minutes || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}
