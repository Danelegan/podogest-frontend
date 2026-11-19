import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy } from 'lucide-react'
import ValesDialog from './ValesDialog'
import { valesRequest } from './valesApi'
import {
  actionsFor,
  classifyError,
  formatClp,
  formatDateTime,
  formatSignedClp,
  groupCode,
  movementLabel,
  statusLabel,
  validityText,
} from './valesUtils'

function UsedBar({ percent }) {
  return (
    <div className="vales-used">
      <p className="vales-used__text">Usado: {percent}%</p>
      <div className="vales-used__track" aria-hidden="true">
        <div className="vales-used__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

// Detalle de un vale: código completo, montos, acciones e historial.
// `vale` es la versión más reciente que tiene la lista; el código completo se
// pide aparte y solo vive mientras el diálogo está abierto.
function ValeDetailDialog({ valeId, vale, version, onClose, onAction, onLoaded, onSessionExpired }) {
  const [fullCode, setFullCode] = useState('')
  const [detailError, setDetailError] = useState('')
  const [movements, setMovements] = useState(null)
  const [movementsError, setMovementsError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const sessionRef = useRef(onSessionExpired)
  const loadedRef = useRef(onLoaded)
  useEffect(() => {
    sessionRef.current = onSessionExpired
    loadedRef.current = onLoaded
  })

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const response = await valesRequest(`${valeId}/`, { signal: controller.signal })
      if (response.aborted) return
      if (response.ok && response.data) {
        setFullCode(response.data.codigo ?? '')
        setDetailError('')
        loadedRef.current(response.data)
        return
      }
      const problem = classifyError(response, 'detalle')
      if (problem.kind === 'session') return sessionRef.current()
      setDetailError(problem.message)
    })()
    return () => controller.abort()
  }, [valeId, reloadCount])

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const response = await valesRequest(`${valeId}/movimientos/`, { signal: controller.signal })
      if (response.aborted) return
      if (response.ok && Array.isArray(response.data)) {
        setMovements(response.data)
        setMovementsError('')
        return
      }
      const problem = classifyError(response, 'movimientos')
      if (problem.kind === 'session') return sessionRef.current()
      setMovementsError(problem.message)
    })()
    return () => controller.abort()
  }, [valeId, version, reloadCount])

  if (!vale) {
    return (
      <ValesDialog title="Vale de regalo" onClose={onClose}>
        {detailError ? (
          <div className="vales-form">
            <p role="alert" className="vales-alert">
              {detailError}
            </p>
            <div className="vales-actions">
              <button type="button" className="vales-btn" onClick={() => setReloadCount((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <p role="status" className="vales-note">
            Cargando vale…
          </p>
        )}
      </ValesDialog>
    )
  }

  const actions = actionsFor(vale.estado)
  const hasMore = actions.anular || actions.ajustar

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(fullCode)
      setCopyMessage('Código copiado.')
    } catch {
      setCopyMessage('No se pudo copiar el código.')
    }
  }

  return (
    <ValesDialog title="Vale de regalo" onClose={onClose} wide>
      <div className="vales-form">
        <section aria-label="Código del vale">
          {fullCode ? (
            <div className="vales-code-row">
              <p className="vales-code" aria-label={`Código ${fullCode.split('').join(' ')}`}>
                {groupCode(fullCode)}
              </p>
              <button type="button" className="vales-btn" onClick={copyCode}>
                <Copy size={18} aria-hidden="true" /> Copiar
              </button>
            </div>
          ) : (
            <p className="vales-code vales-code--masked">
              {detailError || `Código ${vale.codigo}`}
            </p>
          )}
          <p role="status" className="vales-note">
            {copyMessage}
          </p>
        </section>

        <dl className="vales-facts">
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={`vales-badge vales-badge--${vale.estado}`}>{statusLabel(vale.estado)}</span>
            </dd>
          </div>
          <div>
            <dt>Monto inicial</dt>
            <dd>{formatClp(vale.monto_inicial)}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd>{formatClp(vale.saldo)}</dd>
          </div>
          <div>
            <dt>Vigencia</dt>
            <dd>{validityText(vale)}</dd>
          </div>
          {vale.nota && (
            <div>
              <dt>Nota</dt>
              <dd>{vale.nota}</dd>
            </div>
          )}
        </dl>
        <UsedBar percent={vale.porcentaje_usado} />

        <div className="vales-actions">
          {actions.primary === 'activar' && (
            <button type="button" className="vales-btn vales-btn--primary" onClick={() => onAction('activar')}>
              Vender vale (activar)
            </button>
          )}
          {actions.primary === 'canjear' && (
            <button type="button" className="vales-btn vales-btn--primary" onClick={() => onAction('canjear')}>
              Canjear
            </button>
          )}
          {actions.canjearBloqueado && (
            <button type="button" className="vales-btn vales-btn--primary" aria-disabled="true" aria-describedby="vales-expired-note">
              Canjear
            </button>
          )}
          {hasMore && (
            <button
              type="button"
              className="vales-btn"
              aria-expanded={moreOpen}
              aria-controls="vales-more"
              onClick={() => setMoreOpen((open) => !open)}
            >
              Más acciones <ChevronDown size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {actions.canjearBloqueado && (
          <p id="vales-expired-note" className="vales-note">
            Este vale está vencido, así que ya no se puede canjear.
          </p>
        )}
        {hasMore && moreOpen && (
          <div id="vales-more" className="vales-more">
            {actions.ajustar && (
              <button type="button" className="vales-btn" onClick={() => onAction('ajustar')}>
                Ajustar saldo
              </button>
            )}
            {actions.anular && (
              <button type="button" className="vales-btn vales-btn--danger-outline" onClick={() => onAction('anular')}>
                Anular vale
              </button>
            )}
          </div>
        )}

        <section aria-labelledby="vales-history-title">
          <h3 id="vales-history-title" className="vales-step-title">
            Historial
          </h3>
          {movementsError && (
            <p role="alert" className="vales-alert">
              {movementsError}{' '}
              <button type="button" className="vales-link" onClick={() => setReloadCount((n) => n + 1)}>
                Reintentar
              </button>
            </p>
          )}
          {!movementsError && movements === null && (
            <p role="status" className="vales-note">
              Cargando historial…
            </p>
          )}
          {movements?.length === 0 && <p className="vales-note">Este vale aún no tiene movimientos.</p>}
          {movements?.length > 0 && (
            <ul className="vales-history">
              {movements.map((movement) => (
                <li key={movement.id} className="vales-history__item">
                  <div className="vales-history__top">
                    <span className="vales-history__type">{movementLabel(movement.tipo)}</span>
                    <span className="vales-history__amount">{formatSignedClp(movement.monto)}</span>
                  </div>
                  <p className="vales-history__line">Saldo después: {formatClp(movement.saldo_resultante)}</p>
                  <p className="vales-history__line">
                    {formatDateTime(movement.creado_en)}
                    {movement.usuario ? ` · ${movement.usuario}` : ''}
                  </p>
                  {movement.nota && (
                    <p className="vales-history__line">
                      {movement.tipo === 'anulacion' ? 'Motivo' : 'Nota'}: {movement.nota}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ValesDialog>
  )
}

export default ValeDetailDialog
