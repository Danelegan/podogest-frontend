import { useEffect, useRef, useState } from 'react'
import { CalendarX, Check, Clock, FilePlus, FileText, User, UserX } from 'lucide-react'
import { recordActionLabel } from '../utils/appointmentRecord'
import { clinicNow } from '../utils/clinicDate'
import './DailyAgenda.css'

const STATUS_META = {
  confirmada: { label: 'Confirmada', className: 'daily-agenda__badge--confirmed' },
  pendiente: { label: 'Pendiente', className: 'daily-agenda__badge--pending' },
  cancelada: { label: 'Cancelada', className: 'daily-agenda__badge--cancelled' },
  atendida: { label: 'Atendida', className: 'daily-agenda__badge--attended' },
  no_asistio: { label: 'No asistió', className: 'daily-agenda__badge--no-show' },
}

// Only these can still be marked as attended or no-show.
const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada'])

// The "already started" check is redone this often, so the buttons show up
// without reloading the page.
const CLOCK_TICK_MS = 60_000

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

// Started when its date and "HH:MM" are not after the clinic's current minute.
function hasStarted(appointment, now) {
  const { appointment_date: date, appointment_time: time } = appointment
  if (!date || !time) return false
  return `${date} ${time.slice(0, 5)}` <= `${now.date} ${now.time}`
}

