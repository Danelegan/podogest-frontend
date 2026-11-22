import { useState } from 'react'
import { X } from 'lucide-react'
import usePhotoList from '../hooks/usePhotoList'

const MAX_COMPARED = 2
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "2030-01-04", "10:00" -> "4 ene 2030, 10:00"; 'Sin fecha' if there is no date.
function visitLabel(date, time) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!match) return 'Sin fecha'
  const day = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`
  return time ? `${day}, ${time.slice(0, 5)}` : day
}

// Oldest first by date, then by hour; photos without a date go last. The sort
// is stable, so the backend's order (by id) is kept inside the same hour.
const visitKey = (photo) => `${photo.date ?? '9999-99-99'} ${photo.time ?? ''}`

// Photos of every visit of the patient (?alcance=paciente), grouped by the
// appointment's date and hour, oldest first. Two can be picked and seen side by side.
function FotosEvolucion({ recordId, onSessionExpired, onClose }) {
  const { status, photos, error, canRetryUrls, retry, reportImageError } = usePhotoList({
    recordId,
    patientScope: true,
    onSessionExpired,
  })
  // Ids, not photos: the list is asked for again when its URLs expire.
  const [selectedIds, setSelectedIds] = useState([])

  const sorted = [...photos].sort((a, b) => visitKey(a).localeCompare(visitKey(b)))
  const groups = []
  sorted.forEach((item) => {
    const key = visitKey(item)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, date: item.date, time: item.time, items: [item] })
  })

  // In the sorted order (oldest first), whatever order they were picked in.
  const compared = sorted.filter((item) => selectedIds.includes(item.id))
  const hasMissingUrl = photos.some((item) => !item.url)

  const toggle = (id) =>
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id)
      return prev.length < MAX_COMPARED ? [...prev, id] : [prev[1], id]
    })

  return (
    <div className="fotos-evolution" role="region" aria-label="Evolución del paciente">
      <div className="fotos-evolution__header">
        <h3 className="fotos-evolution__title">Evolución del paciente</h3>
        <button type="button" className="clinical-btn" onClick={onClose}>
          <X className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
          Cerrar evolución
        </button>
      </div>

      {status === 'loading' && photos.length === 0 && (
        <p className="fotos__hint" role="status">
          Cargando evolución…
        </p>
      )}
      {status === 'error' && (
        <div className="fotos__message fotos__message--error" role="alert">
          <p>{error || 'No pudimos cargar la evolución.'}</p>
          <button type="button" className="clinical-btn" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {status === 'off' && <p className="fotos__hint">La función de fotos no está disponible.</p>}
      {status === 'ready' && photos.length === 0 && (
        <p className="fotos__hint">Este paciente aún no tiene fotos.</p>
      )}

      {hasMissingUrl && (
        <div className="fotos__message fotos__message--error" role="alert">
          <p>Algunas fotos no se pudieron cargar.</p>
          {canRetryUrls && (
            <button type="button" className="clinical-btn" onClick={reportImageError}>
              Reintentar
            </button>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <>
          <p className="fotos__hint">Toca dos fotos para verlas lado a lado.</p>

          {compared.length > 0 && (
            <div className="fotos-compare" role="group" aria-label="Fotos seleccionadas">
              {compared.map((item) => (
                <figure key={item.id} className="fotos-compare__item">
                  {item.url ? (
                    <img
                      src={item.url}
                      alt={`Foto de la atención del ${visitLabel(item.date, item.time)}`}
                      referrerPolicy="no-referrer"
                      onError={reportImageError}
                    />
                  ) : (
                    <p className="fotos__missing fotos__missing--large">No se pudo cargar</p>
                  )}
                  <figcaption>{visitLabel(item.date, item.time)}</figcaption>
                </figure>
              ))}
              {compared.length === 1 && (
                <p className="fotos__hint fotos-compare__placeholder">Elige otra foto para comparar.</p>
              )}
            </div>
          )}

          {groups.map((group) => (
            <section key={group.key} className="fotos-evolution__group">
              <h4 className="fotos-evolution__date">{visitLabel(group.date, group.time)}</h4>
              <ul className="fotos__grid">
                {group.items.map((item) => {
                  const isSelected = selectedIds.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`fotos__thumb${isSelected ? ' fotos__thumb--selected' : ''}`}
                        onClick={() => toggle(item.id)}
                        aria-pressed={isSelected}
                        aria-label={`Foto del ${visitLabel(group.date, group.time)}${isSelected ? ', seleccionada' : ''}`}
                      >
                        {item.url ? (
                          <img
                            src={item.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={reportImageError}
                          />
                        ) : (
                          <span className="fotos__missing">No se pudo cargar</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

export default FotosEvolucion
