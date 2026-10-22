import { CalendarX, Clock, User } from 'lucide-react'
import './DailyAgenda.css'

const STATUS_META = {
  confirmada: { label: 'Confirmada', className: 'daily-agenda__badge--confirmed' },
  pendiente: { label: 'Pendiente', className: 'daily-agenda__badge--pending' },
  cancelada: { label: 'Cancelada', className: 'daily-agenda__badge--cancelled' },
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function getTodayLabel() {
  const label = new Date().toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return capitalize(label)
}

// Django manda la hora como "10:00:00"; nos quedamos solo con "10:00".
function formatTime(time) {
  return time ? time.slice(0, 5) : '--:--'
}

// Sin status no se muestra etiqueta: no se inventa un estado que no conocemos.
// Un status que no está en STATUS_META se muestra tal cual, en estilo neutro.
function getStatusMeta(status) {
  if (!status) return null
  return (
    STATUS_META[status] ?? {
      label: capitalize(String(status).replaceAll('_', ' ')),
      className: 'daily-agenda__badge--neutral',
    }
  )
}

// Also used by the "Todas las citas" table, so both views share one style.
export function StatusBadge({ status }) {
  const statusMeta = getStatusMeta(status)
  if (!statusMeta) return null
  return <span className={`daily-agenda__badge ${statusMeta.className}`}>{statusMeta.label}</span>
}

function AppointmentCard({ appointment_time, patient_name, service_type, status }) {
  const isCancelled = status === 'cancelada'

  return (
    <li className={`daily-agenda__card${isCancelled ? ' daily-agenda__card--cancelled' : ''}`}>
      <div className="daily-agenda__time">
        <Clock size={18} aria-hidden="true" />
        <span>{formatTime(appointment_time)}</span>
      </div>

      <div className="daily-agenda__info">
        <div className="daily-agenda__patient">
          <User size={16} aria-hidden="true" />
          <span>{patient_name || 'Paciente sin nombre'}</span>
        </div>
        <p className="daily-agenda__service">{service_type || 'Consulta general'}</p>
      </div>

      <StatusBadge status={status} />
    </li>
  )
}

function DailyAgenda({ appointments = [] }) {
  return (
    <section className="daily-agenda" aria-labelledby="daily-agenda-title">
      <header className="daily-agenda__header">
        <h2 id="daily-agenda-title" className="daily-agenda__title">
          Agenda de hoy
        </h2>
        <p className="daily-agenda__date">{getTodayLabel()}</p>
      </header>

      {appointments.length === 0 ? (
        <div className="daily-agenda__empty" role="status">
          <CalendarX size={32} strokeWidth={1.5} aria-hidden="true" />
          <p>No tienes citas agendadas para hoy</p>
        </div>
      ) : (
        <ul className="daily-agenda__list">
          {appointments.map((appointment) => (
            <AppointmentCard key={appointment.id} {...appointment} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default DailyAgenda
