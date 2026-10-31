// Clinic schedule shared by the public booking and the next-control picker.
// Same table as the backend (api/booking.py: BUSINESS_HOURS, SLOT_MINUTES).
import { clinicNow } from './clinicDate'

// Every appointment lasts SLOT_MINUTES and must finish by the closing time.
export const SLOT_MINUTES = 90

// Opening hours, in minutes from midnight. Sunday is closed.
export const BUSINESS_HOURS = {
  weekday: { open: 10 * 60, close: 19 * 60 }, // Mon-Fri 10:00-19:00
  saturday: { open: 9 * 60, close: 14 * 60 }, // Sat 09:00-14:00
}

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Date#getDay: 0 = Sunday.
const getHoursForDay = (dayOfWeek) => {
  if (dayOfWeek === 0) return null
  return dayOfWeek === 6 ? BUSINESS_HOURS.saturday : BUSINESS_HOURS.weekday
}

const formatMinutes = (totalMinutes) =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(
    totalMinutes % 60,
  ).padStart(2, '0')}`

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

// Times of a "YYYY-MM-DD" day by the opening hours ([] without a date).
export const slotsForDate = (dateString) => {
  if (!dateString) return []
  const { year, monthIndex, day } = parseDate(dateString)
  return generateTimeSlots(year, monthIndex, day)
}

export const isClosedDay = (year, monthIndex, day) =>
  getHoursForDay(new Date(year, monthIndex, day).getDay()) === null

export function generateTimeSlots(year, monthIndex, day) {
  const hours = getHoursForDay(new Date(year, monthIndex, day).getDay())
  if (!hours) return []

  const slots = []
  for (let start = hours.open; start + SLOT_MINUTES <= hours.close; start += SLOT_MINUTES) {
    slots.push(formatMinutes(start))
  }
  return slots
}

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
// ", no disponible" when isUnavailable (past or closed days). The visible text
// stays the number. es-CL writes "martes, 14 de…"; only the comma right after
// the weekday is dropped.
export function dayAccessibleLabel(year, monthIndex, day, isUnavailable) {
  const label = new Date(year, monthIndex, day)
    .toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .replace(/^(\p{L}+),/u, '$1')
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

// A slot is past once its start time has been reached in Chile ("18:30" is
// past at 18:30). Any earlier day is past too.
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
