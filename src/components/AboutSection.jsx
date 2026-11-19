import { Check } from 'lucide-react'
import './AboutSection.css'

const HIGHLIGHTS = [
  'Instrumental Esterilizado',
  'Atención Personalizada',
  'Ubicación céntrica en Quinta Normal',
]

function AboutSection() {
  return (
    <section className="about" id="nosotros" aria-labelledby="nosotros-title">
      <div className="about__container">
        <div className="about__media">
          <img
            src="/foto-perfil.jpeg"
            alt="Podóloga con mascarilla y guantes realizando un procedimiento en el pie de un paciente bajo una lámpara clínica"
            className="about__image"
          />
        </div>

        <div className="about__content">
          {/* "a&nbsp;tu&nbsp;especialista" es intencional: evita que "a" o "tu"
              queden al final de una línea. */}
          <h2 className="about__title" id="nosotros-title">
            Conoce a&nbsp;tu&nbsp;especialista
          </h2>

          <p className="about__paragraph">
            Con más de 2 años de experiencia en el cuidado podológico, me especializo en
            brindar soluciones efectivas y personalizadas para cada paciente. Mi enfoque
            combina un diagnóstico clínico riguroso con un trato cercano, abordando
            cada afección del pie desde sus causas y no solo sus síntomas.
          </p>

          <p className="about__paragraph">
            Cada procedimiento se realiza bajo estrictos protocolos de higiene y
            bioseguridad mediante el uso de autoclave para la esterilización,
            priorizando el bienestar del paciente en un ambiente
            cómodo, limpio y profesional pensado para tu tranquilidad.
          </p>

          <ul className="about__highlights">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="about__highlight">
                <Check
                  className="about__highlight-icon"
                  size={18}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export default AboutSection
