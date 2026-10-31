import { useEffect, useRef, useState } from 'react'
import { CalendarCheck, CalendarOff } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import API_BASE_URL from '../config/api'
import { authFetch } from '../utils/auth'
import { clinicNow, shiftYears } from '../utils/clinicDate'
import { invalidateClosedDays } from '../utils/closedDays'
import { addDays, formatWeekdayDate, isClosedDay, parseDate } from '../utils/schedule'
import './ClosedDaysPanel.css'

const CALENDAR_URL = `${API_BASE_URL}/api/calendario/`
const CLOSE_URL = `${API_BASE_URL}/api/calendario/cerrar/`
const OPEN_URL = `${API_BASE_URL}/api/calendario/abrir/`
const JSON_HEADERS = { 'Content-Type': 'application/json' }

// Upcoming days listed in the panel.
const DAYS_AHEAD = 60
// Same limit as the backend (DiaCalendario.MOTIVO_MAX_LENGTH).
const REASON_MAX_LENGTH = 100
const REQUEST_TIMEOUT_MS = 20000

// DRF sends { field: ["msg"] }, { detail: "msg" } or a list; keep only the texts.
function collectMessages(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages)
  return []
}

const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const isSunday = (dateString) => {
  const { year, monthIndex, day } = parseDate(dateString)
  return isClosedDay(year, monthIndex, day)
}

// "sábado 31 de octubre" -> "Sábado 31 de octubre".
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Only links the backend built for wa.me are rendered.
const safeWhatsAppLink = (link) =>
  typeof link === 'string' && link.startsWith('https://wa.me/') ? link : ''

