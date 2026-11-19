// Appointment statuses: how each one looks and what tapping its badge does.

export const STATUS_META = {
  confirmada: { label: 'Confirmada', className: 'daily-agenda__badge--confirmed' },
  pendiente: { label: 'Pendiente', className: 'daily-agenda__badge--pending' },
  cancelada: { label: 'Cancelada', className: 'daily-agenda__badge--cancelled' },
  atendida: { label: 'Atendida', className: 'daily-agenda__badge--attended' },
  no_asistio: { label: 'No asistió', className: 'daily-agenda__badge--no-show' },
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Sin status no se muestra etiqueta: no se inventa un estado que no conocemos.
// Un status que no está en STATUS_META se muestra tal cual, en estilo neutro.
export function getStatusMeta(status) {
  if (!status) return null
  return (
    STATUS_META[status] ?? {
      label: capitalize(String(status).replaceAll('_', ' ')),
      className: 'daily-agenda__badge--neutral',
    }
  )
}

// Started when its date and "HH:MM" are not after the clinic's current minute
// (`now` from clinicNow(): Chile time). Same rule as the backend.
export function hasStarted(appointment, now) {
  const { appointment_date: date, appointment_time: time } = appointment ?? {}
  if (!date || !time) return false
  return `${date} ${time.slice(0, 5)}` <= `${now.date} ${now.time}`
}

// What tapping the status badge does, or null when it can't be tapped:
// - { kind: 'toggle', target }: online booking not started yet, pendiente <-> confirmada.
// - { kind: 'menu', options }: started (any origin) or already marked; the
//   options are the statuses it can move to.
export function statusAction(appointment, now) {
  const status = appointment?.status
  if (status === 'atendida') return { kind: 'menu', options: ['no_asistio'] }
  if (status === 'no_asistio') return { kind: 'menu', options: ['atendida'] }
  if (status !== 'pendiente' && status !== 'confirmada') return null
  if (hasStarted(appointment, now)) return { kind: 'menu', options: ['atendida', 'no_asistio'] }
  if (appointment.origen === 'web') {
    return { kind: 'toggle', target: status === 'pendiente' ? 'confirmada' : 'pendiente' }
  }
  return null
}
