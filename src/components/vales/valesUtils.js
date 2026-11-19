// Lógica pura de la pantalla de vales de regalo (sin React ni red), para poder
// probarla aparte. Todo texto visible va en español de Chile.

export const NOTE_MAX = 80
export const CODE_LENGTH = 10
export const LIST_LIMIT = 200
export const EMIT_MAX_QUANTITY = 50
export const EMIT_MAX_AMOUNT = 1000000

// ---------- Dinero ----------

// 25000 -> "$25.000". Siempre enteros; negativos como "-$12.000".
export function formatClp(value) {
  const number = Math.trunc(Number(value) || 0)
  const digits = String(Math.abs(number)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${number < 0 ? '-' : ''}$${digits}`
}

// Con signo explícito para movimientos: "+$30.000", "−$12.000".
export function formatSignedClp(value) {
  const number = Math.trunc(Number(value) || 0)
  if (number === 0) return '$0'
  return `${number < 0 ? '−' : '+'}${formatClp(Math.abs(number))}`
}

// Cuánto queda en el vale tras descontar `amount`.
export const remainingAfter = (balance, amount) => balance - amount

// ---------- Códigos ----------

// Mayúsculas, sin espacios ni guiones ni otros símbolos.
export const normalizeCode = (text) =>
  String(text ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

export const maskCode = (code) => {
  const text = String(code ?? '')
  return `******${text.slice(-4)}`
}

// Qué hacer con lo escrito en la búsqueda.
//  suffix: 1 a 4 caracteres, filtra la lista por los últimos 4 del código.
//  full: 10 caracteres, se consulta al servidor.
//  invalid: cualquier otro largo.
export function planSearch(text) {
  const value = normalizeCode(text)
  if (!value) return { kind: 'empty', value }
  if (value.length <= 4) return { kind: 'suffix', value }
  if (value.length === CODE_LENGTH) return { kind: 'full', value }
  return { kind: 'invalid', value }
}

// Agrupa de a 5 para leer o dictar: "K2P9XQ4RTM" -> "K2P9X Q4RTM".
export const groupCode = (code) => String(code ?? '').replace(/(.{5})(?=.)/g, '$1 ')

// ---------- Estados y textos ----------

export const STATUS_LABELS = {
  sin_activar: 'Sin activar',
  activo: 'Activo',
  agotado: 'Agotado',
  anulado: 'Anulado',
  vencido: 'Vencido',
}

export const statusLabel = (status) => STATUS_LABELS[status] ?? 'Desconocido'

export const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'sin_activar', label: 'Sin activar' },
  { id: 'activo', label: 'Activos' },
  { id: 'agotado', label: 'Agotados' },
  { id: 'anulado', label: 'Anulados' },
  { id: 'vencido', label: 'Vencidos' },
]

export function filterVales(vales, filter, suffix = '') {
  return vales.filter((vale) => {
    if (filter !== 'todos' && vale.estado !== filter) return false
    if (suffix && !String(vale.codigo ?? '').slice(-4).includes(suffix)) return false
    return true
  })
}

// Lo que se puede hacer con un vale según su estado.
export function actionsFor(status) {
  return {
    primary:
      status === 'sin_activar' ? 'activar' : status === 'activo' ? 'canjear' : null,
    canjearBloqueado: status === 'vencido',
    anular: ['sin_activar', 'activo', 'vencido'].includes(status),
    ajustar: ['activo', 'agotado', 'vencido'].includes(status),
  }
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// "2027-12-12" -> "12 de diciembre de 2027" (sin pasar por Date: sin desfase horario).
export function formatLongDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString ?? '')
  if (!match) return ''
  return `${Number(match[3])} de ${MONTHS[Number(match[2]) - 1]} de ${match[1]}`
}

export function validityText(vale) {
  if (vale.vence_en) {
    const date = formatLongDate(vale.vence_en)
    return vale.estado === 'vencido' ? `venció el ${date}` : `vence el ${date}`
  }
  return vale.estado === 'sin_activar' ? 'la vigencia se define al vender' : 'sin vigencia'
}

const dateTimeFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatDateTime(timestamp) {
  const date = new Date(timestamp ?? '')
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date)
}

export const MOVEMENT_LABELS = {
  activacion: 'Activación',
  canje: 'Canje',
  ajuste: 'Ajuste',
  anulacion: 'Anulación',
}

export const movementLabel = (type) => MOVEMENT_LABELS[type] ?? 'Movimiento'

// ---------- Validación en el cliente ----------

const WHOLE = /^\d+$/

// "5000" -> 5000; cualquier otra cosa -> null.
export function parseWhole(text) {
  const value = String(text ?? '').trim()
  return WHOLE.test(value) ? Number(value) : null
}

// "+5000" / "-5000" / "5000" -> número; vacío o inválido -> null.
export function parseSigned(text) {
  const value = String(text ?? '').trim().replace('−', '-')
  if (!/^[+-]?\d+$/.test(value)) return null
  return Number(value)
}

export function validateCanje(text, balance) {
  const value = parseWhole(text)
  if (value === null) return { error: 'Escribe el monto a descontar, solo números.' }
  if (value < 1) return { error: 'El monto debe ser de $1 o más.' }
  if (value > balance) return { error: `El monto no puede superar el saldo (${formatClp(balance)}).` }
  return { value }
}

export function validateAjuste(text, vale) {
  const value = parseSigned(text)
  if (value === null) {
    return { error: 'Escribe el monto con + para sumar o - para restar. Ejemplo: -5000.' }
  }
  if (value === 0) return { error: 'El monto del ajuste no puede ser 0.' }
  const after = vale.saldo + value
  if (after < 0) return { error: 'El ajuste dejaría el saldo en negativo.' }
  if (after > vale.monto_inicial) {
    return { error: 'El ajuste dejaría el saldo sobre el monto inicial del vale.' }
  }
  return { value, after }
}

export function validateEmitir({ cantidad, monto, nota }) {
  const errors = {}
  const quantity = parseWhole(cantidad)
  const amount = parseWhole(monto)
  if (quantity === null || quantity < 1 || quantity > EMIT_MAX_QUANTITY) {
    errors.cantidad = 'La cantidad debe ser de 1 a 50.'
  }
  if (amount === null || amount < 1 || amount > EMIT_MAX_AMOUNT) {
    errors.monto = 'El monto debe ser de $1 a $1.000.000.'
  }
  if (nota.length > NOTE_MAX) errors.nota = 'Debe tener como máximo 80 caracteres.'
  return { errors, quantity, amount }
}

export function validateMonths(text) {
  const value = parseWhole(text)
  if (value === null || value < 1 || value > 24) {
    return { error: 'La vigencia debe ser de 1 a 24 meses.' }
  }
  return { value }
}

export function validateReason(text) {
  const value = text.trim()
  if (!value) return { error: 'Escribe el motivo.' }
  if (value.length > NOTE_MAX) return { error: 'Debe tener como máximo 80 caracteres.' }
  return { value }
}

// ---------- Errores de la API ----------

export const MESSAGES = {
  disabled: 'Los vales de regalo aún no están habilitados.',
  codeNotFound: 'No encontramos ese código',
  valeNotFound: 'No encontramos ese vale.',
  forbidden: 'Tu cuenta no tiene permiso para usar los vales.',
  network:
    'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  generic: 'Algo salió mal. Inténtalo de nuevo.',
  codeLength: 'Los códigos tienen 10 caracteres',
}

const CONFLICTS = {
  sin_activar: 'Este vale aún no se vende. Primero hay que activarlo.',
  vencido: 'Este vale está vencido y ya no se puede canjear.',
  agotado: 'Este vale ya no tiene saldo.',
  anulado: 'Este vale está anulado.',
  sin_saldo: 'El vale no tiene saldo suficiente para este canje.',
  ya_activado: 'Este vale ya estaba activado.',
  clave_reutilizada: 'Este canje ya se había registrado.',
  estado_invalido: 'Esa acción no se puede hacer con el estado actual del vale.',
}

export function throttledMessage(retryAfterSeconds) {
  const base = 'Demasiadas acciones seguidas, espera un momento.'
  const seconds = Number(retryAfterSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return base
  const minutes = Math.ceil(seconds / 60)
  return `${base} Podrás seguir en ${minutes === 1 ? 'cerca de 1 minuto' : `unos ${minutes} minutos`}.`
}

// Traduce una respuesta del servidor a algo que la pantalla sabe mostrar.
// `action`: 'listar' | 'emitir' | 'consultar' | 'detalle' | 'activar' |
//           'canjear' | 'anular' | 'ajustar' | 'movimientos'
// kind: session | disabled | notfound | conflict | repeated | field | throttled
//       | forbidden | network | generic
export function classifyError({ status, data, retryAfter, network }, action) {
  if (network) return { kind: 'network', message: MESSAGES.network }
  if (status === 401) return { kind: 'session', message: '' }
  if (status === 403) return { kind: 'forbidden', message: MESSAGES.forbidden }
  if (status === 404) {
    if (action === 'listar' || action === 'emitir') {
      return { kind: 'disabled', message: MESSAGES.disabled }
    }
    return {
      kind: 'notfound',
      message: action === 'consultar' ? MESSAGES.codeNotFound : MESSAGES.valeNotFound,
    }
  }
  if (status === 409) {
    const code = data?.code
    if (code === 'clave_reutilizada') {
      return { kind: 'repeated', code, message: CONFLICTS.clave_reutilizada }
    }
    return { kind: 'conflict', code, message: CONFLICTS[code] ?? MESSAGES.generic }
  }
  if (status === 429) return { kind: 'throttled', message: throttledMessage(retryAfter) }
  if (status === 400 && data && typeof data === 'object' && !Array.isArray(data)) {
    const [field, messages] = Object.entries(data)[0] ?? []
    const text = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : null
    if (field && field !== 'detail' && field !== 'non_field_errors' && text) {
      return { kind: 'field', field, message: text }
    }
  }
  return { kind: 'generic', message: MESSAGES.generic }
}

// ---------- Envío único y clave de canje ----------

// Envuelve una función asíncrona: mientras una llamada sigue en curso, las
// demás se ignoran. Así un doble clic no manda dos peticiones.
export function singleFlight(task) {
  let running = false
  return async (...args) => {
    if (running) return undefined
    running = true
    try {
      return await task(...args)
    } finally {
      running = false
    }
  }
}

// Clave única de un canje (se crea al abrir el diálogo y se reutiliza al reintentar).
export function newRedeemKey() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
