import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, CircleCheck, Clock, MapPin, X } from 'lucide-react'
import { formatRUT, validarRut } from '../utils/rutValidation'
import { servicesData, specialtiesData } from '../data/services'
import API_BASE_URL from '../config/api'
import './BookingModal.css'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Opening hours by weekday (Date#getDay: 0 = Sunday), in minutes from midnight.
// Sunday is closed. Every appointment lasts SLOT_MINUTES and must finish by the
// closing time.
const SLOT_MINUTES = 90

const BUSINESS_HOURS = {
  weekday: { open: 10 * 60, close: 19 * 60 }, // Mon-Fri 10:00-19:00
  saturday: { open: 9 * 60, close: 14 * 60 }, // Sat 09:00-14:00
}

const getHoursForDay = (dayOfWeek) => {
  if (dayOfWeek === 0) return null
  return dayOfWeek === 6 ? BUSINESS_HOURS.saturday : BUSINESS_HOURS.weekday
}

const formatMinutes = (totalMinutes) =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(
    totalMinutes % 60,
  ).padStart(2, '0')}`

const isClosedDay = (year, month, day) =>
  getHoursForDay(new Date(year, month, day).getDay()) === null

function generateTimeSlots(year, month, day) {
  const hours = getHoursForDay(new Date(year, month, day).getDay())
  if (!hours) return []

  const slots = []
  for (
    let start = hours.open;
    start + SLOT_MINUTES <= hours.close;
    start += SLOT_MINUTES
  ) {
    slots.push(formatMinutes(start))
  }
  return slots
}

const SERVICE_OPTIONS = [
  ...servicesData.map((service) => service.title),
  ...specialtiesData.map((service) => service.title),
  'Evaluación General',
]

const API_URL = `${API_BASE_URL}/api/appointments/`

const BUSY_SLOTS_URL = `${API_BASE_URL}/api/appointments/horarios-ocupados/`

// Same list as the panel modals: what Tab can land on inside the dialog.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const formatDate = (year, monthIndex, day) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const INITIAL_FORM = {
  nombre: '',
  rut: '',
  telefono: '',
  email: '',
  motivo: '',
}

// Same address as the footer; the link opens Google Maps directions to it.
const CLINIC_ADDRESS = 'Av. José Joaquín Pérez 4435, Quinta Normal, Santiago, Chile'
const CLINIC_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_ADDRESS)}`

// Name: letters (accents and ñ included), spaces, apostrophes and hyphens.
const formatName = (value) => value.replace(/[^\p{L}\s'’-]/gu, '')

// Per-field input filters. Fields not listed here are left as typed.
const FIELD_FORMATTERS = { nombre: formatName, rut: formatRUT }

// Accessible name for a calendar day: "martes 14 de octubre de 2026", plus
// ", no disponible" when isUnavailable (past or closed days). The visible text
// stays the number. es-CL writes "martes, 14 de…"; only the comma right after
// the weekday is dropped.
function dayAccessibleLabel(year, monthIndex, day, isUnavailable) {
  const label = new Date(year, monthIndex, day)
    .toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .replace(/^(\p{L}+),/u, '$1')
  return isUnavailable ? `${label}, no disponible` : label
}

function buildMonthGrid(referenceDate) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0

  const cells = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }

  return cells
}

