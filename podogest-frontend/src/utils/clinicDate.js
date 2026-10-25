// Dates as the clinic sees them (Chile), whatever the device's time zone.
// "YYYY-MM-DD" strings are handled as text: new Date("2026-10-24") is UTC
// midnight, which in Chile is still the previous day.
const CLINIC_TIME_ZONE = 'America/Santiago'

const clinicParts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CLINIC_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )

// Current date and time in Chile: { date: "2026-10-25", time: "16:05" }.
export function clinicNow() {
  const { year, month, day, hour, minute } = clinicParts(new Date())
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
}

// Chile calendar day of a timestamp ("2026-10-25T02:10:00Z" -> "2026-10-24").
export function clinicDateOf(timestamp) {
  const date = new Date(timestamp ?? '')
  if (Number.isNaN(date.getTime())) return ''
  const { year, month, day } = clinicParts(date)
  return `${year}-${month}-${day}`
}

// "2026-10-24" -> "24/10/2026"; '' if it isn't a date.
export function formatDateString(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString ?? '')
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

// Same day `years` later or earlier; 29 Feb becomes 28 Feb (as the backend does).
export function shiftYears(dateString, years) {
  const [year, month, day] = dateString.split('-')
  const target = Number(year) + years
  const isLeap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0
  const safeDay = month === '02' && day === '29' && !isLeap ? '28' : day
  return `${target}-${month}-${safeDay}`
}
