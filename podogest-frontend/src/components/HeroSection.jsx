import './HeroSection.css'

function HeroSection({ onOpenBooking }) {
  return (
    <section className="hero" id="top">
      <div className="hero__container">
        <div className="hero__content">
          <h1 className="hero__title">
            Salud y bienestar para tus pies
          </h1>
          <p className="hero__subtitle">
            Atención podológica profesional y personalizada, para que cada
            paso que des sea firme, cómodo y sin dolor.
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
        </div>

        <div className="hero__visual">
          <img
            src="/public/foto2.jpeg"
            alt="Atención podológica profesional"
            className="hero__image"
          />
        </div>
      </div>
    </section>
  )
}

export default HeroSection
