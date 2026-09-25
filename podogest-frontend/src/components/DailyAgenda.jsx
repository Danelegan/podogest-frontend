import { Clock, User } from 'lucide-react'
import './DailyAgenda.css'

// TODO: reemplazar por datos reales, ej. GET /api/appointments/?date=hoy
const mockAppointments = [
  {
    id: 1,
    time: '09:00',
    patientName: 'María González',
    service: 'Atención Integral',
    status: 'confirmada',
  },
  {
    id: 2,
    time: '10:30',
    patientName: 'Pedro Soto',
    service: 'Onicomicosis',
    status: 'pendiente',
  },
  {
    id: 3,
    time: '12:00',
    patientName: 'Camila Rojas',
    service: 'Reflexología y Masoterapia',
    status: 'confirmada',
  },
  {
    id: 4,
    time: '13:30',
    patientName: 'Jorge Muñoz',
    service: 'Pie Diabético',
    status: 'cancelada',
  },
]

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

function AppointmentCard({ time, patientName, service, status }) {
  const statusMeta = STATUS_META[status] ?? STATUS_META.pendiente

  return (
    <li className="daily-agenda__card">
      <div className="daily-agenda__time">
        <Clock size={18} aria-hidden="true" />
        <span>{time}</span>
      </div>

      <div className="daily-agenda__info">
        <div className="daily-agenda__patient">
          <User size={16} aria-hidden="true" />
          <span>{patientName}</span>
        </div>
        <p className="daily-agenda__service">{service}</p>
      </div>

      <span className={`daily-agenda__badge ${statusMeta.className}`}>{statusMeta.label}</span>
    </li>
  )
}

function DailyAgenda({ appointments = mockAppointments }) {
  return (
    <section className="daily-agenda">
      <header className="daily-agenda__header">
        <h2 className="daily-agenda__title">Agenda de hoy</h2>
        <p className="daily-agenda__date">{getTodayLabel()}</p>
      </header>

      {appointments.length === 0 ? (
        <p className="daily-agenda__empty">No hay citas agendadas para hoy.</p>
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
