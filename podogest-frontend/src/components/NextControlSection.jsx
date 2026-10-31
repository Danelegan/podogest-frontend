import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, CalendarX } from 'lucide-react'
import API_BASE_URL from '../config/api'
import { authFetch } from '../utils/auth'
import { clinicNow, shiftYears } from '../utils/clinicDate'
import {
  formatWeekdayDate,
  isSlotPast,
  overlapsBusySlot,
  parseBusySlots,
} from '../utils/schedule'
import { StatusBadge } from './DailyAgenda'
import SlotPicker from './SlotPicker'
import './NextControlSection.css'

const BUSY_SLOTS_URL = `${API_BASE_URL}/api/appointments/horarios-ocupados/`
const RECORDS_URL = `${API_BASE_URL}/api/clinical-records/`
const APPOINTMENTS_URL = `${API_BASE_URL}/api/appointments/`
const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Ficha-Version': '2' }

// Same range as the backend (ProximoControlSerializer.YEARS_AHEAD).
const YEARS_AHEAD = 1

const REQUEST_TIMEOUT_MS = 20000
const SCHEDULE_TIMEOUT_MESSAGE =
  'No se pudo confirmar si el control quedó agendado. Revisa la agenda antes de volver a intentarlo.'
const CANCEL_TIMEOUT_MESSAGE =
  'No se pudo confirmar la cancelación. Revisa la agenda antes de volver a intentarlo.'
const CONNECTION_MESSAGE = 'No se pudo conectar con el servidor. Inténtalo de nuevo.'

const EMPTY_DRAFT = { date: '', time: '' }

// DRF sends { field: ["msg"] }, { detail: "msg" } or a list; keep only the texts.
function collectMessages(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages)
  return []
}

// Busy hours from the public endpoint; null if they could not be read (the
// backend still rejects taken hours).
async function fetchBusySlots(signal) {
  try {
    const response = await fetch(BUSY_SLOTS_URL, { signal })
    return response.ok ? parseBusySlots(await response.json()) : null
  } catch {
    return null
  }
}

const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

// "martes 18 de noviembre, 11:30"; "… de 2027, 11:30" in another year.
const describeSlot = (date, time) => {
  const year = date.slice(0, 4)
  const sameYear = year === clinicNow().date.slice(0, 4)
  return `${formatWeekdayDate(date)}${sameYear ? '' : ` de ${year}`}, ${String(time).slice(0, 5)}`
}

