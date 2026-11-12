import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, CalendarX, Clock, FilePlus, FileText, Lock, User } from 'lucide-react'
import { hasAppointmentDocument, recordActionLabel } from '../utils/appointmentRecord'
import { buildTimeline } from '../utils/blocks'
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

function AppointmentCard({
  appointment,
  now,
  isBusy,
  error,
  onOpenRecord,
  onChangeStatus,
  onNewAttention,
}) {
  const { id, appointment_time, patient_name, service_type, status, control_de } = appointment

  const isCancelled = status === 'cancelada'
  const isNoShow = status === 'no_asistio'
  const canOpenRecord = !isCancelled && !isNoShow && Boolean(onOpenRecord)
  // Also on cancelled and no-show appointments: the patient may come another day.
  const canStartNew = Boolean(onNewAttention) && hasAppointmentDocument(appointment)
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

      {(canOpenRecord || canStartNew) && (
        <div className="daily-agenda__actions">
          {canOpenRecord && (
            <button
              type="button"
              className="daily-agenda__action"
              onClick={() => onOpenRecord(appointment)}
              aria-describedby={patientId}
            >
              <RecordIcon size={16} aria-hidden="true" />
              {recordActionLabel(appointment)}
            </button>
          )}
          {canStartNew && (
            <button
              type="button"
              className="daily-agenda__action daily-agenda__action--secondary"
              onClick={() => onNewAttention(appointment)}
              aria-describedby={patientId}
            >
              <CalendarPlus size={16} aria-hidden="true" />
              Nueva atención
            </button>
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

// Mensaje bajo una fila: error (role="alert") o aviso breve (role="status").
function SlotMessage({ id, message, standalone = false }) {
  if (!message) return null
  const extra = standalone ? ' daily-agenda__%s--standalone' : ''
  if (message.kind === 'notice') {
    return (
      <p id={id} className={`daily-agenda__notice${extra.replace('%s', 'notice')}`} role="status">
        {message.text}
      </p>
    )
  }
  return (
    <p id={id} className={`daily-agenda__error${extra.replace('%s', 'error')}`} role="alert">
      {message.text}
    </p>
  )
}

// Franja libre de la grilla: un toque la bloquea, sin confirmación.
function FreeSlotRow({ time, isBusy, message, onBlock }) {
  const labelId = `daily-agenda-free-${time}`
  const messageId = `daily-agenda-free-message-${time}`

  return (
    <li className="daily-agenda__card daily-agenda__card--free">
      <div className="daily-agenda__time">
        <Clock size={18} aria-hidden="true" />
        <span>{time}</span>
      </div>
      <div className="daily-agenda__info">
        <p id={labelId} className="daily-agenda__free-label">
          Libre
        </p>
      </div>
      <div className="daily-agenda__actions">
        <button
          id={`daily-agenda-block-${time}`}
          type="button"
          className="daily-agenda__action daily-agenda__action--secondary"
          // aria-disabled, no disabled: el botón conserva el foco mientras guarda.
          aria-disabled={isBusy || undefined}
          aria-label={isBusy ? `Guardando… el bloqueo de las ${time}` : `Bloquear la hora de las ${time}`}
          aria-describedby={message ? `${labelId} ${messageId}` : labelId}
          onClick={() => {
            if (!isBusy) onBlock(time)
          }}
        >
          <Lock size={16} aria-hidden="true" />
          {isBusy ? 'Guardando…' : 'Bloquear'}
        </button>
      </div>
      <SlotMessage id={messageId} message={message} />
    </li>
  )
}

// Franja bloqueada. "Liberar" pide una confirmación breve dentro de la tarjeta.
function BlockCard({ block, canRelease, isBusy, message, onRelease }) {
  const [isConfirming, setIsConfirming] = useState(false)
  const releaseRef = useRef(null)
  const noRef = useRef(null)
  const returnFocusRef = useRef(false)
  const titleId = `daily-agenda-block-title-${block.id}`
  const messageId = `daily-agenda-block-message-${block.id}`

  // Al abrir la confirmación el foco va a "No"; al cerrarla sin liberar, vuelve a "Liberar".
  useEffect(() => {
    if (isConfirming) {
      noRef.current?.focus()
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false
      releaseRef.current?.focus()
    }
  }, [isConfirming])

  const closeConfirm = () => {
    returnFocusRef.current = true
    setIsConfirming(false)
  }

  return (
    <li className="daily-agenda__card daily-agenda__card--blocked">
      <div className="daily-agenda__time">
        <Clock size={18} aria-hidden="true" />
        <span>{block.time}</span>
      </div>
      <div className="daily-agenda__info">
        <div className="daily-agenda__patient">
          <Lock size={16} aria-hidden="true" />
          <span id={titleId}>Hora bloqueada</span>
        </div>
        <p className="daily-agenda__service">
          De {block.time} a {block.endTime}
        </p>
      </div>

      {canRelease && (
        <div
          className="daily-agenda__actions"
          onKeyDown={(event) => {
            if (isConfirming && event.key === 'Escape') {
              event.stopPropagation()
              closeConfirm()
            }
          }}
        >
          {isConfirming ? (
            <div
              className="daily-agenda__confirm"
              role="group"
              aria-label={`Liberar la hora de las ${block.time}`}
            >
              <span className="daily-agenda__confirm-text">¿Liberar?</span>
              <button
                type="button"
                className="daily-agenda__action daily-agenda__action--confirm"
                aria-label={`Sí, liberar la hora de las ${block.time}`}
                onClick={() => {
                  closeConfirm()
                  onRelease(block)
                }}
              >
                Sí
              </button>
              <button
                ref={noRef}
                type="button"
                className="daily-agenda__action daily-agenda__action--secondary"
                aria-label="No, mantener bloqueada"
                onClick={closeConfirm}
              >
                No
              </button>
            </div>
          ) : (
            <button
              ref={releaseRef}
              id={`daily-agenda-release-${block.time}`}
              type="button"
              className="daily-agenda__action"
              aria-disabled={isBusy || undefined}
              aria-label={
                isBusy ? `Guardando… la liberación de las ${block.time}` : `Liberar la hora de las ${block.time}`
              }
              aria-describedby={message ? `${titleId} ${messageId}` : titleId}
              onClick={() => {
                if (!isBusy) setIsConfirming(true)
              }}
            >
              {isBusy ? 'Guardando…' : 'Liberar'}
            </button>
          )}
        </div>
      )}
      <SlotMessage id={messageId} message={message} />
    </li>
  )
}

// `now`: clinic time from useClinicClock (decides whether a badge toggles or opens the menu).
// `statusBusy`: { [appointmentId]: true } while its status change is saved.
// `statusErrors`: { [appointmentId]: message } from the last failed change.
// Bloqueos (opcionales; sin `onBlockSlot` solo se ven las citas):
// `blocks`: bloqueos de hoy ya normalizados; `blocksReady`: ya se cargaron;
// `blocksError`: texto si falló la carga; `blockBusy`: { [hora]: true } mientras guarda;
// `blockMessages`: { [hora]: { kind: 'error' | 'notice', text } }.
function DailyAgenda({
  appointments = [],
  now = clinicNow(),
  onOpenRecord,
  onChangeStatus,
  onNewAttention,
  statusBusy = {},
  statusErrors = {},
  blocks = [],
  blocksReady = false,
  blocksError = '',
  blockBusy = {},
  blockMessages = {},
  onBlockSlot,
  onReleaseSlot,
}) {
  const timeline = useMemo(
    () =>
      buildTimeline({
        date: now.date,
        appointments,
        blocks,
        now,
        includeFree: blocksReady && Boolean(onBlockSlot),
      }),
    [now, appointments, blocks, blocksReady, onBlockSlot],
  )

  // Tras bloquear o liberar, la fila cambia de tipo y se desmonta: el foco pasa al botón nuevo.
  const focusTargetRef = useRef(null)
  useEffect(() => {
    const id = focusTargetRef.current
    if (!id) return
    const target = document.getElementById(id)
    if (target) {
      target.focus()
      focusTargetRef.current = null
    }
  }, [timeline])

  const handleBlock = (time) => {
    focusTargetRef.current = `daily-agenda-release-${time}`
    onBlockSlot(time)
  }
  const handleRelease = (block) => {
    focusTargetRef.current = `daily-agenda-block-${block.time}`
    onReleaseSlot(block)
  }

  // Mensajes de una hora cuya fila ya no es "libre" ni "bloqueada" (por ejemplo,
  // ahora hay una cita): se muestran arriba para que no se pierdan.
  const rowTimes = new Set(timeline.filter((item) => item.kind !== 'appointment').map((item) => item.time))
  const looseMessages = Object.entries(blockMessages).filter(([time]) => !rowTimes.has(time))
  const waitingForBlocks = Boolean(onBlockSlot) && !blocksReady && !blocksError

  return (
    <section className="daily-agenda" aria-labelledby="daily-agenda-title">
      <header className="daily-agenda__header">
        <h2 id="daily-agenda-title" className="daily-agenda__title">
          Agenda de hoy
        </h2>
        <p className="daily-agenda__date">{getTodayLabel(now.date)}</p>
      </header>

      {blocksError && (
        <p className="daily-agenda__error daily-agenda__error--standalone" role="alert">
          {blocksError}
        </p>
      )}
      {looseMessages.map(([time, message]) => (
        <SlotMessage
          key={time}
          standalone
          message={{ ...message, text: `${time}: ${message.text}` }}
        />
      ))}
      {waitingForBlocks && (
        <p className="daily-agenda__loading" role="status">
          Cargando horas libres…
        </p>
      )}

      {timeline.length === 0 && !waitingForBlocks ? (
        <div className="daily-agenda__empty" role="status">
          <CalendarX size={32} strokeWidth={1.5} aria-hidden="true" />
          <p>No tienes citas agendadas para hoy</p>
        </div>
      ) : (
        timeline.length > 0 && (
          <ul className="daily-agenda__list">
            {timeline.map((item) => {
              if (item.kind === 'free') {
                return (
                  <FreeSlotRow
                    key={item.key}
                    time={item.time}
                    isBusy={Boolean(blockBusy[item.time])}
                    message={blockMessages[item.time]}
                    onBlock={handleBlock}
                  />
                )
              }
              if (item.kind === 'block') {
                return (
                  <BlockCard
                    key={item.key}
                    block={item.block}
                    canRelease={!item.isEnded && Boolean(onReleaseSlot)}
                    isBusy={Boolean(blockBusy[item.time])}
                    message={blockMessages[item.time]}
                    onRelease={handleRelease}
                  />
                )
              }
              const { appointment } = item
              return (
                <AppointmentCard
                  key={item.key}
                  appointment={appointment}
                  now={now}
                  isBusy={Boolean(statusBusy[appointment.id])}
                  error={statusErrors[appointment.id] ?? ''}
                  onOpenRecord={onOpenRecord}
                  onChangeStatus={onChangeStatus}
                  onNewAttention={onNewAttention}
                />
              )
            })}
          </ul>
        )
      )}
    </section>
  )
}

export default DailyAgenda
