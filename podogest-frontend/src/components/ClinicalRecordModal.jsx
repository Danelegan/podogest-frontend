import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  Eraser,
  Footprints,
  HeartPulse,
  Pencil,
  PenTool,
  RotateCcw,
  Save,
  Stethoscope,
  Undo2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import API_BASE_URL from '../config/api'
import { authFetch, SESSION_EXPIRED_UNSAVED_MESSAGE } from '../utils/auth'
import { buildObservations, parseObservations, PODOGRAM_MAPS } from '../utils/podogram'
import { clinicDateOf, formatDateString } from '../utils/clinicDate'
import './ClinicalRecordModal.css'

const API_URL = `${API_BASE_URL}/api/clinical-records/`
const JSON_HEADERS = { 'Content-Type': 'application/json' }

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
  'Onicocriptosis Leve',
  'Onicocriptosis Grave',
  'Onicogrifosis',
  'Onicomicosis',
  'VPH plantar',
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
  tallaCalzado: '',
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
  presionSistolica: '',
  presionDiastolica: '',
  frecuenciaCardiaca: '',
  pulso: '',
  anestesia: '',
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
  tallaCalzado: 'Talla de calzado',
  enfermedad: 'Enfermedad diagnosticada',
  medicamento: 'Medicamento',
  dosis: 'Dosis',
  desdeCuando: 'Desde cuándo',
  consume: 'Consume',
  cirugias: 'Cirugías previas',
  familiares: 'Antecedentes familiares',
  presion: 'Presión arterial',
  frecuenciaCardiaca: 'Frecuencia cardíaca',
  pulso: 'Pulso pedio',
}
const SYMPTOM_KEYS = { problemas: 'Problemas', otros: 'Otros' }
const TREATMENT_KEYS = { anestesia: 'Anestesia', precio: 'Precio' }

// Measurements are stored with their unit so the Excel backup reads
// "Presión arterial: 117/65 mmHg"; the form holds only the numbers.
const MEASURE_UNITS = { frecuenciaCardiaca: 'lpm', pulso: 'lpm', anestesia: 'ml' }

// Only called with validated values: "007" -> "7", "01,50" -> "1,50".
const trimZeros = (value) => value.replace(/^0+(?=\d)/, '')

function toStoredValues(form) {
  const withUnit = (field) =>
    form[field] ? `${trimZeros(form[field])} ${MEASURE_UNITS[field]}` : ''
  const systolic = trimZeros(form.presionSistolica)
  const diastolic = trimZeros(form.presionDiastolica)
  return {
    ...form,
    presion: systolic || diastolic ? `${systolic}/${diastolic} mmHg` : '',
    frecuenciaCardiaca: withUnit('frecuenciaCardiaca'),
    pulso: withUnit('pulso'),
    anestesia: withUnit('anestesia'),
  }
}

function fromStoredValues({ presion, ...values }) {
  const withoutUnit = (text) => text.replace(/\s*(mmHg|lpm|ml)\s*$/i, '').trim()
  Object.keys(MEASURE_UNITS).forEach((field) => {
    if (values[field] != null) values[field] = withoutUnit(values[field])
  })
  if (presion != null) {
    const [systolic = '', diastolic = ''] = withoutUnit(presion).split('/')
    values.presionSistolica = systolic.trim()
    values.presionDiastolica = diastolic.trim()
  }
  return values
}

// Wide limits: they catch typos (1170 instead of 117), never a rare but real
// reading. Keys follow the on-screen order, so the first one gets the focus.
function validateMeasures(form) {
  const errors = {}
  const inRange = (value, min, max) =>
    /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max

  const { presionSistolica: systolic, presionDiastolica: diastolic } = form
  if (systolic || diastolic) {
    if (!systolic || !diastolic) {
      errors.presion = 'Completa la presión sistólica y la diastólica.'
    } else if (!inRange(systolic, 50, 300)) {
      errors.presion = 'La presión sistólica debe estar entre 50 y 300 mmHg.'
    } else if (!inRange(diastolic, 20, 200)) {
      errors.presion = 'La presión diastólica debe estar entre 20 y 200 mmHg.'
    } else if (Number(systolic) <= Number(diastolic)) {
      errors.presion = 'La presión sistólica debe ser mayor que la diastólica.'
    }
  }

  if (form.frecuenciaCardiaca && !inRange(form.frecuenciaCardiaca, 20, 250)) {
    errors.frecuenciaCardiaca = 'La frecuencia cardíaca debe estar entre 20 y 250 lpm.'
  }
  if (form.pulso && !inRange(form.pulso, 20, 250)) {
    errors.pulso = 'El pulso pedio debe estar entre 20 y 250 lpm.'
  }

  if (form.anestesia) {
    const ml = Number(form.anestesia.replace(',', '.'))
    if (!/^\d+(,\d{1,2})?$/.test(form.anestesia)) {
      errors.anestesia = 'Escribe la cantidad como número, por ejemplo 1,50.'
    } else if (ml <= 0 || ml > 20) {
      errors.anestesia = 'La anestesia debe ser mayor que 0 y de hasta 20 ml.'
    }
  }
  return errors
}

