import './HeroSection.css'

function HeroSection() {
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
            <a href="#agendar" className="hero__btn hero__btn--primary">
              Reserva tu cita
            </a>
            <a href="#servicios" className="hero__btn hero__btn--secondary">
              Conoce nuestros servicios
            </a>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="hero__blob"></div>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
