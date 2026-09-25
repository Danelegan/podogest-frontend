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

function AppointmentCard({ appointment_time, patient_name, service_type, status }) {
  // El backend aún no expone un estado propio de la cita: si existe en la
  // agenda de hoy se asume confirmada, salvo que venga un status explícito.
  const statusMeta = STATUS_META[status] ?? STATUS_META.confirmada

  return (
    <li className="daily-agenda__card">
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

      <span className={`daily-agenda__badge ${statusMeta.className}`}>{statusMeta.label}</span>
    </li>
  )
}

function DailyAgenda({ appointments = [] }) {
  return (
    <section className="daily-agenda">
      <header className="daily-agenda__header">
        <h2 className="daily-agenda__title">Agenda de hoy</h2>
        <p className="daily-agenda__date">{getTodayLabel()}</p>
      </header>

      {appointments.length === 0 ? (
        <div className="daily-agenda__empty">
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
