import { Home } from 'lucide-react'
import { specialtiesData } from '../data/services'
import './HeroSection.css'

// Mismo título que la tarjeta de servicios, para que el modal lo preseleccione.
const HOME_SERVICE = specialtiesData.find((service) => service.id === 'atencion-domicilio')?.title ?? ''

function HeroSection({ onOpenBooking, onRequestService }) {
  return (
    <section className="hero" id="top">
      <div className="hero__container">
        <div className="hero__content">
          <h1 className="hero__title">
            Podología clínica
            <br />
            para el cuidado diario de tus pies
          </h1>
          <p className="hero__subtitle">
            Atención podológica profesional y personalizada, para que cada paso que des sea firme, cómodo y sin dolor.
          </p>
          <div className="hero__actions">
            <button
              type="button"
              className="hero__btn hero__btn--primary"
              onClick={onOpenBooking}
            >
              Reserva tu cita
            </button>
            <a
              href="https://wa.me/56972836396"
              target="_blank"
              rel="noopener noreferrer"
              className="hero__btn hero__btn--secondary"
            >
              Haz tu consulta
            </a>
          </div>
          <button
            type="button"
            className="hero__note"
            onClick={() => onRequestService(HOME_SERVICE)}
          >
            <Home className="hero__note-icon" size={18} strokeWidth={2} aria-hidden="true" />
            Atención a domicilio disponible
          </button>
        </div>

        <div className="hero__visual">
          <img
            src="/Traje.jpeg"
            alt="Atención podológica profesional"
            className="hero__image"
          />
        </div>
      </div>
    </section>
  )
}

export default HeroSection
