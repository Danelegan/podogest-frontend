import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Save, UserPlus, X } from 'lucide-react'
import { formatRUT, validarRut } from '../utils/rutValidation'
import API_BASE_URL from '../config/api'
import './ManualAttentionModal.css'

const API_URL = `${API_BASE_URL}/api/appointments/atencion-espontanea/`
const TOKEN_KEY = 'podogest_token'

const EMPTY_FORM = { nombre: '', rut: '', email: '', telefono: '' }

// Name: letters (accents and ñ included), spaces, apostrophes and hyphens.
const formatName = (value) => value.replace(/[^\p{L}\s'’-]/gu, '')

const FIELD_FORMATTERS = { nombre: formatName, rut: formatRUT }

// DRF returns { field: ["msg"] } or { non_field_errors: ["msg"] }; flatten it.
function describeErrors(data) {
  if (!data || typeof data !== 'object') return ''
  return Object.values(data).flat().join(' ')
}

// Walk-in patient: the backend creates today's appointment (at the current
// time) plus its empty clinical record in one request.
function ManualAttentionModal({ isOpen, onClose, onCreated, onUnauthorized }) {
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSaving, onClose])

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = FIELD_FORMATTERS[name]?.(value) ?? value
    setFormData((prev) => ({ ...prev, [name]: nextValue }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')

    if (!validarRut(formData.rut)) {
      setErrorMessage('El RUT ingresado no es válido.')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
        body: JSON.stringify({
          patient_name: formData.nombre.trim(),
          rut: formData.rut,
          email: formData.email.trim(),
          phone: formData.telefono.trim(),
        }),
      })

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      const data = await response.json().catch(() => null)

      if (response.status !== 201) {
        setErrorMessage(
          `No se pudo registrar la atención (error ${response.status}). ${describeErrors(data)}`.trim(),
        )
        return
      }

      setFormData(EMPTY_FORM)
      onCreated(data.appointment)
    } catch {
      setErrorMessage('No se pudo conectar con el servidor.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="manual-overlay"
          onClick={isSaving ? undefined : onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.form
            className="manual-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-modal-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <header className="manual-modal__header">
              <h2 id="manual-modal-title" className="manual-modal__title">
                <UserPlus size={20} aria-hidden="true" />
                Nueva Atención Manual
              </h2>
              <button
                type="button"
                className="manual-modal__close"
                onClick={onClose}
                disabled={isSaving}
                aria-label="Cerrar"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <label className="manual-modal__field">
              Nombre
              <input
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Nombre y apellido"
                autoComplete="off"
                required
                autoFocus
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
              Email
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="correo@ejemplo.com (opcional)"
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

            {errorMessage && (
              <p className="manual-modal__error" role="alert">
                {errorMessage}
              </p>
            )}

            <button type="submit" className="manual-modal__submit" disabled={isSaving}>
              <Save size={16} aria-hidden="true" />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ManualAttentionModal
