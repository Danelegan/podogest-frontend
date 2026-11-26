import { CLINIC_ADDRESS, CLINIC_MAPS_URL } from '../config/clinic'
import './Footer.css'

const PHONE_DISPLAY = '+56 9 7283 6396'
const PHONE_URL = 'tel:+56972836396'
const WHATSAPP_URL = 'https://wa.me/56972836396'
const INSTAGRAM_URL = 'https://www.instagram.com/pasos_saludablesplus'

// "Av. …, Local A" en la primera línea y "Quinta Normal, Santiago" en la segunda.
const ADDRESS_PARTS = CLINIC_ADDRESS.split(', ')
const ADDRESS_STREET = ADDRESS_PARTS.slice(0, -2).join(', ')
const ADDRESS_CITY = ADDRESS_PARTS.slice(-2).join(', ')

const SCHEDULE = [
  { day: 'Lunes a viernes', hours: '10:00–20:30' },
  { day: 'Sábado', hours: '09:30–19:00' },
  { day: 'Domingo', hours: 'Cerrado' },
]

// "10:00–20:30" se ve con semirraya; el lector de pantalla oye "10:00 a 20:30".
function Hours({ value }) {
  const range = value.split('–')
  if (range.length !== 2) {
    return <span className="footer__hours">{value}</span>
  }
  return (
    <span className="footer__hours">
      <span aria-hidden="true">{value}</span>
      <span className="footer__sr-only">{`${range[0]} a ${range[1]}`}</span>
    </span>
  )
}

// Enlace que abre en otra pestaña; lo avisa a los lectores de pantalla.
function ExternalTextLink({ href, className, children }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="footer__sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  )
}

function Footer({ onOpenBooking }) {
  return (
    <footer className="footer" id="contacto">
      <div className="footer__container">
        <div className="footer__top">
          <div className="footer__brand">
            <p className="footer__logo">Pasos Saludables</p>
            <a href={PHONE_URL} className="footer__phone">
              {PHONE_DISPLAY}
            </a>
            <p className="footer__lead">Escríbenos por WhatsApp o llámanos para reservar tu hora.</p>
          </div>
          <div className="footer__actions">
            <button type="button" className="footer__button footer__button--book" onClick={onOpenBooking}>
              Reservar hora
            </button>
            <ExternalTextLink href={WHATSAPP_URL} className="footer__button footer__button--outline">
              WhatsApp
            </ExternalTextLink>
          </div>
        </div>

        <div className="footer__grid">
          <div>
            <h2 className="footer__heading">Dónde estamos</h2>
            <p className="footer__address">
              {ADDRESS_STREET}
              <br />
              {ADDRESS_CITY}
            </p>
            <ExternalTextLink href={CLINIC_MAPS_URL} className="footer__link">
              Abrir en Google Maps
            </ExternalTextLink>
          </div>

          <div>
            <h2 className="footer__heading">Cuándo atendemos</h2>
            <ul className="footer__schedule">
              {SCHEDULE.map(({ day, hours }) => (
                <li key={day} className="footer__schedule-item">
                  <span>{day}</span>
                  <Hours value={hours} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="footer__heading">Síguenos</h2>
            <ul className="footer__links">
              <li>
                <ExternalTextLink href={INSTAGRAM_URL} className="footer__link">
                  Instagram
                </ExternalTextLink>
              </li>
              <li>
                <ExternalTextLink href={WHATSAPP_URL} className="footer__link">
                  WhatsApp
                </ExternalTextLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p>© 2026 Pasos Saludables</p>
          <p>Desarrollado por Danelegan</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
