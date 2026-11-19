import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUp, Lock } from 'lucide-react'
import { MonthCalendar } from './SlotPicker'
import useUpcomingBlocks, { UPCOMING_DAYS } from '../hooks/useUpcomingBlocks'
import { useClosedDaysStatus } from '../utils/closedDays'
import { addDays, formatWeekdayDate, monthOf } from '../utils/schedule'
import './OtherDayView.css'

// Hasta cuántos días adelante se puede elegir en el calendario (12 meses).
const DAYS_AHEAD = 365

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Vista "Bloquear otro día" dentro de la pestaña "Agenda de hoy": calendario,
// lista de próximos bloqueos y, al elegir un día, sus franjas (`renderAgenda`).
// - `today`: hoy en Chile ("YYYY-MM-DD"); no se pueden elegir días anteriores.
// - `date`: día elegido ('' si aún no hay).
// - `refreshKey`: cambia tras bloquear o liberar; la lista de próximos se relee.
// - `onSessionExpired()`: 401 al leer la lista.
// - `renderAgenda(closedReason, isCheckingClosed)`: las franjas del día. `closedReason`
//   es un texto (puede ser '') si el día está cerrado o es feriado y undefined si
//   está abierto; `isCheckingClosed` es true mientras se lee si lo está.
function OtherDayView({ today, date, onDateChange, onBack, refreshKey, onSessionExpired, renderAgenda }) {
  const [month, setMonth] = useState(() => monthOf(today))
  const maxDate = addDays(today, DAYS_AHEAD)
  const headingRef = useRef(null)
  const resultRef = useRef(null)
  const calendarRef = useRef(null)
  const listRef = useRef(null)
  // Día abierto desde la lista: al volver, el foco regresa a su botón.
  const openedFromListRef = useRef('')

  const upcoming = useUpcomingBlocks(today, { refreshKey, onSessionExpired })

  // Mes del día elegido: de ahí sale si está cerrado (el calendario lee el mes que se ve).
  const { days: closedDays, isLoaded: closedLoaded } = useClosedDaysStatus(date ? monthOf(date) : null)
  const closedReason = date && date in closedDays ? closedDays[date] : undefined

  // Al abrir la vista, el foco va a su título.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Al elegir un día, las franjas quedan a la vista. El foco se queda donde estaba.
  useEffect(() => {
    if (date) resultRef.current?.scrollIntoView({ block: 'start' })
  }, [date])

  const pickFromCalendar = (picked) => {
    openedFromListRef.current = ''
    onDateChange(picked)
  }

  // Desde la lista se puede abrir cualquier día con bloqueos, aunque esté cerrado
  // (el calendario no deja elegirlo). El calendario pasa a ese mes.
  const pickFromList = (picked) => {
    openedFromListRef.current = picked
    setMonth(monthOf(picked))
    onDateChange(picked)
  }

  // Sube al calendario sin perder el día elegido: el foco va al botón de la lista
  // de donde vino, o al día marcado, o al título.
  const goToCalendar = () => {
    headingRef.current?.scrollIntoView({ block: 'start' })
    const fromList = openedFromListRef.current
    const target =
      (fromList && listRef.current?.querySelector(`[data-date="${fromList}"]`)) ||
      calendarRef.current?.querySelector('[aria-pressed="true"]') ||
      headingRef.current
    // El scroll ya lo hizo scrollIntoView: el foco no debe moverlo a otro sitio.
    target?.focus({ preventScroll: true })
  }

  return (
    <section className="other-day" aria-labelledby="other-day-title">
      <div className="other-day__bar">
        <button type="button" className="other-day__back" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          Volver a hoy
        </button>
      </div>

      <h2 id="other-day-title" ref={headingRef} tabIndex={-1} className="other-day__title">
        Elegir otro día
      </h2>
      <p className="other-day__hint">Elige un día para ver sus horas y bloquearlas o liberarlas.</p>

      <div ref={calendarRef} className="other-day__calendar">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          minMonth={monthOf(today)}
          maxMonth={monthOf(maxDate)}
          today={today}
          maxDate={maxDate}
          selectedDate={date}
          onSelectDate={pickFromCalendar}
          labelId="other-day-month"
        />
      </div>

      <section className="other-day__upcoming" aria-labelledby="other-day-upcoming-title">
        <h3 id="other-day-upcoming-title" className="other-day__subtitle">
          Próximos bloqueos
        </h3>
        <p className="other-day__hint">Se muestran los de mañana hasta dentro de {UPCOMING_DAYS} días; para otras fechas usa el calendario. Toca una fecha para abrirla.</p>

        {upcoming.status === 'error' && (
          <div className="other-day__upcoming-error" role="alert">
            <p>No se pudieron cargar los próximos bloqueos. El calendario sigue funcionando.</p>
            <button type="button" className="other-day__retry" onClick={upcoming.retry}>
              Reintentar
            </button>
          </div>
        )}
        {upcoming.status === 'loading' && (
          <p className="other-day__hint" role="status">
            Cargando próximos bloqueos…
          </p>
        )}
        {upcoming.status === 'ok' && upcoming.groups.length === 0 && (
          <p className="other-day__hint">No tienes bloqueos próximos.</p>
        )}
        {upcoming.groups.length > 0 && (
          <ul ref={listRef} className="other-day__list">
            {upcoming.groups.map(({ date: groupDate, times }) => (
              <li key={groupDate}>
                <button
                  type="button"
                  className="other-day__day-button"
                  data-date={groupDate}
                  aria-current={groupDate === date ? 'true' : undefined}
                  onClick={() => pickFromList(groupDate)}
                >
                  <Lock size={16} aria-hidden="true" />
                  <span className="other-day__day-text">
                    <span className="other-day__day-name">
                      {capitalize(formatWeekdayDate(groupDate))}
                      {groupDate === date && <span className="other-day__sr"> (día abierto)</span>}
                    </span>
                    <span className="other-day__day-times">
                      {times.length} {times.length === 1 ? 'hora bloqueada' : 'horas bloqueadas'}: {times.join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Anuncia el día elegido sin mover el foco. */}
      <p className="other-day__sr" role="status">
        {date ? `Mostrando las horas del ${formatWeekdayDate(date)}.` : ''}
      </p>

      <div ref={resultRef} className="other-day__result">
        {date ? (
          <>
            <button type="button" className="other-day__change" onClick={goToCalendar}>
              <ArrowUp size={16} aria-hidden="true" />
              Cambiar de día
            </button>
            {renderAgenda(closedReason, !closedLoaded)}
          </>
        ) : (
          <p className="other-day__prompt">Aún no has elegido ningún día.</p>
        )}
      </div>
    </section>
  )
}

export default OtherDayView
