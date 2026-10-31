import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, CircleCheck, Clock, MapPin, X } from 'lucide-react'
import { DEFAULT_DOCUMENT_TYPE, validateDocument } from '../utils/documentValidation'
import { servicesData, specialtiesData } from '../data/services'
import API_BASE_URL from '../config/api'
import DocumentField from './DocumentField'
import { MonthCalendar, TimeSlotGrid } from './SlotPicker'
import { clinicNow } from '../utils/clinicDate'
import {
  addMonths,
  formatDayMonth,
  isExactSlotBusy,
  isSlotPast,
  monthOf,
  parseBusySlots,
  slotsForDate,
} from '../utils/schedule'
import './BookingModal.css'

// The calendar can move this many months past the current one.
const MONTHS_AHEAD = 2

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

const INITIAL_FORM = {
  nombre: '',
  documentType: DEFAULT_DOCUMENT_TYPE,
  documentNumber: '',
  telefono: '',
  email: '',
  motivo: '',
}

// Same address as the footer; the link opens Google Maps directions to it.
const CLINIC_ADDRESS = 'Av. José Joaquín Pérez 4435, Local A, Quinta Normal, Santiago'
// The maps query keeps the original address so the "how to get there" link points to the same place.
const CLINIC_MAPS_QUERY = 'Av. José Joaquín Pérez 4435, Quinta Normal, Santiago, Chile'
const CLINIC_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_MAPS_QUERY)}`

// Name: letters (accents and ñ included), spaces, apostrophes and hyphens.
const formatName = (value) => value.replace(/[^\p{L}\s'’-]/gu, '')

// Per-field input filters. Fields not listed here are left as typed (the
// document number is formatted by DocumentField).
const FIELD_FORMATTERS = { nombre: formatName }

// Input id of each form field, in form order (the first one with an error
// gets the focus).
const FIELD_IDS = {
  nombre: 'booking-nombre',
  documento: 'booking-documento',
  telefono: 'booking-telefono',
  email: 'booking-email',
  motivo: 'booking-motivo',
}

// Backend field -> form field that shows its error. Everything else
// (non_field_errors, date, time, detail) goes to the general message.
const SERVER_FIELDS = {
  patient_name: 'nombre',
  document_type: 'documento',
  document_number: 'documento',
  rut: 'documento',
  phone: 'telefono',
  email: 'email',
  service_type: 'motivo',
}

const WHATSAPP_URL = 'https://wa.me/56972836396'

const UNEXPECTED_ERROR =
  'No pudimos agendar tu hora. Inténtalo nuevamente en unos minutos o escríbenos por WhatsApp.'

// DRF sends { field: ["msg"] }, { field: "msg" } or a list; keep only the texts.
function collectMessages(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages)
  return []
}

// Splits a 400 body into per-field messages and general ones.
function splitServerErrors(data) {
  const fields = {}
  const general = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { fields, general: collectMessages(data) }
  }
  for (const [key, value] of Object.entries(data)) {
    const messages = collectMessages(value)
    const field = SERVER_FIELDS[key]
    if (!messages.length) continue
    if (field) fields[field] = [fields[field], ...messages].filter(Boolean).join(' ')
    else general.push(...messages)
  }
  return { fields, general }
}

// Label above the control; the error goes outside the <label> so screen
// readers hear it as a description (aria-describedby), not as the name.
function BookingField({ id, label, error, children }) {
  return (
    <div className="booking-modal__field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="booking-modal__field-error">
          {error}
        </p>
      )}
    </div>
  )
}

function BookingModal({ isOpen, onClose, initialService = '' }) {
  // Today and the current time in Chile, whatever the device's time zone.
  const now = clinicNow()
  const today = now.date
  const currentMonth = monthOf(today)
  const lastMonth = addMonths(currentMonth, MONTHS_AHEAD)

  const [step, setStep] = useState(1)
  const [viewMonth, setViewMonth] = useState(currentMonth)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [formData, setFormData] = useState({
    ...INITIAL_FORM,
    motivo: initialService,
  })
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Unexpected failures add a "write us on WhatsApp" link to the message.
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
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
        // Backend sends "10:00:00"; trimmed to match "10:00" slots.
        setBusySlots(parseBusySlots(await response.json()))
      } catch {
        // Network error or aborted: leave all slots enabled.
      }
    }

    loadBusySlots()
    return () => controller.abort()
  }, [isOpen])

  const dialogRef = useRef(null)
  const panelRef = useRef(null)
  const documentInputRef = useRef(null)
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

  const selectedLabel = selectedDate ? formatDayMonth(selectedDate) : ''
  const timeSlots = slotsForDate(selectedDate)

  // Only the exact slot is blocked, as in the backend's public booking. A
  // slot is past once its start time has been reached in Chile ("18:30" is
  // disabled at 18:45).
  const isTimeDisabled = (time) =>
    isExactSlotBusy(busySlots, selectedDate, time) || isSlotPast(selectedDate, time, now)

  const handleDayClick = (date) => {
    setSelectedDate(date)
    setSelectedTime(null)
    setStep(2)
  }

  const handleTimeClick = (time) => {
    setSelectedTime(time)
    setStep(3)
  }

  // Editing a field clears its error.
  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    const nextValue = FIELD_FORMATTERS[name]?.(value) ?? value
    setFormData((prev) => ({ ...prev, [name]: nextValue }))
    clearFieldError(name)
  }

  const handleDocumentChange = (nextDocument) => {
    setFormData((prev) => ({ ...prev, ...nextDocument }))
    clearFieldError('documento')
  }

  // aria attributes of a control whose error is shown below it.
  const errorProps = (field) =>
    fieldErrors[field]
      ? { 'aria-invalid': true, 'aria-describedby': `${FIELD_IDS[field]}-error` }
      : {}

  const showGeneralError = (message, withWhatsApp = false) => {
    setErrorMessage(message)
    setShowWhatsApp(withWhatsApp)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    showGeneralError('')

    const documentError = validateDocument(formData.documentType, formData.documentNumber)
    if (documentError) {
      setFieldErrors((prev) => ({ ...prev, documento: documentError }))
      documentInputRef.current?.focus()
      return
    }

    setIsLoading(true)

    const appointmentDate = selectedDate

    const payload = {
      patient_name: formData.nombre,
      document_type: formData.documentType,
      document_number: formData.documentNumber,
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
        setFieldErrors({})
        setIsConfirmed(true)
      } else if (response.status === 429) {
        // Backend rate limit: max 5 reservas por minuto.
        showGeneralError(
          'Has realizado demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.',
        )
      } else {
        // A 400 explains itself, already in Spanish: each message goes next to
        // its field, the rest (e.g. the 2-appointment limit) above the button.
        const data = response.status === 400 ? await response.json().catch(() => null) : null
        const { fields, general } = splitServerErrors(data)
        if (!Object.keys(fields).length && !general.length) {
          showGeneralError(UNEXPECTED_ERROR, true)
          return
        }
        setFieldErrors(fields)
        showGeneralError(general.join(' '))
        const firstField = Object.keys(FIELD_IDS).find((field) => fields[field])
        if (firstField) document.getElementById(FIELD_IDS[firstField])?.focus()
      }
    } catch {
      showGeneralError(
        'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo nuevamente, o escríbenos por WhatsApp.',
        true,
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setStep(1)
    setViewMonth(currentMonth)
    setSelectedDate(null)
    setSelectedTime(null)
    setFormData(INITIAL_FORM)
    setFieldErrors({})
    showGeneralError('')
    setIsConfirmed(false)
  }

  const goToStep = (targetStep) => {
    if (isConfirmed) return
    if (targetStep === 1) setStep(1)
    if (targetStep === 2 && selectedDate != null) setStep(2)
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
                    } ${selectedDate != null ? 'is-done' : ''}`}
                  onClick={() => goToStep(1)}
                  disabled={isConfirmed}
                  aria-current={step === 1 && !isConfirmed ? 'step' : undefined}
                >
                  <span className="booking-modal__step-index" aria-hidden="true">
                    {selectedDate != null ? <Check size={14} strokeWidth={2.5} /> : 1}
                  </span>
                  <span>
                    <span className="booking-modal__step-label">Fecha</span>
                    <span className="booking-modal__step-value">
                      {selectedDate != null ? selectedLabel : 'Sin seleccionar'}
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
                  disabled={isConfirmed || selectedDate == null}
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
                  <strong>{selectedLabel}</strong>{' '}
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
              <MonthCalendar
                month={viewMonth}
                onMonthChange={setViewMonth}
                minMonth={currentMonth}
                maxMonth={lastMonth}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={handleDayClick}
                labelId="booking-month"
              />
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
                <p id="booking-times-label" className="booking-modal__times-label">
                  Horas disponibles para el {selectedLabel}
                </p>
                <TimeSlotGrid
                  times={timeSlots}
                  selectedTime={selectedTime}
                  onSelectTime={handleTimeClick}
                  isTimeDisabled={isTimeDisabled}
                  labelId="booking-times-label"
                />
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
                  {selectedLabel} · {selectedTime}
                </p>

                <BookingField id={FIELD_IDS.nombre} label="Nombre completo" error={fieldErrors.nombre}>
                  <input
                    id={FIELD_IDS.nombre}
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleFormChange}
                    placeholder="Ej: María Pérez"
                    required
                    {...errorProps('nombre')}
                  />
                </BookingField>

                <DocumentField
                  ref={documentInputRef}
                  id={FIELD_IDS.documento}
                  className="booking-modal__field"
                  documentType={formData.documentType}
                  documentNumber={formData.documentNumber}
                  onChange={handleDocumentChange}
                  error={fieldErrors.documento}
                  required
                />

                <BookingField id={FIELD_IDS.telefono} label="Teléfono" error={fieldErrors.telefono}>
                  <input
                    id={FIELD_IDS.telefono}
                    type="tel"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleFormChange}
                    placeholder="Ej: +56 9 1234 5678"
                    required
                    {...errorProps('telefono')}
                  />
                </BookingField>

                <BookingField id={FIELD_IDS.email} label="Correo electrónico" error={fieldErrors.email}>
                  <input
                    id={FIELD_IDS.email}
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    placeholder="Ej: maria@correo.com"
                    required
                    {...errorProps('email')}
                  />
                </BookingField>

                <BookingField id={FIELD_IDS.motivo} label="Motivo de consulta" error={fieldErrors.motivo}>
                  <select
                    id={FIELD_IDS.motivo}
                    name="motivo"
                    value={formData.motivo}
                    onChange={handleFormChange}
                    required
                    {...errorProps('motivo')}
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
                </BookingField>

                {errorMessage && (
                  <p className="booking-modal__error" role="alert">
                    {errorMessage}
                    {showWhatsApp && (
                      <>
                        {' '}
                        <a
                          className="booking-modal__error-link"
                          href={WHATSAPP_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Escribir por WhatsApp
                        </a>
                      </>
                    )}
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
