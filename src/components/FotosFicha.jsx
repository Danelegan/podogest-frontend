import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, History, ImagePlus, Trash2, X } from 'lucide-react'
import usePhotoList from '../hooks/usePhotoList'
import { compressImage } from '../utils/compressImage'
import {
  CONNECTION_MESSAGE,
  UPLOAD_TIMEOUT_MESSAGE,
  deleteErrorMessage,
  deletePhoto,
  photoLimits,
  uploadErrorMessage,
  uploadPhoto,
} from '../utils/fotosApi'
import { formatDateString } from '../utils/clinicDate'
import FotosEvolucion from './FotosEvolucion'
import './FotosFicha.css'

const formatMegabytes = (bytes) => `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`

const DELETE_QUESTION = '¿Eliminar esta foto? La foto se borrará definitivamente.'

// "Fotos" section of the clinical record: take or pick photos, gallery with a
// viewer, and the patient's evolution. Shown only while the backend has photos
// turned on (opciones/ fotos_activo, checked by the parent) and the photos API
// doesn't answer 404. Photos are not part of the record's form: they are saved
// on their own, so the record's own save and unsaved-changes logic don't see them.
// options: opciones/ of the record (photo limits; defaults apply if missing).
function FotosFicha({ recordId, options = null, disabled = false, onSessionExpired }) {
  const { status, photos, error, canRetryUrls, reload, retry, reportImageError } = usePhotoList({
    recordId,
    onSessionExpired,
  })
  const [message, setMessage] = useState(null)
  const [progress, setProgress] = useState(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEvolution, setShowEvolution] = useState(false)
  // Blocks a second click that arrives before the re-render marks the buttons busy.
  const busyRef = useRef(false)
  const abortRef = useRef(null)
  const captureInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const addButtonRef = useRef(null)
  const evolutionButtonRef = useRef(null)
  const viewerRef = useRef(null)
  const thumbRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const limits = photoLimits(options)
  const hasRecord = recordId != null
  const isFull = status === 'ready' && photos.length >= limits.maxPerRecord
  const canAdd = hasRecord && !disabled && !isFull
  const hasMissingUrl = photos.some((item) => !item.url)
  const isBusy = progress != null || isDeleting
  const index = viewerIndex == null || photos.length === 0 ? null : Math.min(viewerIndex, photos.length - 1)
  const isViewing = index != null
  const photo = isViewing ? photos[index] : null

  useEffect(() => {
    if (!isViewing) return
    viewerRef.current?.focus()
    viewerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isViewing])

  if (status === 'off') return null

  const openViewer = (event, position) => {
    thumbRef.current = event.currentTarget
    setViewerIndex(position)
  }

  const closeViewer = () => {
    setViewerIndex(null)
    const target = thumbRef.current?.isConnected ? thumbRef.current : addButtonRef.current
    target?.focus()
  }

  const handleViewerKeyDown = (event) => {
    if (event.key === 'Escape') {
      // Closes the viewer only, not the whole record behind it.
      event.preventDefault()
      event.stopPropagation()
      closeViewer()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      setViewerIndex(index - 1)
    } else if (event.key === 'ArrowRight' && index < photos.length - 1) {
      event.preventDefault()
      setViewerIndex(index + 1)
    }
  }

  const openPicker = (inputRef) => {
    if (!canAdd || busyRef.current) return
    inputRef.current?.click()
  }

  // One photo at a time: compressed in the browser (the original goes up if that
  // fails), uploaded, and the next one only after it. The first error stops the
  // rest; nothing is retried by itself.
  const handleFiles = async (event) => {
    const picked = [...event.target.files]
    event.target.value = ''
    if (!picked.length || !canAdd || busyRef.current) return
    // Only as many as fit in the record (the backend refuses the rest anyway).
    const room = limits.maxPerRecord - photos.length
    const files = picked.slice(0, Math.max(room, 0))
    const skipped = picked.length - files.length

    busyRef.current = true
    setMessage(null)
    const controller = new AbortController()
    abortRef.current = controller
    let uploaded = 0
    let outcome = null
    try {
      for (const [position, original] of files.entries()) {
        setProgress({ current: position + 1, total: files.length })
        const file = await compressImage(original, { maxSide: limits.maxSide })
        if (file.size > limits.maxBytes) {
          outcome = {
            kind: 'error',
            text: `La foto pesa ${formatMegabytes(file.size)} y el máximo es ${formatMegabytes(limits.maxBytes)}.`,
          }
          break
        }
        const result = await uploadPhoto(recordId, file, { signal: controller.signal })
        if (result.kind === 'expired') {
          onSessionExpired?.()
          return
        }
        if (result.kind === 'error') {
          outcome = { kind: 'error', text: uploadErrorMessage(result.status, result.message) }
          break
        }
        uploaded += 1
      }
    } catch {
      if (controller.signal.aborted) return
      // Its own deadline passed: the photo may or may not have arrived.
      outcome = { kind: 'error', text: navigator.onLine === false ? CONNECTION_MESSAGE : UPLOAD_TIMEOUT_MESSAGE }
    } finally {
      busyRef.current = false
      setProgress(null)
    }

    if (!outcome && uploaded > 0) {
      outcome = { kind: 'success', text: uploaded === 1 ? 'Foto subida.' : `${uploaded} fotos subidas.` }
    } else if (outcome && uploaded > 0) {
      outcome = { ...outcome, text: `${uploaded} de ${files.length} subidas. ${outcome.text}` }
    }
    if (skipped > 0) {
      const note = `Solo se subieron las primeras ${files.length}: el máximo es ${limits.maxPerRecord} fotos por ficha.`
      outcome = { kind: outcome?.kind ?? 'error', text: [outcome?.text, note].filter(Boolean).join(' ') }
    }
    setMessage(outcome)
    if (uploaded > 0 || outcome?.text === UPLOAD_TIMEOUT_MESSAGE) reload()
  }

  const handleDelete = async () => {
    if (!photo || busyRef.current) return
    if (!window.confirm(DELETE_QUESTION)) return
    busyRef.current = true
    setIsDeleting(true)
    setMessage(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await deletePhoto(recordId, photo.id, { signal: controller.signal })
      if (result.kind === 'expired') {
        onSessionExpired?.()
        return
      }
      if (result.kind === 'error') {
        setMessage({ kind: 'error', text: deleteErrorMessage(result.status) })
        return
      }
      setMessage({ kind: 'success', text: 'Foto eliminada.' })
      reload()
    } catch {
      if (!controller.signal.aborted) setMessage({ kind: 'error', text: CONNECTION_MESSAGE })
    } finally {
      busyRef.current = false
      setIsDeleting(false)
    }
  }

  const toggleEvolution = () => {
    if (showEvolution) {
      setShowEvolution(false)
      evolutionButtonRef.current?.focus()
    } else {
      setShowEvolution(true)
    }
  }

  return (
    <section className="clinical-card fotos" aria-labelledby="fotos-title">
      <h2 id="fotos-title" className="clinical-card__header">
        <Camera className="clinical-card__icon" strokeWidth={2} aria-hidden="true" />
        Fotos
      </h2>
      <div className="clinical-card__body">
        <div className="fotos__actions">
          <button
            ref={addButtonRef}
            type="button"
            className="clinical-btn"
            onClick={() => openPicker(captureInputRef)}
            disabled={!canAdd}
            aria-disabled={(canAdd && isBusy) || undefined}
          >
            <Camera className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
            Tomar foto
          </button>
          <button
            type="button"
            className="clinical-btn"
            onClick={() => openPicker(galleryInputRef)}
            disabled={!canAdd}
            aria-disabled={(canAdd && isBusy) || undefined}
          >
            <ImagePlus className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
            Elegir de la galería
          </button>
          <button
            ref={evolutionButtonRef}
            type="button"
            className="clinical-btn"
            onClick={toggleEvolution}
            disabled={!hasRecord}
            aria-expanded={showEvolution}
          >
            <History className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
            {showEvolution ? 'Ocultar evolución' : 'Ver evolución'}
          </button>
          <input
            ref={captureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            tabIndex={-1}
            onChange={handleFiles}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            tabIndex={-1}
            onChange={handleFiles}
          />
        </div>

        {!hasRecord && <p className="fotos__hint">Guarda la ficha para agregar fotos</p>}
        {hasRecord && status === 'ready' && (
          <p className="fotos__hint">
            {photos.length} de {limits.maxPerRecord} fotos
            {isFull && ' · Llegaste al máximo: elimina una para agregar otra.'}
          </p>
        )}

        <p className="fotos__status" role="status">
          {progress
            ? `Subiendo… ${progress.total > 1 ? `(${progress.current} de ${progress.total})` : ''}`.trim()
            : isDeleting
              ? 'Eliminando…'
              : ''}
        </p>
        {message && (
          <p
            className={`fotos__message fotos__message--${message.kind}`}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        )}

        {hasRecord && status === 'loading' && photos.length === 0 && (
          <p className="fotos__hint" role="status">
            Cargando fotos…
          </p>
        )}
        {hasRecord && status === 'error' && (
          <div className="fotos__message fotos__message--error" role="alert">
            <p>{error || 'No pudimos cargar las fotos.'}</p>
            <button type="button" className="clinical-btn" onClick={retry}>
              Reintentar
            </button>
          </div>
        )}
        {hasRecord && status === 'ready' && photos.length === 0 && (
          <p className="fotos__hint">Esta ficha aún no tiene fotos.</p>
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
          <ul className="fotos__grid">
            {photos.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="fotos__thumb"
                  onClick={(event) => openViewer(event, position)}
                  aria-label={`Abrir foto ${position + 1} de ${photos.length}`}
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
            ))}
          </ul>
        )}

        {photo && (
          <div
            ref={viewerRef}
            className="fotos__viewer"
            role="group"
            aria-label={`Foto ${index + 1} de ${photos.length}`}
            tabIndex={-1}
            onKeyDown={handleViewerKeyDown}
          >
            {photo.url ? (
              <img
                className="fotos__viewer-image"
                src={photo.url}
                alt={`Foto ${index + 1} de ${photos.length} de la ficha`}
                referrerPolicy="no-referrer"
                onError={reportImageError}
              />
            ) : (
              <p className="fotos__missing fotos__missing--large">No se pudo cargar</p>
            )}
            <p className="fotos__viewer-count">
              Foto {index + 1} de {photos.length}
              {photo.date && ` · ${formatDateString(photo.date)}`}
            </p>
            <div className="fotos__viewer-actions">
              <button
                type="button"
                className="clinical-btn"
                onClick={() => setViewerIndex(index - 1)}
                disabled={index === 0}
              >
                <ChevronLeft className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
                Anterior
              </button>
              <button
                type="button"
                className="clinical-btn"
                onClick={() => setViewerIndex(index + 1)}
                disabled={index === photos.length - 1}
              >
                Siguiente
                <ChevronRight className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="clinical-btn fotos__delete"
                onClick={handleDelete}
                aria-disabled={isBusy || undefined}
              >
                <Trash2 className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
                Eliminar
              </button>
              <button type="button" className="clinical-btn" onClick={closeViewer}>
                <X className="clinical-btn__icon" strokeWidth={2} aria-hidden="true" />
                Cerrar
              </button>
            </div>
          </div>
        )}

        {showEvolution && hasRecord && (
          <FotosEvolucion
            recordId={recordId}
            onSessionExpired={onSessionExpired}
            onClose={toggleEvolution}
          />
        )}
      </div>
    </section>
  )
}

export default FotosFicha
