import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  dayAccessibleLabel,
  formatDate,
  formatMonthLabel,
  isClosedDay,
  monthKey,
  monthOf,
  addMonths,
  slotsForDate,
} from '../utils/schedule'
import './SlotPicker.css'

// Month grid with previous/next month buttons. Days before `today`, after
// `maxDate` and Sundays are disabled. `month` is controlled by the parent.
export function MonthCalendar({
  month,
  onMonthChange,
  minMonth,
  maxMonth,
  today,
  maxDate = '',
  selectedDate,
  onSelectDate,
  labelId,
}) {
  const { year, monthIndex } = month
  const key = monthKey(month)
  const canGoBack = !minMonth || key > monthKey(minMonth)
  const canGoForward = !maxMonth || key < monthKey(maxMonth)
  const monthLabel = formatMonthLabel(year, monthIndex)

  return (
    <div className="slot-picker__calendar">
      <div className="slot-picker__month-row">
        {/* Announced when the month changes. */}
        <p id={labelId} className="slot-picker__month" aria-live="polite">
          {monthLabel}
        </p>
        <button
          type="button"
          className="slot-picker__nav"
          // aria-disabled, not disabled: the button keeps focus at the first month.
          onClick={() => canGoBack && onMonthChange(addMonths(month, -1))}
          aria-disabled={!canGoBack || undefined}
          aria-label="Mes anterior"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="slot-picker__nav"
          onClick={() => canGoForward && onMonthChange(addMonths(month, 1))}
          aria-disabled={!canGoForward || undefined}
          aria-label="Mes siguiente"
        >
          <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="slot-picker__weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="slot-picker__days" role="group" aria-labelledby={labelId}>
        {buildMonthGrid(year, monthIndex).map((day, index) => {
          if (day == null) {
            return <span key={`empty-${index}`} className="slot-picker__day is-empty" aria-hidden="true" />
          }
          const date = formatDate(year, monthIndex, day)
          const isUnavailable =
            date < today || (maxDate !== '' && date > maxDate) || isClosedDay(year, monthIndex, day)
          const isToday = date === today
          const isSelected = date === selectedDate

          return (
            <button
              type="button"
              key={date}
              className={`slot-picker__day ${isUnavailable ? 'is-disabled' : ''} ${isToday ? 'is-today' : ''
                } ${isSelected ? 'is-selected' : ''}`}
              disabled={isUnavailable}
              aria-label={dayAccessibleLabel(year, monthIndex, day, isUnavailable)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(date)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Time chips (44px). isTimeDisabled(time) -> true for busy or past times.
// Without labelId (inside a fieldset that names it) it is a plain container.
export function TimeSlotGrid({ times, selectedTime, onSelectTime, isTimeDisabled, labelId }) {
  return (
    <div
      className="slot-picker__times"
      role={labelId ? 'group' : undefined}
      aria-labelledby={labelId}
    >
      {times.map((time) => {
        const isDisabled = isTimeDisabled(time)
        return (
          <button
            type="button"
            key={time}
            className={`slot-picker__time ${time === selectedTime ? 'is-selected' : ''}`}
            disabled={isDisabled}
            aria-label={isDisabled ? `${time}, no disponible` : undefined}
            aria-pressed={time === selectedTime}
            onClick={() => onSelectTime(time)}
          >
            {time}
          </button>
        )
      })}
    </div>
  )
}

// Calendar and times side by side (stacked on narrow screens), for the panel.
// value: { date: "YYYY-MM-DD" | "", time: "HH:MM" | "" }.
function SlotPicker({
  idPrefix,
  value,
  onChange,
  today,
  maxDate,
  isTimeDisabled,
  disabled = false,
}) {
  const [month, setMonth] = useState(() => monthOf(value.date || today))
  const times = slotsForDate(value.date)
  const monthLabelId = `${idPrefix}-month`

  return (
    <div className="slot-picker slot-picker--panel">
      <fieldset className="slot-picker__fieldset" disabled={disabled}>
        <legend className="slot-picker__legend">Día</legend>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          minMonth={monthOf(today)}
          maxMonth={maxDate ? monthOf(maxDate) : undefined}
          today={today}
          maxDate={maxDate}
          selectedDate={value.date}
          onSelectDate={(date) => onChange({ date, time: '' })}
          labelId={monthLabelId}
        />
      </fieldset>
      <fieldset className="slot-picker__fieldset" disabled={disabled}>
        <legend className="slot-picker__legend">
          Hora
        </legend>
        {value.date ? (
          <>
            <TimeSlotGrid
              times={times}
              selectedTime={value.time}
              onSelectTime={(time) => onChange({ date: value.date, time })}
              isTimeDisabled={(time) => isTimeDisabled(value.date, time)}
            />
            {times.every((time) => isTimeDisabled(value.date, time)) && (
              <p className="slot-picker__note">No quedan horas libres ese día. Elige otro día.</p>
            )}
          </>
        ) : (
          <p className="slot-picker__note">Elige un día para ver las horas.</p>
        )}
      </fieldset>
    </div>
  )
}

export default SlotPicker
