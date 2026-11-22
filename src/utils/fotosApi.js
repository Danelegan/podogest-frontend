// Calls to the clinical record photos API (staff only, JWT through authFetch,
// so a session renewal on 401 works like everywhere else).
//
//   GET    /api/clinical-records/{id}/fotos/                    { alcance, fotos: [...] }
//   GET    /api/clinical-records/{id}/fotos/?alcance=paciente   every record of the patient
//   POST   /api/clinical-records/{id}/fotos/                    multipart, field "imagen"; 201 = one photo
//   DELETE /api/clinical-records/{id}/fotos/{foto_id}/          204, permanent
//
// A photo: { id, ficha, fecha_cita, hora_cita, tipo_contenido, tamano, ancho,
// alto, sha256, created_at, url, url_expira_en }. `url` is a presigned read URL
// that expires in 10 minutes, and it can be null (it could not be signed). URLs
// are only kept in memory (component state); never in any storage, never logged.

import API_BASE_URL from '../config/api'
import { authFetch } from './auth'

const RECORDS_URL = `${API_BASE_URL}/api/clinical-records/`
const photosUrl = (recordId) => `${RECORDS_URL}${recordId}/fotos/`

export const UPLOAD_TIMEOUT_MS = 60000
export const REQUEST_TIMEOUT_MS = 20000

// Limits from opciones/ (fotos_maximo_por_ficha, fotos_max_bytes,
// fotos_lado_maximo); these apply when one is missing.
export const DEFAULT_PHOTO_LIMITS = { maxPerRecord: 20, maxBytes: 10485760, maxSide: 1600 }

const positiveInt = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback)

export const photoLimits = (options) => ({
  maxPerRecord: positiveInt(options?.fotos_maximo_por_ficha, DEFAULT_PHOTO_LIMITS.maxPerRecord),
  maxBytes: positiveInt(options?.fotos_max_bytes, DEFAULT_PHOTO_LIMITS.maxBytes),
  maxSide: positiveInt(options?.fotos_lado_maximo, DEFAULT_PHOTO_LIMITS.maxSide),
})

const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

// `url` is null when the backend could not sign it: the photo is still listed.
export function normalizePhoto(raw) {
  if (!raw || typeof raw !== 'object' || raw.id == null) return null
  return {
    id: raw.id,
    record: raw.ficha ?? null,
    date: typeof raw.fecha_cita === 'string' ? raw.fecha_cita : null,
    time: typeof raw.hora_cita === 'string' ? raw.hora_cita : null,
    url: typeof raw.url === 'string' && raw.url ? raw.url : null,
  }
}

// First message of an error body: { imagen: ["..."] } or { detail: "..." }.
function firstMessage(body) {
  if (!body || typeof body !== 'object') return ''
  const value = body.imagen ?? body.detail
  const message = Array.isArray(value) ? value[0] : value
  return typeof message === 'string' ? message : ''
}

// Own deadline for a request, still stoppable by the caller's signal.
function withDeadline(signal, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

// -> { kind: 'ok', photos } | { kind: 'off' } (404: feature off) |
//    { kind: 'expired' } (401) | { kind: 'error', status }
// Network errors and the caller's abort throw (AbortError = unmounted).
export async function listPhotos(recordId, { patientScope = false, signal } = {}) {
  const deadline = withDeadline(signal, REQUEST_TIMEOUT_MS)
  try {
    const response = await authFetch(`${photosUrl(recordId)}${patientScope ? '?alcance=paciente' : ''}`, {
      // The answer holds presigned URLs: don't keep it in the HTTP cache.
      cache: 'no-store',
      signal: deadline.signal,
    })
    if (response.status === 401) return { kind: 'expired' }
    if (response.status === 404) return { kind: 'off' }
    if (!response.ok) return { kind: 'error', status: response.status }
    const data = await readJson(response)
    const photos = Array.isArray(data?.fotos) ? data.fotos.map(normalizePhoto).filter(Boolean) : []
    return { kind: 'ok', photos }
  } finally {
    deadline.done()
  }
}

// -> { kind: 'ok' } | { kind: 'expired' } | { kind: 'error', status }
// No Content-Type: the browser sets the multipart boundary.
export async function uploadPhoto(recordId, file, { signal } = {}) {
  const body = new FormData()
  body.append('imagen', file, file.name || 'foto.jpg')
  const deadline = withDeadline(signal, UPLOAD_TIMEOUT_MS)
  try {
    const response = await authFetch(photosUrl(recordId), {
      method: 'POST',
      body,
      signal: deadline.signal,
    })
    if (response.status === 401) return { kind: 'expired' }
    if (response.ok) return { kind: 'ok' }
    return { kind: 'error', status: response.status, message: firstMessage(await readJson(response)) }
  } finally {
    deadline.done()
  }
}

// -> { kind: 'ok' } | { kind: 'expired' } | { kind: 'error', status }
export async function deletePhoto(recordId, photoId, { signal } = {}) {
  const deadline = withDeadline(signal, REQUEST_TIMEOUT_MS)
  try {
    const response = await authFetch(`${photosUrl(recordId)}${photoId}/`, {
      method: 'DELETE',
      signal: deadline.signal,
    })
    if (response.status === 401) return { kind: 'expired' }
    if (response.ok) return { kind: 'ok' }
    // "La foto no existe.": it is already gone, which is what was asked for.
    const message = firstMessage(await readJson(response))
    if (response.status === 404 && message === 'La foto no existe.') return { kind: 'ok', gone: true }
    return { kind: 'error', status: response.status }
  } finally {
    deadline.done()
  }
}

export const CONNECTION_MESSAGE = 'No se pudo conectar con el servidor.'
export const UPLOAD_TIMEOUT_MESSAGE =
  'No se pudo confirmar la subida. Revisa la galería antes de volver a intentarlo.'

// 400, 409, 413 and 502 come in Spanish from the backend and are shown as they
// are; 429 comes in English, so it has its own text.
export function uploadErrorMessage(status, serverMessage = '') {
  if (status === 429) return 'Demasiadas fotos en poco tiempo. Espera un momento e inténtalo de nuevo.'
  if (status === 404) return 'Las fotos no están disponibles en este momento.'
  if ([400, 409, 413, 502].includes(status) && serverMessage) return serverMessage
  return `No se pudo subir la foto (error ${status}). Inténtalo de nuevo.`
}

export const deleteErrorMessage = (status) =>
  `No se pudo eliminar la foto (error ${status}). Inténtalo de nuevo.`

export const listErrorMessage = (status) =>
  `No pudimos cargar las fotos (error ${status}).`
