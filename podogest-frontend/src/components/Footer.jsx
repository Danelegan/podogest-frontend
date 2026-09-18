import { FaInstagram, FaWhatsapp } from 'react-icons/fa'
import { Phone, Mail, MapPin } from 'lucide-react'
import './Footer.css'

const SCHEDULE = [
  { day: 'Lunes a Viernes', hours: '09:00 - 18:00' },
  { day: 'Sábado', hours: '09:00 - 14:00' },
  { day: 'Domingo', hours: 'Cerrado' },
]

function Footer() {
  return (
    <footer className="footer" id="contacto">
      <div className="footer__container">
        <div className="footer__col footer__brand">
          <p className="footer__logo">
            Pasos<span>Saludables</span>
          </p>
          <p className="footer__tagline">
            Cuidado profesional de tus pies, con protocolos clínicos y un trato cercano
            pensado para tu bienestar.
          </p>
          <div className="footer__socials">
            <a
              href="https://www.instagram.com/pasos_saludablesplus"
              className="footer__social-link footer__social-link--instagram"
              aria-label="Síguenos en Instagram"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaInstagram size={18} />
            </a>
            <a
              href="https://wa.me/56972836396"
              className="footer__social-link footer__social-link--whatsapp"
              aria-label="Escríbenos por WhatsApp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaWhatsapp size={18} />
            </a>
          </div>
        </div>

        <div className="footer__col">
          <h3 className="footer__heading">Contacto</h3>
          <ul className="footer__list">
            <li className="footer__item">
              <Phone size={16} strokeWidth={2} />
              <a href="tel:+56972836396">+56 9 7283 6396</a>
            </li>
            <li className="footer__item">
              <Mail size={16} strokeWidth={2} />
              <a href="mailto:arokelina@gmail.com">arokelina@gmail.com</a>
            </li>
          </ul>

          <h3 className="footer__heading footer__heading--spaced">Horarios</h3>
          <ul className="footer__schedule">
            {SCHEDULE.map(({ day, hours }) => (
              <li key={day} className="footer__schedule-item">
                <span>{day}</span>
                <span>{hours}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h3 className="footer__heading">Ubicación</h3>
          <p className="footer__item">
            <MapPin size={16} strokeWidth={2} />
            Av. José Joaquín Pérez 4435, Quinta Normal, Santiago, Chile
          </p>
          <div className="footer__map-placeholder">Mapa Interactivo</div>
        </div>
      </div>

      <div className="footer__bottom">
        <p>© 2026 Pasos Saludables - Desarrollado por Danelegan</p>
      </div>
    </footer>
  )
}

export default Footer
