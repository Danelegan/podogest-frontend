import { useCallback, useEffect, useRef, useState } from 'react'
import { Gift, Plus, Search } from 'lucide-react'
import EmitirDialog from './EmitirDialog'
import ValeActionDialog from './ValeActionDialog'
import ValeDetailDialog from './ValeDetailDialog'
import { valesRequest } from './valesApi'
import {
  FILTERS,
  LIST_LIMIT,
  MESSAGES,
  classifyError,
  filterVales,
  formatClp,
  maskCode,
  planSearch,
  statusLabel,
  validityText,
} from './valesUtils'
import './ValesPanel.css'

// El código completo solo se muestra en el detalle y al emitir: en la lista
// siempre va enmascarado, venga de donde venga el vale.
const masked = (vale) => ({ ...vale, codigo: maskCode(vale.codigo) })

// Reemplaza el vale (o lo inserta) manteniendo el orden por id descendente.
function upsert(list, vale) {
  const next = masked(vale)
  const index = list.findIndex((item) => item.id === next.id)
  if (index >= 0) return list.map((item, i) => (i === index ? { ...item, ...next } : item))
  return [...list, next].sort((a, b) => b.id - a.id)
}

function ValeCard({ vale, onOpen }) {
  const titleId = `vale-card-${vale.id}`
  return (
    <li className="vales-card">
      <div className="vales-card__top">
        <p id={titleId} className="vales-card__code">
          {vale.codigo}
        </p>
        <span className={`vales-badge vales-badge--${vale.estado}`}>{statusLabel(vale.estado)}</span>
      </div>
      <p className="vales-card__balance">
        Saldo {formatClp(vale.saldo)} <span>de {formatClp(vale.monto_inicial)}</span>
      </p>
      <div className="vales-used">
        <p className="vales-used__text">Usado: {vale.porcentaje_usado}%</p>
        <div className="vales-used__track" aria-hidden="true">
          <div className="vales-used__fill" style={{ width: `${vale.porcentaje_usado}%` }} />
        </div>
      </div>
      <p className="vales-card__line">Vigencia: {validityText(vale)}</p>
      {vale.nota && <p className="vales-card__line">Nota: {vale.nota}</p>}
      <button type="button" className="vales-btn vales-card__open" aria-describedby={titleId} onClick={() => onOpen(vale.id)}>
        Ver detalle y acciones
      </button>
    </li>
  )
}

