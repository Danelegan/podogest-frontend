import { useState } from 'react'
import './Navbar.css'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  const closeMenu = () => setIsOpen(false)

  return (
    <header className="navbar">
      <div className="navbar__container">
        <a href="#top" className="navbar__logo" onClick={closeMenu}>
          Podo<span>Gest</span>
        </a>

        <button
          className={`navbar__toggle ${isOpen ? 'is-active' : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Abrir menú de navegación"
          aria-expanded={isOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`navbar__nav ${isOpen ? 'is-open' : ''}`}>
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
          <a href="#agendar" className="navbar__cta" onClick={closeMenu}>
            Agendar Hora
          </a>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
