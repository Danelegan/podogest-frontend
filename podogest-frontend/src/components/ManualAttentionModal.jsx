import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import { formatRUT, validarRut } from '../utils/rutValidation'
import API_BASE_URL from '../config/api'
import { authFetch, SESSION_EXPIRED_UNSAVED_MESSAGE } from '../utils/auth'
import { clinicNow, formatDateString, shiftYears } from '../utils/clinicDate'
import './ManualAttentionModal.css'

const API_URL = `${API_BASE_URL}/api/appointments/atencion-espontanea/`

const EMPTY_FORM = { nombre: '', rut: '', email: '', telefono: '', fecha: '', hora: '' }
// Date and time start as "now"; they only count as unsaved once edited.
const PATIENT_FIELDS = ['nombre', 'rut', 'email', 'telefono']
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

const FIELD_FORMATTERS = { nombre: formatName, rut: formatRUT }

// DRF returns { field: ["msg"] } or { non_field_errors: ["msg"] }; flatten it.
function describeErrors(data) {
  if (!data || typeof data !== 'object') return ''
  return Object.values(data).flat().join(' ')
}

// Walk-in patient: the backend creates the appointment (by default today, at
// the current time) plus its empty clinical record in one request.
function ManualAttentionModal({ isOpen, onClose, onCreated, onSessionExpired }) {
  const [formData, setFormData] = useState(EMPTY_FORM)
  // Whether the date or time were changed since the modal opened (each opening
  // resets them to the current Chile date and time).
  const [isDateTouched, setIsDateTouched] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Blocks a second submit that arrives before the re-render disables Guardar.
  const isSubmittingRef = useRef(false)
  const dialogRef = useRef(null)
  const nameInputRef = useRef(null)
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

    nameInputRef.current?.focus()

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
  }, [isOpen])

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      const now = clinicNow()
      setFormData((prev) => ({ ...prev, fecha: now.date, hora: now.time }))
      setIsDateTouched(false)
    }
  }

  const hasUnsavedChanges = () =>
    isDateTouched ||
    PATIENT_FIELDS.some((field) => formData[field] !== EMPTY_FORM[field])

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

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmittingRef.current) return
    setErrorMessage('')

    if (!validarRut(formData.rut)) {
      setErrorMessage('El RUT ingresado no es válido.')
      return
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
          rut: formData.rut,
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
        const detail = describeErrors(data)
        setErrorMessage(
          response.status === 400 && detail
            ? detail
            : `No se pudo registrar la atención (error ${response.status}). ${detail}`.trim(),
        )
        return
      }

      setFormData(EMPTY_FORM)
      setIsDateTouched(false)
      onCreated(data.appointment)
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

  const today = clinicNow().date
  const isOtherDay = formData.fecha !== '' && formData.fecha !== today

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
                    Nueva atención manual
                  </h2>
                  <p id="manual-modal-meta" className="manual-modal__meta">
                    Por defecto se registra hoy, a la hora actual.
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

                <label className="manual-modal__field">
                  RUT
                  <input
                    name="rut"
                    value={formData.rut}
                    onChange={handleChange}
                    placeholder="12.345.678-9"
                    autoComplete="off"
                    required
                  />
                </label>

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
                        id="manual-fecha"
                        type="date"
                        name="fecha"
                        value={formData.fecha}
                        onChange={handleChange}
                        min={shiftYears(today, -YEARS_BACK)}
                        max={shiftYears(today, YEARS_AHEAD)}
                        autoComplete="off"
                        aria-describedby={isOtherDay ? 'manual-fecha-hint' : undefined}
                        required
                      />
                    </div>

                    <div className="manual-modal__field">
                      <label htmlFor="manual-hora">Hora</label>
                      <input
                        id="manual-hora"
                        type="time"
                        name="hora"
                        value={formData.hora}
                        onChange={handleChange}
                        autoComplete="off"
                        required
                      />
                    </div>
                  </div>
                  <p id="manual-fecha-hint" className="manual-modal__hint" aria-live="polite">
                    {isOtherDay && `Se registrará como atención del ${formatDateString(formData.fecha)}.`}
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
