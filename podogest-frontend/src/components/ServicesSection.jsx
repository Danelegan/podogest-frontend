import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Home } from 'lucide-react'
import { servicesData, specialtiesData } from '../data/services'
import './ServicesSection.css'

const ICONS = { home: Home }

// Une las palabras de una o dos letras ("a", "y", "de") con la siguiente
// mediante un espacio no separable, para que nunca queden solas al final
// de una línea: "Podología a Domicilio" se muestra con "a" y "Domicilio" unidos.
const keepShortWordsAttached = (text) => {
  const words = text.trim().split(/ +/)
  return words
    .map((word, i) =>
      i === words.length - 1 ? word : `${word}${word.length <= 2 ? '\u00a0' : ' '}`,
    )
    .join('')
}

// Solo presentación: "$30.000 - $40.000" se muestra como "$30.000–40.000";
// el lector de pantalla oye "$30.000 a $40.000".
function Price({ value }) {
  const range = value.match(/^(\$[\d.,]+)\s*-\s*\$?([\d.,]+)$/)
  if (!range) {
    return <span className="service-card__price">{value}</span>
  }
  const [, from, to] = range
  return (
    <span className="service-card__price">
      <span aria-hidden="true">{`${from}\u2013${to}`}</span>
      <span className="services__sr-only">{`${from} a $${to}`}</span>
    </span>
  )
}

function ServiceCard({
  title,
  description,
  imagePath,
  icon,
  price,
  priceNote,
  onRequest,
  headingLevel: Heading,
}) {
  const Icon = icon ? ICONS[icon] : null
  return (
    <li className="service-card">
      <div className="service-card__media">
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
      </div>
      <div className="service-card__head">
        <Heading className={`service-card__title${price ? ' service-card__title--leader' : ''}`}>
          <span className="service-card__title-text">{keepShortWordsAttached(title)}</span>
        </Heading>
        {price && <Price value={price} />}
      </div>
      <p className="service-card__description">{description}</p>
      {priceNote && <p className="service-card__price-note">{priceNote}</p>}
      <button
        type="button"
        className="service-card__cta"
        onClick={() => onRequest(title)}
        aria-label={`Solicitar ${title}`}
      >
        Solicitar
        <ArrowRight className="service-card__arrow" size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </li>
  )
}

const cardStarts = (list) => {
  const padding = parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0
  return Array.from(list.children, (card) => card.offsetLeft - padding)
}

const currentIndex = (list, total) => {
  // La última tarjeta no puede alinearse al inicio: al llegar al final, es la actual.
  if (list.scrollLeft >= list.scrollWidth - list.clientWidth - 2) return total - 1
  const starts = cardStarts(list)
  let closest = 0
  starts.forEach((start, i) => {
    if (Math.abs(start - list.scrollLeft) < Math.abs(starts[closest] - list.scrollLeft)) {
      closest = i
    }
  })
  return closest
}

// Cuadrícula en escritorio y tablet; en móvil (≤600px, ver CSS) es un
// carrusel con scroll-snap, contador y flechas.
function ServiceCarousel({ items, headingLevel, labelledBy, itemName, onRequest }) {
  const listRef = useRef(null)
  const frameRef = useRef(0)
  const [index, setIndex] = useState(0)
  // Solo se anuncia al usar las flechas: al deslizar con el dedo, un aviso
  // por tarjeta sería ruido para el lector de pantalla.
  const [announcement, setAnnouncement] = useState('')
  const total = items.length
  const itemLabel = itemName.charAt(0).toUpperCase() + itemName.slice(1)

  const scheduleUpdate = () => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      if (listRef.current) setIndex(currentIndex(listRef.current, total))
    })
  }

  // Al rotar o redimensionar cambian los anchos sin que siempre haya scroll.
  useEffect(() => {
    const list = listRef.current
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        setIndex(currentIndex(list, total))
      })
    })
    observer.observe(list)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameRef.current)
    }
  }, [total])

  const goTo = (target) => {
    const list = listRef.current
    if (!list || target < 0 || target >= total) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({
      left: cardStarts(list)[target],
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
    setAnnouncement(`${itemLabel} ${target + 1} de ${total}`)
  }

  const atStart = index === 0
  const atEnd = index === total - 1

  return (
    <div className="services__block">
      <ul
        ref={listRef}
        className="services__grid"
        role="list"
        aria-labelledby={labelledBy}
        onScroll={scheduleUpdate}
      >
        {items.map((item) => (
          <ServiceCard
            key={item.id}
            {...item}
            headingLevel={headingLevel}
            onRequest={onRequest}
          />
        ))}
      </ul>

      <div className="services__controls">
        <button
          type="button"
          className="services__arrow"
          onClick={() => goTo(index - 1)}
          aria-label={`Ver ${itemName} anterior`}
          aria-disabled={atStart}
        >
          <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="services__counter">
          <span aria-hidden="true">
            {index + 1} / {total}
          </span>
          <span className="services__sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </span>
        </p>
        <button
          type="button"
          className="services__arrow"
          onClick={() => goTo(index + 1)}
          aria-label={`Ver ${itemName} siguiente`}
          aria-disabled={atEnd}
        >
          <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ServicesSection({ onRequestService }) {
  return (
    <section className="services" id="servicios" aria-labelledby="servicios-title">
      <div className="services__container">
        <header className="services__intro">
          <h2 className="services__title" id="servicios-title">Servicios</h2>
          <p className="services__subtitle">
            Procedimientos podológicos evaluados y aplicados según el estado de
            tus pies, con precios claros desde la primera consulta.
          </p>
          <button
            type="button"
            className="services__book"
            onClick={() => onRequestService('')}
          >
            Reservar hora
          </button>
        </header>

        <ServiceCarousel
          items={servicesData}
          headingLevel="h3"
          labelledBy="servicios-title"
          itemName="servicio"
          onRequest={onRequestService}
        />

        <h3 className="services__subheading" id="especialidades-title">
          Especialidades
        </h3>

        <ServiceCarousel
          items={specialtiesData}
          headingLevel="h4"
          labelledBy="especialidades-title"
          itemName="especialidad"
          onRequest={onRequestService}
        />
      </div>
    </section>
  )
}

export default ServicesSection
