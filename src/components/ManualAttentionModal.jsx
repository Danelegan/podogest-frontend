import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import { DEFAULT_DOCUMENT_TYPE, validateDocument } from '../utils/documentValidation'
import API_BASE_URL from '../config/api'
import { authFetch, SESSION_EXPIRED_UNSAVED_MESSAGE } from '../utils/auth'
import { clinicNow, formatDateString, shiftYears } from '../utils/clinicDate'
import DocumentField from './DocumentField'
import { useClosedDays } from '../utils/closedDays'
import { isClosedDay, monthOf, parseDate } from '../utils/schedule'
import './ManualAttentionModal.css'

const APPOINTMENTS_URL = `${API_BASE_URL}/api/appointments/`
const API_URL = `${APPOINTMENTS_URL}atencion-espontanea/`

// The appointment was created but could not be marked as attended.
const MARK_FAILED_MESSAGE = 'La atención se creó, pero no quedó como atendida.'
const MARK_FAILED_HINT = 'Puedes marcarla desde su estado en la agenda.'

const EMPTY_FORM = {
  nombre: '',
  documentType: DEFAULT_DOCUMENT_TYPE,
  documentNumber: '',
  email: '',
  telefono: '',
  fecha: '',
  hora: '',
}
// Date and time start as "now"; they only count as unsaved once edited. The
// document type alone (without a number) is not data yet.
const PATIENT_FIELDS = ['nombre', 'documentNumber', 'email', 'telefono']
// Backend errors shown on the document field instead of the footer.
const DOCUMENT_ERROR_KEYS = ['document_type', 'document_number', 'rut']
const DATE_FIELDS = ['fecha', 'hora']

// Range accepted by the backend: up to 2 years back and 1 year ahead.
const YEARS_BACK = 2
const YEARS_AHEAD = 1

const SAVE_TIMEOUT_MS = 20000
const SAVE_TIMEOUT_MESSAGE =
  'No se pudo confirmar la atención. Revisa la agenda de ese día antes de volver a intentarlo.'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Name: letters (accents and ñ included), spaces, apostrophes and hyphens.
