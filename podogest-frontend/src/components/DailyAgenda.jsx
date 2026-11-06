import { CalendarX, Clock, FilePlus, FileText, User } from 'lucide-react'
import { recordActionLabel } from '../utils/appointmentRecord'
import { clinicNow } from '../utils/clinicDate'
import { StatusControl } from './StatusBadge'
import './DailyAgenda.css'

// Panel keys stored as service_type; site services arrive as their title.
const SERVICE_LABELS = { control: 'Control' }

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Today in Chile, like the agenda's filter; built as a local date so
// toLocaleDateString doesn't move it to another day.
function getTodayLabel(date) {
  const [year, month, day] = date.split('-').map(Number)
  const label = new Date(year, month - 1, day).toLocaleDateString('es-CL', {
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

function AppointmentCard({ appointment, now, isBusy, error, onOpenRecord, onChangeStatus }) {
  const { id, appointment_time, patient_name, service_type, status, control_de } = appointment

  const isCancelled = status === 'cancelada'
  const isNoShow = status === 'no_asistio'
  const canOpenRecord = !isCancelled && !isNoShow && Boolean(onOpenRecord)
  const serviceLabel = SERVICE_LABELS[service_type] ?? (service_type || 'Consulta general')
  const patientId = `daily-agenda-patient-${id}`
  const errorId = `daily-agenda-error-${id}`
  const RecordIcon = appointment.ficha_con_datos === true ? FileText : FilePlus

  const cardClass = [
    'daily-agenda__card',
    isCancelled && 'daily-agenda__card--cancelled',
    isNoShow && 'daily-agenda__card--no-show',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={cardClass}>
      <div className="daily-agenda__time">
        <Clock size={18} aria-hidden="true" />
        <span>{formatTime(appointment_time)}</span>
      </div>

      <div className="daily-agenda__info">
        <div className="daily-agenda__patient">
          <User size={16} aria-hidden="true" />
          <span id={patientId}>{patient_name || 'Paciente sin nombre'}</span>
        </div>
        <p className="daily-agenda__service">
          {serviceLabel}
          {/* A control booked with another service still says it is a control. */}
          {control_de != null && serviceLabel !== 'Control' && (
            <span className="daily-agenda__tag">Control</span>
          )}
        </p>
      </div>

      <StatusControl
        appointment={appointment}
        now={now}
        isBusy={isBusy}
        describedBy={error ? `${patientId} ${errorId}` : patientId}
        onChange={(newStatus) => onChangeStatus?.(appointment, newStatus)}
      />

      {canOpenRecord && (
        <div className="daily-agenda__actions">
          <button
            type="button"
            className="daily-agenda__action"
            onClick={() => onOpenRecord(appointment)}
            aria-describedby={patientId}
          >
            <RecordIcon size={16} aria-hidden="true" />
            {recordActionLabel(appointment)}
          </button>
        </div>
      )}

      {error && (
        <p id={errorId} className="daily-agenda__error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

// `now`: clinic time from useClinicClock (decides whether a badge toggles or opens the menu).
// `statusBusy`: { [appointmentId]: true } while its status change is saved.
// `statusErrors`: { [appointmentId]: message } from the last failed change.
function DailyAgenda({
  appointments = [],
  now = clinicNow(),
  onOpenRecord,
  onChangeStatus,
  statusBusy = {},
  statusErrors = {},
}) {
  return (
    <section className="daily-agenda" aria-labelledby="daily-agenda-title">
      <header className="daily-agenda__header">
        <h2 id="daily-agenda-title" className="daily-agenda__title">
          Agenda de hoy
        </h2>
        <p className="daily-agenda__date">{getTodayLabel(now.date)}</p>
      </header>

      {appointments.length === 0 ? (
        <div className="daily-agenda__empty" role="status">
          <CalendarX size={32} strokeWidth={1.5} aria-hidden="true" />
          <p>No tienes citas agendadas para hoy</p>
        </div>
      ) : (
        <ul className="daily-agenda__list">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              now={now}
              isBusy={Boolean(statusBusy[appointment.id])}
              error={statusErrors[appointment.id] ?? ''}
              onOpenRecord={onOpenRecord}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default DailyAgenda
