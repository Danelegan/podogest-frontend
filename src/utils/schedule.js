// Clinic schedule shared by the public booking and the next-control picker.
// The start times are the same lists the backend accepts: change both together.
import { clinicNow } from './clinicDate'

// Every appointment lasts SLOT_MINUTES.
export const SLOT_MINUTES = 90

// Start times of each day, "HH:MM". Explicit lists, not an even grid: on
// Saturday the gap before the last one is longer. Published opening hours
// (footer and index.html): Mon-Fri 10:00-20:30, Saturday 09:30-19:00.
const WEEKDAY_SLOTS = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00']
const SATURDAY_SLOTS = ['09:30', '11:00', '12:30', '14:00', '15:30', '17:30']

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Date#getDay: 0 = Sunday (closed, no start times).
const slotsForWeekday = (dayOfWeek) => {
  if (dayOfWeek === 0) return []
  return dayOfWeek === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS
}

// "10:30" -> 630; "10:47:12" -> 647.2 (seconds count, as in the backend).
export const toMinutes = (time) => {
  const [hours = 0, minutes = 0, seconds = 0] = String(time ?? '').split(':').map(Number)
  return hours * 60 + minutes + seconds / 60
}

// (2026, 9, 5) -> "2026-10-05". monthIndex is 0-based, like Date.
export const formatDate = (year, monthIndex, day) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// "2026-10-05" -> { year: 2026, monthIndex: 9, day: 5 }.
export const parseDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number)
  return { year, monthIndex: month - 1, day }
}

// "2026-10-31" + 1 -> "2026-11-01" (calendar days, no time zone involved).
export const addDays = (dateString, count) => {
  const { year, monthIndex, day } = parseDate(dateString)
  const date = new Date(year, monthIndex, day + count)
  return formatDate(date.getFullYear(), date.getMonth(), date.getDate())
}

// Local Date built from the parts, only for weekday and month names (the
// string is a Chile date; no time zone conversion happens).
const toLocalDate = (dateString) => {
  const { year, monthIndex, day } = parseDate(dateString)
  return new Date(year, monthIndex, day)
}

// Calendar months as { year, monthIndex }; monthKey orders them.
export const monthKey = ({ year, monthIndex }) => year * 12 + monthIndex

export const addMonths = (month, count) => {
  const key = monthKey(month) + count
  return { year: Math.floor(key / 12), monthIndex: key % 12 }
}

// Month of a "YYYY-MM-DD" date.
export const monthOf = (dateString) => {
  const { year, monthIndex } = parseDate(dateString)
  return { year, monthIndex }
}

// Start times of a "YYYY-MM-DD" day ([] on Sundays or without a date).
export const slotsForDate = (dateString) => {
  if (!dateString) return []
  const { year, monthIndex, day } = parseDate(dateString)
  return [...slotsForWeekday(new Date(year, monthIndex, day).getDay())]
}

export const isClosedDay = (year, monthIndex, day) =>
  slotsForWeekday(new Date(year, monthIndex, day).getDay()).length === 0

// Cells of a month starting on Monday: null before day 1, then 1..n.
export function buildMonthGrid(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7 // Monday = 0

  const cells = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }
  return cells
}

// Accessible name for a calendar day: "martes 14 de octubre de 2026", plus
// ", no disponible" when isUnavailable (past days, Sundays) or ", cerrado: …"
// when closedReason is a string (holiday or closed from the panel; '' without
// a reason). The visible text stays the number. es-CL writes "martes, 14 de…";
// only the comma right after the weekday is dropped.
export function dayAccessibleLabel(year, monthIndex, day, isUnavailable, closedReason) {
  const label = new Date(year, monthIndex, day)
    .toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .replace(/^(\p{L}+),/u, '$1')
  if (typeof closedReason === 'string') {
    return closedReason ? `${label}, cerrado: ${closedReason}` : `${label}, cerrado`
  }
  return isUnavailable ? `${label}, no disponible` : label
}

// (2026, 9) -> "octubre de 2026".
export const formatMonthLabel = (year, monthIndex) =>
  new Date(year, monthIndex, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

// "2026-10-14" -> "14 de octubre de 2026".
export const formatDayMonth = (dateString) => {
  const { year, monthIndex, day } = parseDate(dateString)
  return `${day} de ${formatMonthLabel(year, monthIndex)}`
}

// "2026-11-18" -> "martes 18 de noviembre".
export const formatWeekdayDate = (dateString) =>
  toLocalDate(dateString)
    .toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^(\p{L}+),/u, '$1')

// A slot is past once its start time has been reached in Chile ("19:00" is
// past at 19:00). Any earlier day is past too.
export function isSlotPast(dateString, time, now = clinicNow()) {
  if (dateString !== now.date) return dateString < now.date
  return toMinutes(time) <= toMinutes(now.time)
}

// Busy list from /api/appointments/horarios-ocupados/:
// [{ appointment_date: "2026-10-14", appointment_time: "10:00:00" }]
//  -> [{ date: "2026-10-14", time: "10:00", minutes: 600 }].
export const parseBusySlots = (data) =>
  (Array.isArray(data) ? data : []).map(({ appointment_date, appointment_time }) => ({
    date: appointment_date,
    time: String(appointment_time ?? '').slice(0, 5),
    minutes: toMinutes(appointment_time),
  }))

// Same start time on that day (public booking: the backend only blocks the
// exact slot there).
export const isExactSlotBusy = (busySlots, dateString, time) =>
  busySlots.some((slot) => slot.date === dateString && slot.time === time)

// Another appointment starts less than SLOT_MINUTES away (next control: the
// backend rejects overlaps, including walk-ins at any time like 10:47).
export const overlapsBusySlot = (busySlots, dateString, time) =>
  busySlots.some(
    (slot) =>
      slot.date === dateString && Math.abs(slot.minutes - toMinutes(time)) < SLOT_MINUTES,
  )
