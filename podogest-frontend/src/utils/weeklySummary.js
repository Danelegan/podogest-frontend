// Resumen semanal del panel: único punto de contacto con el backend para esta
// pantalla, y la normalización de su respuesta.
//
// CONTRATO (final, implementado en el backend). Solo datos agregados: nunca
// nombres, documentos ni datos clínicos; aquí solo se leen los campos listados.
//
//   GET /api/resumen-semanal/?semana=AAAA-MM-DD     (con token; sin caché)
//     Sin `semana` = semana actual en hora de Chile. El navegador NO calcula
//     semanas: la primera carga va sin parámetro y se navega solo con
//     semana.anterior / semana.siguiente.
//
//   200 {
//     "semana":   { "desde": "2026-11-16", "hasta": "2026-11-22", "en_curso": true,
//                   "anterior": "2026-11-09", "siguiente": null },
//                  // siguiente = null en la semana actual; anterior = null en el
//                  // límite de dos años
//     "citas":    { "total": 21, "atendidas": 15, "no_asistio": 2, "canceladas": 1,
//                   "sin_marcar": 2, "por_venir": 1 },       // los cinco suman total
//     "pacientes": { "distintos": 14, "nuevos": 5, "recurrentes": 9,
//                    "sin_identificar": 2 },                  // CITAS sin documento
//     "servicios": [ { "servicio": "Podología clínica", "citas": 7 } ],
//                  // ya ordenado de más a menos, "Otro" siempre al final: se respeta
//     "ingresos": { "total": 285000,
//                   "por_medio": { "efectivo": 0, "debito": 0, "credito": 0, "transferencia": 0 },
//                   "citas_con_pago": 14, "citas_sin_pago": 1 },
//     "por_dia":  [ { "fecha": "2026-11-16", "dia": "lunes", "cerrado": false,
//                     "atendidas": 2, "no_asistio": 1, "canceladas": 0, "ingresos": 36000 } ],
//                  // siempre 7 filas
//     "por_hora": [ { "hora": "10:00", "citas": 5 } ]
//                  // solo horas con citas; la grilla la dibuja este archivo
//   }
//
//   Bloque aditivo (el frontend tolera que falte): solo etiquetas y conteos.
//     "problemas": [ { "problema": "Uña encarnada", "fichas": 6 } ],  // ya ordenado
//     "cobertura": { "citas_con_problemas": 9, "citas_no_canceladas": 20 }
//   Una ficha puede tener varios problemas: la suma de "fichas" puede superar
//   las citas. Nada más se lee de estos bloques (ningún nombre ni dato clínico).
//
//   400 semana inválida o fuera de rango (mensaje en español) · 401 · 403.
//
// "Ocupado" (por día) = atendidas + no_asistio: lo calcula este archivo.

import API_BASE_URL from '../config/api'
import { authFetch } from './auth'
import { collectMessages, readJson } from './blocks'
import { slotsForDate } from './schedule'

const SUMMARY_URL = `${API_BASE_URL}/api/resumen-semanal/`
const REQUEST_TIMEOUT_MS = 20000

export const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'transferencia', label: 'Transferencia' },
]

// ---------- Texto de fechas (solo dar formato a fechas que manda el backend) ----------

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const dateOrNull = (value) => (typeof value === 'string' && DATE_PATTERN.test(value) ? value : null)

// { weekday: 0-6 (lunes = 0), day, month: 0-11, year } de un "AAAA-MM-DD".
function parts(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return { weekday: (date.getUTCDay() + 6) % 7, day, month: month - 1, year }
}

// "9 nov 2026".
export function formatDateShort(dateString) {
  const { day, month, year } = parts(dateString)
  return `${day} ${MONTHS[month]} ${year}`
}

// "16 – 22 nov 2026", "26 oct – 1 nov 2026", "28 dic 2026 – 3 ene 2027".
export function formatWeekRange(from, to) {
  const a = parts(from)
  const b = parts(to)
  const fromText = `${a.day} ${MONTHS[a.month]}`
  const toText = `${b.day} ${MONTHS[b.month]}`
  if (a.year !== b.year) return `${fromText} ${a.year} – ${toText} ${b.year}`
  if (a.month === b.month) return `${a.day} – ${toText} ${b.year}`
  return `${fromText} – ${toText} ${b.year}`
}

// "Lun 16" y "lunes 16 de noviembre" (para lectores de pantalla).
export const formatDayShort = (dateString) => {
  const { weekday, day } = parts(dateString)
  return `${WEEKDAYS_SHORT[weekday]} ${day}`
}
export const formatDayLong = (dateString) => {
  const { weekday, day, month } = parts(dateString)
  return `${WEEKDAYS_LONG[weekday]} ${day} de ${MONTHS_LONG[month]}`
}
export const weekdayName = (dateString) => WEEKDAYS_LONG[parts(dateString).weekday]

// ---------- Dinero (mismo formato que Ganancias: pesos chilenos, sin decimales) ----------

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})
export const formatClp = (value) => clp.format(Number(value) || 0)

// ---------- Normalización ----------

export class WeeklySummaryError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'WeeklySummaryError'
    this.status = status
  }
}

const count = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : [])

const READ_ERROR = 'No pudimos leer el resumen. Inténtalo de nuevo.'

