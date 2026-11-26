import { useRef, useState } from 'react'
import { useReveal } from '../hooks/useReveal'
import './AboutSection.css'

const VISIT_STEPS = [
  {
    title: 'Reviso tu pie completo',
    description: 'Te explico lo que encuentro, con palabras simples.',
  },
  {
    title: 'Te enseño a cuidarlo',
    description: 'En casa, para que el resultado dure.',
  },
  {
    title: 'Cuéntame lo que te duele',
    description: 'Sin sentirte juzgado. Siempre vas a tener quien te ayude con tus pies.',
  },
]

function AboutSection({ onOpenBooking }) {
  const sectionRef = useRef(null)
  // Si falta /autoclave.jpeg, el círculo y su texto no se muestran.
  const [hasAutoclave, setHasAutoclave] = useState(true)
  useReveal(sectionRef, '.about__reveal', { variant: 'rise', stagger: 90 })

  return (
    <section
      ref={sectionRef}
      className="about"
      id="nosotros"
      aria-labelledby="nosotros-eyebrow nosotros-title"
    >
      <div className="about__container">
        <div className="about__media about__reveal">
          <img
            src="/foto-perfil.jpeg"
            alt="Podóloga con mascarilla y guantes realizando un procedimiento en el pie de un paciente bajo una lámpara clínica"
            className="about__image"
          />
        </div>

        <div className="about__content">
          <div className="about__intro">
            <div className="about__name">
              <p className="about__eyebrow about__reveal" id="nosotros-eyebrow">
                Conoce a tu especialista
              </p>
              <h2 className="about__title about__reveal" id="nosotros-title">
                Alejandra Villanueva
              </h2>
            </div>
            {hasAutoclave && (
              <figure className="about__autoclave about__reveal">
                <img
                  src="/autoclave.jpeg"
                  alt="Autoclave abierto con instrumental envuelto en sus bandejas"
                  className="about__autoclave-image"
                  width="120"
                  height="120"
                  loading="lazy"
                  onError={() => setHasAutoclave(false)}
                />
                <figcaption className="about__autoclave-caption">
                  Instrumental esterilizado en autoclave
                </figcaption>
              </figure>
            )}
          </div>

          <p className="about__quote about__reveal">
            Con más de 2 años de experiencia, abordo cada afección del pie desde sus causas y no
            solo sus síntomas.
          </p>

          <h3 className="about__subtitle about__reveal">Lo que te llevas de tu hora</h3>
          <ol className="about__steps">
            {VISIT_STEPS.map((step) => (
              <li key={step.title} className="about__step about__reveal">
                <h4 className="about__step-title">{step.title}</h4>
                <p className="about__step-text">{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="about__actions about__reveal">
            <button type="button" className="about__book" onClick={onOpenBooking}>
              Reservar hora
            </button>
            <span className="about__place">Quinta Normal, Santiago</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AboutSection