// "Próximo control" of the clinical record: creates a real appointment at once,
// apart from "Guardar". The draft (chosen day and time) lives in the record
// modal, so an hour chosen but not booked counts as unsaved there.
// onControlChange(control, appointment): control is the new proximo_control
// (or null); appointment, the appointment the backend returned, if any.
function NextControlSection({
  recordId,
  control,
  draft,
  onDraftChange,
  onControlChange,
  onSessionExpired,
  disabled = false,
}) {
  const [busySlots, setBusySlots] = useState([])
  // Hours the backend rejected (overlap) since the last reload: disabled even
  // if the busy list arrives late or without them.
  const [rejectedSlots, setRejectedSlots] = useState([])
  const [message, setMessage] = useState(null)
  const [isWorking, setIsWorking] = useState(false)
  const isSubmittingRef = useRef(false)
  const cancelButtonRef = useRef(null)
  const messageRef = useRef(null)
  const pendingFocusRef = useRef(null)

  const now = clinicNow()
  const today = now.date
  const hasControl = control != null

  const reloadBusySlots = () => fetchBusySlots().then((slots) => {
    if (slots) setBusySlots(slots)
  })

  // The busy hours are read when the picker appears (no control yet).
  useEffect(() => {
    if (hasControl) return undefined
    const controller = new AbortController()
    fetchBusySlots(controller.signal).then((slots) => {
      if (!slots) return
      setBusySlots(slots)
      setRejectedSlots([])
    })
    return () => controller.abort()
  }, [hasControl])

  // Focus the element the last action asked for, once it is rendered.
  useEffect(() => {
    const target = pendingFocusRef.current
    if (!target) return
    pendingFocusRef.current = null
    // Without the control in the response there is no cancel button yet.
    if (target === 'cancel' && cancelButtonRef.current) cancelButtonRef.current.focus()
    else messageRef.current?.focus()
  })

  const isTimeDisabled = (date, time) =>
    isSlotPast(date, time, now) ||
    overlapsBusySlot(busySlots, date, time) ||
    rejectedSlots.includes(`${date} ${time}`)

  // After a 409 or an unclear result: what the backend has now.
  const refreshControl = async () => {
    try {
      const response = await authFetch(`${RECORDS_URL}${recordId}/`, { headers: JSON_HEADERS })
      if (!response.ok) return
      const record = await readJson(response)
      if (record && 'proximo_control' in record) onControlChange(record.proximo_control ?? null)
    } catch {
      // Keep what is shown; the message already says to check the agenda.
    }
  }

  // Runs a request once at a time, with a deadline and no automatic retry.
  const runRequest = async (request) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setIsWorking(true)
    setMessage(null)
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    try {
      await request(timeout.signal)
    } finally {
      clearTimeout(timeoutId)
      isSubmittingRef.current = false
      setIsWorking(false)
    }
  }

  // Announced by role="alert"; the focus stays where it was.
  const showError = (text) => setMessage({ kind: 'error', text })

  const handleSchedule = () =>
    runRequest(async (signal) => {
      const { date, time } = draft
      try {
        const response = await authFetch(`${RECORDS_URL}${recordId}/proximo-control/`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ appointment_date: date, appointment_time: time }),
          signal,
        })
        if (response.status === 401) {
          onSessionExpired()
          return
        }
        const data = await readJson(response)

        if (response.status === 201) {
          onDraftChange(EMPTY_DRAFT)
          onControlChange(data?.proximo_control ?? null, data?.appointment)
          setMessage({ kind: 'success', text: `Control agendado para el ${describeSlot(date, time)}.` })
          pendingFocusRef.current = 'cancel'
          return
        }
        if (response.status === 409) {
          // Another control is already active (another tab, a double send).
          showError(collectMessages(data).join(' ') || 'Esta ficha ya tiene un próximo control agendado.')
          onDraftChange(EMPTY_DRAFT)
          await refreshControl()
          return
        }
        if (response.status === 400) {
          // Usually the hour overlaps another appointment: disable it, reload.
          setRejectedSlots((prev) => [...prev, `${date} ${time}`])
          onDraftChange({ date, time: '' })
          showError(
            collectMessages(data).join(' ') ||
              'No se pudo agendar el control en esa hora. Elige otra.',
          )
          reloadBusySlots()
          return
        }
        showError(`No se pudo agendar el control (error ${response.status}). Inténtalo de nuevo.`)
      } catch {
        if (signal.aborted) {
          showError(SCHEDULE_TIMEOUT_MESSAGE)
          refreshControl()
        } else {
          showError(CONNECTION_MESSAGE)
        }
      }
    })

  const handleCancel = () => {
    if (!control) return
    const when = describeSlot(control.appointment_date, control.appointment_time)
    if (!window.confirm(`¿Cancelar el control del ${when}? La hora quedará libre en la agenda.`)) {
      return
    }
    runRequest(async (signal) => {
      try {
        const response = await authFetch(`${APPOINTMENTS_URL}${control.id}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelada' }),
          signal,
        })
        if (response.status === 401) {
          onSessionExpired()
          return
        }
        const data = await readJson(response)
        if (response.ok || response.status === 404) {
          // 404: the appointment no longer exists, so there is no control either.
          onControlChange(null, response.ok ? data : undefined)
          reloadBusySlots()
          // The cancel button disappears: focus goes to this message, which is
          // read on focus (outside the live regions, so it is not read twice).
          setMessage({ kind: 'cancelled', text: `Control del ${when} cancelado.` })
          pendingFocusRef.current = 'message'
          return
        }
        showError(
          collectMessages(data).join(' ') ||
            `No se pudo cancelar el control (error ${response.status}). Inténtalo de nuevo.`,
        )
      } catch {
        showError(signal.aborted ? CANCEL_TIMEOUT_MESSAGE : CONNECTION_MESSAGE)
      }
    })
  }

  const canSchedule = recordId != null && draft.time !== '' && !isWorking && !disabled
  const scheduleLabel = (() => {
    if (recordId == null) return 'Guarda la ficha para agendar el control'
    if (isWorking) return 'Agendando…'
    return 'Agendar control'
  })()

  return (
    <div className="next-control">
      {hasControl ? (
        <div className="next-control__booked">
          <p className="next-control__booked-text">
            <span>
              Control agendado:{' '}
              <strong>{describeSlot(control.appointment_date, control.appointment_time)}</strong>
            </span>
            <StatusBadge status={control.status} />
          </p>
          <button
            ref={cancelButtonRef}
            type="button"
            className="clinical-btn next-control__cancel"
            onClick={handleCancel}
            disabled={isWorking || disabled}
          >
            <CalendarX className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
            {isWorking ? 'Cancelando…' : 'Cancelar control'}
          </button>
        </div>
      ) : (
        <>
          <SlotPicker
            idPrefix="next-control"
            value={draft}
            onChange={(next) => {
              setMessage(null)
              onDraftChange(next)
            }}
            today={today}
            maxDate={shiftYears(today, YEARS_AHEAD)}
            isTimeDisabled={isTimeDisabled}
            disabled={isWorking || disabled}
          />
          <div className="next-control__actions">
            <p className="next-control__summary" aria-live="polite">
              {draft.time
                ? `Control el ${describeSlot(draft.date, draft.time)}.`
                : 'Elige un día y una hora para el control.'}
            </p>
            <button
              type="button"
              className={`clinical-btn clinical-btn--primary next-control__schedule${isWorking ? '' : ' is-idle'}`}
              onClick={handleSchedule}
              disabled={!canSchedule}
            >
              <CalendarPlus className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
              {scheduleLabel}
            </button>
          </div>
        </>
      )}

      {/* Live regions always mounted, so the result is announced. */}
      <div role="alert">
        {message?.kind === 'error' && (
          <p className="clinical-message clinical-message--error">{message.text}</p>
        )}
      </div>
      <div role="status">
        {message?.kind === 'success' && (
          <p className="clinical-message clinical-message--success">{message.text}</p>
        )}
      </div>
      {message?.kind === 'cancelled' && (
        <p
          ref={messageRef}
          tabIndex={-1}
          className="clinical-message clinical-message--success next-control__message"
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

export default NextControlSection