// Clinic time (Chile), refreshed every minute.
function useClinicClock() {
  const [now, setNow] = useState(clinicNow)
  useEffect(() => {
    const id = setInterval(() => setNow(clinicNow()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
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

function AppointmentCard({ appointment, now, busyAction, error, onOpenRecord, onMarkStatus }) {
  const { id, appointment_time, patient_name, service_type, status, control_de } = appointment
  const [isConfirmingNoShow, setIsConfirmingNoShow] = useState(false)
  const recordButtonRef = useRef(null)
  const noShowButtonRef = useRef(null)
  const confirmNoRef = useRef(null)
  const cardRef = useRef(null)
  // Set when the user marks the card: once the status changes, the pressed
  // button is gone and the focus has to land somewhere sensible.
  const focusAfterChangeRef = useRef(false)
  // Where the focus goes after closing the confirmation: '' (nowhere), 'trigger' or 'no'.
  const confirmFocusRef = useRef('')

  const isCancelled = status === 'cancelada'
  const isNoShow = status === 'no_asistio'
  const isBusy = busyAction != null
  const canOpenRecord = !isCancelled && !isNoShow && Boolean(onOpenRecord)
  const canMark = ACTIVE_STATUSES.has(status) && hasStarted(appointment, now) && Boolean(onMarkStatus)
  const showConfirm = canMark && isConfirmingNoShow
  const serviceLabel = SERVICE_LABELS[service_type] ?? (service_type || 'Consulta general')
  const patientId = `daily-agenda-patient-${id}`
  const errorId = `daily-agenda-error-${id}`
  const RecordIcon = appointment.ficha_con_datos === true ? FileText : FilePlus

  useEffect(() => {
    if (!focusAfterChangeRef.current || ACTIVE_STATUSES.has(status)) return
    focusAfterChangeRef.current = false
    ;(recordButtonRef.current ?? cardRef.current)?.focus()
  }, [status])

  // A failed change leaves the status as it was: nothing to refocus later.
  useEffect(() => {
    if (error) focusAfterChangeRef.current = false
  }, [error])

  useEffect(() => {
    const target = confirmFocusRef.current
    if (!target) return
    confirmFocusRef.current = ''
    ;(target === 'no' ? confirmNoRef : noShowButtonRef).current?.focus()
  }, [showConfirm])

  // The pressed button is disabled (or removed) while saving, which would drop
  // the focus to the page: it waits on the card, where the error is read too.
  const mark = (action) => {
    focusAfterChangeRef.current = true
    cardRef.current?.focus()
    onMarkStatus(appointment, action)
  }

  const openConfirm = () => {
    confirmFocusRef.current = 'no'
    setIsConfirmingNoShow(true)
  }

  const closeConfirm = () => {
    confirmFocusRef.current = 'trigger'
    setIsConfirmingNoShow(false)
  }

  const confirmNoShow = () => {
    setIsConfirmingNoShow(false)
    mark('no_asistio')
  }

  const cardClass = [
    'daily-agenda__card',
    isCancelled && 'daily-agenda__card--cancelled',
    isNoShow && 'daily-agenda__card--no-show',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={cardClass} ref={cardRef} tabIndex={-1} aria-labelledby={patientId}>
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

      <StatusBadge status={status} />

      {(canOpenRecord || canMark) && (
        <div className="daily-agenda__actions">
          {canOpenRecord && (
            <button
              ref={recordButtonRef}
              type="button"
              className="daily-agenda__action daily-agenda__action--record"
              onClick={() => onOpenRecord(appointment)}
              aria-describedby={patientId}
            >
              <RecordIcon size={16} aria-hidden="true" />
              {recordActionLabel(appointment)}
            </button>
          )}

          {canMark && !showConfirm && (
            <>
              <button
                type="button"
                className={`daily-agenda__action daily-agenda__action--attended${
                  busyAction === 'atendida' ? ' daily-agenda__action--saving' : ''
                }`}
                onClick={() => mark('atendida')}
                disabled={isBusy}
                aria-describedby={error ? `${patientId} ${errorId}` : patientId}
              >
                <Check size={16} aria-hidden="true" />
                {busyAction === 'atendida' ? 'Guardando…' : 'Atendida'}
              </button>
              <button
                ref={noShowButtonRef}
                type="button"
                className={`daily-agenda__action daily-agenda__action--quiet${
                  busyAction === 'no_asistio' ? ' daily-agenda__action--saving' : ''
                }`}
                onClick={openConfirm}
                disabled={isBusy}
                aria-describedby={error ? `${patientId} ${errorId}` : patientId}
              >
                <UserX size={16} aria-hidden="true" />
                {busyAction === 'no_asistio' ? 'Guardando…' : 'No asistió'}
              </button>
            </>
          )}

          {showConfirm && (
            <div
              className="daily-agenda__confirm"
              role="group"
              aria-labelledby={`daily-agenda-confirm-${id}`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeConfirm()
                }
              }}
            >
              <p id={`daily-agenda-confirm-${id}`} className="daily-agenda__confirm-text">
                ¿Confirmas que no asistió?
              </p>
              <div className="daily-agenda__confirm-buttons">
                <button
                  type="button"
                  className="daily-agenda__action daily-agenda__action--danger"
                  onClick={confirmNoShow}
                  aria-label="Sí, no asistió"
                  aria-describedby={patientId}
                >
                  Sí
                </button>
                <button
                  ref={confirmNoRef}
                  type="button"
                  className="daily-agenda__action daily-agenda__action--quiet"
                  onClick={closeConfirm}
                >
                  No
                </button>
              </div>
            </div>
          )}
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

// `statusBusy`: { id, action } of the change being saved, or null.
// `statusErrors`: { [appointmentId]: message } from the last failed change.
// `statusNotice`: text announced to screen readers after a successful change.
function DailyAgenda({
  appointments = [],
  onOpenRecord,
  onMarkStatus,
  statusBusy = null,
  statusErrors = {},
  statusNotice = '',
}) {
  const now = useClinicClock()

  return (
    <section className="daily-agenda" aria-labelledby="daily-agenda-title">
      <header className="daily-agenda__header">
        <h2 id="daily-agenda-title" className="daily-agenda__title">
          Agenda de hoy
        </h2>
        <p className="daily-agenda__date">{getTodayLabel(now.date)}</p>
      </header>

      {/* Always mounted, so the change is announced; the badge already shows it. */}
      <p className="daily-agenda__sr-only" role="status">
        {statusNotice}
      </p>

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
              busyAction={statusBusy?.id === appointment.id ? statusBusy.action : null}
              error={statusErrors[appointment.id] ?? ''}
              onOpenRecord={onOpenRecord}
              onMarkStatus={onMarkStatus}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default DailyAgenda
