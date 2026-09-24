import { motion } from 'framer-motion'
import SpecularButton from './SpecularButton'
import './HeroSection.css'

function HeroSection({ onOpenBooking }) {
  return (
    <section className="hero" id="top">
      <div className="hero__container">
        <motion.div
          className="hero__content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="hero__title">
            Podología clínica
            <br />
            para el cuidado diario de tus pies
          </h1>
          <p className="hero__subtitle">
            "Atención podológica profesional y personalizada, para que cada paso que des sea firme, cómodo y sin dolor."
          </p>
          <div className="hero__actions">
            <SpecularButton
              className="hero__specular"
              size="md"
              radius={10}
              tint="#0891b2"
              tintOpacity={1}
              textColor="#ffffff"
              baseColor="#0e7490"
              autoAnimate
              onClick={onOpenBooking}
            >
              Reserva tu cita
            </SpecularButton>
            <a
              href="https://wa.me/56972836396"
              target="_blank"
              rel="noopener noreferrer"
              className="hero__btn hero__btn--secondary"
            >
              Haz tu consulta
            </a>
          </div>
          <p className="hero__badge">🚗 Atención a domicilio disponible</p>
        </motion.div>

        <motion.div
          className="hero__visual"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <img
            src="/Traje.jpeg"
            alt="Atención podológica profesional"
            className="hero__image"
          />
        </motion.div>
      </div>
    </section>
  )
}

export default HeroSection