const formatName = (value) => value.replace(/[^\p{L}\s'’-]/gu, '')

const FIELD_FORMATTERS = { nombre: formatName }

// DRF returns { field: ["msg"] } or { non_field_errors: ["msg"] }; flatten it.
function describeErrors(data) {
  if (!data || typeof data !== 'object') return ''
  return Object.values(data).flat().join(' ')
}

// { document_number: [...], phone: [...] } -> { document: {...}, rest: {...} }.
function splitDocumentErrors(data) {
  const documentPart = {}
  const rest = {}
  for (const [key, value] of Object.entries(data)) {
    if (DOCUMENT_ERROR_KEYS.includes(key)) documentPart[key] = value
    else rest[key] = value
  }
  return { document: documentPart, rest }
}

// pastOnly: a future attention isn't allowed (Chile time). '' when valid.
function futureWhenError(fecha, hora, now) {
  if (fecha > now.date) return 'La fecha no puede ser futura: elige hoy o un día anterior.'
  if (fecha === now.date && hora.slice(0, 5) > now.time) {
    return `La hora no puede ser posterior a la actual (${now.time}).`
  }
  return ''
}

// Whether the attention's date and time are already over (it then counts as attended).
const hasStarted = (fecha, hora, now) => `${fecha} ${hora.slice(0, 5)}` < `${now.date} ${now.time}`

// Walk-in patient: the backend creates the appointment (by default today, at
// the current time) plus its empty clinical record in one request.
// initialPatient: data copied from an existing appointment ("Nueva atención");
// pastOnly: today or an earlier day only, and a past one is marked as attended.
function ManualAttentionModal({
  isOpen,
  onClose,
  onCreated,
  onSessionExpired,
  initialPatient = null,
  pastOnly = false,
}) {
  const [formData, setFormData] = useState(EMPTY_FORM)
  // Whether the date or time were changed since the modal opened (each opening
  // resets them to the current Chile date and time).
  const [isDateTouched, setIsDateTouched] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  // Opened with initialPatient: the form starts from `baseline` (the copied
  // data) and the walk-in draft waits in `walkInDraft` for the next normal opening.
  const [isPrefilled, setIsPrefilled] = useState(false)
  const [baseline, setBaseline] = useState(EMPTY_FORM)
  const [walkInDraft, setWalkInDraft] = useState(EMPTY_FORM)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Blocks a second submit that arrives before the re-render disables Guardar.
  const isSubmittingRef = useRef(false)
  const dialogRef = useRef(null)
  const nameInputRef = useRef(null)
  const fechaInputRef = useRef(null)
  const horaInputRef = useRef(null)
  const documentInputRef = useRef(null)
  const returnFocusRef = useRef(null)
  // Latest handlers for the document-level listeners (Escape fallback,
  // beforeunload), which are registered once per opening.
  const latestRef = useRef({ requestClose: () => {}, hasUnsavedChanges: () => false })

  // On open: remember who opened the modal ("Nueva atención manual"), make the
  // rest of the page inert and focus the first field. On close: undo that and
  // hand focus back.
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

    // Copied data: the date is what usually changes.
    ;(isPrefilled ? fechaInputRef : nameInputRef).current?.focus()

    const handleDocumentKeyDown = (event) => {
      // Fallback for when focus is not inside the dialog (e.g. on <body>);
      // inside it, the dialog's own onKeyDown handles Escape.
      if (event.key !== 'Escape' || dialogRef.current?.contains(event.target)) return
      event.preventDefault()
      latestRef.current.requestClose()
    }

    const handleBeforeUnload = (event) => {
      if (!latestRef.current.hasUnsavedChanges()) return
      event.preventDefault()
      event.returnValue = ''
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.body.style.overflow = ''
      madeInert.forEach((element) => {
        element.inert = false
      })
      const opener = returnFocusRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen, isPrefilled])

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      const now = clinicNow()
      const opensPrefilled = initialPatient != null
      if (opensPrefilled) {
        const copied = { ...EMPTY_FORM, ...initialPatient }
        // An unsaved walk-in draft is kept for the next "Nueva atención manual".
        if (!isPrefilled) setWalkInDraft(formData)
        setBaseline(copied)
        setFormData({ ...copied, fecha: now.date, hora: now.time })
        // An old document may not pass today's rules: say so right away.
        setDocumentError(validateDocument(copied.documentType, copied.documentNumber))
      } else {
        setBaseline(EMPTY_FORM)
        setFormData((prev) => ({ ...(isPrefilled ? walkInDraft : prev), fecha: now.date, hora: now.time }))
        setDocumentError('')
      }
      // A message from the other kind of opening doesn't belong here.
      if (opensPrefilled || isPrefilled) setErrorMessage('')
      setIsPrefilled(opensPrefilled)
      setIsDateTouched(false)
    }
  }

  const hasUnsavedChanges = () =>
    isDateTouched ||
    PATIENT_FIELDS.some((field) => formData[field] !== baseline[field])

  // Closing is blocked while the request is in flight.
  const requestClose = () => {
    if (isSaving) return
    if (
      hasUnsavedChanges() &&
      !window.confirm('Hay datos sin guardar en la atención. ¿Cerrar de todos modos?')
    ) {
      return
    }
    onClose()
  }

  useEffect(() => {
    latestRef.current = { requestClose, hasUnsavedChanges }
  })

  // Escape closes; Tab cycles within the dialog.
  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusables = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || !focusables.includes(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = FIELD_FORMATTERS[name]?.(value) ?? value
    if (DATE_FIELDS.includes(name)) setIsDateTouched(true)
    setFormData((prev) => ({ ...prev, [name]: nextValue }))
  }

  const handleDocumentChange = (nextDocument) => {
    setFormData((prev) => ({ ...prev, ...nextDocument }))
    setDocumentError('')
  }

  // POST marcar-atendida for the appointment just created. Never throws:
  // { appointment } on success, { expired: true } on 401, { warning } otherwise.
  const markAttended = async (id) => {
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), SAVE_TIMEOUT_MS)
    try {
      const response = await authFetch(`${APPOINTMENTS_URL}${id}/marcar-atendida/`, {
        method: 'POST',
        signal: timeout.signal,
      })
      if (response.status === 401) return { expired: true }
      const data = await response.json().catch(() => null)
      if (response.ok && data?.id != null) return { appointment: data }
      const detail = describeErrors(data)
      return {
        warning: `${MARK_FAILED_MESSAGE} ${detail || `(error ${response.status}).`} ${MARK_FAILED_HINT}`,
      }
    } catch {
      return {
        warning: timeout.signal.aborted
          ? `${MARK_FAILED_MESSAGE} No se pudo confirmar el cambio. ${MARK_FAILED_HINT}`
          : `${MARK_FAILED_MESSAGE} No se pudo conectar con el servidor. ${MARK_FAILED_HINT}`,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmittingRef.current) return
    setErrorMessage('')

    const localDocumentError = validateDocument(formData.documentType, formData.documentNumber)
    if (localDocumentError) {
      setDocumentError(localDocumentError)
      documentInputRef.current?.focus()
      return
    }
    setDocumentError('')

    // The date picker doesn't stop a future date typed by hand. The message
    // itself is already on screen (whenError); this only blocks and focuses.
    if (pastOnly) {
      const now = clinicNow()
      if (futureWhenError(formData.fecha, formData.hora, now)) {
        ;(formData.fecha > now.date ? fechaInputRef : horaInputRef).current?.focus()
        return
      }
    }

    isSubmittingRef.current = true
    setIsSaving(true)
    // No automatic retry: if the deadline passes, the appointment may or may
    // not have been created, so the user checks today's agenda first.
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), SAVE_TIMEOUT_MS)
    try {
      const response = await authFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: formData.nombre.trim(),
          document_type: formData.documentType,
          document_number: formData.documentNumber,
          email: formData.email.trim(),
          phone: formData.telefono.trim(),
          appointment_date: formData.fecha,
          appointment_time: formData.hora,
        }),
        signal: timeout.signal,
      })

      // Expired session: unsaved data keeps the modal open so it can be copied.
      if (response.status === 401) {
        if (latestRef.current.hasUnsavedChanges()) setErrorMessage(SESSION_EXPIRED_UNSAVED_MESSAGE)
        else onSessionExpired()
        return
      }

      const data = await response.json().catch(() => null)

      if (response.status !== 201) {
        // A 400 explains itself (time clash, date out of range): shown as is.
        // Document errors go next to the document field.
        if (response.status === 400 && data && typeof data === 'object' && !Array.isArray(data)) {
          const { document: documentErrors, rest } = splitDocumentErrors(data)
          const documentDetail = describeErrors(documentErrors)
          if (documentDetail) {
            setDocumentError(documentDetail)
            documentInputRef.current?.focus()
            setErrorMessage(describeErrors(rest))
            return
          }
        }
        const detail = describeErrors(data)
        setErrorMessage(
          response.status === 400 && detail
            ? detail
            : `No se pudo registrar la atención (error ${response.status}). ${detail}`.trim(),
        )
        return
      }

      let appointment = data.appointment
      let warning = ''
      // A past attention already happened: it is marked as attended right away.
      // If that fails, the appointment stays created and the reason is passed on.
      if (pastOnly && appointment?.id != null && hasStarted(formData.fecha, formData.hora, clinicNow())) {
        const marked = await markAttended(appointment.id)
        if (marked.expired) {
          setFormData(EMPTY_FORM)
          onSessionExpired()
          return
        }
        if (marked.appointment) appointment = { ...appointment, ...marked.appointment }
        warning = marked.warning ?? ''
      }

      setFormData(EMPTY_FORM)
      setDocumentError('')
      setIsDateTouched(false)
      onCreated(appointment, { warning })
    } catch {
      setErrorMessage(
        timeout.signal.aborted ? SAVE_TIMEOUT_MESSAGE : 'No se pudo conectar con el servidor.',
      )
    } finally {
      clearTimeout(timeoutId)
      isSubmittingRef.current = false
      setIsSaving(false)
    }
  }

  const renderNow = clinicNow()
  const today = renderNow.date
  const isOtherDay = formData.fecha !== '' && formData.fecha !== today
  // Shown while the date or time is in the future; Guardar re-checks it with a fresh clock.
  const whenError =
    pastOnly && /^\d{4}-\d{2}-\d{2}$/.test(formData.fecha)
      ? futureWhenError(formData.fecha, formData.hora, renderNow)
      : ''
  const isFutureDate = whenError !== '' && formData.fecha > today
  const isDocumentChanged =
    isPrefilled &&
    (formData.documentType !== baseline.documentType ||
      formData.documentNumber !== baseline.documentNumber)

  // A walk-in can be registered on a closed day (the backend allows it); the
  // notice only makes sure it is on purpose.
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(formData.fecha)
  const closedDays = useClosedDays(isOpen && hasValidDate ? monthOf(formData.fecha) : null)
  const closedNotice = (() => {
    if (!hasValidDate) return ''
    const { year, monthIndex, day } = parseDate(formData.fecha)
    if (isClosedDay(year, monthIndex, day)) return 'Ese día es domingo: la clínica está cerrada.'
    if (!(formData.fecha in closedDays)) return ''
    const reason = closedDays[formData.fecha]
    return `Ese día está marcado como cerrado${reason ? ` (${reason})` : ''}.`
  })()
  const fechaHints = [
    isFutureDate && 'manual-when-error',
    isOtherDay && 'manual-fecha-hint',
    closedNotice && 'manual-fecha-closed',
  ]
    .filter(Boolean)
    .join(' ')
  const isFutureTime = whenError !== '' && !isFutureDate

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="manual-modal"
            className="manual-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            // Clicking the backdrop must not pull focus out of the dialog.
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) event.preventDefault()
            }}
          >
            <motion.form
              ref={dialogRef}
              className="manual-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="manual-modal-title"
              aria-describedby="manual-modal-meta"
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
              onSubmit={handleSubmit}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <header className="manual-modal__header">
                <div>
                  <h2 id="manual-modal-title" className="manual-modal__title">
                    {isPrefilled ? 'Nueva atención' : 'Nueva atención manual'}
                  </h2>
                  <p id="manual-modal-meta" className="manual-modal__meta">
                    {isPrefilled
                      ? 'Se copian nombre, documento, teléfono y correo. La ficha queda vacía.'
                      : 'Por defecto se registra hoy, a la hora actual.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="manual-modal__close"
                  onClick={requestClose}
                  // aria-disabled instead of disabled so the button keeps focus.
                  aria-disabled={isSaving || undefined}
                  aria-label={isSaving ? 'Cerrar (guardando…)' : 'Cerrar'}
                  title={isSaving ? 'Guardando…' : 'Cerrar'}
                >
                  <X size={20} strokeWidth={2} aria-hidden="true" />
                </button>
              </header>

              <div className="manual-modal__body">
                <label className="manual-modal__field">
                  Nombre
                  <input
                    ref={nameInputRef}
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    placeholder="Nombre y apellido"
                    autoComplete="off"
                    required
                  />
                </label>

                <DocumentField
                  ref={documentInputRef}
                  id="manual-documento"
                  className="manual-modal__field"
                  documentType={formData.documentType}
                  documentNumber={formData.documentNumber}
                  onChange={handleDocumentChange}
                  error={documentError}
                  required
                />
                {isPrefilled && (
                  <p className="manual-modal__closed" aria-live="polite">
                    {isDocumentChanged &&
                      'Si cambias el documento, esta atención no se enlazará con el historial.'}
                  </p>
                )}

                <label className="manual-modal__field">
                  <span>
                    Email <span className="manual-modal__optional">(opcional)</span>
                  </span>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="correo@ejemplo.com"
                    autoComplete="off"
                  />
                </label>

                <label className="manual-modal__field">
                  Teléfono
                  <input
                    type="tel"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    placeholder="+56 9 1234 5678"
                    autoComplete="off"
                    maxLength={20}
                    required
                  />
                </label>

                <div className="manual-modal__when">
                  <div className="manual-modal__row">
                    <div className="manual-modal__field">
                      <label htmlFor="manual-fecha">Fecha de la atención</label>
                      <input
                        ref={fechaInputRef}
                        id="manual-fecha"
                        type="date"
                        name="fecha"
                        value={formData.fecha}
                        onChange={handleChange}
                        min={shiftYears(today, -YEARS_BACK)}
                        max={pastOnly ? today : shiftYears(today, YEARS_AHEAD)}
                        autoComplete="off"
                        aria-invalid={isFutureDate || undefined}
                        aria-describedby={fechaHints || undefined}
                        required
                      />
                    </div>

                    <div className="manual-modal__field">
                      <label htmlFor="manual-hora">Hora</label>
                      <input
                        ref={horaInputRef}
                        id="manual-hora"
                        type="time"
                        name="hora"
                        value={formData.hora}
                        onChange={handleChange}
                        autoComplete="off"
                        aria-invalid={isFutureTime || undefined}
                        aria-describedby={isFutureTime ? 'manual-when-error' : undefined}
                        required
                      />
                    </div>
                  </div>
                  {pastOnly && (
                    <p id="manual-when-error" className="manual-modal__field-error" aria-live="polite">
                      {whenError}
                    </p>
                  )}
                  <p id="manual-fecha-hint" className="manual-modal__hint" aria-live="polite">
                    {isOtherDay && `Se registrará como atención del ${formatDateString(formData.fecha)}.`}
                  </p>
                  <p id="manual-fecha-closed" className="manual-modal__closed" aria-live="polite">
                    {closedNotice && `${closedNotice} Puedes registrar la atención igual.`}
                  </p>
                </div>
              </div>

              <footer className="manual-modal__footer">
                {errorMessage && (
                  <p className="manual-modal__error" role="alert">
                    {errorMessage}
                  </p>
                )}
                <div className="manual-modal__actions">
                  <button type="submit" className="manual-modal__submit" disabled={isSaving}>
                    <Save size={16} strokeWidth={2} aria-hidden="true" />
                    {isSaving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </footer>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}

export default ManualAttentionModal
