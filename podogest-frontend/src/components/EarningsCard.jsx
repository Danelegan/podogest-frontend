import { useEffect, useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import API_BASE_URL from '../config/api'
import { authFetch } from '../utils/auth'
import './EarningsCard.css'

const SUMMARY_URL = `${API_BASE_URL}/api/pagos/resumen/`
const HIDE_KEY = 'podogest_ocultar_montos'
const MASK = '$ •••••'

const PERIODS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
]

// Same keys and order as the backend (Pago.Medio).
const METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'transferencia', label: 'Transferencia' },
]

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})
const formatClp = (value) => clp.format(Number(value) || 0)

// "2026-10-26" -> "26 oct"; built from the parts so no time zone shifts it.
const formatShortDate = (dateString) => {
  const [year, month, day] = String(dateString ?? '').split('-').map(Number)
  if (!year) return ''
  return new Date(year, month - 1, day)
    .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

// "Sábado 31 de octubre", "26 oct – 1 nov", "Octubre de 2026".
function describePeriod(period, data) {
  if (!data?.desde) return ''
  const [year, month, day] = data.desde.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  let text
  if (period === 'hoy') {
    text = start.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  } else if (period === 'semana') {
    text = `${formatShortDate(data.desde)} – ${formatShortDate(data.hasta)}`
  } else {
    text = start.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  }
  text = text.replace(/^(\p{L}+),/u, '$1')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// If localStorage is unavailable (private mode, blocked), amounts are shown.
function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function saveHidden(hidden) {
  try {
    if (hidden) localStorage.setItem(HIDE_KEY, '1')
    else localStorage.removeItem(HIDE_KEY)
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
}

// Amount, or the mask with a name screen readers can say.
function Amount({ value, hidden }) {
  if (!hidden) return formatClp(value)
  return (
    <>
      <span aria-hidden="true">{MASK}</span>
      <span className="earnings__sr-only">Monto oculto</span>
    </>
  )
}

// "Ganancias" card: today, this week (Mon-Sun) or this month, by the
// appointment's date. Reloads on mount, with "Actualizar" and whenever
// refreshKey changes (a record saved, a control booked or cancelled...).
function EarningsCard({ refreshKey = 0 }) {
  const [period, setPeriod] = useState('hoy')
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isHidden, setIsHidden] = useState(readHidden)
  // Bumped by "Actualizar"; together with refreshKey it triggers a load.
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    // Only the latest request counts: a new one aborts the previous.
    const controller = new AbortController()

    const load = async () => {
      setIsLoading(true)
      try {
        const response = await authFetch(SUMMARY_URL, { signal: controller.signal })
        // Not sent to the login: the record modal may be open with unsaved changes.
        if (response.status === 401) {
          setErrorMessage('Tu sesión expiró. Vuelve a iniciar sesión para ver las ganancias.')
          return
        }
        if (!response.ok) {
          setErrorMessage(`No pudimos cargar las ganancias (error ${response.status}).`)
          return
        }
        const data = await response.json().catch(() => null)
        if (!data || typeof data !== 'object' || !data.hoy) {
          setErrorMessage('No pudimos leer las ganancias. Inténtalo de nuevo.')
          return
        }
        setSummary(data)
        setErrorMessage('')
      } catch {
        if (controller.signal.aborted) return
        setErrorMessage('No se pudo conectar con el servidor para cargar las ganancias.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [refreshKey, reloadCount])

  const toggleHidden = () => {
    const next = !isHidden
    setIsHidden(next)
    saveHidden(next)
  }

  // The button keeps focus while loading (aria-disabled instead of disabled).
  const reload = () => {
    if (!isLoading) setReloadCount((count) => count + 1)
  }

  const data = summary?.[period]
  const unpaid = Number(data?.citas_sin_pago) || 0
  const periodLabel = PERIODS.find((item) => item.id === period).label

  return (
    <section className="earnings" aria-labelledby="earnings-title" aria-busy={isLoading}>
      <header className="earnings__header">
        <h2 id="earnings-title" className="earnings__title">
          Ganancias
        </h2>
        <div className="earnings__tools">
          <button
            type="button"
            className="earnings__tool"
            onClick={toggleHidden}
            aria-pressed={isHidden}
          >
            {/* Fixed name with aria-pressed: "Ocultar montos, activado". */}
            {isHidden ? (
              <Eye size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <EyeOff size={18} strokeWidth={2} aria-hidden="true" />
            )}
            Ocultar montos
          </button>
          <button
            type="button"
            className="earnings__tool"
            onClick={reload}
            aria-disabled={isLoading || undefined}
          >
            <RefreshCw
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={isLoading ? 'earnings__spin' : undefined}
            />
            Actualizar
          </button>
        </div>
      </header>

      <div className="earnings__periods" role="group" aria-label="Período">
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`earnings__period ${period === id ? 'earnings__period--active' : ''}`}
            onClick={() => setPeriod(id)}
            aria-pressed={period === id}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Errors replace the figures only before the first load; later the last
          figures stay visible with the error above them. */}
      <div role="alert">
        {errorMessage && <p className="earnings__error">{errorMessage}</p>}
      </div>

      {!summary ? (
        isLoading && (
          <p className="earnings__message" role="status">
            Cargando ganancias…
          </p>
        )
      ) : (
        <>
          <div className="earnings__total-row">
            <p className="earnings__period-label">
              {periodLabel} · {describePeriod(period, data)}
            </p>
            {/* Announced when the period or the figures change. */}
            <p className="earnings__total" aria-live="polite">
              <span className="earnings__sr-only">Total {periodLabel.toLowerCase()}: </span>
              <Amount value={data?.total} hidden={isHidden} />
            </p>
          </div>

          <dl className="earnings__methods">
            {METHODS.map(({ id, label }) => (
              <div key={id} className="earnings__method">
                <dt>{label}</dt>
                <dd>
                  <Amount value={data?.por_medio?.[id]} hidden={isHidden} />
                </dd>
              </div>
            ))}
          </dl>

          {unpaid > 0 && (
            <p className="earnings__unpaid">
              {unpaid} {unpaid === 1 ? 'atención' : 'atenciones'} sin pago registrado
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default EarningsCard