const MEASURE_INPUT_IDS = {
  presion: 'clinical-presion-sistolica',
  frecuenciaCardiaca: 'clinical-frecuencia-cardiaca',
  pulso: 'clinical-pulso',
  anestesia: 'clinical-anestesia',
}

const MEASURES_ERROR_MESSAGE =
  'Revisa los valores marcados en Signos vitales o Anestesia antes de guardar.'

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

    ; (text ?? '').split('\n').forEach((line) => {
      const separator = line.indexOf(': ')
      const field = separator > 0 ? byLabel[line.slice(0, separator)] : undefined
      if (field) {
        const raw = line.slice(separator + 2)
        values[field] = LIST_FIELDS[field]
          ? raw
            .split(',')
            .map((item) => item.trim())
            // Legacy records stored a single "Onicocriptosis".
            .map((item) => (item === 'Onicocriptosis' ? 'Onicocriptosis Leve' : item))
            .filter((item) => LIST_FIELDS[field].includes(item))
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

// Checkbox lists compare as sets: unchecking and rechecking is not a change.
function isSameForm(a, b) {
  return Object.keys(EMPTY_FORM).every((field) => {
    if (!Array.isArray(a[field])) return a[field] === b[field]
    return a[field].length === b[field].length && a[field].every((item) => b[field].includes(item))
  })
}

// The backend sends `appointment` as the appointment's id. A record for any
// other appointment is never shown or overwritten.
const belongsToAppointment = (record, appointmentId) =>
  record != null && String(record.appointment) === String(appointmentId)

const MISMATCH_MESSAGE =
  'La ficha recibida no corresponde a esta cita, por eso no se muestra. ' +
  'Recarga la página o avisa a soporte.'

const SAVE_TIMEOUT_MS = 20000
const SAVE_TIMEOUT_MESSAGE =
  'No se pudo confirmar el guardado. Revisa tu conexión antes de reintentar.'

const saveErrorMessage = (status, body) =>
  `No pudimos guardar la ficha (error ${status}). ${body ? JSON.stringify(body) : ''}`.trim()

const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null // response body was not JSON
  }
}

const PEN_COLOR = '#dc2626'
// The eraser is this many times wider than the pen.
const ERASER_FACTOR = 4
// Undo steps kept; each one is a full copy of the canvas pixels.
const UNDO_LIMIT = 20

// Circle the size of the eraser, centered on the pointer (desktop cursor).
const eraserCursor = (diameter) => {
  const size = Math.min(Math.max(Math.round(diameter), 4), 126) + 2
  const r = size / 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(255,255,255,0.35)" ` +
    'stroke="#1f2937" stroke-width="1"/></svg>'
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${r} ${r}, crosshair`
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Field({ label, span = 1, children }) {
  return (
    <label className={`clinical-field clinical-span-${span}`}>
      {label}
      {children}
    </label>
  )
}

// Numeric field with its error outside the <label>, so screen readers hear it
// as a description (aria-describedby) instead of as part of the field's name.
function MeasureField({ id, label, error, ...inputProps }) {
  const errorId = `${id}-error`
  return (
    <div className="clinical-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="clinical-field__error">
          {error}
        </p>
      )}
    </div>
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

function ClinicalRecordModal({ isOpen, onClose, onSessionExpired, appointmentId, appointment }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [recordId, setRecordId] = useState(null)
  // Lines in each backend field that this form doesn't manage; kept on save.
  const [rest, setRest] = useState({ medical: [], symptoms: [], treatment: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  // The load returned a record for another appointment: it is not shown and
  // saving stays blocked until the modal is reopened.
  const [hasForeignRecord, setHasForeignRecord] = useState(false)
  const [savedDrawing, setSavedDrawing] = useState('')
  // When the loaded record was created ("2026-10-25T14:03:00Z"); '' for a new one.
  const [recordCreatedAt, setRecordCreatedAt] = useState('')
  // Old drawings keep the map they were drawn on; everything else uses v2.
  const [mapVersion, setMapVersion] = useState('v2')
  // Measurements whose errors are visible: shown once the user leaves the
  // field or tries to save, not while still typing.
  const [checkedMeasures, setCheckedMeasures] = useState({})
  // Save was stopped by invalid measurements; the footer notice lasts only
  // while some of them are still invalid.
  const [isSaveBlocked, setIsSaveBlocked] = useState(false)
  const [drawTool, setDrawTool] = useState('pen')
  const [undoCount, setUndoCount] = useState(0)
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const hasInkRef = useRef(false)
  // Canvas pixels before each stroke, oldest first (at most UNDO_LIMIT).
  const undoStackRef = useRef([])
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const saveButtonRef = useRef(null)
  const returnFocusRef = useRef(null)
  const wasLoadingRef = useRef(false)
  const wasSavingRef = useRef(false)
  // Latest handlers for the document-level listeners (Escape fallback,
  // beforeunload), which are registered once per opening.
  const latestRef = useRef({ requestClose: () => {}, hasUnsavedChanges: () => false })
  // Unsaved-changes tracking: the form as last loaded/saved, and a counter of
  // podogram edits (the canvas is not React state).
  const baselineRef = useRef({ form: EMPTY_FORM, drawEdits: 0 })
  const submittedRef = useRef(null)
  const drawEditsRef = useRef(0)

  const emptyForm = () => ({
    ...EMPTY_FORM,
    nombre: appointment?.patient_name ?? '',
    email: appointment?.email ?? '',
    telefono: appointment?.phone ?? '',
  })

  // Expired session while saving: unsaved changes keep the modal open so they
  // can be copied before signing in again. Read through latestRef: edits made
  // while the save was in flight count too.
  const handleSessionExpired = () => {
    if (latestRef.current.hasUnsavedChanges()) setErrorMessage(SESSION_EXPIRED_UNSAVED_MESSAGE)
    else onSessionExpired()
  }

  useEffect(() => {
    if (!isOpen || appointmentId == null) return undefined

    const controller = new AbortController()

    const loadRecord = async () => {
      setIsLoading(true)
      setErrorMessage('')
      setSuccessMessage('')
      setHasForeignRecord(false)
      setRecordId(null)
      setRest({ medical: [], symptoms: [], treatment: [] })
      setSavedDrawing('')
      setMapVersion('v2')
      setRecordCreatedAt('')
      setCheckedMeasures({})
      setIsSaveBlocked(false)
      setDrawTool('pen')
      setForm({
        ...EMPTY_FORM,
        nombre: appointment?.patient_name ?? '',
        email: appointment?.email ?? '',
        telefono: appointment?.phone ?? '',
      })

      try {
        const response = await authFetch(`${API_URL}?appointment=${appointmentId}`, {
          headers: JSON_HEADERS,
          signal: controller.signal,
        })

        // Nothing typed yet while loading, so there is nothing to keep.
        if (response.status === 401) {
          onSessionExpired()
          return
        }
        if (!response.ok) {
          setErrorMessage(`No pudimos cargar la ficha (error ${response.status}).`)
          return
        }

        const data = await response.json()
        const records = Array.isArray(data) ? data : data.results ?? []
        const record = records.find((item) => belongsToAppointment(item, appointmentId))
        if (!record) {
          // Records came back, but none for this appointment: show nothing and
          // block saving. An empty list just means "no record yet" (next save POSTs).
          if (records.length) setHasForeignRecord(true)
          return
        }

        const medical = parseLines(record.antecedentes_medicos, MEDICAL_KEYS)
        const symptoms = parseLines(record.sintomas, SYMPTOM_KEYS)
        const treatment = parseLines(record.tratamiento_realizado, TREATMENT_KEYS)

        setRecordId(record.id)
        setRecordCreatedAt(record.created_at ?? '')
        setRest({
          medical: medical.rest,
          symptoms: symptoms.rest,
          treatment: treatment.rest,
        })
        const { observations, drawing, version } = parseObservations(record.observaciones)
        setSavedDrawing(drawing)
        setMapVersion(version)
        setForm((prev) => ({
          ...prev,
          ...fromStoredValues({ ...medical.values, ...symptoms.values, ...treatment.values }),
          observaciones: observations,
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

  // On open: remember who opened the modal ("Ver Ficha"), make the rest of the
  // page inert and focus the title. On close: undo that and hand focus back.
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

    titleRef.current?.focus()

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

  // While saving, the Save button is disabled and the browser drops its focus;
  // give it back once the request finishes (successful or not), unless the
  // user has already moved focus to something else inside the dialog.
  useEffect(() => {
    if (isSaving) {
      wasSavingRef.current = true
      return
    }
    if (!wasSavingRef.current) return
    wasSavingRef.current = false
    // A closed (or closing) modal must not take focus back from "Ver Ficha".
    if (!isOpen) return
    const active = document.activeElement
    const focusIsLost =
      !active ||
      active === document.body ||
      active === saveButtonRef.current ||
      !dialogRef.current?.contains(active)
    if (focusIsLost) saveButtonRef.current?.focus()
  }, [isOpen, isSaving])

  // When loading finishes the form exists: snapshot it as "unchanged".
  useEffect(() => {
    if (!isOpen) return
    if (isLoading) {
      wasLoadingRef.current = true
      return
    }
    if (!wasLoadingRef.current) return
    wasLoadingRef.current = false
    baselineRef.current = { form, drawEdits: drawEditsRef.current }
    // Only the loading transition matters; `form` is read as of that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isLoading])

  // A successful save makes what was submitted the new "unchanged" state.
  useEffect(() => {
    if (successMessage && submittedRef.current) {
      baselineRef.current = submittedRef.current
      submittedRef.current = null
    }
  }, [successMessage])

  const hasUnsavedChanges = () =>
    !isLoading &&
    (!isSameForm(form, baselineRef.current.form) ||
      drawEditsRef.current !== baselineRef.current.drawEdits)

  // Closing is blocked while a save is in flight; if it fails, the normal
  // unsaved-changes confirmation applies again.
  const requestClose = () => {
    if (isSaving) return
    if (
      hasUnsavedChanges() &&
      !window.confirm('Hay cambios sin guardar en la ficha. ¿Cerrar y descartarlos?')
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
      // Browsers don't expose whether a <select> list is open, so Escape on a
      // focused select is left to the select (closing its list).
      if (event.target instanceof HTMLSelectElement) return
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

    // The title and the dialog itself hold focus but are not in the Tab order.
    if (event.shiftKey && (active === first || !focusables.includes(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleSubmit = (event) => {
    if (hasForeignRecord) {
      event.preventDefault()
      return
    }
    // Impossible readings block the save with the reason next to each field.
    const invalid = Object.keys(validateMeasures(form))
    if (invalid.length) {
      event.preventDefault()
      setCheckedMeasures(Object.fromEntries(invalid.map((field) => [field, true])))
      setSuccessMessage('')
      setErrorMessage('')
      setIsSaveBlocked(true)
      document.getElementById(MEASURE_INPUT_IDS[invalid[0]])?.focus()
      return
    }
    submittedRef.current = { form, drawEdits: drawEditsRef.current }
    handleSave(event)
  }

  // The canvas only exists once the form is rendered (after loading), so the
  // saved drawing is painted back here rather than in the fetch.
  useEffect(() => {
    if (!isOpen || isLoading) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    // Earlier steps belong to another drawing (or another canvas size).
    undoStackRef.current = []
    setUndoCount(0)
    if (!savedDrawing) return undefined

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      hasInkRef.current = true
    }
    image.src = savedDrawing
    return () => {
      cancelled = true
    }
  }, [isOpen, isLoading, savedDrawing, mapVersion])

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  // The canvas is drawn at its internal size; when shown smaller (phone), the
  // stroke is widened so it still looks about the same on screen.
  const getStrokeWidth = (tool) => {
    const canvas = canvasRef.current
    const { lineWidth, minStrokePx } = PODOGRAM_MAPS[mapVersion]
    const scale = canvas.width / canvas.getBoundingClientRect().width
    const penWidth = Math.max(lineWidth, minStrokePx * scale)
    return { width: tool === 'eraser' ? penWidth * ERASER_FACTOR : penWidth, scale }
  }

  // Sized from the current on-screen scale, so it matches what gets erased.
  const updateCursor = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (drawTool !== 'eraser') {
      canvas.style.cursor = ''
      return
    }
    const { width, scale } = getStrokeWidth('eraser')
    const cursor = eraserCursor(width / scale)
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
  }

  // Resizes between renders are picked up again on pointerenter.
  useEffect(() => {
    if (!isOpen || isLoading) return
    updateCursor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isLoading, drawTool, mapVersion])

  const handleDrawStart = (event) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = getCanvasPoint(event)
    canvas.setPointerCapture(event.pointerId)
    const stack = undoStackRef.current
    stack.push({
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height),
      hasInk: hasInkRef.current,
    })
    if (stack.length > UNDO_LIMIT) stack.shift()
    setUndoCount(stack.length)
    isDrawingRef.current = true
    drawEditsRef.current += 1
    const isEraser = drawTool === 'eraser'
    // The eraser only removes strokes: the map is an <img> under the canvas.
    if (!isEraser) hasInkRef.current = true
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'
    ctx.strokeStyle = PEN_COLOR
    ctx.lineWidth = getStrokeWidth(drawTool).width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    // A click without movement still leaves a dot.
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
  }

  const handleDrawMove = (event) => {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getCanvasPoint(event)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  // An eraser stroke may have removed the last ink: then nothing is saved, as
  // after "Limpiar dibujo", instead of an empty PNG.
  const handleDrawEnd = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    if (drawTool !== 'eraser' || !hasInkRef.current) return
    const canvas = canvasRef.current
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    let hasInk = false
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        hasInk = true
        break
      }
    }
    hasInkRef.current = hasInk
  }

  const handleUndo = () => {
    if (isDrawingRef.current) return
    const step = undoStackRef.current.pop()
    if (!step) return
    canvasRef.current.getContext('2d').putImageData(step.pixels, 0, 0)
    hasInkRef.current = step.hasInk
    drawEditsRef.current += 1
    setUndoCount(undoStackRef.current.length)
  }

  // Ctrl+Z (Cmd+Z on Mac) while focus is on the map or its tools.
  const handlePodogramKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
    if (event.key.toLowerCase() !== 'z') return
    event.preventDefault()
    handleUndo()
  }

  const handleClearDrawing = () => {
    const canvas = canvasRef.current
    if (hasInkRef.current) drawEditsRef.current += 1
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    // The map may change to v2 (another canvas size): old steps can't apply.
    undoStackRef.current = []
    setUndoCount(0)
    setSavedDrawing('')
    // Nothing left that depends on the old map.
    setMapVersion('v2')
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handlePriceChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '')
    setForm((prev) => ({ ...prev, precio: digits }))
  }

  // Nothing is cut short: an extra digit ("1170") must reach the range check
  // and show its error instead of silently becoming a valid value.
  const handleWholeNumberChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value.replace(/\D/g, '') }))
  }

  // Anesthesia: "1,50" or "1.50", shown with a comma.
  const handleAnesthesiaChange = (event) => {
    const value = event.target.value.replace(/\./g, ',').replace(/[^\d,]/g, '')
    setForm((prev) => ({ ...prev, anestesia: value }))
  }

  const checkMeasure = (field) => () => {
    setCheckedMeasures((prev) => ({ ...prev, [field]: true }))
  }

  // Both pressure inputs count as one field: checked once focus leaves the pair.
  const handlePressureBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) checkMeasure('presion')()
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
    const confirmed = window.confirm(
      '¿Vaciar la ficha? Se borrarán todos los campos del formulario. ' +
        'La ficha guardada no cambia hasta que presiones Guardar.',
    )
    if (!confirmed) return
    setForm(emptyForm())
    setCheckedMeasures({})
    setIsSaveBlocked(false)
    handleClearDrawing()
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setIsSaveBlocked(false)
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    const drawing =
      hasInkRef.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''

    const stored = toStoredValues(form)
    const payload = {
      antecedentes_medicos: buildLines(stored, MEDICAL_KEYS, rest.medical),
      sintomas: buildLines(stored, SYMPTOM_KEYS, rest.symptoms),
      tratamiento_realizado: buildLines(stored, TREATMENT_KEYS, rest.treatment),
      observaciones: buildObservations(form.observaciones, drawing, mapVersion),
    }
    const isUpdate = recordId != null

    // One deadline for the whole save, including the lookup and PATCH retry.
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), SAVE_TIMEOUT_MS)
    const patch = (id) =>
      authFetch(`${API_URL}${id}/`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })

    try {
      let targetId = recordId
      let response = isUpdate
        ? await patch(recordId)
        : await authFetch(API_URL, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...payload, appointment: appointmentId }),
          signal: timeout.signal,
        })

      if (response.status === 401) {
        handleSessionExpired()
        return
      }
      let errorBody = response.ok ? null : await readJson(response)

      // The appointment already has a record (one per appointment, e.g. from a
      // POST whose answer never arrived): find it and update it instead.
      if (!isUpdate && response.status === 400 && errorBody?.appointment) {
        const lookup = await authFetch(`${API_URL}?appointment=${appointmentId}`, {
          headers: JSON_HEADERS,
          signal: timeout.signal,
        })
        if (lookup.status === 401) {
          handleSessionExpired()
          return
        }
        const data = lookup.ok ? await readJson(lookup) : null
        // undefined when the lookup failed or did not return a list.
        const records = Array.isArray(data) ? data : data?.results
        const existing = records?.find((record) => belongsToAppointment(record, appointmentId))
        if (!existing) {
          setErrorMessage(
            records
              ? 'Esta cita ya tiene una ficha, pero no pudimos recuperarla para actualizarla. ' +
                  'Recarga la página antes de reintentar.'
              // The lookup itself failed: the POST's error is the useful one.
              : saveErrorMessage(response.status, errorBody),
          )
          return
        }

        targetId = existing.id
        response = await patch(targetId)
        if (response.status === 401) {
          handleSessionExpired()
          return
        }
        errorBody = response.ok ? null : await readJson(response)
      }

      if (response.ok) {
        const saved = await response.json()
        setRecordId(saved.id ?? targetId)
        if (saved.created_at) setRecordCreatedAt(saved.created_at)
        setSuccessMessage('Ficha guardada correctamente.')
      } else {
        setErrorMessage(saveErrorMessage(response.status, errorBody))
      }
    } catch {
      setErrorMessage(
        timeout.signal.aborted ? SAVE_TIMEOUT_MESSAGE : 'No se pudo conectar con el servidor.',
      )
    } finally {
      clearTimeout(timeoutId)
      setIsSaving(false)
    }
  }

  // The appointment's own day (a date without time, kept as text), not today.
  const appointmentDate = appointment?.appointment_date ?? ''
  const createdDate = clinicDateOf(recordCreatedAt)
  const registeredLabel =
    createdDate && createdDate !== appointmentDate
      ? `Registrada el ${formatDateString(createdDate)}`
      : ''
  const recordLabel =
    recordId != null ? `Ficha n.º ${String(recordId).padStart(4, '0')}` : 'Ficha nueva'
  const price = formatClp(form.precio)
  const measureErrors = validateMeasures(form)
  // Once everything is fixed the block is over: a later typo only shows its
  // own field error until the next save attempt.
  if (isSaveBlocked && Object.keys(measureErrors).length === 0) setIsSaveBlocked(false)
  const measureError = (field) => (checkedMeasures[field] ? measureErrors[field] : undefined)
  const pressureError = measureError('presion')

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="clinical-modal"
            className="clinical-overlay"
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
              className="clinical-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clinical-modal-title"
              aria-describedby={
                registeredLabel ? 'clinical-modal-meta clinical-modal-registered' : 'clinical-modal-meta'
              }
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
              onSubmit={handleSubmit}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <header className="clinical-header">
                <div>
                  <h1
                    ref={titleRef}
                    id="clinical-modal-title"
                    className="clinical-header__title"
                    tabIndex={-1}
                  >
                    Ficha clínica podológica
                  </h1>
                  <p id="clinical-modal-meta" className="clinical-header__meta">
                    {recordLabel}
                    {appointmentDate && ` · ${formatDateString(appointmentDate)}`}
                  </p>
                  {registeredLabel && (
                    <p id="clinical-modal-registered" className="clinical-header__registered">
                      {registeredLabel}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="clinical-close"
                  onClick={requestClose}
                  // aria-disabled instead of disabled so the button keeps focus.
                  aria-disabled={isSaving || undefined}
                  aria-label={isSaving ? 'Cerrar ficha (guardando…)' : 'Cerrar ficha'}
                  title={isSaving ? 'Guardando…' : 'Cerrar'}
                >
                  <X className="clinical-btn__icon" strokeWidth={2} />
                </button>
              </header>

              {/* Always mounted, so screen readers announce when its text changes;
                  the visible "Cargando ficha…" below is hidden from them. */}
              <p className="clinical-sr-only" role="status">
                {isLoading ? 'Cargando ficha…' : ''}
              </p>

              <div className="clinical-body" aria-busy={isLoading}>
                {isLoading ? (
                  <p className="clinical-loading" aria-hidden="true">
                    Cargando ficha…
                  </p>
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
                            placeholder="Ej.: María González Pérez"
                          />
                        </Field>
                        <Field label="Fecha de nacimiento">
                          <input
                            type="date"
                            name="nacimiento"
                            value={form.nacimiento}
                            onChange={handleChange}
                          />
                        </Field>
                        <Field label="Género">
                          <select name="genero" value={form.genero} onChange={handleChange}>
                            <option value="">Seleccionar…</option>
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
                            <option value="">Seleccionar…</option>
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
                            placeholder="Ej.: Media completa"
                          />
                        </Field>
                        <Field label="Ocupación" span={2}>
                          <input
                            type="text"
                            name="ocupacion"
                            value={form.ocupacion}
                            onChange={handleChange}
                            placeholder="Ej.: Profesora"
                          />
                        </Field>
                        <Field label="Dirección" span={2}>
                          <input
                            type="text"
                            name="direccion"
                            value={form.direccion}
                            onChange={handleChange}
                            placeholder="Ej.: Av. Providencia 1234, Santiago"
                          />
                        </Field>
                        <Field label="Teléfono">
                          <input
                            type="tel"
                            name="telefono"
                            value={form.telefono}
                            onChange={handleChange}
                            placeholder="Ej.: +56 9 1234 5678"
                          />
                        </Field>
                        <Field label="Correo electrónico" span={2}>
                          <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={handleChange}
                            placeholder="Ej.: nombre@correo.cl"
                          />
                        </Field>
                        <Field label="Talla de calzado">
                          <input
                            type="text"
                            inputMode="decimal"
                            name="tallaCalzado"
                            value={form.tallaCalzado}
                            onChange={handleChange}
                            placeholder="Ej.: 38"
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
                        <Field label="Otros" span={4}>
                          <input
                            type="text"
                            name="otros"
                            value={form.otros}
                            onChange={handleChange}
                            placeholder="Ej.: Fisura en talón derecho"
                          />
                        </Field>
                        <Field label="Observaciones" span={4}>
                          <textarea
                            name="observaciones"
                            value={form.observaciones}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Ej.: Paciente refiere dolor al caminar hace 2 semanas"
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
                            placeholder="Ej.: Diabetes tipo 2"
                          />
                        </Field>
                        <Field label="Medicamento">
                          <input
                            type="text"
                            name="medicamento"
                            value={form.medicamento}
                            onChange={handleChange}
                            placeholder="Ej.: Metformina"
                          />
                        </Field>
                        <Field label="Dosis">
                          <input
                            type="text"
                            name="dosis"
                            value={form.dosis}
                            onChange={handleChange}
                            placeholder="Ej.: 850 mg cada 12 horas"
                          />
                        </Field>
                        <Field label="Desde cuándo">
                          <input
                            type="text"
                            name="desdeCuando"
                            value={form.desdeCuando}
                            onChange={handleChange}
                            placeholder="Ej.: Marzo 2019"
                          />
                        </Field>
                        <fieldset className="clinical-field clinical-fieldset clinical-span-3">
                          <legend className="clinical-fieldset__legend">Consume</legend>
                          <CheckGroup
                            className="clinical-checks-row"
                            options={CONSUMES}
                            selected={form.consume}
                            onToggle={toggleOption('consume')}
                          />
                        </fieldset>
                        <Field label="Cirugías previas" span={3}>
                          <input
                            type="text"
                            name="cirugias"
                            value={form.cirugias}
                            onChange={handleChange}
                            placeholder="Ej.: Apendicectomía, 2010"
                          />
                        </Field>
                      </div>
                    </Section>

                    <Section icon={HeartPulse} title="Signos vitales">
                      <div className="clinical-grid clinical-grid--3">
                        <fieldset
                          className="clinical-field clinical-fieldset"
                          onBlur={handlePressureBlur}
                        >
                          <legend className="clinical-fieldset__legend">
                            Presión arterial (mmHg)
                          </legend>
                          <div className="clinical-pressure">
                            <input
                              id={MEASURE_INPUT_IDS.presion}
                              type="text"
                              inputMode="numeric"
                              name="presionSistolica"
                              value={form.presionSistolica}
                              onChange={handleWholeNumberChange}
                              placeholder="117"
                              aria-label="Sistólica"
                              aria-invalid={pressureError ? true : undefined}
                              aria-describedby={pressureError ? 'clinical-presion-error' : undefined}
                            />
                            <span className="clinical-pressure__separator" aria-hidden="true">
                              /
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              name="presionDiastolica"
                              value={form.presionDiastolica}
                              onChange={handleWholeNumberChange}
                              placeholder="65"
                              aria-label="Diastólica"
                              aria-invalid={pressureError ? true : undefined}
                              aria-describedby={pressureError ? 'clinical-presion-error' : undefined}
                            />
                          </div>
                          {pressureError && (
                            <p id="clinical-presion-error" className="clinical-field__error">
                              {pressureError}
                            </p>
                          )}
                        </fieldset>
                        <MeasureField
                          id={MEASURE_INPUT_IDS.frecuenciaCardiaca}
                          label="Frecuencia cardíaca (lpm)"
                          error={measureError('frecuenciaCardiaca')}
                          inputMode="numeric"
                          name="frecuenciaCardiaca"
                          value={form.frecuenciaCardiaca}
                          onChange={handleWholeNumberChange}
                          onBlur={checkMeasure('frecuenciaCardiaca')}
                          placeholder="Ej.: 72"
                        />
                        <MeasureField
                          id={MEASURE_INPUT_IDS.pulso}
                          label="Pulso pedio (lpm)"
                          error={measureError('pulso')}
                          inputMode="numeric"
                          name="pulso"
                          value={form.pulso}
                          onChange={handleWholeNumberChange}
                          onBlur={checkMeasure('pulso')}
                          placeholder="Ej.: 70"
                        />
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

                    <Section icon={PenTool} title="Mapa anatómico">
                      <div className="clinical-podogram" onKeyDown={handlePodogramKeyDown}>
                        <p className="clinical-podogram__hint">
                          {mapVersion === 'v2'
                            ? 'Dibuja sobre las vistas plantar y dorsal para marcar zonas de interés.'
                            : 'Dibuja sobre el pie para marcar zonas de interés.'}
                        </p>
                        <div className="clinical-podogram__toolbar">
                          <div
                            className="clinical-podogram__tools"
                            role="group"
                            aria-label="Herramienta de dibujo"
                          >
                            <button
                              type="button"
                              className="clinical-btn clinical-btn--toggle"
                              aria-pressed={drawTool === 'pen'}
                              onClick={() => setDrawTool('pen')}
                            >
                              <Pencil className="clinical-btn__icon" strokeWidth={2} />
                              Lápiz
                            </button>
                            <button
                              type="button"
                              className="clinical-btn clinical-btn--toggle"
                              aria-pressed={drawTool === 'eraser'}
                              onClick={() => setDrawTool('eraser')}
                            >
                              <Eraser className="clinical-btn__icon" strokeWidth={2} />
                              Borrador
                            </button>
                          </div>
                          <button
                            type="button"
                            className="clinical-btn"
                            onClick={handleUndo}
                            // aria-disabled instead of disabled so the button keeps focus.
                            aria-disabled={undoCount === 0 || undefined}
                            aria-keyshortcuts="Control+Z"
                          >
                            <Undo2 className="clinical-btn__icon" strokeWidth={2} />
                            Deshacer
                          </button>
                        </div>
                        <div
                          className={`clinical-podogram__stage clinical-podogram__stage--${mapVersion}`}
                        >
                          <img
                            className="clinical-podogram__image"
                            src={PODOGRAM_MAPS[mapVersion].src}
                            alt={PODOGRAM_MAPS[mapVersion].alt}
                            draggable={false}
                          />
                          <canvas
                            ref={canvasRef}
                            className="clinical-podogram__canvas"
                            width={PODOGRAM_MAPS[mapVersion].width}
                            height={PODOGRAM_MAPS[mapVersion].height}
                            tabIndex={0}
                            role="application"
                            aria-roledescription="área de dibujo"
                            aria-label={`Mapa anatómico, herramienta ${
                              drawTool === 'eraser' ? 'borrador' : 'lápiz'
                            }`}
                            aria-keyshortcuts="Control+Z"
                            onPointerEnter={updateCursor}
                            onPointerDown={handleDrawStart}
                            onPointerMove={handleDrawMove}
                            onPointerUp={handleDrawEnd}
                            onPointerCancel={handleDrawEnd}
                          />
                        </div>
                        <button type="button" className="clinical-btn" onClick={handleClearDrawing}>
                          <Eraser className="clinical-btn__icon" strokeWidth={2} />
                          Limpiar dibujo
                        </button>
                      </div>
                    </Section>

                    <Section icon={Wallet} title="Tratamiento y cobro">
                      <div className="clinical-stack">
                        <div className="clinical-grid clinical-grid--3">
                          <MeasureField
                            id={MEASURE_INPUT_IDS.anestesia}
                            label="Anestesia (ml)"
                            error={measureError('anestesia')}
                            inputMode="decimal"
                            name="anestesia"
                            value={form.anestesia}
                            onChange={handleAnesthesiaChange}
                            onBlur={checkMeasure('anestesia')}
                            placeholder="Ej.: 1,50"
                          />
                        </div>
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
                      </div>
                    </Section>
                  </>
                )}
              </div>

              <footer className="clinical-footer">
                {/* Separate from errorMessage so "Vaciar ficha" or a save can't clear it. */}
                {hasForeignRecord && (
                  <p className="clinical-message clinical-message--error" role="alert">
                    {MISMATCH_MESSAGE}
                  </p>
                )}
                {isSaveBlocked && Object.keys(measureErrors).length > 0 && (
                  <p className="clinical-message clinical-message--error" role="alert">
                    {MEASURES_ERROR_MESSAGE}
                  </p>
                )}
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
                <div className="clinical-footer__actions">
                  <button type="button" className="clinical-btn" onClick={handleClear}>
                    <RotateCcw className="clinical-btn__icon" strokeWidth={2} />
                    Vaciar ficha
                  </button>
                  <button
                    ref={saveButtonRef}
                    type="submit"
                    className="clinical-btn clinical-btn--primary"
                    disabled={isSaving || isLoading || hasForeignRecord}
                  >
                    <Save className="clinical-btn__icon" strokeWidth={2} />
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

export default ClinicalRecordModal
