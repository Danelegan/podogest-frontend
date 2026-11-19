import { Link } from 'react-router-dom'
import './NotFoundPage.css'

// Any unknown public route. The SPA rewrite still answers 200, so noindex keeps
// these URLs out of Google (React 19 hoists <title> and <meta> into <head>).
function NotFoundPage() {
  return (
    <main className="not-found">
      <title>Página no encontrada · Pasos Saludables</title>
      <meta name="robots" content="noindex" />

      <div className="not-found__card">
        <Link to="/" className="not-found__logo">
          <img src="/logo.jpeg" alt="Pasos Saludables, ir al inicio" />
        </Link>

        <p className="not-found__eyebrow">Error 404</p>
        <h1 className="not-found__title">Página no encontrada</h1>
        <p className="not-found__text">
          La dirección que buscas no existe o cambió de lugar. Desde el inicio
          puedes ver nuestros servicios y reservar tu hora.
        </p>

        <div className="not-found__actions">
          <Link to="/" className="not-found__button not-found__button--primary">
            Volver al inicio
          </Link>
          <Link to="/reservar" className="not-found__button not-found__button--ghost">
            Reservar hora
          </Link>
        </div>
      </div>
    </main>
  )
}

export default NotFoundPage
