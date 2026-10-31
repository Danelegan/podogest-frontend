import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  CalendarClock,
  Eraser,
  Footprints,
  HeartPulse,
  Pencil,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  Stethoscope,
  Trash2,
  Undo2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import API_BASE_URL from '../config/api'
import { authFetch, SESSION_EXPIRED_UNSAVED_MESSAGE } from '../utils/auth'
import { parseObservations, PODOGRAM_MAPS } from '../utils/podogram'
import { clinicDateOf, clinicNow, formatDateString } from '../utils/clinicDate'
import NextControlSection from './NextControlSection'
import './ClinicalRecordModal.css'

const API_URL = `${API_BASE_URL}/api/clinical-records/`
const OPTIONS_URL = `${API_URL}opciones/`
// Every request to the clinical records API asks for the Ficha 2.0 format:
// contact, birth date, prescription, payments and drawing in their own fields.
const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Ficha-Version': '2' }

// Prescription code that requires the medication to be typed in receta_otro
// (fixed by the backend; the rest of the list comes from opciones/).
const RECETA_OTRO = 'otro'

// Lists and limits from opciones/, fetched once per page load.
let cachedOptions = null

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
  diagnostico: '',
  // Free text of tratamiento_realizado (see parseTreatment).
  tratamiento: '',
  edad: '',
  receta: [],
  recetaOtro: '',
  indicaciones: '',
  // Rows of { id, medio, monto }; the form always shows at least one.
  pagos: [],
}

let nextPaymentId = 0
const newPaymentRow = (medio = '', monto = '') => {
  nextPaymentId += 1
  return { id: nextPaymentId, medio, monto }
}
// A row with neither medio nor monto is not sent and is not a change.
const filledPayments = (rows) => rows.filter((row) => row.medio || row.monto)

// Contact fields: own backend fields in Ficha 2.0 (form field -> API field).
const CONTACT_FIELDS = {
  nombre: 'contacto_nombre',
  telefono: 'contacto_telefono',
  email: 'contacto_email',
  direccion: 'direccion',
}

// Label used in the "Clave: valor" lines of each backend text field.
const MEDICAL_KEYS = {
  genero: 'Género',
  estadoCivil: 'Estado civil',
  escolaridad: 'Escolaridad',
  ocupacion: 'Ocupación',
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
// Before Ficha 2.0 the contact and the birth date were lines of
// antecedentes_medicos too. Only used to read records the backend could not
// convert (migracion_pendiente).
const LEGACY_MEDICAL_KEYS = {
  nombre: 'Nombre',
  nacimiento: 'Nacimiento',
  ...MEDICAL_KEYS,
  direccion: 'Dirección',
  telefono: 'Teléfono',
  email: 'E-mail',
}

const SYMPTOM_KEYS = { problemas: 'Problemas', otros: 'Otros' }
// "Precio: 15000" lines of older records are kept untouched among the lines we
// don't own, and only shown (payments replace them).
const ANESTHESIA_PREFIX = 'Anestesia: '
const LEGACY_PRICE_PREFIX = 'Precio: '

// tratamiento_realizado holds the "Anestesia: …" line, any old "Precio: …"
// line and, after them, the free text of "Tratamiento realizado". Read line by
// line (not with parseLines) so the free text keeps its blank lines.
const EMPTY_TREATMENT = { anesthesiaLine: '', anesthesia: '', keptLines: [], original: '', freeText: '' }

// Blank lines at the start or end are not part of the text.
const trimBlankLines = (lines) => {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return lines.slice(start, end)
}

function parseTreatment(text) {
  const treatment = { ...EMPTY_TREATMENT, keptLines: [] }
  const free = []
  ;(text ?? '').split('\n').forEach((line) => {
    if (line.startsWith(ANESTHESIA_PREFIX) && !treatment.anesthesiaLine) {
      treatment.anesthesiaLine = line
      // As the form holds it: without the unit ("1,50 ml" -> "1,50").
      treatment.anesthesia = fromStoredValues({ anestesia: line.slice(ANESTHESIA_PREFIX.length) }).anestesia
    } else if (line.startsWith(ANESTHESIA_PREFIX) || line.startsWith(LEGACY_PRICE_PREFIX)) {
      // Old prices (and a repeated anesthesia line) are kept exactly as they are.
      treatment.keptLines.push(line)
    } else {
      free.push(line)
    }
  })
  treatment.original = text ?? ''
  treatment.freeText = trimBlankLines(free).join('\n')
  return { treatment, freeText: treatment.freeText }
}

// Untouched, the text goes back exactly as it came (same order and blank
// lines); otherwise an unchanged anesthesia still keeps its original line.
function buildTreatment(form, stored, treatment) {
  if (form.anestesia === treatment.anesthesia && form.tratamiento === treatment.freeText) {
    return treatment.original
  }
  const anesthesia =
    treatment.anesthesiaLine && form.anestesia === treatment.anesthesia
      ? treatment.anesthesiaLine
      : stored.anestesia
        ? `${ANESTHESIA_PREFIX}${stored.anestesia}`
        : ''
  const free = trimBlankLines(form.tratamiento.split('\n'))
  return [...(anesthesia ? [anesthesia] : []), ...treatment.keptLines, ...free].join('\n')
}

// migracion_pendiente reasons the old reader handles without losing anything:
// lines out of order, or a contact value that is empty or too long (the backend
// then answers with that field's error). Any other reason blocks saving.
const SAFE_MIGRATION_REASONS = ['antecedentes_orden', 'antecedentes_valor_invalido']
const MIGRATION_REASON_TEXT = {
  antecedentes_clave_repetida: 'un dato de contacto o la fecha de nacimiento aparece repetido',
  nacimiento_invalido: 'la fecha de nacimiento guardada no es una fecha válida',
  podograma_marca_repetida: 'el dibujo del mapa anatómico está guardado dos veces',
  podograma_formato: 'el dibujo del mapa anatómico tiene un formato que no se reconoce',
  conflicto_campo_propio: 'tiene datos en el formato antiguo y en el nuevo a la vez',
}

// Text of the notice for a record that can't be converted safely, '' if it can.
function migrationBlockMessage(pending) {
  if (!pending) return ''
  const reasons = pending.split(',').map((reason) => reason.trim()).filter(Boolean)
  const unsafe = reasons.filter((reason) => !SAFE_MIGRATION_REASONS.includes(reason))
  if (!unsafe.length) return ''
  const details = [
    ...new Set(unsafe.map((reason) => MIGRATION_REASON_TEXT[reason] ?? 'tiene un formato que no se reconoce')),
  ]
  return (
    `Esta ficha está guardada en el formato antiguo y no se puede pasar al nuevo sin riesgo ` +
    `de perder datos: ${details.join('; ')}. Puedes consultarla, pero no guardarla. ` +
    'Avisa a soporte para que la revisen.'
  )
}

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

// Whole years on `day` ("YYYY-MM-DD" strings), as the backend computes it:
// negative when born after that day; null if either isn't a date.
function ageOn(birth, day) {
  const parse = (text) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '')?.slice(1).map(Number)
  const born = parse(birth)
  const on = parse(day)
  if (!born || !on) return null
  const [year, month, date] = born
  const [onYear, onMonth, onDate] = on
  return onYear - year - (onMonth < month || (onMonth === month && onDate < date) ? 1 : 0)
}

