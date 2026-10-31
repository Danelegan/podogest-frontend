import { formatRUT, validarRut } from './rutValidation'

// Patient document: Chilean RUT or passport. Values and messages match the
// backend (api/documentos.py), so local and server errors read the same.
export const DOCUMENT_TYPES = [
  { value: 'rut', label: 'RUT' },
  { value: 'pasaporte', label: 'Pasaporte' },
]

export const DEFAULT_DOCUMENT_TYPE = 'rut'

const PASSPORT_MAX_LENGTH = 20

const RUT_INVALID = 'El RUT ingresado no es válido. Revisa el número y el dígito verificador.'
const PASSPORT_FORMAT = 'El pasaporte debe tener entre 5 y 20 letras (A-Z) o números, sin otros signos.'
const PASSPORT_NO_DIGIT = 'El pasaporte debe incluir al menos un número.'
const PASSPORT_INVALID = 'El número de pasaporte no es válido. Revisa que esté bien escrito.'

// Passport: only A-Z and 0-9, uppercase, at most 20 characters. Filtered
// before uppercasing, like the backend ("ß".toUpperCase() is "SS").
export function formatPassport(value) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, PASSPORT_MAX_LENGTH)
}

export function formatDocumentNumber(type, value) {
  return type === 'pasaporte' ? formatPassport(value) : formatRUT(value)
}

// '' when the number is valid for its type; otherwise the message to show.
export function validateDocument(type, number) {
  if (type !== 'pasaporte') return validarRut(number) ? '' : RUT_INVALID

  const clean = formatPassport(number)
  if (clean.length < 5) return PASSPORT_FORMAT
  if (!/\d/.test(clean)) return PASSPORT_NO_DIGIT
  if (new Set(clean).size === 1) return PASSPORT_INVALID
  return ''
}

// Search key: no dots, hyphens or spaces, uppercase ("12.345.678-k" -> "12345678K").
export function normalizeDocumentSearch(value) {
  return String(value ?? '').replace(/[.\-\s]/g, '').toUpperCase()
}
