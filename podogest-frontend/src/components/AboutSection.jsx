import { Check } from 'lucide-react'
import './AboutSection.css'

const HIGHLIGHTS = [
  'Instrumental Esterilizado',
  'Atención Personalizada',
  'Ubicación céntrica en Quinta Normal',
]

function AboutSection() {
  return (
    <section className="about" id="nosotros">
      <div className="about__container">
        <div className="about__image-placeholder" aria-hidden="true">
          Fotografía de la podóloga
        </div>

        <div className="about__content">
          <h2 className="about__title">Conoce a tu especialista</h2>

          <p className="about__paragraph">
            Con mas de 2 años de experiencia en el cuidado podológico, me especializo en
            brindar soluciones efectivas y personalizadas para cada paciente. Mi enfoque
            combina un diagnóstico clínico riguroso con un trato cercano, abordando
            cada afección del pie desde sus causas y no solo sus síntomas.
          </p>

          <p className="about__paragraph">
            Cada procedimiento se realiza bajo estrictos protocolos de higiene y
            bioseguridad, mediante el uso de autoclave para la esterilización,
            priorizando el bienestar del paciente en un ambiente
            cómodo, limpio y profesional pensado para tu tranquilidad.
          </p>

          <ul className="about__highlights">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="about__highlight">
                <span className="about__highlight-icon" aria-hidden="true">
                  <Check size={16} strokeWidth={3} />
                </span>
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
