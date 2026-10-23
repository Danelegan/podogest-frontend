import { FaInstagram, FaWhatsapp } from 'react-icons/fa'
import { Mail, Phone } from 'lucide-react'
import './Footer.css'

const SCHEDULE = [
  { day: 'Lunes a viernes', hours: '10:00–19:00' },
  { day: 'Sábado', hours: '09:00–14:00' },
  { day: 'Domingo', hours: 'Cerrado' },
]

// "10:00–19:00" se ve con semirraya; el lector de pantalla oye "10:00 a 19:00".
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

function Footer() {
  return (
    <footer className="footer" id="contacto">
      <div className="footer__container">
        <div className="footer__col footer__brand">
          {/* Dos líneas como en el logo; el espacio hace que se lea "Pasos Saludables". */}
          <p className="footer__logo">
            <span className="footer__logo-first">Pasos</span>{' '}
            <span className="footer__logo-second">Saludables</span>
          </p>
          <p className="footer__tagline">
            Cuidado profesional de tus pies, con protocolos clínicos y un trato cercano
            pensado para tu bienestar.
          </p>
          <div className="footer__socials">
            <a
              href="https://www.instagram.com/pasos_saludablesplus"
              className="footer__social-link"
              aria-label="Síguenos en Instagram"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaInstagram size={18} aria-hidden="true" />
            </a>
            <a
              href="https://wa.me/56972836396"
              className="footer__social-link"
              aria-label="Escríbenos por WhatsApp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaWhatsapp size={18} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="footer__col">
          <h2 className="footer__heading">Contacto</h2>
          <ul className="footer__list">
            <li>
              <a href="tel:+56972836396">
                <Phone className="footer__contact-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                +56 9 7283 6396
              </a>
            </li>
            <li>
              <a href="mailto:arokelina@gmail.com">
                <Mail className="footer__contact-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                arokelina@gmail.com
              </a>
            </li>
          </ul>
        </div>

        <div className="footer__col">
          <h2 className="footer__heading">Horarios</h2>
          <ul className="footer__schedule">
            {SCHEDULE.map(({ day, hours }) => (
              <li key={day} className="footer__schedule-item">
                <span className="footer__day">{day}</span>
                <Hours value={hours} />
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h2 className="footer__heading">Ubicación</h2>
          <p className="footer__address">
            Av. José Joaquín Pérez 4435, Local A, Quinta Normal, Santiago
          </p>
          <div className="footer__map">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3329.683499213773!2d-70.69840248873771!3d-33.431494996430736!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9662c4152b181411%3A0xe049811f8493a61a!2sAv.%20Jos%C3%A9%20Joaqu%C3%ADn%20P%C3%A9rez%204435%2C%208500124%20Quinta%20Normal%2C%20Regi%C3%B3n%20Metropolitana!5e0!3m2!1ses-419!2scl!4v1789690410363!5m2!1ses-419!2scl"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              title="Mapa de ubicación de Pasos Saludables en Quinta Normal"
            ></iframe>
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        <p>© 2026 Pasos Saludables · Desarrollado por Danelegan</p>
      </div>
    </footer>
  )
}

export default Footer
