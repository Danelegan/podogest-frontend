// Mapa del footer anterior. Hoy no se usa en ninguna parte; se conserva por si
// se quiere volver a mostrar.
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import { CLINIC_ADDRESS, CLINIC_MAP_EMBED_URL, CLINIC_MAPS_URL, CLINIC_NAME } from '../config/clinic'
import './ClinicMap.css'

// Vista previa propia del mapa: calles abstractas y un pin, dibujados a mano
// (no es un mapa real). Decorativa: la información está en el texto de la tarjeta.
function MapPreviewArt() {
  return (
    <svg
      className="footer__map-art"
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g className="footer__map-art-blocks">
        <rect x="18" y="104" width="62" height="40" rx="3" />
        <rect x="196" y="18" width="70" height="38" rx="3" />
        <rect x="128" y="150" width="58" height="34" rx="3" />
      </g>
      <g className="footer__map-art-streets">
        <path d="M-10 92 C 70 80, 150 98, 330 84" />
        <path d="M-10 158 L 330 136" />
        <path d="M108 -10 C 112 60, 98 140, 112 210" />
        <path d="M184 -10 L 196 210" />
      </g>
      <g className="footer__map-art-minor">
        <path d="M-10 40 L 330 30" />
        <path d="M40 -10 L 52 210" />
        <path d="M282 -10 C 270 70, 290 140, 276 210" />
      </g>
      <g className="footer__map-art-pin" transform="translate(26 8)">
        <ellipse cx="240" cy="129" rx="9" ry="3" />
        <path d="M240 128 C 240 128 222 108 222 96 a 18 18 0 0 1 36 0 C 258 108 240 128 240 128 Z" />
        <circle cx="240" cy="96" r="6.5" />
      </g>
    </svg>
  )
}

// El mapa de Google solo se carga si el visitante lo pide: hasta entonces no
// hay ninguna petición a google.com. El recuadro mide lo mismo antes y después,
// así que cargarlo no mueve la página.
function ClinicMap() {
  const [isLoaded, setIsLoaded] = useState(false)
  const iframeRef = useRef(null)

  // El botón desaparece al cargar: el foco pasa al mapa para no perderse.
  useEffect(() => {
    if (isLoaded) iframeRef.current?.focus()
  }, [isLoaded])

  return (
    <>
      <div className="footer__map">
        {isLoaded ? (
          <iframe
            ref={iframeRef}
            src={CLINIC_MAP_EMBED_URL}
            width="100%"
            height="100%"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            title="Mapa de Podología Clínica Pasos Saludables"
          ></iframe>
        ) : (
          <div className="footer__map-placeholder">
            <MapPreviewArt />
            <div className="footer__map-place">
              <p className="footer__map-name">{CLINIC_NAME}</p>
              <p className="footer__map-address">{CLINIC_ADDRESS}</p>
            </div>
            <button
              type="button"
              className="footer__map-button"
              aria-describedby="footer-map-notice"
              onClick={() => setIsLoaded(true)}
            >
              <MapPin size={18} strokeWidth={1.5} aria-hidden="true" />
              Ver mapa
            </button>
            <p id="footer-map-notice" className="footer__map-notice">
              Al cargarlo, Google puede usar cookies.
            </p>
          </div>
        )}
      </div>
      <a
        className="footer__map-link"
        href={CLINIC_MAPS_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir en Google Maps
        <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="footer__sr-only">(se abre en una pestaña nueva)</span>
      </a>
    </>
  )
}

export default ClinicMap