// Panel tab "Días cerrados": close today, tomorrow or another day, list the
// upcoming closed days (holidays and manual) and reopen them. Closing a day
// does not cancel its appointments: the backend returns them with a WhatsApp
// link to let each patient know.
function ClosedDaysPanel({ onSessionExpired }) {
  const [days, setDays] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  // Action in flight: 'today', 'tomorrow', 'other' or "open:YYYY-MM-DD".
  const [pendingAction, setPendingAction] = useState('')
  const [result, setResult] = useState(null)
  const [otherDate, setOtherDate] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [otherError, setOtherError] = useState('')
  const isSubmittingRef = useRef(false)
  const resultRef = useRef(null)
  const dateInputRef = useRef(null)
  const focusResultRef = useRef(false)
  // Latest handler for the load effect, which only reruns on reloadCount.
  const onSessionExpiredRef = useRef(onSessionExpired)
  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired
  })

  const today = clinicNow().date
  const tomorrow = addDays(today, 1)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setIsLoading(true)
      try {
        const start = clinicNow().date
        const params = new URLSearchParams({ desde: start, hasta: addDays(start, DAYS_AHEAD) })
        const response = await authFetch(`${CALENDAR_URL}?${params}`, { signal: controller.signal })
        if (response.status === 401) {
          onSessionExpiredRef.current()
          return
        }
        if (!response.ok) {
          setLoadError(`No pudimos cargar los días cerrados (error ${response.status}).`)
          return
        }
        const data = await readJson(response)
        setDays(Array.isArray(data) ? data : [])
        setLoadError('')
      } catch {
        if (!controller.signal.aborted) {
          setLoadError('No se pudo conectar con el servidor para cargar los días cerrados.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [reloadCount])

  // The result (and its patients to notify) gets the focus once rendered.
  useEffect(() => {
    if (!focusResultRef.current || !result) return
    focusResultRef.current = false
    resultRef.current?.focus()
  }, [result])

  const entryFor = (date) => days.find((day) => day.fecha === date)
  const isDayClosed = (date) => isSunday(date) || entryFor(date)?.estado === 'cerrado'

  // POST with a deadline, one at a time and no automatic retry.
  const send = async (action, url, body) => {
    if (isSubmittingRef.current) return null
    isSubmittingRef.current = true
    setPendingAction(action)
    setResult(null)
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await authFetch(url, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
        signal: timeout.signal,
      })
      if (response.status === 401) {
        onSessionExpired()
        return null
      }
      const data = await readJson(response)
      if (!response.ok) {
        return {
          error:
            collectMessages(data).join(' ') ||
            `No se pudo completar el cambio (error ${response.status}). Inténtalo de nuevo.`,
        }
      }
      // Calendars (booking, next control) and this list read the new state.
      invalidateClosedDays()
      setReloadCount((count) => count + 1)
      return { data }
    } catch {
      return {
        error: timeout.signal.aborted
          ? 'No se pudo confirmar el cambio. Recarga la lista antes de volver a intentarlo.'
          : 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
      }
    } finally {
      clearTimeout(timeoutId)
      isSubmittingRef.current = false
      setPendingAction('')
    }
  }

  // The result gets the focus, so it is read without a live region (which
  // would read it a second time).
  const showResult = (next) => {
    focusResultRef.current = true
    setResult(next)
  }

  const closeDay = async (action, date, reason = '') => {
    const label = formatWeekdayDate(date)
    if (!window.confirm(`¿Cerrar el ${label}? No se podrán hacer reservas ese día.`)) return false
    const outcome = await send(action, CLOSE_URL, { fecha: date, motivo: reason.trim() })
    if (!outcome) return false
    if (outcome.error) {
      showResult({ kind: 'error', text: outcome.error })
      return false
    }
    const appointments = Array.isArray(outcome.data?.citas) ? outcome.data.citas : []
    showResult({ kind: 'closed', text: `${capitalize(label)} quedó cerrado.`, appointments })
    return true
  }

  const openDay = async (date) => {
    const label = capitalize(formatWeekdayDate(date))
    if (!window.confirm(`${label}: ¿Vas a atender este día? Se abrirá para reservas.`)) return
    const outcome = await send(`open:${date}`, OPEN_URL, { fecha: date })
    if (!outcome) return
    showResult(
      outcome.error
        ? { kind: 'error', text: outcome.error }
        : { kind: 'opened', text: `${label} quedó abierto para reservas.` },
    )
  }

  // The date field gets the focus, so its error (aria-describedby) is read.
  const rejectDate = (message) => {
    setOtherError(message)
    dateInputRef.current?.focus()
  }

  const handleOtherSubmit = async (event) => {
    event.preventDefault()
    setOtherError('')
    if (!otherDate) {
      rejectDate('Elige la fecha que quieres cerrar.')
      return
    }
    if (otherDate < today) {
      rejectDate('No se pueden cerrar días pasados.')
      return
    }
    if (isSunday(otherDate)) {
      rejectDate('Los domingos la clínica siempre está cerrada.')
      return
    }
    if (await closeDay('other', otherDate, otherReason)) {
      setOtherDate('')
      setOtherReason('')
    }
  }

  // Quick buttons: disabled with the reason when the day is already closed.
  const quickButton = (action, date, label, closedLabel) => {
    const isClosed = isDayClosed(date)
    const isPending = pendingAction === action
    return (
      <button
        type="button"
        className="closed-days__btn closed-days__btn--primary"
        onClick={() => closeDay(action, date)}
        disabled={isClosed || isLoading || pendingAction !== ''}
      >
        <CalendarOff size={18} strokeWidth={2} aria-hidden="true" />
        {isPending ? 'Cerrando…' : isClosed ? closedLabel : label}
      </button>
    )
  }

  const closedEntries = days.filter((day) => day.estado === 'cerrado')
  const reopenedHolidays = days.filter((day) => day.estado === 'abierto' && day.feriado)

  return (
    <section className="closed-days" aria-labelledby="closed-days-title">
      <h2 id="closed-days-title" className="closed-days__title">
        Días cerrados
      </h2>
      <p className="closed-days__intro">
        Un día cerrado no se puede reservar en el sitio. Las citas que ya tenía no se cancelan:
        avísales a los pacientes.
      </p>

      <div className="closed-days__quick">
        {quickButton('today', today, 'Hoy no abriré', 'Hoy está cerrado')}
        {quickButton('tomorrow', tomorrow, 'Mañana no abriré', 'Mañana está cerrado')}
      </div>

      <form className="closed-days__form" onSubmit={handleOtherSubmit} noValidate>
        <fieldset className="closed-days__fieldset" disabled={pendingAction !== ''}>
          <legend className="closed-days__legend">Cerrar otro día</legend>
          <div className="closed-days__fields">
            <div className="closed-days__field">
              <label htmlFor="closed-days-date">Fecha</label>
              <input
                ref={dateInputRef}
                id="closed-days-date"
                type="date"
                value={otherDate}
                onChange={(event) => {
                  setOtherDate(event.target.value)
                  setOtherError('')
                }}
                min={today}
                max={shiftYears(today, 1)}
                aria-invalid={otherError ? true : undefined}
                aria-describedby={otherError ? 'closed-days-date-error' : undefined}
              />
            </div>
            <div className="closed-days__field closed-days__field--grow">
              <label htmlFor="closed-days-reason">
                Motivo <span className="closed-days__optional">(opcional, lo verán los pacientes)</span>
              </label>
              <input
                id="closed-days-reason"
                type="text"
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                maxLength={REASON_MAX_LENGTH}
                placeholder="Ej.: Capacitación"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="closed-days__btn closed-days__btn--primary">
              <CalendarOff size={18} strokeWidth={2} aria-hidden="true" />
              {pendingAction === 'other' ? 'Cerrando…' : 'Cerrar día'}
            </button>
          </div>
          {otherError && (
            <p id="closed-days-date-error" className="closed-days__field-error">
              {otherError}
            </p>
          )}
        </fieldset>
      </form>

      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="closed-days-result-text"
          className={`closed-days__result closed-days__result--${result.kind === 'error' ? 'error' : 'ok'}`}
        >
          <p id="closed-days-result-text" className="closed-days__result-text">
            {result.text}
          </p>
          {result.kind === 'closed' && result.appointments.length > 0 && (
            <>
              <p className="closed-days__notify-title">
                {result.appointments.length === 1
                  ? 'Hay 1 cita ese día. Avísale:'
                  : `Hay ${result.appointments.length} citas ese día. Avísales:`}
              </p>
              <ul className="closed-days__notify">
                {result.appointments.map((appointment) => {
                  const link = safeWhatsAppLink(appointment.link_whatsapp)
                  return (
                    <li key={appointment.id} className="closed-days__notify-item">
                      <span className="closed-days__notify-who">
                        <strong>{appointment.hora}</strong> · {appointment.nombre}
                        <span className="closed-days__notify-phone">{appointment.telefono}</span>
                      </span>
                      {link ? (
                        <a
                          className="closed-days__btn closed-days__btn--whatsapp"
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Escribir por WhatsApp a ${appointment.nombre} (${appointment.hora})`}
                        >
                          <FaWhatsapp size={18} aria-hidden="true" />
                          WhatsApp
                        </a>
                      ) : (
                        <span className="closed-days__notify-nolink">
                          Sin WhatsApp: llama al {appointment.telefono}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      <h3 className="closed-days__subtitle">Próximos días cerrados</h3>
      <p className="closed-days__hint">Feriados y días cerrados de los próximos {DAYS_AHEAD} días.</p>

      {isLoading && days.length === 0 ? (
        <p className="closed-days__message" role="status">
          Cargando días cerrados…
        </p>
      ) : loadError ? (
        <div className="closed-days__load-error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="closed-days__btn"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : closedEntries.length === 0 && reopenedHolidays.length === 0 ? (
        <p className="closed-days__message">No hay días cerrados en los próximos {DAYS_AHEAD} días.</p>
      ) : (
        <ul className="closed-days__list">
          {[...closedEntries, ...reopenedHolidays]
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map((day) => {
              const isClosed = day.estado === 'cerrado'
              const label = capitalize(formatWeekdayDate(day.fecha))
              const appointments = Number(day.citas) || 0
              return (
                <li key={day.fecha} className={`closed-days__item${isClosed ? '' : ' is-open'}`}>
                  <div className="closed-days__item-text">
                    <p className="closed-days__item-date">
                      {label}
                      <span className={`closed-days__tag closed-days__tag--${day.origen === 'feriado' ? 'holiday' : 'manual'}`}>
                        {day.origen !== 'feriado' ? 'Cerrado a mano' : isClosed ? 'Feriado' : 'Feriado abierto'}
                      </span>
                    </p>
                    <p className="closed-days__item-reason">
                      {isClosed
                        ? day.motivo || 'Sin motivo'
                        : `${day.feriado}: abierto, vas a atender`}
                      {appointments > 0 &&
                        ` · ${appointments} ${appointments === 1 ? 'cita' : 'citas'}`}
                    </p>
                  </div>
                  {isClosed && day.puede_reabrir && (
                    <button
                      type="button"
                      className="closed-days__btn"
                      onClick={() => openDay(day.fecha)}
                      disabled={pendingAction !== ''}
                      aria-label={`Reabrir el ${formatWeekdayDate(day.fecha)}`}
                    >
                      <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
                      {pendingAction === `open:${day.fecha}` ? 'Abriendo…' : 'Reabrir'}
                    </button>
                  )}
                  {!isClosed && day.puede_cerrar && (
                    <button
                      type="button"
                      className="closed-days__btn"
                      onClick={() => closeDay(`close:${day.fecha}`, day.fecha)}
                      disabled={pendingAction !== ''}
                      aria-label={`Volver a cerrar el ${formatWeekdayDate(day.fecha)}`}
                    >
                      <CalendarOff size={18} strokeWidth={2} aria-hidden="true" />
                      {pendingAction === `close:${day.fecha}` ? 'Cerrando…' : 'Volver a cerrar'}
                    </button>
                  )}
                </li>
              )
            })}
        </ul>
      )}
    </section>
  )
}

export default ClosedDaysPanel