// Horas de la grilla de la clínica (las de cada día de la semana, juntas) más
// las que el backend trae fuera de ella: esas se marcan "fuera de horario".
function buildHourRows(hours, days) {
  const grid = new Set(days.flatMap((day) => slotsForDate(day.date)))
  const counts = new Map()
  for (const { time, count: citas } of hours) counts.set(time, (counts.get(time) ?? 0) + citas)
  return [...new Set([...grid, ...counts.keys()])]
    .sort()
    .map((time) => ({ time, count: counts.get(time) ?? 0, offHours: !grid.has(time) }))
}

// Respuesta del backend -> forma que usa la pantalla. Solo pasa lo conocido;
// cualquier otro campo (por ejemplo un nombre) se descarta aquí.
export function normalizeWeeklySummary(raw) {
  if (!isObject(raw) || !isObject(raw.semana) || !isObject(raw.citas)) {
    throw new WeeklySummaryError(READ_ERROR)
  }
  const from = dateOrNull(raw.semana.desde)
  const to = dateOrNull(raw.semana.hasta)
  if (!from || !to) throw new WeeklySummaryError(READ_ERROR)

  const citas = raw.citas
  const patients = isObject(raw.pacientes) ? raw.pacientes : {}
  const income = isObject(raw.ingresos) ? raw.ingresos : {}
  const byMethod = isObject(income.por_medio) ? income.por_medio : {}

  const days = list(raw.por_dia)
    .filter((item) => dateOrNull(item.fecha))
    .map((item) => {
      const attended = count(item.atendidas)
      const noShow = count(item.no_asistio)
      return {
        date: item.fecha,
        closed: item.cerrado === true,
        attended,
        noShow,
        cancelled: count(item.canceladas),
        busy: attended + noShow,
      }
    })

  const hours = list(raw.por_hora)
    .map((item) => ({ time: String(item.hora ?? '').slice(0, 5), count: count(item.citas) }))
    .filter((item) => /^\d{2}:\d{2}$/.test(item.time) && item.count > 0)

  return {
    week: {
      from,
      to,
      inProgress: raw.semana.en_curso === true,
      previous: dateOrNull(raw.semana.anterior),
      next: dateOrNull(raw.semana.siguiente),
    },
    total: count(citas.total),
    attended: count(citas.atendidas),
    noShow: count(citas.no_asistio),
    cancelled: count(citas.canceladas),
    unmarked: count(citas.sin_marcar),
    upcoming: count(citas.por_venir),
    patients: {
      distinct: count(patients.distintos),
      newOnes: count(patients.nuevos),
      recurring: count(patients.recurrentes),
      // Cuenta CITAS sin documento, no personas.
      undocumentedAppointments: count(patients.sin_identificar),
    },
    earnings: {
      total: count(income.total),
      withPayment: count(income.citas_con_pago),
      unpaid: count(income.citas_sin_pago),
      methods: PAYMENT_METHODS.map(({ id, label }) => ({ id, label, amount: count(byMethod[id]) })),
    },
    // El backend ya los ordena de más a menos con "Otro" al final: se respeta.
    services: list(raw.servicios)
      .map((item) => ({ label: String(item.servicio ?? '').trim() || 'Sin nombre', count: count(item.citas) }))
      .filter((item) => item.count > 0),
    // Sin bloque (backend antiguo) queda [] y la pantalla muestra el estado vacío.
    // La etiqueta se recorta a 80 caracteres por si llegara muy larga.
    problems: list(raw.problemas)
      .map((item) => ({ label: String(item.problema ?? '').trim().slice(0, 80), count: count(item.fichas) }))
      .filter((item) => item.label !== '' && item.count > 0),
    coverage: isObject(raw.cobertura)
      ? {
          withProblems: count(raw.cobertura.citas_con_problemas),
          nonCancelled: count(raw.cobertura.citas_no_canceladas),
        }
      : null,
    days,
    hours: buildHourRows(hours, days),
    isEmpty: count(citas.total) === 0,
  }
}

// ---------- Petición ----------

async function failureMessage(response) {
  const { status } = response
  if (status === 400) {
    const [message] = collectMessages(await readJson(response))
    return message || 'La semana pedida no es válida.'
  }
  if (status === 403) return 'No tienes permiso para ver el resumen semanal.'
  if (status >= 500) return `El servidor tuvo un problema (error ${status}). Inténtalo de nuevo.`
  return `No pudimos cargar el resumen (error ${status}). Inténtalo de nuevo.`
}

// Carga el resumen. `week` es null (semana actual, sin parámetro) o el
// "AAAA-MM-DD" que entregó semana.anterior / semana.siguiente. `signal` cancela
// la petición (cambio de semana); un AbortError se deja pasar tal cual para que
// quien llama lo ignore. Los demás fallos son WeeklySummaryError.
export async function fetchWeeklySummary(week, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const url = week ? `${SUMMARY_URL}?semana=${encodeURIComponent(week)}` : SUMMARY_URL
  let response
  try {
    response = await authFetch(url, { signal: combined })
  } catch (error) {
    if (signal?.aborted) throw error
    if (timeout.aborted) {
      throw new WeeklySummaryError('El servidor tardó demasiado en responder. Inténtalo de nuevo.')
    }
    throw new WeeklySummaryError('No se pudo conectar con el servidor. Inténtalo de nuevo.')
  }

  if (response.status === 401) throw new WeeklySummaryError('Sesión vencida.', 401)
  if (!response.ok) throw new WeeklySummaryError(await failureMessage(response), response.status)

  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new WeeklySummaryError(READ_ERROR)
  }
  return normalizeWeeklySummary(data)
}
