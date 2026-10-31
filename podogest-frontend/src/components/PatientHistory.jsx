import { useRef, useState } from 'react'
import { ChevronDown, History, RotateCcw } from 'lucide-react'
import { formatDashDate } from '../utils/clinicDate'
import { PODOGRAM_MAPS } from '../utils/podogram'
import './PatientHistory.css'

const DIAGNOSIS_PREVIEW = 90

const formatClp = (amount) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)

// First line of the diagnosis, cut at a word.
const shortDiagnosis = (text) => {
  const line = (text ?? '').trim().split('\n')[0].trim()
  if (line.length <= DIAGNOSIS_PREVIEW) return line
  const cut = line.slice(0, DIAGNOSIS_PREVIEW)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : DIAGNOSIS_PREVIEW)}…`
}

const paidLabel = (ficha) => {
  if (ficha.sin_cobro) return 'Sin cobro'
  return Number(ficha.total_pagado) > 0 ? formatClp(ficha.total_pagado) : 'Sin pagos registrados'
}

function DetailText({ label, value }) {
  const text = (value ?? '').trim()
  return (
    <div className="patient-history__detail-row">
      <dt>{label}</dt>
      <dd className={text ? 'patient-history__text' : 'patient-history__empty'}>
        {text || 'Sin registrar'}
      </dd>
    </div>
  )
}

// Read-only summary of one earlier record.
function FichaDetail({ ficha, medioLabel }) {
  const receta = Array.isArray(ficha.receta) ? ficha.receta : []
  const pagos = Array.isArray(ficha.pagos) ? ficha.pagos : []
  const version = ficha.podograma_version === 'legacy' ? 'legacy' : 'v2'
  const map = PODOGRAM_MAPS[version]
  const date = formatDashDate(ficha.appointment_date)

  return (
    <div className="patient-history__detail">
      <dl className="patient-history__detail-list">
        <DetailText label="Síntomas" value={ficha.sintomas} />
        <DetailText label="Diagnóstico" value={ficha.diagnostico} />
        <DetailText label="Tratamiento realizado" value={ficha.tratamiento_realizado} />
        <DetailText label="Observaciones" value={ficha.observaciones} />
        <div className="patient-history__detail-row">
          <dt>Receta</dt>
          <dd className={receta.length ? 'patient-history__text' : 'patient-history__empty'}>
            {receta.length ? receta.join(', ') : 'Sin receta'}
          </dd>
        </div>
        <DetailText label="Indicaciones" value={ficha.receta_indicaciones} />
        <div className="patient-history__detail-row">
          <dt>Pagos</dt>
          <dd>
            {ficha.sin_cobro ? (
              'Atención sin cobro'
            ) : pagos.length ? (
              <ul className="patient-history__payments">
                {pagos.map((pago, index) => (
                  <li key={`${pago.medio}-${index}`}>
                    <span>{medioLabel(pago.medio)}</span>
                    <span className="patient-history__amount">{formatClp(pago.monto)}</span>
                  </li>
                ))}
                {pagos.length > 1 && (
                  <li className="patient-history__payments-total">
                    <span>Total</span>
                    <span className="patient-history__amount">{formatClp(ficha.total_pagado)}</span>
                  </li>
                )}
              </ul>
            ) : (
              <span className="patient-history__empty">Sin pagos registrados</span>
            )}
          </dd>
        </div>
        <div className="patient-history__detail-row">
          <dt>Mapa anatómico</dt>
          <dd>
            {ficha.podograma ? (
              // The PNG holds only the strokes: shown over the map it was drawn on.
              <div
                className={`patient-history__podogram patient-history__podogram--${version}`}
                role="img"
                aria-label={`Mapa anatómico dibujado en la atención del ${date} (solo lectura)`}
              >
                <img src={map.src} alt="" width={map.width} height={map.height} />
                <img src={ficha.podograma} alt="" width={map.width} height={map.height} />
              </div>
            ) : (
              <span className="patient-history__empty">Sin dibujo</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}

// "Atenciones anteriores" of the same patient (same document), newest first.
// `history`: { status: 'loading' | 'error' | 'ready', fichas, limit }.
function PatientHistory({ history, hasDocument, medioLabel, onRetry }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openDetails, setOpenDetails] = useState({})
  const titleRef = useRef(null)
  const fichas = history.status === 'ready' ? history.fichas : []
  const count = fichas.length
  const canExpand = count > 0

  const toggleDetail = (id) => setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] }))

  let message = ''
  if (history.status === 'loading') {
    message = 'Cargando atenciones anteriores…'
  } else if (history.status === 'ready' && count === 0) {
    message = hasDocument
      ? 'Primera atención de este paciente.'
      : 'Esta cita no tiene documento registrado: no se pueden buscar atenciones anteriores.'
  }

  return (
    <section className="patient-history" aria-labelledby="patient-history-title">
      <h2 ref={titleRef} id="patient-history-title" className="patient-history__title" tabIndex={-1}>
        {canExpand ? (
          <button
            type="button"
            className="patient-history__toggle"
            aria-expanded={isOpen}
            aria-controls="patient-history-list"
            onClick={() => setIsOpen((value) => !value)}
          >
            <History className="patient-history__icon" strokeWidth={2} aria-hidden="true" />
            <span>Atenciones anteriores ({count})</span>
            <ChevronDown className="patient-history__chevron" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <span className="patient-history__heading">
            <History className="patient-history__icon" strokeWidth={2} aria-hidden="true" />
            Atenciones anteriores
          </span>
        )}
      </h2>

      {/* Always mounted, so "Cargando…" and its result are announced. */}
      <p className="patient-history__message" role="status">
        {message}
      </p>

      {history.status === 'error' && (
        <div className="patient-history__error" role="alert">
          <p>{history.error}</p>
          <button
            type="button"
            className="clinical-btn"
            onClick={() => {
              // The button goes away while loading: keep the focus in this section.
              titleRef.current?.focus()
              onRetry()
            }}
          >
            <RotateCcw className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      )}

      {canExpand && (
        <div id="patient-history-list" hidden={!isOpen}>
          {count >= history.limit && (
            <p className="patient-history__message">Se muestran las {count} atenciones más recientes.</p>
          )}
          <ol className="patient-history__list">
            {fichas.map((ficha) => {
              const date = formatDashDate(ficha.appointment_date)
              const diagnosis = shortDiagnosis(ficha.diagnostico)
              const detailId = `patient-history-detail-${ficha.id}`
              const isDetailOpen = Boolean(openDetails[ficha.id])
              return (
                <li key={ficha.id} className="patient-history__item">
                  <div className="patient-history__summary">
                    <div className="patient-history__info">
                      <p className="patient-history__date">
                        {date}
                        {ficha.status === 'cancelada' && (
                          <span className="patient-history__tag">Cita cancelada</span>
                        )}
                      </p>
                      <p className="patient-history__service">{ficha.service_type || 'Servicio sin indicar'}</p>
                      <p className={diagnosis ? 'patient-history__diagnosis' : 'patient-history__empty'}>
                        {diagnosis || 'Sin diagnóstico'}
                      </p>
                    </div>
                    <p className={`patient-history__paid${ficha.sin_cobro ? ' is-free' : ''}`}>
                      {paidLabel(ficha)}
                    </p>
                    <button
                      type="button"
                      className="clinical-btn patient-history__detail-btn"
                      aria-expanded={isDetailOpen}
                      aria-controls={detailId}
                      onClick={() => toggleDetail(ficha.id)}
                    >
                      Ver detalle
                      <span className="clinical-sr-only"> de la atención del {date}</span>
                      <ChevronDown className="patient-history__chevron" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                  <div id={detailId} hidden={!isDetailOpen}>
                    {isDetailOpen && <FichaDetail ficha={ficha} medioLabel={medioLabel} />}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

export default PatientHistory