// Error keys of one payment row; also the base of its input ids.
const paymentKey = (row, field) => `pago-${row.id}-${field}`

// Wide limits: they catch typos (1170 instead of 117), never a rare but real
// reading. Keys follow the on-screen order, so the first one gets the focus.
// `limits` come from opciones/ and `day` is the appointment's date.
function validateForm(form, { day, limits }) {
  const errors = {}
  const inRange = (value, min, max) =>
    /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max

  const maxAge = limits?.edad_maxima ?? 120
  if (form.nacimiento) {
    const age = ageOn(form.nacimiento, day)
    if (age == null) {
      errors.nacimiento = 'La fecha de nacimiento no es válida.'
    } else if (age < 0) {
      errors.nacimiento = 'La fecha de nacimiento no puede ser posterior a la fecha de la atención.'
    } else if (age > maxAge) {
      errors.nacimiento =
        `Con esa fecha de nacimiento la edad sería ${age} años (máximo ${maxAge}). ` +
        'Revisa que esté bien escrita.'
    }
  } else if (form.edad && !inRange(form.edad, 0, maxAge)) {
    errors.edad = `La edad debe ser un número entero de 0 a ${maxAge} años.`
  }

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

  // Such a line would be read back as the anesthesia or as an old price.
  const reserved = form.tratamiento
    .split('\n')
    .find((line) => line.startsWith(ANESTHESIA_PREFIX) || line.startsWith(LEGACY_PRICE_PREFIX))
  if (reserved) {
    errors.tratamiento =
      `Ninguna línea puede empezar con "${reserved.slice(0, reserved.indexOf(':') + 1)}" ` +
      '(la anestesia va en su propio campo). Cambia los dos puntos por un guion, por ejemplo.'
  }

  if (form.receta.includes(RECETA_OTRO) && !form.recetaOtro.trim()) {
    errors.recetaOtro = 'Escribe el otro medicamento recetado.'
  }

  const maxAmount = limits?.pago_monto_maximo
  filledPayments(form.pagos).forEach((row) => {
    if (!row.medio) errors[paymentKey(row, 'medio')] = 'Indica el medio de pago.'
    if (!row.monto) {
      errors[paymentKey(row, 'monto')] = 'Indica el monto del pago.'
    } else if (Number(row.monto) <= 0) {
      errors[paymentKey(row, 'monto')] = 'El monto del pago debe ser mayor que 0.'
    } else if (maxAmount && Number(row.monto) > maxAmount) {
      errors[paymentKey(row, 'monto')] = `El monto de un pago no puede superar ${formatClp(String(maxAmount))}.`
    }
  })
  return errors
}

// Input (or group) that receives the focus for each error key; payment rows
// use `clinical-<paymentKey>`.
const FIELD_INPUT_IDS = {
  nombre: 'clinical-nombre',
  nacimiento: 'clinical-nacimiento',
  edad: 'clinical-edad',
  direccion: 'clinical-direccion',
  telefono: 'clinical-telefono',
  email: 'clinical-email',
  diagnostico: 'clinical-diagnostico',
  observaciones: 'clinical-observaciones',
  presion: 'clinical-presion-sistolica',
  frecuenciaCardiaca: 'clinical-frecuencia-cardiaca',
  pulso: 'clinical-pulso',
  podograma: 'clinical-podogram-canvas',
  anestesia: 'clinical-anestesia',
  tratamiento: 'clinical-tratamiento',
  receta: 'clinical-receta',
  recetaOtro: 'clinical-receta-otro',
  indicaciones: 'clinical-indicaciones',
  pagos: 'clinical-pagos',
}
const fieldInputId = (key) => FIELD_INPUT_IDS[key] ?? `clinical-${key}`

// Error keys in on-screen order; each payment row's keys go after "Pagos".
function orderErrorKeys(keys, rows) {
  const order = Object.keys(FIELD_INPUT_IDS).flatMap((key) =>
    key === 'pagos'
      ? [key, ...rows.flatMap((row) => [paymentKey(row, 'medio'), paymentKey(row, 'monto')])]
      : [key],
  )
  return [...order.filter((key) => keys.includes(key)), ...keys.filter((key) => !order.includes(key))]
}

// Names used in the error summary, in on-screen order.
const FIELD_LABELS = {
  nombre: 'Nombre completo',
  nacimiento: 'Fecha de nacimiento',
  edad: 'Edad',
  direccion: 'Dirección',
  telefono: 'Teléfono',
  email: 'Correo electrónico',
  diagnostico: 'Diagnóstico',
  observaciones: 'Observaciones',
  presion: 'Presión arterial',
  frecuenciaCardiaca: 'Frecuencia cardíaca',
  pulso: 'Pulso pedio',
  podograma: 'Mapa anatómico',
  anestesia: 'Anestesia',
  tratamiento: 'Tratamiento realizado',
  receta: 'Receta',
  recetaOtro: 'Otro medicamento',
  indicaciones: 'Indicaciones',
  pagos: 'Pagos',
}

// Backend field -> form error key. Text fields that hold several form fields
// have no single place on screen: their errors go to the general message.
const API_ERROR_KEYS = {
  ...Object.fromEntries(Object.entries(CONTACT_FIELDS).map(([field, api]) => [api, field])),
  fecha_nacimiento: 'nacimiento',
  edad: 'edad',
  observaciones: 'observaciones',
  podograma: 'podograma',
  podograma_version: 'podograma',
  receta_medicamentos: 'receta',
  receta_otro: 'recetaOtro',
  receta_indicaciones: 'indicaciones',
  diagnostico: 'diagnostico',
  tratamiento_realizado: 'tratamiento',
}
const API_FIELD_NAMES = {
  antecedentes_medicos: 'Antecedentes',
  sintomas: 'Problemas actuales',
}

