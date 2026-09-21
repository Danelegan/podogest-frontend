import { motion } from 'framer-motion'
import { Home } from 'lucide-react'
import { servicesData, specialtiesData } from '../data/services'
import './ServicesSection.css'

const ICONS = { home: Home }

function ServiceCard({ title, description, imagePath, icon, price, onRequest }) {
  const Icon = icon ? ICONS[icon] : null
  return (
    <motion.article
      className="service-card"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5 }}
    >
      <div className="service-card__image-wrapper">
        {Icon ? (
          <div className="service-card__icon" aria-hidden="true">
            <Icon size={56} strokeWidth={1.5} />
          </div>
        ) : (
          <img
            src={imagePath}
            alt={title}
            className="service-card__image"
            loading="lazy"
          />
        )}
        {price && <span className="service-card__price">{price}</span>}
      </div>
      <h3 className="service-card__title">{title}</h3>
      <p className="service-card__description">{description}</p>
      <button
        type="button"
        className="service-card__cta"
        onClick={() => onRequest(title)}
        aria-label={`Solicitar ${title}`}
      >
        Solicitar
      </button>
    </motion.article>
  )
}

function ServicesSection({ onRequestService }) {
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
          {servicesData.map((service) => (
            <ServiceCard key={service.id} {...service} onRequest={onRequestService} />
          ))}
        </div>

        <div className="services__divider" role="separator" />

        <h3 className="services__subheading">Especialidades</h3>

        <div className="services__grid services__grid--specialties">
          {specialtiesData.map((specialty) => (
            <ServiceCard key={specialty.id} {...specialty} onRequest={onRequestService} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ServicesSection
