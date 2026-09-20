import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eraser,
  Footprints,
  Save,
  Stethoscope,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import './ClinicalRecordModal.css'

const API_URL = 'https://podogest-backend.onrender.com/api/clinical-records/'
const TOKEN_KEY = 'podogest_token'

const GENDERS = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir']
const CIVIL_STATUSES = [
  'Soltero/a',
  'Casado/a',
  'Conviviente civil',
  'Divorciado/a',
  'Viudo/a',
]
const PROBLEMS = [
  'Onicotomía',
  'Pie diabético',
  'Bromhidrosis',
  'Heloma',
  'Dermatomicosis',
  'Hiperqueratosis',
  'Hiperhidrosis',
  'Onicocriptosis',
  'Onicogrifosis',
]
const CONSUMES = ['Alcohol', 'Drogas', 'Antimicóticos', 'Analgésicos']
const FAMILY_HISTORY = [
  'Obesidad',
  'Diabetes',
  'HTA',
  'Cáncer',
  'Presión arterial',
  'Traumatismo',
]

const EMPTY_FORM = {
  nombre: '',
  nacimiento: '',
  genero: '',
  estadoCivil: '',
  escolaridad: '',
  ocupacion: '',
  direccion: '',
  telefono: '',
  email: '',
  problemas: [],
  otros: '',
  observaciones: '',
  enfermedad: '',
  medicamento: '',
  dosis: '',
  desdeCuando: '',
  consume: [],
  cirugias: '',
  familiares: [],
  precio: '',
}

// Label used in the "Clave: valor" lines of each backend text field.
const MEDICAL_KEYS = {
  nombre: 'Nombre',
  nacimiento: 'Nacimiento',
  genero: 'Género',
  estadoCivil: 'Estado civil',
  escolaridad: 'Escolaridad',
  ocupacion: 'Ocupación',
  direccion: 'Dirección',
  telefono: 'Teléfono',
  email: 'E-mail',
  enfermedad: 'Enfermedad diagnosticada',
  medicamento: 'Medicamento',
  dosis: 'Dosis',
  desdeCuando: 'Desde cuándo',
  consume: 'Consume',
  cirugias: 'Cirugías previas',
  familiares: 'Antecedentes familiares',
}
const SYMPTOM_KEYS = { problemas: 'Problemas', otros: 'Otros' }
const TREATMENT_KEYS = { precio: 'Precio' }

const LIST_FIELDS = { problemas: PROBLEMS, consume: CONSUMES, familiares: FAMILY_HISTORY }

const formatClp = (digits) =>
  digits
    ? new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(Number(digits))
    : ''

// Text -> { field: value } for known keys, plus the lines we don't own.
function parseLines(text, keys) {
  const byLabel = Object.fromEntries(
    Object.entries(keys).map(([field, label]) => [label, field]),
  )
  const values = {}
  const rest = []

  ;(text ?? '').split('\n').forEach((line) => {
    const separator = line.indexOf(': ')
    const field = separator > 0 ? byLabel[line.slice(0, separator)] : undefined
    if (field) {
      const raw = line.slice(separator + 2)
      values[field] = LIST_FIELDS[field]
        ? raw.split(',').map((item) => item.trim()).filter((item) => LIST_FIELDS[field].includes(item))
        : raw
    } else if (line.trim()) {
      rest.push(line)
    }
  })

  return { values, rest }
}

// { field: value } -> text, keeping the lines we don't own after ours.
function buildLines(form, keys, rest) {
  const lines = Object.entries(keys).flatMap(([field, label]) => {
    const value = form[field]
    if (Array.isArray(value)) {
      const ordered = LIST_FIELDS[field].filter((item) => value.includes(item))
      return ordered.length ? [`${label}: ${ordered.join(', ')}`] : []
    }
    return value.trim() ? [`${label}: ${value.trim()}`] : []
  })
  return [...lines, ...rest].join('\n')
}

function Field({ label, span = 1, children }) {
  return (
    <label className={`clinical-field clinical-span-${span}`}>
      {label}
      {children}
    </label>
  )
}

