import { useState } from 'react'
import './ServicesSection.css'

const SERVICES = [
  {
    id: 'corte-clinico',
    icon: '🦶',
    title: 'Corte Clínico',
    description:
      'Corte de uñas seguro e higiénico, realizado con instrumental esterilizado para prevenir lesiones.',
  },
  {
    id: 'tratamiento-hongos',
    icon: '🧴',
    title: 'Tratamiento de Hongos',
    description:
      'Diagnóstico y tratamiento de onicomicosis con protocolos clínicos que cuidan tu piel.',
  },
  {
    id: 'una-encarnada',
    icon: '💉',
    title: 'Uña Encarnada',
    description:
      'Corrección de uñas encarnadas para aliviar el dolor y evitar infecciones a futuro.',
  },
]

function ServiceCard({ icon, title, description }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <article className="service-card">
      <div className="service-card__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="service-card__title">{title}</h3>
      <p className="service-card__description">{description}</p>

      <button
        type="button"
        className="service-card__toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        ¿Cómo identificarlo?
        <span className={`service-card__chevron ${isOpen ? 'is-open' : ''}`}>
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="service-card__panel">
          <div className="service-card__image-placeholder">
            Imagen clínica referencial
          </div>
        </div>
      )}
    </article>
  )
}

function ServicesSection() {
  return (
    <section className="services" id="servicios">
      <div className="services__container">
        <div className="services__header">
          <h2 className="services__title">Nuestros Servicios</h2>
          <p className="services__subtitle">
            Cuidado podológico profesional adaptado a las necesidades de tus pies.
          </p>
        </div>

        <div className="services__grid">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} {...service} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ServicesSection