// DRF errors come as strings, lists of strings or nested objects.
const flattenMessages = (value) => {
  if (value == null) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(flattenMessages)
  if (typeof value === 'object') return Object.values(value).flatMap(flattenMessages)
  return [String(value)]
}

// 400 body -> { fields: { errorKey: message }, general: [messages] }.
// `sentRows` are the payment rows in the order they were sent.
function parseSaveErrors(body, sentRows) {
  const fields = {}
  const general = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    general.push(...flattenMessages(body))
    return { fields, general }
  }
  Object.entries(body).forEach(([name, value]) => {
    if (name === 'pagos' && Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
      // One entry per sent row ({} for rows without errors).
      value.forEach((rowErrors, index) => {
        const row = sentRows[index]
        if (!row || !rowErrors || typeof rowErrors !== 'object') return
        Object.entries(rowErrors).forEach(([field, messages]) => {
          const key = field === 'medio' || field === 'monto' ? paymentKey(row, field) : 'pagos'
          fields[key] = flattenMessages(messages).join(' ')
        })
      })
      return
    }
    const messages = flattenMessages(value).join(' ')
    if (!messages) return
    const key = name === 'pagos' ? 'pagos' : API_ERROR_KEYS[name]
    if (key) fields[key] = messages
    else if (API_FIELD_NAMES[name]) general.push(`${API_FIELD_NAMES[name]}: ${messages}`)
    else general.push(messages)
  })
  return { fields, general }
}

const FIELDS_ERROR_MESSAGE = 'Revisa los campos marcados antes de guardar.'

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
// Payments compare as a set of "medio:monto" too, ignoring empty rows.
const paymentsKey = (rows) =>
  filledPayments(rows)
    .map((row) => `${row.medio}:${row.monto}`)
    .sort()
    .join('|')