function BookingModal({ isOpen, onClose, initialService = '' }) {
  const today = new Date()
  const monthLabel = today.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  const monthCells = buildMonthGrid(today)

  const [step, setStep] = useState(1)
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [formData, setFormData] = useState({
    ...INITIAL_FORM,
    motivo: initialService,
  })
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [busySlots, setBusySlots] = useState([])

  useEffect(() => {
    if (!isOpen) return undefined

    const controller = new AbortController()

    const loadBusySlots = async () => {
      try {
        const response = await fetch(BUSY_SLOTS_URL, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json()
        // Backend sends "10:00:00"; trim seconds to match "10:00" slots.
        setBusySlots(
          data.map(({ appointment_date, appointment_time }) => ({
            date: appointment_date,
            time: appointment_time.slice(0, 5),
          })),
        )
      } catch {
        // Network error or aborted: leave all slots enabled.
      }
    }

    loadBusySlots()
    return () => controller.abort()
  }, [isOpen])

  const dialogRef = useRef(null)
  const panelRef = useRef(null)
  const returnFocusRef = useRef(null)
  // Latest onClose for the document-level Escape listener, which is
  // registered once per opening.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Same pattern as the panel modals. On open: remember who opened the modal,
  // make the rest of the page inert and focus the dialog. On close: undo that
  // and hand focus back.
  useEffect(() => {
    if (!isOpen) return undefined

    returnFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'

    // Every sibling of the overlay and of its ancestors, up to <body>, is
    // background. Elements that were already inert are left alone.
    const madeInert = []
    let node = dialogRef.current?.parentElement
    while (node && node !== document.body) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && !sibling.inert) {
          sibling.inert = true
          madeInert.push(sibling)
        }
      }
      node = node.parentElement
    }

    dialogRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      madeInert.forEach((element) => {
        element.inert = false
      })
      const opener = returnFocusRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen])

  // The clicked day or hour unmounts when the step changes; move focus to the
  // new step so keyboard users are not dropped on <body>.
  // Compares against the previous step instead of a "first render" flag, so
  // StrictMode's double effect run in development does not move focus on open.
  const prevStepRef = useRef({ step, isConfirmed })
  useEffect(() => {
    const prev = prevStepRef.current
    if (prev.step === step && prev.isConfirmed === isConfirmed) return
    prevStepRef.current = { step, isConfirmed }
    panelRef.current?.focus()
  }, [step, isConfirmed])

  // Tab cycles within the dialog.
  const handleDialogKeyDown = (event) => {
    if (event.key !== 'Tab') return

    const focusables = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement

    // From the panel (focused after a step change) Shift+Tab is left to the
    // browser, so it goes to the step buttons instead of wrapping to the end.
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const selectedDate =
    selectedDay != null
      ? formatDate(today.getFullYear(), today.getMonth(), selectedDay)
      : null

  const timeSlots =
    selectedDay != null
      ? generateTimeSlots(today.getFullYear(), today.getMonth(), selectedDay)
      : []

  const isSlotBusy = (time) =>
    busySlots.some(
      (slot) => slot.date === selectedDate && slot.time === time,
    )

  // Only today can have past slots: a slot is past once its start time has
  // been reached on the clock ("18:30" is disabled at 18:45).
  const isSlotPast = (time) => {
    if (selectedDay !== today.getDate()) return false
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes <= today.getHours() * 60 + today.getMinutes()
  }

  const handleDayClick = (day) => {
    if (day == null || day < today.getDate()) return
    if (isClosedDay(today.getFullYear(), today.getMonth(), day)) return
    setSelectedDay(day)
    setSelectedTime(null)
    setStep(2)
  }

  const handleTimeClick = (time) => {
    setSelectedTime(time)
    setStep(3)
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    const nextValue = FIELD_FORMATTERS[name]?.(value) ?? value
    setFormData((prev) => ({ ...prev, [name]: nextValue }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')

    if (!validarRut(formData.rut)) {
      setErrorMessage('El RUT ingresado no es válido')
      return
    }

    setIsLoading(true)

    const appointmentDate = selectedDate

    const payload = {
      patient_name: formData.nombre,
      rut: formData.rut,
      phone: formData.telefono,
      email: formData.email,
      service_type: formData.motivo,
      appointment_date: appointmentDate,
      appointment_time: selectedTime,
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 201) {
        setIsConfirmed(true)
      } else if (response.status === 429) {
        // Backend rate limit: max 5 reservas por minuto.
        setErrorMessage(
          'Has realizado demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.',
        )
      } else {
        let detail = ''
        try {
          detail = JSON.stringify(await response.json())
        } catch {
          // response body was not JSON
        }
        setErrorMessage(
          `No pudimos agendar tu hora (error ${response.status}). ${detail}`.trim(),
        )
      }
    } catch {
      setErrorMessage(
        'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setStep(1)
    setSelectedDay(null)
    setSelectedTime(null)
    setFormData(INITIAL_FORM)
    setIsConfirmed(false)
  }

  const goToStep = (targetStep) => {
    if (isConfirmed) return
    if (targetStep === 1) setStep(1)
    if (targetStep === 2 && selectedDay != null) setStep(2)
  }

  const handleClose = () => {
    onClose()
    if (isConfirmed) handleReset()
  }

  if (!isOpen) return null

  return (
    <div
      className="booking-modal-overlay"
      onClick={handleClose}
      // Clicking the backdrop must not pull focus out of the dialog.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <div
        ref={dialogRef}
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-modal__header">
          <div>
            <h2 id="booking-modal-title" className="booking-modal__title">
              Agenda tu hora
            </h2>
            <p className="booking-modal__subtitle">
              Reserva tu atención podológica en simples pasos, sin llamadas ni
              esperas.
            </p>
          </div>
          <button
            type="button"
            className="booking-modal__close"
            onClick={handleClose}
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="booking-modal__card">
          <aside className="booking-modal__info">
            <h3 className="booking-modal__info-title">Consulta podológica</h3>
            <ul className="booking-modal__info-meta">
              <li>
                <Clock size={16} strokeWidth={1.5} aria-hidden="true" /> Duración: 40 min
              </li>
              <li>
                <MapPin size={16} strokeWidth={1.5} aria-hidden="true" /> Atención presencial
              </li>
            </ul>

            <ol className="booking-modal__steps">
              <li>
                <button
                  type="button"
                  className={`booking-modal__step ${step === 1 ? 'is-active' : ''
                    } ${selectedDay != null ? 'is-done' : ''}`}
                  onClick={() => goToStep(1)}
                  disabled={isConfirmed}
                  aria-current={step === 1 && !isConfirmed ? 'step' : undefined}
                >
                  <span className="booking-modal__step-index" aria-hidden="true">
                    {selectedDay != null ? <Check size={14} strokeWidth={2.5} /> : 1}
                  </span>
                  <span>
                    <span className="booking-modal__step-label">Fecha</span>
                    <span className="booking-modal__step-value">
                      {selectedDay != null
                        ? `${selectedDay} de ${monthLabel}`
                        : 'Sin seleccionar'}
                    </span>
                  </span>
                </button>
              </li>

              <li>
                <button
                  type="button"
                  className={`booking-modal__step ${step === 2 ? 'is-active' : ''
                    } ${selectedTime ? 'is-done' : ''}`}
                  onClick={() => goToStep(2)}
                  disabled={isConfirmed || selectedDay == null}
                  aria-current={step === 2 && !isConfirmed ? 'step' : undefined}
                >
                  <span className="booking-modal__step-index" aria-hidden="true">
                    {selectedTime ? <Check size={14} strokeWidth={2.5} /> : 2}
                  </span>
                  <span>
                    <span className="booking-modal__step-label">Hora</span>
                    <span className="booking-modal__step-value">
                      {selectedTime ?? 'Sin seleccionar'}
                    </span>
                  </span>
                </button>
              </li>

              <li>
                <div
                  className={`booking-modal__step ${step === 3 ? 'is-active' : ''
                    } ${isConfirmed ? 'is-done' : ''}`}
                  aria-current={step === 3 && !isConfirmed ? 'step' : undefined}
                >
                  <span className="booking-modal__step-index" aria-hidden="true">
                    {isConfirmed ? <Check size={14} strokeWidth={2.5} /> : 3}
                  </span>
                  <span>
                    <span className="booking-modal__step-label">Tus datos</span>
                    <span className="booking-modal__step-value">
                      {isConfirmed ? 'Confirmado' : 'Pendiente'}
                    </span>
                  </span>
                </div>
              </li>
            </ol>
          </aside>

          <div className="booking-modal__panel" ref={panelRef} tabIndex={-1}>
            {isConfirmed ? (
              <div className="booking-modal__confirmation">
                <h3 className="booking-modal__confirmation-title">
                  <CircleCheck
                    className="booking-modal__confirmation-icon"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>¡Reserva confirmada!</span>
                </h3>
                <p>
                  Hemos agendado tu hora para el{' '}
                  <strong>
                    {selectedDay} de {monthLabel}
                  </strong>{' '}
                  a las <strong>{selectedTime}</strong>.
                </p>
                <p className="booking-modal__confirmation-name">
                  Te esperamos, {formData.nombre?.trim() || 'paciente'}.
                </p>

                <div className="booking-modal__location">
                  <p className="booking-modal__location-label">Dónde estamos</p>
                  <p className="booking-modal__location-address">{CLINIC_ADDRESS}</p>
                  <a
                    href={CLINIC_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="booking-modal__map-btn"
                  >
                    <MapPin size={18} strokeWidth={1.5} aria-hidden="true" />
                    Cómo llegar
                  </a>
                </div>

                <button
                  type="button"
                  className="booking-modal__link-btn"
                  onClick={handleReset}
                >
                  Reservar otra hora
                </button>
              </div>
            ) : step === 1 ? (
              <div className="booking-modal__calendar">
                <p className="booking-modal__calendar-month">{monthLabel}</p>
                <div className="booking-modal__weekdays" aria-hidden="true">
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="booking-modal__days">
                  {monthCells.map((day, index) => {
                    const isClosed =
                      day != null &&
                      isClosedDay(today.getFullYear(), today.getMonth(), day)
                    const isPast =
                      day != null && (day < today.getDate() || isClosed)
                    const isToday = day === today.getDate()
                    const isSelected = day === selectedDay

                    return (
                      <button
                        type="button"
                        key={index}
                        className={`booking-modal__day ${day == null ? 'is-empty' : ''
                          } ${isPast ? 'is-disabled' : ''} ${isToday ? 'is-today' : ''
                          } ${isSelected ? 'is-selected' : ''}`}
                        disabled={day == null || isPast}
                        aria-hidden={day == null ? 'true' : undefined}
                        aria-label={
                          day == null
                            ? undefined
                            : dayAccessibleLabel(
                                today.getFullYear(),
                                today.getMonth(),
                                day,
                                isPast,
                              )
                        }
                        aria-current={isToday ? 'date' : undefined}
                        aria-pressed={day == null ? undefined : isSelected}
                        onClick={() => handleDayClick(day)}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : step === 2 ? (
              <div className="booking-modal__times">
                <button
                  type="button"
                  className="booking-modal__back"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="booking-modal__back-icon" strokeWidth={2} aria-hidden="true" />
                  Volver al calendario
                </button>
                <p className="booking-modal__times-label">
                  Horas disponibles para el {selectedDay} de {monthLabel}
                </p>
                <div className="booking-modal__times-grid">
                  {timeSlots.map((time) => (
                    <button
                      type="button"
                      key={time}
                      className={`booking-modal__time ${time === selectedTime ? 'is-selected' : ''
                        }`}
                      disabled={isSlotBusy(time) || isSlotPast(time)}
                      onClick={() => handleTimeClick(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form className="booking-modal__form" onSubmit={handleSubmit}>
                <button
                  type="button"
                  className="booking-modal__back"
                  onClick={() => setStep(2)}
                >
                  <ChevronLeft className="booking-modal__back-icon" strokeWidth={2} aria-hidden="true" />
                  Volver a las horas
                </button>
                <p className="booking-modal__times-label">
                  {selectedDay} de {monthLabel} · {selectedTime}
                </p>

                <label className="booking-modal__field">
                  Nombre completo
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleFormChange}
                    placeholder="Ej: María Pérez"
                    required
                  />
                </label>

                <label className="booking-modal__field">
                  RUT
                  <input
                    type="text"
                    name="rut"
                    value={formData.rut}
                    onChange={handleFormChange}
                    placeholder="Ej: 12.345.678-9"
                    required
                  />
                </label>

                <label className="booking-modal__field">
                  Teléfono
                  <input
                    type="tel"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleFormChange}
                    placeholder="Ej: +56 9 1234 5678"
                    required
                  />
                </label>

                <label className="booking-modal__field">
                  Correo electrónico
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    placeholder="Ej: maria@correo.com"
                    required
                  />
                </label>

                <label className="booking-modal__field">
                  Motivo de consulta
                  <select
                    name="motivo"
                    value={formData.motivo}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="" disabled>
                      Selecciona un servicio…
                    </option>
                    {SERVICE_OPTIONS.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </label>

                {errorMessage && (
                  <p className="booking-modal__error" role="alert">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  className="booking-modal__submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Enviando…' : 'Confirmar reserva'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookingModal
