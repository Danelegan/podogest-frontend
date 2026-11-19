import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Diálogos abiertos, el último es el de arriba: solo ese responde a Escape.
const openDialogs = []

// Cascarón de los diálogos de vales: modal con foco atrapado, resto de la
// página inerte, cierre con Escape y el foco vuelve a quien lo abrió.
// Se dibuja en <body> (portal) para poder apilar uno sobre otro.
function ValesDialog({ title, description, onClose, closeLocked = false, wide = false, children }) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const overlayRef = useRef(null)
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const latestRef = useRef({ onClose, closeLocked })
  useEffect(() => {
    latestRef.current = { onClose, closeLocked }
  })

  useEffect(() => {
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Todo lo que rodea al diálogo (y a sus ancestros, hasta <body>) es fondo.
    const madeInert = []
    let node = overlayRef.current
    while (node && node !== document.body) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && !sibling.inert) {
          sibling.inert = true
          madeInert.push(sibling)
        }
      }
      node = node.parentElement
    }

    titleRef.current?.focus()

    const token = {}
    openDialogs.push(token)
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || openDialogs.at(-1) !== token) return
      event.preventDefault()
      if (!latestRef.current.closeLocked) latestRef.current.onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      openDialogs.splice(openDialogs.indexOf(token), 1)
      document.body.style.overflow = previousOverflow
      madeInert.forEach((element) => {
        element.inert = false
      })
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  // Tab da la vuelta dentro del diálogo.
  const handleKeyDown = (event) => {
    if (event.key !== 'Tab') return
    const focusables = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !focusables.includes(active) || active === titleRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="vales-overlay"
      // Tocar el fondo no saca el foco del diálogo.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <div
        ref={dialogRef}
        className={`vales-dialog${wide ? ' vales-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="vales-dialog__header">
          <div>
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="vales-dialog__title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="vales-dialog__description">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="vales-dialog__close"
            aria-label="Cerrar"
            // aria-disabled y no disabled: así el botón conserva el foco.
            aria-disabled={closeLocked}
            onClick={() => {
              if (!closeLocked) onClose()
            }}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="vales-dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default ValesDialog