function isSameForm(a, b) {
  return Object.keys(EMPTY_FORM).every((field) => {
    if (field === 'pagos') return paymentsKey(a.pagos) === paymentsKey(b.pagos)
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

// Messages without a field of their own; never the raw JSON.
const saveErrorMessage = (status, messages = []) =>
  messages.length
    ? `No pudimos guardar la ficha: ${messages.join(' ')}`
    : `No pudimos guardar la ficha (error ${status}). Inténtalo de nuevo.`

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
// ...but never narrower than this on screen (CSS px), on any map.
const ERASER_MIN_PX = 24
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

// Field with its hint and error outside the <label>, so screen readers hear
// them as a description (aria-describedby) instead of as part of its name.
function InputField({ id, label, error, hint, span = 1, ...inputProps }) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')
  return (
    <div className={`clinical-field clinical-span-${span}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="clinical-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="clinical-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

function TextAreaField({ id, label, error, span = 1, ...textareaProps }) {
  const errorId = `${id}-error`
  return (
    <div className={`clinical-field clinical-span-${span}`}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...textareaProps}
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

const EMPTY_CONTROL_DRAFT = { date: '', time: '' }

function ClinicalRecordModal({
  isOpen,
  onClose,
  onSessionExpired,
  onControlChanged,
  onSaved,
  appointmentId,
  appointment,
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [recordId, setRecordId] = useState(null)
  // Lines in each backend field that this form doesn't manage; kept on save.
  const [rest, setRest] = useState({ medical: [], symptoms: [], treatment: EMPTY_TREATMENT })
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
  // "RUT 12.345.678-5" / "Pasaporte AB1234567", read-only (comes from the
  // appointment). Until the record exists, the appointment's own value is used.
  const [recordDocument, setRecordDocument] = useState('')
  // Next control booked from this record (read-only, from the backend) and the
  // day and hour chosen for a new one. Kept apart from `form`: booking it is
  // not a change of the record, but an hour chosen and not booked is unsaved.
  const [proximoControl, setProximoControl] = useState(null)
  const [controlDraft, setControlDraft] = useState(EMPTY_CONTROL_DRAFT)
  // Old drawings keep the map they were drawn on; everything else uses v2.
  const [mapVersion, setMapVersion] = useState('v2')
  // Fields whose errors are visible: shown once the user leaves the field or
  // tries to save, not while still typing.
  const [checkedFields, setCheckedFields] = useState({})
  // Save was stopped by invalid fields; the footer notice lasts only while
  // some of them are still invalid.
  const [isSaveBlocked, setIsSaveBlocked] = useState(false)
  // Errors the backend gave for each field on the last save ({ errorKey: message });
  // each one goes away as soon as its field is edited.
  const [serverErrors, setServerErrors] = useState({})
  // Show the list of errors at the top (set by a stopped or rejected save).
  const [showErrorSummary, setShowErrorSummary] = useState(false)
  // Lists and limits from opciones/; null until loaded. Without them saving is
  // blocked, since prescription and payments can't be shown.
  const [options, setOptions] = useState(cachedOptions)
  const [optionsError, setOptionsError] = useState('')
  // Codes saved in this record that opciones/ no longer lists: still shown.
  const [extraCodes, setExtraCodes] = useState({ receta: [], medios: [] })
  // Old-format record the backend could not convert (migracion_pendiente).
  const [migrationPending, setMigrationPending] = useState('')
  // "$15.000" from an older record's "Precio: 15000" line ('' if none).
  const [legacyPrice, setLegacyPrice] = useState('')
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
  // The drawing as loaded and the edit count at that moment: an untouched
  // drawing is sent as it came (or not at all), never re-exported.
  const loadedDrawingRef = useRef({ drawing: '', version: 'v2', drawEdits: 0 })
  // Payment rows in the order of the last save, to place the backend's errors.
  const sentPaymentsRef = useRef([])
  // Element to focus after the next render (a new row, "Otro", an error).
  const pendingFocusRef = useRef('')

  const emptyForm = () => ({
    ...EMPTY_FORM,
    nombre: appointment?.patient_name ?? '',
    email: appointment?.email ?? '',
    telefono: appointment?.phone ?? '',
    pagos: [newPaymentRow()],
  })

  const documentDisplay = recordDocument || appointment?.document_display || ''

  // Age is counted on the appointment's day, as the backend does.
  const appointmentDay = appointment?.appointment_date || clinicNow().date
  const validationContext = { day: appointmentDay, limits: options }
  const migrationBlock = migrationBlockMessage(migrationPending)

  useEffect(() => {
    if (!pendingFocusRef.current) return
    document.getElementById(pendingFocusRef.current)?.focus()
    pendingFocusRef.current = ''
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
      setRest({ medical: [], symptoms: [], treatment: EMPTY_TREATMENT })
      setSavedDrawing('')
      setMapVersion('v2')
      setRecordCreatedAt('')
      setRecordDocument('')
      setProximoControl(null)
      setControlDraft(EMPTY_CONTROL_DRAFT)
      setCheckedFields({})
      setIsSaveBlocked(false)
      setServerErrors({})
      setShowErrorSummary(false)
      setOptionsError('')
      setExtraCodes({ receta: [], medios: [] })
      setMigrationPending('')
      setLegacyPrice('')
      setDrawTool('pen')
      loadedDrawingRef.current = { drawing: '', version: 'v2', drawEdits: drawEditsRef.current }
      setForm(emptyForm())

      try {
        const loadOptions = async () => {
          if (cachedOptions) return null
          return authFetch(OPTIONS_URL, { headers: JSON_HEADERS, signal: controller.signal })
        }
        const [optionsResponse, response] = await Promise.all([
          loadOptions(),
          authFetch(`${API_URL}?appointment=${appointmentId}`, {
            headers: JSON_HEADERS,
            signal: controller.signal,
          }),
        ])

        // Nothing typed yet while loading, so there is nothing to keep.
        if (response.status === 401 || optionsResponse?.status === 401) {
          onSessionExpired()
          return
        }
        if (optionsResponse) {
          const loaded = optionsResponse.ok ? await readJson(optionsResponse) : null
          if (Array.isArray(loaded?.receta_medicamentos) && Array.isArray(loaded?.medios_pago)) {
            cachedOptions = loaded
            setOptions(loaded)
          } else {
            setOptionsError(
              'No pudimos cargar las listas de receta y medios de pago' +
                (optionsResponse.ok ? '' : ` (error ${optionsResponse.status})`) +
                '. Cierra y vuelve a abrir la ficha para poder guardarla.',
            )
          }
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

        // A record the backend could not convert still has the contact, the
        // birth date and the drawing inside its texts: read it the old way.
        const pending = record.migracion_pendiente ?? ''
        const medical = parseLines(
          record.antecedentes_medicos,
          pending ? LEGACY_MEDICAL_KEYS : MEDICAL_KEYS,
        )
        const symptoms = parseLines(record.sintomas, SYMPTOM_KEYS)
        const { treatment, freeText } = parseTreatment(record.tratamiento_realizado)
        const { observations, drawing, version } = pending
          ? parseObservations(record.observaciones)
          : {
            observations: record.observaciones ?? '',
            drawing: record.podograma ?? '',
            version: record.podograma ? (record.podograma_version === 'legacy' ? 'legacy' : 'v2') : 'v2',
          }
        const own = pending
          ? {
            nombre: medical.values.nombre ?? '',
            telefono: medical.values.telefono ?? '',
            email: medical.values.email ?? '',
            direccion: medical.values.direccion ?? '',
            nacimiento: medical.values.nacimiento ?? '',
          }
          : {
            ...Object.fromEntries(
              Object.entries(CONTACT_FIELDS).map(([field, api]) => [field, record[api] ?? '']),
            ),
            nacimiento: record.fecha_nacimiento ?? '',
          }
        const receta = Array.isArray(record.receta_medicamentos) ? record.receta_medicamentos : []
        const pagos = (Array.isArray(record.pagos) ? record.pagos : []).map((pago) =>
          newPaymentRow(pago.medio ?? '', pago.monto != null ? String(pago.monto) : ''),
        )
        const priceLine = treatment.keptLines.find((line) => line.startsWith(LEGACY_PRICE_PREFIX))
        const priceText = priceLine?.slice(LEGACY_PRICE_PREFIX.length).trim() ?? ''

        const knownOptions = cachedOptions
        if (knownOptions) {
          const knownRecetas = knownOptions.receta_medicamentos.map((option) => option.codigo)
          const knownMedios = knownOptions.medios_pago.map((option) => option.codigo)
          setExtraCodes({
            receta: receta.filter((code) => !knownRecetas.includes(code)),
            medios: [...new Set(pagos.map((row) => row.medio))].filter(
              (code) => code && !knownMedios.includes(code),
            ),
          })
        }

        setRecordId(record.id)
        setRecordCreatedAt(record.created_at ?? '')
        setRecordDocument(record.document_display ?? '')
        setProximoControl(record.proximo_control ?? null)
        setMigrationPending(pending)
        setLegacyPrice(/^\d+$/.test(priceText) ? formatClp(priceText) : priceText)
        setRest({
          medical: medical.rest,
          symptoms: symptoms.rest,
          treatment,
        })
        loadedDrawingRef.current = { drawing, version, drawEdits: drawEditsRef.current }
        setSavedDrawing(drawing)
        setMapVersion(version)
        setForm((prev) => {
          const values = fromStoredValues({ ...medical.values, ...symptoms.values })
          // Empty contact fields keep the appointment's data, as on a new record.
          const contact = Object.fromEntries(
            Object.entries(own).map(([field, value]) => [field, value || prev[field]]),
          )
          return {
            ...prev,
            ...values,
            ...contact,
            observaciones: observations,
            anestesia: treatment.anesthesia,
            diagnostico: record.diagnostico ?? '',
            tratamiento: freeText,
            edad: record.edad != null ? String(record.edad) : '',
            receta,
            recetaOtro: record.receta_otro ?? '',
            indicaciones: record.receta_indicaciones ?? '',
            pagos: pagos.length ? pagos : prev.pagos,
          }
        })
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

  const hasRecordChanges = () =>
    !isLoading &&
    (!isSameForm(form, baselineRef.current.form) ||
      drawEditsRef.current !== baselineRef.current.drawEdits)

  // An hour chosen for the next control but not booked yet.
  const hasControlDraft = () => !isLoading && proximoControl == null && controlDraft.time !== ''

  const hasUnsavedChanges = () => hasRecordChanges() || hasControlDraft()

  // The control is booked at once (no "Guardar"); the dashboard updates its list.
  const handleControlChange = (control, changedAppointment) => {
    setProximoControl(control)
    if (control != null) setControlDraft(EMPTY_CONTROL_DRAFT)
    if (changedAppointment) onControlChanged?.(changedAppointment)
  }

  // Closing is blocked while a save is in flight; if it fails, the normal
  // unsaved-changes confirmation applies again.
  const requestClose = () => {
    if (isSaving) return
    const question = hasRecordChanges()
      ? 'Hay cambios sin guardar en la ficha. ¿Cerrar y descartarlos?'
      : hasControlDraft()
        ? 'Elegiste una hora para el próximo control, pero no la agendaste. ¿Cerrar de todos modos?'
        : ''
    if (question && !window.confirm(question)) return
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
    if (hasForeignRecord || migrationBlock || !options) {
      event.preventDefault()
      return
    }
    // Impossible values block the save with the reason next to each field.
    const invalid = Object.keys(validateForm(form, validationContext))
    if (invalid.length) {
      event.preventDefault()
      setCheckedFields((prev) => ({
        ...prev,
        ...Object.fromEntries(invalid.map((field) => [field, true])),
      }))
      setSuccessMessage('')
      setErrorMessage('')
      setIsSaveBlocked(true)
      setShowErrorSummary(true)
      document.getElementById(fieldInputId(invalid[0]))?.focus()
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
    // A canvas without layout yet (width 0) is treated as shown at full size.
    const scale = canvas.width / canvas.getBoundingClientRect().width || 1
    const penWidth = Math.max(lineWidth, minStrokePx * scale)
    const width =
      tool === 'eraser' ? Math.max(penWidth * ERASER_FACTOR, ERASER_MIN_PX * scale) : penWidth
    return { width, scale }
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
    clearServerErrors('podograma')
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
    // A saved drawing still loading counts too: it must not come back on save.
    if (hasInkRef.current || savedDrawing) drawEditsRef.current += 1
    clearServerErrors('podograma')
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    // The map may change to v2 (another canvas size): old steps can't apply.
    undoStackRef.current = []
    setUndoCount(0)
    setSavedDrawing('')
    // Nothing left that depends on the old map.
    setMapVersion('v2')
  }

  // A backend error goes away once its field is edited.
  const clearServerErrors = (...keys) => {
    setServerErrors((prev) => {
      if (!keys.some((key) => key in prev)) return prev
      const next = { ...prev }
      keys.forEach((key) => delete next[key])
      return next
    })
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    clearServerErrors(name)
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Clearing the birth date keeps the age it gave, now editable.
  const handleBirthDateChange = (event) => {
    const { value } = event.target
    clearServerErrors('nacimiento', 'edad')
    setForm((prev) => {
      const age = !value && prev.nacimiento ? ageOn(prev.nacimiento, appointmentDay) : null
      const maxAge = options?.edad_maxima ?? 120
      const keptAge = age != null && age >= 0 && age <= maxAge ? String(age) : prev.edad
      return { ...prev, nacimiento: value, edad: keptAge }
    })
  }

  // Nothing is cut short: an extra digit ("1170") must reach the range check
  // and show its error instead of silently becoming a valid value.
  const handleWholeNumberChange = (event) => {
    const { name, value } = event.target
    clearServerErrors(name)
    setForm((prev) => ({ ...prev, [name]: value.replace(/\D/g, '') }))
  }

  // Anesthesia: "1,50" or "1.50", shown with a comma.
  const handleAnesthesiaChange = (event) => {
    const value = event.target.value.replace(/\./g, ',').replace(/[^\d,]/g, '')
    setForm((prev) => ({ ...prev, anestesia: value }))
  }

  const checkField = (field) => () => {
    setCheckedFields((prev) => ({ ...prev, [field]: true }))
  }

  // Both pressure inputs count as one field: checked once focus leaves the pair.
  const handlePressureBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) checkField('presion')()
  }

  const toggleOption = (name) => (option) => {
    setForm((prev) => ({
      ...prev,
      [name]: prev[name].includes(option)
        ? prev[name].filter((item) => item !== option)
        : [...prev[name], option],
    }))
  }

  // Marking "Otro" shows its text field and moves the focus there.
  const toggleReceta = (code) => {
    clearServerErrors('receta', 'recetaOtro')
    if (code === RECETA_OTRO && !form.receta.includes(code)) {
      pendingFocusRef.current = FIELD_INPUT_IDS.recetaOtro
    }
    toggleOption('receta')(code)
  }

  const updatePayment = (row, field, value) => {
    clearServerErrors(paymentKey(row, field), 'pagos')
    setForm((prev) => ({
      ...prev,
      pagos: prev.pagos.map((item) => (item.id === row.id ? { ...item, [field]: value } : item)),
    }))
  }

  const addPayment = () => {
    if (!canAddPayment) return
    const row = newPaymentRow()
    pendingFocusRef.current = `clinical-${paymentKey(row, 'medio')}`
    clearServerErrors('pagos')
    setForm((prev) => ({ ...prev, pagos: [...prev.pagos, row] }))
  }

  // Focus goes to the row before (or the one that takes its place).
  const removePayment = (index) => {
    const rows = form.pagos
    const neighbor = rows[index - 1] ?? rows[index + 1]
    pendingFocusRef.current = neighbor ? `clinical-${paymentKey(neighbor, 'medio')}` : ''
    clearServerErrors(paymentKey(rows[index], 'medio'), paymentKey(rows[index], 'monto'), 'pagos')
    setForm((prev) => ({ ...prev, pagos: prev.pagos.filter((_, i) => i !== index) }))
  }

  const handleClear = () => {
    const confirmed = window.confirm(
      '¿Vaciar la ficha? Se borrarán todos los campos del formulario. ' +
        'La ficha guardada no cambia hasta que presiones Guardar.',
    )
    if (!confirmed) return
    setForm(emptyForm())
    setCheckedFields({})
    setIsSaveBlocked(false)
    setServerErrors({})
    setShowErrorSummary(false)
    handleClearDrawing()
    setErrorMessage('')
    setSuccessMessage('')
  }

  // Shows the backend's errors next to their fields and focuses the first one.
  const showSaveErrors = (status, body) => {
    const { fields, general } = parseSaveErrors(body, sentPaymentsRef.current)
    const keys = orderErrorKeys(Object.keys(fields), form.pagos)
    setServerErrors(fields)
    if (keys.length) {
      setShowErrorSummary(true)
      pendingFocusRef.current = fieldInputId(keys[0])
      setErrorMessage(general.length ? saveErrorMessage(status, general) : FIELDS_ERROR_MESSAGE)
    } else {
      setErrorMessage(saveErrorMessage(status, general))
    }
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setIsSaveBlocked(false)
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    setServerErrors({})

    const stored = toStoredValues(form)
    const sentRows = filledPayments(form.pagos)
    sentPaymentsRef.current = sentRows
    const age = form.nacimiento
      ? ageOn(form.nacimiento, appointmentDay)
      : form.edad === ''
        ? null
        : Number(form.edad)
    const payload = {
      antecedentes_medicos: buildLines(stored, MEDICAL_KEYS, rest.medical),
      sintomas: buildLines(stored, SYMPTOM_KEYS, rest.symptoms),
      diagnostico: form.diagnostico.trim(),
      tratamiento_realizado: buildTreatment(form, stored, rest.treatment),
      // Plain text: the drawing goes in `podograma`, never here.
      observaciones: form.observaciones,
      ...Object.fromEntries(
        Object.entries(CONTACT_FIELDS).map(([field, api]) => [api, form[field].trim()]),
      ),
      fecha_nacimiento: form.nacimiento || null,
      edad: age,
      receta_medicamentos: form.receta,
      receta_otro: form.receta.includes(RECETA_OTRO) ? form.recetaOtro.trim() : '',
      receta_indicaciones: form.indicaciones.trim(),
      // The whole list: it replaces what was saved ([] removes every payment).
      pagos: sentRows.map((row) => ({ medio: row.medio, monto: Number(row.monto) })),
    }
    // A drawing edited since loading is exported from the canvas; an untouched
    // one is left as is, except in an old-format record, where it still lives
    // inside observaciones and has to move to its own field.
    const loaded = loadedDrawingRef.current
    if (drawEditsRef.current !== loaded.drawEdits) {
      const drawing =
        hasInkRef.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
      payload.podograma = drawing
      payload.podograma_version = drawing ? mapVersion : ''
    } else if (migrationPending) {
      payload.podograma = loaded.drawing
      payload.podograma_version = loaded.drawing ? loaded.version : ''
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
              : saveErrorMessage(response.status, flattenMessages(errorBody)),
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
        if (saved.document_display) setRecordDocument(saved.document_display)
        if ('proximo_control' in saved) setProximoControl(saved.proximo_control ?? null)
        // Converted to the new format by this save (or still pending).
        setMigrationPending(saved.migracion_pendiente ?? '')
        setShowErrorSummary(false)
        setSuccessMessage('Ficha guardada correctamente.')
        onSaved?.()
      } else {
        showSaveErrors(response.status, errorBody)
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
  const formErrors = validateForm(form, validationContext)
  // Once everything is fixed the block is over: a later typo only shows its
  // own field error until the next save attempt.
  if (isSaveBlocked && Object.keys(formErrors).length === 0) setIsSaveBlocked(false)
  const fieldError = (field) =>
    (checkedFields[field] ? formErrors[field] : undefined) ?? serverErrors[field]
  const pressureError = fieldError('presion')
  const visibleErrorKeys = orderErrorKeys(
    [
      ...new Set([
        ...Object.keys(formErrors).filter((key) => checkedFields[key]),
        ...Object.keys(serverErrors),
      ]),
    ],
    form.pagos,
  )
  if (showErrorSummary && visibleErrorKeys.length === 0) setShowErrorSummary(false)
  const errorLabel = (key) => {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key]
    const index = form.pagos.findIndex((row) => key.startsWith(`pago-${row.id}-`))
    if (index === -1) return 'Ficha'
    return `Pago ${index + 1}, ${key.endsWith('-medio') ? 'medio de pago' : 'monto'}`
  }

  const maxAge = options?.edad_maxima ?? 120
  const computedAge = form.nacimiento ? ageOn(form.nacimiento, appointmentDay) : null
  const ageValue = form.nacimiento
    ? computedAge != null && computedAge >= 0 && computedAge <= maxAge
      ? String(computedAge)
      : ''
    : form.edad

  // "Otro" stays last, after any saved code that opciones/ no longer lists.
  const recetaOptions = options
    ? [
      ...options.receta_medicamentos.filter((option) => option.codigo !== RECETA_OTRO),
      ...extraCodes.receta.map((code) => ({ codigo: code, etiqueta: code })),
      ...options.receta_medicamentos.filter((option) => option.codigo === RECETA_OTRO),
    ]
    : []
  const medioOptions = options
    ? [
      ...options.medios_pago,
      ...extraCodes.medios.map((code) => ({ codigo: code, etiqueta: code })),
    ]
    : []
  const maxPayments = options?.pagos_maximo ?? 4
  const usedMedios = form.pagos.map((row) => row.medio).filter(Boolean)
  const hasFreeMedio = medioOptions.some((option) => !usedMedios.includes(option.codigo))
  const canAddPayment = form.pagos.length < maxPayments && hasFreeMedio
  const addPaymentHint = canAddPayment
    ? ''
    : form.pagos.length >= maxPayments
      ? `Se pueden registrar hasta ${maxPayments} medios de pago por atención.`
      : 'Ya se usaron todos los medios de pago.'
  const totalPaid = filledPayments(form.pagos).reduce(
    (sum, row) => sum + (Number(row.monto) || 0),
    0,
  )
  const isSaveDisabled = isSaving || isLoading || hasForeignRecord || Boolean(migrationBlock) || !options

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
                    {migrationBlock && (
                      <p className="clinical-message clinical-message--error" role="alert">
                        {migrationBlock}
                      </p>
                    )}
                    {showErrorSummary && visibleErrorKeys.length > 1 && (
                      <div className="clinical-summary" role="alert">
                        <p className="clinical-summary__title">
                          Hay {visibleErrorKeys.length} campos por revisar:
                        </p>
                        <ul className="clinical-summary__list">
                          {visibleErrorKeys.map((key) => (
                            <li key={key}>
                              <button
                                type="button"
                                className="clinical-summary__link"
                                onClick={() => document.getElementById(fieldInputId(key))?.focus()}
                              >
                                {errorLabel(key)}: {fieldError(key)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Section icon={User} title="Datos del paciente">
                      <div className="clinical-grid clinical-grid--3">
                        <InputField
                          id={FIELD_INPUT_IDS.nombre}
                          label="Nombre completo"
                          span={documentDisplay ? 2 : 3}
                          error={fieldError('nombre')}
                          name="nombre"
                          value={form.nombre}
                          onChange={handleChange}
                          placeholder="Ej.: María González Pérez"
                        />
                        {documentDisplay && (
                          <InputField
                            id="clinical-documento"
                            label="Documento"
                            hint="Viene de la cita; no se edita en la ficha."
                            value={documentDisplay}
                            readOnly
                          />
                        )}
                        <InputField
                          id={FIELD_INPUT_IDS.nacimiento}
                          label="Fecha de nacimiento (opcional)"
                          error={fieldError('nacimiento')}
                          type="date"
                          name="nacimiento"
                          value={form.nacimiento}
                          max={appointmentDay}
                          onChange={handleBirthDateChange}
                          onBlur={checkField('nacimiento')}
                        />
                        <InputField
                          id={FIELD_INPUT_IDS.edad}
                          label="Edad (años)"
                          error={fieldError('edad')}
                          hint={form.nacimiento ? 'Calculada desde la fecha de nacimiento.' : ''}
                          inputMode="numeric"
                          name="edad"
                          value={ageValue}
                          readOnly={Boolean(form.nacimiento)}
                          onChange={handleWholeNumberChange}
                          onBlur={checkField('edad')}
                          placeholder="Ej.: 47"
                        />
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
                        <Field label="Ocupación">
                          <input
                            type="text"
                            name="ocupacion"
                            value={form.ocupacion}
                            onChange={handleChange}
                            placeholder="Ej.: Profesora"
                          />
                        </Field>
                        <InputField
                          id={FIELD_INPUT_IDS.direccion}
                          label="Dirección"
                          span={2}
                          error={fieldError('direccion')}
                          name="direccion"
                          value={form.direccion}
                          onChange={handleChange}
                          placeholder="Ej.: Av. Providencia 1234, Santiago"
                        />
                        <InputField
                          id={FIELD_INPUT_IDS.telefono}
                          label="Teléfono"
                          error={fieldError('telefono')}
                          type="tel"
                          name="telefono"
                          value={form.telefono}
                          onChange={handleChange}
                          placeholder="Ej.: +56 9 1234 5678"
                        />
                        <InputField
                          id={FIELD_INPUT_IDS.email}
                          label="Correo electrónico"
                          span={2}
                          error={fieldError('email')}
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          placeholder="Ej.: nombre@correo.cl"
                        />
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
                        <TextAreaField
                          id={FIELD_INPUT_IDS.diagnostico}
                          label="Diagnóstico"
                          span={4}
                          error={fieldError('diagnostico')}
                          name="diagnostico"
                          value={form.diagnostico}
                          onChange={handleChange}
                          rows={3}
                          placeholder="Ej.: Onicocriptosis leve en hallux derecho"
                        />
                        <TextAreaField
                          id={FIELD_INPUT_IDS.observaciones}
                          label="Observaciones"
                          span={4}
                          error={fieldError('observaciones')}
                          name="observaciones"
                          value={form.observaciones}
                          onChange={handleChange}
                          rows={3}
                          placeholder="Ej.: Paciente refiere dolor al caminar hace 2 semanas"
                        />
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
                              id={FIELD_INPUT_IDS.presion}
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
                        <InputField
                          id={FIELD_INPUT_IDS.frecuenciaCardiaca}
                          label="Frecuencia cardíaca (lpm)"
                          error={fieldError('frecuenciaCardiaca')}
                          inputMode="numeric"
                          name="frecuenciaCardiaca"
                          value={form.frecuenciaCardiaca}
                          onChange={handleWholeNumberChange}
                          onBlur={checkField('frecuenciaCardiaca')}
                          placeholder="Ej.: 72"
                        />
                        <InputField
                          id={FIELD_INPUT_IDS.pulso}
                          label="Pulso pedio (lpm)"
                          error={fieldError('pulso')}
                          inputMode="numeric"
                          name="pulso"
                          value={form.pulso}
                          onChange={handleWholeNumberChange}
                          onBlur={checkField('pulso')}
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
                            id={FIELD_INPUT_IDS.podograma}
                            aria-describedby={
                              fieldError('podograma') ? `${FIELD_INPUT_IDS.podograma}-error` : undefined
                            }
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
                        {fieldError('podograma') && (
                          <p
                            id={`${FIELD_INPUT_IDS.podograma}-error`}
                            className="clinical-field__error"
                          >
                            {fieldError('podograma')}
                          </p>
                        )}
                        <button type="button" className="clinical-btn" onClick={handleClearDrawing}>
                          <Trash2 className="clinical-btn__icon" strokeWidth={2} />
                          Limpiar dibujo
                        </button>
                      </div>
                    </Section>

                    <Section icon={Wallet} title="Tratamiento y cobro">
                      <div className="clinical-stack">
                        <div className="clinical-grid clinical-grid--3">
                          <InputField
                            id={FIELD_INPUT_IDS.anestesia}
                            label="Anestesia (ml)"
                            error={fieldError('anestesia')}
                            inputMode="decimal"
                            name="anestesia"
                            value={form.anestesia}
                            onChange={handleAnesthesiaChange}
                            onBlur={checkField('anestesia')}
                            placeholder="Ej.: 1,50"
                          />
                          <TextAreaField
                            id={FIELD_INPUT_IDS.tratamiento}
                            label="Tratamiento realizado"
                            span={2}
                            error={fieldError('tratamiento')}
                            name="tratamiento"
                            value={form.tratamiento}
                            onChange={handleChange}
                            onBlur={checkField('tratamiento')}
                            rows={3}
                            placeholder="Ej.: Onicotomía y fresado de hiperqueratosis"
                          />
                        </div>

                        {optionsError && (
                          <p className="clinical-message clinical-message--error" role="alert">
                            {optionsError}
                          </p>
                        )}

                        {options && (
                          <fieldset
                            id={FIELD_INPUT_IDS.receta}
                            className="clinical-fieldset clinical-subsection"
                            tabIndex={-1}
                            aria-describedby={
                              fieldError('receta') ? `${FIELD_INPUT_IDS.receta}-error` : undefined
                            }
                          >
                            <legend className="clinical-subsection__title">Indicaciones / Receta</legend>
                            <div className="clinical-checks-row">
                              {recetaOptions.map((option) => (
                                <label key={option.codigo} className="clinical-check">
                                  <input
                                    type="checkbox"
                                    checked={form.receta.includes(option.codigo)}
                                    onChange={() => toggleReceta(option.codigo)}
                                  />
                                  {option.etiqueta}
                                </label>
                              ))}
                            </div>
                            {fieldError('receta') && (
                              <p
                                id={`${FIELD_INPUT_IDS.receta}-error`}
                                className="clinical-field__error"
                              >
                                {fieldError('receta')}
                              </p>
                            )}
                            <div className="clinical-grid clinical-grid--3">
                              {form.receta.includes(RECETA_OTRO) && (
                                <InputField
                                  id={FIELD_INPUT_IDS.recetaOtro}
                                  label="Otro medicamento (obligatorio)"
                                  span={3}
                                  error={fieldError('recetaOtro')}
                                  name="recetaOtro"
                                  value={form.recetaOtro}
                                  onChange={handleChange}
                                  onBlur={checkField('recetaOtro')}
                                  aria-required="true"
                                  placeholder="Ej.: Urea 40 %"
                                />
                              )}
                              <TextAreaField
                                id={FIELD_INPUT_IDS.indicaciones}
                                label="Indicaciones"
                                span={3}
                                error={fieldError('indicaciones')}
                                name="indicaciones"
                                value={form.indicaciones}
                                onChange={handleChange}
                                rows={3}
                                placeholder="Ej.: Aplicar por 5 días todas las noches con los pies secos"
                              />
                            </div>
                          </fieldset>
                        )}

                        {options && (
                          <fieldset
                            id={FIELD_INPUT_IDS.pagos}
                            className="clinical-fieldset clinical-subsection"
                            tabIndex={-1}
                            aria-describedby={[
                              fieldError('pagos') && `${FIELD_INPUT_IDS.pagos}-error`,
                              addPaymentHint && `${FIELD_INPUT_IDS.pagos}-hint`,
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined}
                          >
                            <legend className="clinical-subsection__title">Pagos</legend>
                            {legacyPrice && (
                              <p className="clinical-legacy-price">
                                Precio registrado (formato antiguo): {legacyPrice}
                              </p>
                            )}
                            <div className="clinical-payments">
                              {form.pagos.map((row, index) => {
                                const medioId = `clinical-${paymentKey(row, 'medio')}`
                                const montoId = `clinical-${paymentKey(row, 'monto')}`
                                const medioError = fieldError(paymentKey(row, 'medio'))
                                const montoError = fieldError(paymentKey(row, 'monto'))
                                // Each select offers only the medios no other row uses.
                                const available = medioOptions.filter(
                                  (option) =>
                                    option.codigo === row.medio || !usedMedios.includes(option.codigo),
                                )
                                return (
                                  <div
                                    key={row.id}
                                    className={`clinical-payment${form.pagos.length > 1 ? '' : ' clinical-payment--single'}`}
                                    role="group"
                                    aria-label={`Pago ${index + 1}`}
                                  >
                                    <div className="clinical-field clinical-payment__medio">
                                      <label htmlFor={medioId}>Medio de pago</label>
                                      <select
                                        id={medioId}
                                        value={row.medio}
                                        onChange={(event) => updatePayment(row, 'medio', event.target.value)}
                                        onBlur={checkField(paymentKey(row, 'medio'))}
                                        aria-invalid={medioError ? true : undefined}
                                        aria-describedby={medioError ? `${medioId}-error` : undefined}
                                      >
                                        <option value="">Seleccionar…</option>
                                        {available.map((option) => (
                                          <option key={option.codigo} value={option.codigo}>
                                            {option.etiqueta}
                                          </option>
                                        ))}
                                      </select>
                                      {medioError && (
                                        <p id={`${medioId}-error`} className="clinical-field__error">
                                          {medioError}
                                        </p>
                                      )}
                                    </div>
                                    <div className="clinical-field clinical-payment__monto">
                                      <label htmlFor={montoId}>Monto</label>
                                      <input
                                        id={montoId}
                                        type="text"
                                        inputMode="numeric"
                                        value={formatClp(row.monto)}
                                        onChange={(event) =>
                                          updatePayment(row, 'monto', event.target.value.replace(/\D/g, ''))
                                        }
                                        onBlur={checkField(paymentKey(row, 'monto'))}
                                        placeholder="$15.000"
                                        aria-invalid={montoError ? true : undefined}
                                        aria-describedby={montoError ? `${montoId}-error` : undefined}
                                      />
                                      {montoError && (
                                        <p id={`${montoId}-error`} className="clinical-field__error">
                                          {montoError}
                                        </p>
                                      )}
                                    </div>
                                    {form.pagos.length > 1 && (
                                      <button
                                        type="button"
                                        className="clinical-btn clinical-btn--icon clinical-payment__remove"
                                        onClick={() => removePayment(index)}
                                        aria-label={`Quitar pago ${index + 1}`}
                                        title="Quitar este pago"
                                      >
                                        <Trash2 className="clinical-btn__icon" strokeWidth={2} />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            {fieldError('pagos') && (
                              <p id={`${FIELD_INPUT_IDS.pagos}-error`} className="clinical-field__error">
                                {fieldError('pagos')}
                              </p>
                            )}
                            <div className="clinical-billing">
                              <div className="clinical-payments__add">
                                <button
                                  type="button"
                                  className="clinical-btn"
                                  onClick={addPayment}
                                  // aria-disabled instead of disabled so the button keeps focus.
                                  aria-disabled={!canAddPayment || undefined}
                                  aria-describedby={
                                    addPaymentHint ? `${FIELD_INPUT_IDS.pagos}-hint` : undefined
                                  }
                                >
                                  <Plus className="clinical-btn__icon" strokeWidth={2} />
                                  Agregar otro medio de pago
                                </button>
                                {addPaymentHint && (
                                  <p id={`${FIELD_INPUT_IDS.pagos}-hint`} className="clinical-field__hint">
                                    {addPaymentHint}
                                  </p>
                                )}
                              </div>
                              <p className="clinical-billing__total">
                                <span className="clinical-billing__label">Total pagado</span>
                                <output aria-live="polite">{formatClp(String(totalPaid)) || '$0'}</output>
                              </p>
                            </div>
                          </fieldset>
                        )}
                      </div>
                    </Section>

                    <Section icon={CalendarClock} title="Próximo control">
                      <NextControlSection
                        recordId={recordId}
                        control={proximoControl}
                        draft={controlDraft}
                        onDraftChange={setControlDraft}
                        onControlChange={handleControlChange}
                        onSessionExpired={handleSessionExpired}
                        disabled={hasForeignRecord}
                      />
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
                {/* Why Guardar is disabled, next to it. Announced at the top already. */}
                {(migrationBlock || optionsError) && (
                  <p id="clinical-save-blocked" className="clinical-message clinical-message--error">
                    {migrationBlock
                      ? 'Esta ficha no se puede guardar: está en el formato antiguo (ver aviso arriba).'
                      : 'No se puede guardar sin las listas de receta y medios de pago (ver aviso en Tratamiento y cobro).'}
                  </p>
                )}
                {/* The summary at the top is the alert when it is shown. */}
                {isSaveBlocked && Object.keys(formErrors).length > 0 && (
                  <p
                    className="clinical-message clinical-message--error"
                    role={showErrorSummary && visibleErrorKeys.length > 1 ? undefined : 'alert'}
                  >
                    {FIELDS_ERROR_MESSAGE}
                  </p>
                )}
                {errorMessage && (
                  <p
                    className="clinical-message clinical-message--error"
                    // Just "review the fields": the summary at the top already says it.
                    role={
                      errorMessage === FIELDS_ERROR_MESSAGE && showErrorSummary && visibleErrorKeys.length > 1
                        ? undefined
                        : 'alert'
                    }
                  >
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
                    disabled={isSaveDisabled}
                    aria-describedby={migrationBlock || optionsError ? 'clinical-save-blocked' : undefined}
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
