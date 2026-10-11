import { useEffect, useRef, useState } from 'react'
import './Navbar.css'

function Navbar({ onOpenBooking }) {
  const [isOpen, setIsOpen] = useState(false)
  const toggleRef = useRef(null)

  const closeMenu = () => setIsOpen(false)

  const handleBookingClick = () => {
    closeMenu()
    onOpenBooking()
  }

  // Escape cierra el menú móvil y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <header className="navbar">
      <div className="navbar__container">
        <a href="#top" className="navbar__logo" onClick={closeMenu}>
          <img src="/logo.jpeg" alt="Pasos Saludables" className="navbar__logo-img" />
        </a>

        <button
          ref={toggleRef}
          type="button"
          className={`navbar__toggle ${isOpen ? 'is-active' : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          aria-expanded={isOpen}
          aria-controls="navbar-menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav id="navbar-menu" className={`navbar__nav ${isOpen ? 'is-open' : ''}`}>
          <ul className="navbar__links">
            <li>
              <a href="#servicios" onClick={closeMenu}>Servicios</a>
            </li>
            <li>
              <a href="#nosotros" onClick={closeMenu}>Nosotros</a>
            </li>
            <li>
              <a href="#contacto" onClick={closeMenu}>Contacto</a>
            </li>
          </ul>
          <button
            type="button"
            className="navbar__cta"
            onClick={handleBookingClick}
          >
            Agendar Hora
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
