import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { MonthCalendar } from './SlotPicker'
import { useClosedDays } from '../utils/closedDays'
import { addDays, formatWeekdayDate, monthOf } from '../utils/schedule'
import './OtherDayView.css'

// Hasta cuántos días adelante se puede elegir (12 meses).
const DAYS_AHEAD = 365

// Vista "Bloquear otro día" dentro de la pestaña "Agenda de hoy": calendario arriba
// y, al elegir un día, sus franjas abajo (`renderAgenda`).
// - `today`: hoy en Chile ("YYYY-MM-DD"); no se pueden elegir días anteriores.
// - `date`: día elegido ('' si aún no hay).
// - `renderAgenda(closedReason)`: las franjas del día; `closedReason` es un texto
//   (puede ser '') si el día está cerrado o es feriado, y undefined si está abierto.
function OtherDayView({ today, date, onDateChange, onBack, renderAgenda }) {
  const [month, setMonth] = useState(() => monthOf(today))
  const maxDate = addDays(today, DAYS_AHEAD)
  const headingRef = useRef(null)
  const resultRef = useRef(null)

  // Mes del día elegido: de ahí sale si está cerrado (el calendario lee el mes que se ve).
  const closedDays = useClosedDays(date ? monthOf(date) : null)
  const closedReason = date && date in closedDays ? closedDays[date] : undefined

  // Al abrir la vista, el foco va a su título.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Al elegir un día, las franjas quedan a la vista. El foco se queda en el día tocado.
  useEffect(() => {
    if (date) resultRef.current?.scrollIntoView({ block: 'start' })
  }, [date])

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

      <div className="other-day__calendar">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          minMonth={monthOf(today)}
          maxMonth={monthOf(maxDate)}
          today={today}
          maxDate={maxDate}
          selectedDate={date}
          onSelectDate={onDateChange}
          labelId="other-day-month"
        />
      </div>

      {/* Anuncia el día elegido sin mover el foco del calendario. */}
      <p className="other-day__sr" role="status">
        {date ? `Mostrando las horas del ${formatWeekdayDate(date)}.` : ''}
      </p>

      <div ref={resultRef} className="other-day__result">
        {date ? (
          renderAgenda(closedReason)
        ) : (
          <p className="other-day__prompt">Aún no has elegido ningún día.</p>
        )}
      </div>
    </section>
  )
}

export default OtherDayView
