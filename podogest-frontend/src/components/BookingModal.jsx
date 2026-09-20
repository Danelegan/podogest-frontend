import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { validarRut } from '../utils/rutValidation'
import { servicesData, specialtiesData } from '../data/services'
import './BookingModal.css'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const TIME_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
]

const SERVICE_OPTIONS = [
  ...servicesData.map((service) => service.title),
  ...specialtiesData.map((service) => service.title),
  'Evaluación General',
]

const API_URL = 'https://podogest-backend.onrender.com/api/appointments/'

const BUSY_SLOTS_URL =
  'https://podogest-backend.onrender.com/api/appointments/horarios-ocupados/'

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

// "252370927" -> "25.237.092-7". Keeps only digits and K, max 9 characters.
function formatRUT(value) {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9)
  if (clean.length <= 1) return clean

  const body = clean.slice(0, -1).replace(/\D/g, '')
  const verifier = clean.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${verifier}`
}

// Name: letters (accents and ñ included), spaces, apostrophes and hyphens.
const formatName = (value) => value.replace(/[^\p{L}\s'’-]/gu, '')

// Per-field input filters. Fields not listed here are left as typed.
const FIELD_FORMATTERS = { nombre: formatName, rut: formatRUT }

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

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const selectedDate =
    selectedDay != null
      ? formatDate(today.getFullYear(), today.getMonth(), selectedDay)
      : null

  const isSlotBusy = (time) =>
    busySlots.some(
      (slot) => slot.date === selectedDate && slot.time === time,
    )

  const handleDayClick = (day) => {
    if (day == null || day < today.getDate()) return
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

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      key="booking-modal"
      className="booking-modal-overlay"
      onClick={handleClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        onClick={(event) => event.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          className="booking-modal__close"
          onClick={handleClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="booking-modal__header">
          <h2 id="booking-modal-title" className="booking-modal__title">
            Agenda tu Hora
          </h2>
          <p className="booking-modal__subtitle">
            Reserva tu atención podológica en simples pasos, sin llamadas ni
            esperas.
          </p>
        </div>

        <div className="booking-modal__card">
          <aside className="booking-modal__info">
            <h3 className="booking-modal__info-title">Consulta Podológica</h3>
            <ul className="booking-modal__info-meta">
              <li>
                <span aria-hidden="true">⏱️</span> Duración: 40 min
              </li>
              <li>
                <span aria-hidden="true">📍</span> Atención presencial
              </li>
            </ul>

            <ol className="booking-modal__steps">
              <li
                className={`booking-modal__step ${step === 1 ? 'is-active' : ''
                  } ${selectedDay != null ? 'is-done' : ''}`}
                onClick={() => goToStep(1)}
              >
                <span className="booking-modal__step-index">1</span>
                <div>
                  <p className="booking-modal__step-label">Fecha</p>
                  <p className="booking-modal__step-value">
                    {selectedDay != null
                      ? `${selectedDay} de ${monthLabel}`
                      : 'Sin seleccionar'}
                  </p>
                </div>
              </li>

              <li
                className={`booking-modal__step ${step === 2 ? 'is-active' : ''
                  } ${selectedTime ? 'is-done' : ''}`}
                onClick={() => goToStep(2)}
              >
                <span className="booking-modal__step-index">2</span>
                <div>
                  <p className="booking-modal__step-label">Hora</p>
                  <p className="booking-modal__step-value">
                    {selectedTime ?? 'Sin seleccionar'}
                  </p>
                </div>
              </li>

              <li
                className={`booking-modal__step ${step === 3 ? 'is-active' : ''
                  } ${isConfirmed ? 'is-done' : ''}`}
              >
                <span className="booking-modal__step-index">3</span>
                <div>
                  <p className="booking-modal__step-label">Tus Datos</p>
                  <p className="booking-modal__step-value">
                    {isConfirmed ? 'Confirmado' : 'Pendiente'}
                  </p>
                </div>
              </li>
            </ol>
          </aside>

          <div className="booking-modal__panel">
            {isConfirmed ? (
              <motion.div
                className="booking-modal__confirmation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div
                  className="booking-modal__confirmation-icon"
                  aria-hidden="true"
                >
                  ✅
                </div>
                <h3 className="booking-modal__confirmation-title">¡Reserva Confirmada!</h3>
                <p>
                  Hemos agendado tu hora para el{' '}
                  <strong>
                    {selectedDay} de {monthLabel}
                  </strong>{' '}
                  a las <strong>{selectedTime}</strong>.
                </p>
                <p className="booking-modal__confirmation-name">
                  Te esperamos, {formData.nombre || 'paciente'}.
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
                    📍 Cómo llegar
                  </a>
                </div>

                <button
                  type="button"
                  className="booking-modal__link-btn"
                  onClick={handleReset}
                >
                  Reservar otra hora
                </button>
              </motion.div>
            ) : step === 1 ? (
              <div className="booking-modal__calendar">
                <p className="booking-modal__calendar-month">{monthLabel}</p>
                <div className="booking-modal__weekdays">
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="booking-modal__days">
                  {monthCells.map((day, index) => {
                    const isPast = day != null && day < today.getDate()
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
                  <ChevronLeft className="booking-modal__back-icon" strokeWidth={2.5} />
                  Volver al calendario
                </button>
                <p className="booking-modal__times-label">
                  Horas disponibles para el {selectedDay} de {monthLabel}
                </p>
                <div className="booking-modal__times-grid">
                  {TIME_SLOTS.map((time) => (
                    <button
                      type="button"
                      key={time}
                      className={`booking-modal__time ${time === selectedTime ? 'is-selected' : ''
                        }`}
                      disabled={isSlotBusy(time)}
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
                  <ChevronLeft className="booking-modal__back-icon" strokeWidth={2.5} />
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
                      Seleccione un servicio...
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
                  {isLoading ? 'Enviando...' : 'Confirmar Reserva'}
                </button>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}

export default BookingModal