function CheckGroup({ options, selected, onToggle, className }) {
  return (
    <div className={className}>
      {options.map((option) => (
        <label key={option} className="clinical-check">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="clinical-card">
      <h2 className="clinical-card__header">
        <Icon className="clinical-card__icon" strokeWidth={2} />
        {title}
      </h2>
      <div className="clinical-card__body">{children}</div>
    </section>
  )
}

function ClinicalRecordModal({ isOpen, onClose, appointmentId, appointment }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [recordId, setRecordId] = useState(null)
  // Lines in each backend field that this form doesn't manage; kept on save.
  const [rest, setRest] = useState({ medical: [], symptoms: [], treatment: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const emptyForm = () => ({
    ...EMPTY_FORM,
    nombre: appointment?.patient_name ?? '',
    email: appointment?.email ?? '',
    telefono: appointment?.phone ?? '',
  })

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
  })

  const handleUnauthorized = () => {
    localStorage.removeItem(TOKEN_KEY)
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (!isOpen || appointmentId == null) return undefined

    const controller = new AbortController()

    const loadRecord = async () => {
      setIsLoading(true)
      setErrorMessage('')
      setSuccessMessage('')
      setRecordId(null)
      setRest({ medical: [], symptoms: [], treatment: [] })
      setForm({
        ...EMPTY_FORM,
        nombre: appointment?.patient_name ?? '',
        email: appointment?.email ?? '',
        telefono: appointment?.phone ?? '',
      })

      try {
        const response = await fetch(`${API_URL}?appointment=${appointmentId}`, {
          headers: authHeaders(),
          signal: controller.signal,
        })

        if (response.status === 401) {
          handleUnauthorized()
          return
        }
        if (!response.ok) {
          setErrorMessage(`No pudimos cargar la ficha (error ${response.status}).`)
          return
        }

        const data = await response.json()
        const records = Array.isArray(data) ? data : data.results ?? []
        const record = records[0]
        if (!record) return // no record yet: the next save is a POST

        const medical = parseLines(record.antecedentes_medicos, MEDICAL_KEYS)
        const symptoms = parseLines(record.sintomas, SYMPTOM_KEYS)
        const treatment = parseLines(record.tratamiento_realizado, TREATMENT_KEYS)

        setRecordId(record.id)
        setRest({
          medical: medical.rest,
          symptoms: symptoms.rest,
          treatment: treatment.rest,
        })
        setForm((prev) => ({
          ...prev,
          ...medical.values,
          ...symptoms.values,
          ...treatment.values,
          observaciones: record.observaciones ?? '',
        }))
      } catch (error) {
        if (error.name === 'AbortError') return
        setErrorMessage('No se pudo conectar con el servidor.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadRecord()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, appointmentId])

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

  if (!isOpen) return null

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handlePriceChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '')
    setForm((prev) => ({ ...prev, precio: digits }))
  }

  const toggleOption = (name) => (option) => {
    setForm((prev) => ({
      ...prev,
      [name]: prev[name].includes(option)
        ? prev[name].filter((item) => item !== option)
        : [...prev[name], option],
    }))
  }

  const handleClear = () => {
    setForm(emptyForm())
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    const payload = {
      antecedentes_medicos: buildLines(form, MEDICAL_KEYS, rest.medical),
      sintomas: buildLines(form, SYMPTOM_KEYS, rest.symptoms),
      tratamiento_realizado: buildLines(form, TREATMENT_KEYS, rest.treatment),
      observaciones: form.observaciones,
    }
    const isUpdate = recordId != null
    if (!isUpdate) payload.appointment = appointmentId

    try {
      const response = await fetch(isUpdate ? `${API_URL}${recordId}/` : API_URL, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })

      if (response.status === 401) {
        handleUnauthorized()
        return
      }

      if (response.ok) {
        const saved = await response.json()
        setRecordId(saved.id ?? recordId)
        setSuccessMessage('Ficha guardada correctamente.')
      } else {
        let detail = ''
        try {
          detail = JSON.stringify(await response.json())
        } catch {
          // response body was not JSON
        }
        setErrorMessage(
          `No pudimos guardar la ficha (error ${response.status}). ${detail}`.trim(),
        )
      }
    } catch {
      setErrorMessage('No se pudo conectar con el servidor.')
    } finally {
      setIsSaving(false)
    }
  }

  const today = new Date().toLocaleDateString('en-GB')
  const recordNumber = recordId != null ? String(recordId).padStart(4, '0') : 'nueva'
  const price = formatClp(form.precio)

  return (
    <div className="clinical-overlay" onClick={onClose}>
      <form
        className="clinical-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSave}
      >
        <header className="clinical-header">
          <div>
            <h1 className="clinical-header__title">Ficha clínica podológica</h1>
            <p className="clinical-header__meta">
              Nº ficha {recordNumber} · Fecha {today}
            </p>
          </div>
          <div className="clinical-header__actions">
            <button
              type="submit"
              className="clinical-btn clinical-btn--primary"
              disabled={isSaving || isLoading}
            >
              <Save className="clinical-btn__icon" strokeWidth={2} />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="clinical-btn" onClick={handleClear}>
              <Eraser className="clinical-btn__icon" strokeWidth={2} />
              Limpiar
            </button>
            <button type="button" className="clinical-btn" onClick={onClose}>
              <X className="clinical-btn__icon" strokeWidth={2} />
              Cerrar
            </button>
          </div>
        </header>

        {errorMessage && (
          <p className="clinical-message clinical-message--error" role="alert">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="clinical-message clinical-message--success" role="status">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p className="clinical-loading">Cargando ficha...</p>
        ) : (
          <>
            <Section icon={User} title="Datos del paciente">
              <div className="clinical-grid clinical-grid--3">
                <Field label="Nombre completo" span={3}>
                  <input
                    type="text"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Ej: María González Pérez"
                  />
                </Field>
                <Field label="Nacimiento">
                  <input
                    type="date"
                    name="nacimiento"
                    value={form.nacimiento}
                    onChange={handleChange}
                  />
                </Field>
                <Field label="Género">
                  <select name="genero" value={form.genero} onChange={handleChange}>
                    <option value="">Seleccionar...</option>
                    {GENDERS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado civil">
                  <select
                    name="estadoCivil"
                    value={form.estadoCivil}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    {CIVIL_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Escolaridad">
                  <input
                    type="text"
                    name="escolaridad"
                    value={form.escolaridad}
                    onChange={handleChange}
                    placeholder="Ej: Media completa"
                  />
                </Field>
                <Field label="Ocupación" span={2}>
                  <input
                    type="text"
                    name="ocupacion"
                    value={form.ocupacion}
                    onChange={handleChange}
                    placeholder="Ej: Profesora"
                  />
                </Field>
                <Field label="Dirección" span={2}>
                  <input
                    type="text"
                    name="direccion"
                    value={form.direccion}
                    onChange={handleChange}
                    placeholder="Ej: Av. Providencia 1234, Santiago"
                  />
                </Field>
                <Field label="Teléfono">
                  <input
                    type="tel"
                    name="telefono"
                    value={form.telefono}
                    onChange={handleChange}
                    placeholder="Ej: +56 9 1234 5678"
                  />
                </Field>
                <Field label="E-mail" span={3}>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Ej: nombre@correo.cl"
                  />
                </Field>
              </div>
            </Section>

            <Section icon={Footprints} title="Problemas actuales">
              <div className="clinical-grid clinical-grid--4">
                {PROBLEMS.map((option) => (
                  <label key={option} className="clinical-check">
                    <input
                      type="checkbox"
                      checked={form.problemas.includes(option)}
                      onChange={() => toggleOption('problemas')(option)}
                    />
                    {option}
                  </label>
                ))}
                <Field label="Otros" span={3}>
                  <input
                    type="text"
                    name="otros"
                    value={form.otros}
                    onChange={handleChange}
                    placeholder="Ej: Fisura en talón derecho"
                  />
                </Field>
                <Field label="Observaciones" span={4}>
                  <textarea
                    name="observaciones"
                    value={form.observaciones}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Ej: Paciente refiere dolor al caminar hace 2 semanas"
                  />
                </Field>
              </div>
            </Section>

            <Section icon={Stethoscope} title="Antecedentes de salud">
              <div className="clinical-grid clinical-grid--3">
                <Field label="Enfermedad diagnosticada" span={3}>
                  <input
                    type="text"
                    name="enfermedad"
                    value={form.enfermedad}
                    onChange={handleChange}
                    placeholder="Ej: Diabetes tipo 2"
                  />
                </Field>
                <Field label="Medicamento">
                  <input
                    type="text"
                    name="medicamento"
                    value={form.medicamento}
                    onChange={handleChange}
                    placeholder="Ej: Metformina"
                  />
                </Field>
                <Field label="Dosis">
                  <input
                    type="text"
                    name="dosis"
                    value={form.dosis}
                    onChange={handleChange}
                    placeholder="Ej: 850 mg cada 12 horas"
                  />
                </Field>
                <Field label="Desde cuándo">
                  <input
                    type="text"
                    name="desdeCuando"
                    value={form.desdeCuando}
                    onChange={handleChange}
                    placeholder="Ej: Marzo 2019"
                  />
                </Field>
                <div className="clinical-field clinical-span-3">
                  Consume
                  <CheckGroup
                    className="clinical-checks-row"
                    options={CONSUMES}
                    selected={form.consume}
                    onToggle={toggleOption('consume')}
                  />
                </div>
                <Field label="Cirugías previas" span={3}>
                  <input
                    type="text"
                    name="cirugias"
                    value={form.cirugias}
                    onChange={handleChange}
                    placeholder="Ej: Apendicectomía, 2010"
                  />
                </Field>
              </div>
            </Section>

            <Section icon={Users} title="Antecedentes familiares">
              <CheckGroup
                className="clinical-grid clinical-grid--3"
                options={FAMILY_HISTORY}
                selected={form.familiares}
                onToggle={toggleOption('familiares')}
              />
            </Section>

            <Section icon={Wallet} title="Cobro">
              <div className="clinical-billing">
                <Field label="Precio a cobrar">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="precio"
                    value={price}
                    onChange={handlePriceChange}
                    placeholder="$15.000"
                  />
                </Field>
                <p className="clinical-billing__total">{price || '$0'}</p>
              </div>
            </Section>
          </>
        )}
      </form>
    </div>
  )
}

export default ClinicalRecordModal