// Pestaña "Vales" del panel: lista, búsqueda, emisión y detalle de vales de regalo.
function ValesPanel({ onSessionExpired }) {
  const [vales, setVales] = useState([])
  const [loadState, setLoadState] = useState('loading') // loading | ready | error | disabled
  const [loadError, setLoadError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [filter, setFilter] = useState('todos')
  const [searchText, setSearchText] = useState('')
  const [searchMessage, setSearchMessage] = useState('')
  const [searching, setSearching] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [action, setAction] = useState(null) // { kind, id }
  const [emitting, setEmitting] = useState(false)
  const [version, setVersion] = useState(0)
  const sessionRef = useRef(onSessionExpired)
  useEffect(() => {
    sessionRef.current = onSessionExpired
  })

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const response = await valesRequest('', { signal: controller.signal })
      if (response.aborted) return
      if (response.ok && Array.isArray(response.data)) {
        setVales(response.data.map(masked))
        setTruncated(response.data.length >= LIST_LIMIT)
        setLoadState('ready')
        return
      }
      const problem = classifyError(response, 'listar')
      if (problem.kind === 'session') return sessionRef.current()
      if (problem.kind === 'disabled') {
        setLoadState('disabled')
        return
      }
      setLoadError(problem.message)
      setLoadState('error')
    })()
    return () => controller.abort()
  }, [reloadCount])

  const reload = () => {
    setLoadState('loading')
    setReloadCount((count) => count + 1)
  }

  // Un vale cambió (activar, canjear, anular, ajustar): se actualiza la lista
  // y el historial abierto vuelve a leerse.
  const handleVale = useCallback((vale) => {
    setVales((prev) => upsert(prev, vale))
    setVersion((n) => n + 1)
  }, [])

  // Detalle recién leído: solo actualiza la lista, el historial no cambió.
  const handleLoaded = useCallback((vale) => {
    setVales((prev) => upsert(prev, vale))
  }, [])

  const refreshVale = useCallback(async (id) => {
    const response = await valesRequest(`${id}/`)
    if (response.ok && response.data) {
      handleVale(response.data)
      return response.data
    }
    if (classifyError(response, 'detalle').kind === 'session') sessionRef.current()
    return null
  }, [handleVale])

  const plan = planSearch(searchText)
  const suffix = plan.kind === 'suffix' ? plan.value : ''
  const visible = filterVales(vales, filter, suffix)

  const handleSearch = async (event) => {
    event.preventDefault()
    if (searching) return
    setSearchMessage('')
    if (plan.kind === 'empty') return
    if (plan.kind === 'suffix') {
      return setSearchMessage(
        visible.length ? '' : 'No hay vales con esos últimos caracteres en la lista.',
      )
    }
    if (plan.kind === 'invalid') return setSearchMessage(MESSAGES.codeLength)
    setSearching(true)
    const response = await valesRequest('consultar/', { method: 'POST', body: { codigo: plan.value } })
    setSearching(false)
    if (response.aborted) return
    if (response.ok && response.data?.id) {
      setSearchText('')
      setDetailId(response.data.id)
      return
    }
    const problem = classifyError(response, 'consultar')
    if (problem.kind === 'session') return sessionRef.current()
    setSearchMessage(problem.message)
  }

  const detailVale = vales.find((vale) => vale.id === detailId)
  const actionVale = vales.find((vale) => vale.id === action?.id)

  if (loadState === 'disabled') {
    return (
      <section className="vales" aria-labelledby="vales-title">
        <h2 id="vales-title" className="vales__title">
          Vales de regalo
        </h2>
        <p className="vales__empty" role="status">
          {MESSAGES.disabled}
        </p>
      </section>
    )
  }

  const countText = `${visible.length} ${visible.length === 1 ? 'vale' : 'vales'}`

  return (
    <section className="vales" aria-labelledby="vales-title">
      <div className="vales__head">
        <div>
          <h2 id="vales-title" className="vales__title">
            Vales de regalo
          </h2>
          <p className="vales__intro">Emite, vende y canjea vales. Aquí ves cuánto saldo le queda a cada uno.</p>
        </div>
        <button type="button" className="vales-btn vales-btn--primary" onClick={() => setEmitting(true)}>
          <Plus size={20} aria-hidden="true" /> Emitir vales
        </button>
      </div>

      <form className="vales__search" onSubmit={handleSearch} role="search">
        <label htmlFor="vales-search" className="vales-field__label">
          Buscar por código
        </label>
        <div className="vales__search-row">
          <input
            id="vales-search"
            className="vales-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            aria-describedby="vales-search-hint"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value)
              setSearchMessage('')
            }}
          />
          <button type="submit" className="vales-btn" aria-disabled={searching}>
            <Search size={18} aria-hidden="true" /> {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <p id="vales-search-hint" className="vales-field__hint">
          Escribe los últimos 4 caracteres para filtrar la lista, o el código completo (10 caracteres).
        </p>
        <p role="status" className="vales-note">
          {searchMessage}
        </p>
      </form>

      <div className="vales__filters" role="group" aria-label="Filtrar por estado">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`vales-chip${filter === id ? ' vales-chip--active' : ''}`}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadState === 'loading' && (
        <p className="vales__empty" role="status">
          Cargando vales…
        </p>
      )}

      {loadState === 'error' && (
        <div className="vales__empty">
          <p role="alert" className="vales-alert">
            {loadError}
          </p>
          <button type="button" className="vales-btn" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <p role="status" className="vales__count">
            {countText}
          </p>
          {truncated && <p className="vales-note">Se muestran los 200 más recientes.</p>}
          {visible.length === 0 ? (
            <div className="vales__empty">
              <Gift size={28} aria-hidden="true" />
              <p>
                {vales.length === 0
                  ? 'Aún no hay vales. Toca “Emitir vales” para crear los primeros.'
                  : 'No hay vales con ese filtro o búsqueda.'}
              </p>
            </div>
          ) : (
            <ul className="vales__list">
              {visible.map((vale) => (
                <ValeCard key={vale.id} vale={vale} onOpen={setDetailId} />
              ))}
            </ul>
          )}
        </>
      )}

      {detailId !== null && (
        <ValeDetailDialog
          valeId={detailId}
          vale={detailVale}
          version={version}
          onClose={() => setDetailId(null)}
          onAction={(kind) => setAction({ kind, id: detailId })}
          onLoaded={handleLoaded}
          onSessionExpired={onSessionExpired}
        />
      )}

      {action && actionVale && (
        <ValeActionDialog
          key={`${action.kind}-${action.id}`}
          kind={action.kind}
          vale={actionVale}
          onClose={() => setAction(null)}
          onVale={handleVale}
          onRefresh={refreshVale}
          onSessionExpired={onSessionExpired}
        />
      )}

      {emitting && (
        <EmitirDialog
          onClose={() => setEmitting(false)}
          onIssued={reload}
          onDisabled={() => {
            setEmitting(false)
            setLoadState('disabled')
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  )
}

export default ValesPanel
