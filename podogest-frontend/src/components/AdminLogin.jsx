import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import './AdminLogin.css'

const TOKEN_URL = 'https://podogest-backend.onrender.com/api/token/'
const TOKEN_KEY = 'podogest_token'

function AdminLogin() {
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleChange = (event) => {
    const { name, value } = event.target
    setCredentials((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem(TOKEN_KEY, data.access)
        navigate('/dashboard')
      } else if (response.status === 401) {
        setErrorMessage('Credenciales inválidas')
      } else {
        setErrorMessage(`No pudimos iniciar sesión (error ${response.status}).`)
      }
    } catch {
      setErrorMessage(
        'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="admin-login">
      <button type="button" className="admin-login__back" onClick={() => navigate('/')}>
        <ArrowLeft size={20} aria-hidden="true" />
        Volver al inicio
      </button>

      <form className="admin-login__card" onSubmit={handleSubmit}>
        <h1 className="admin-login__title">Panel de Administración</h1>
        <p className="admin-login__subtitle">Inicia sesión para continuar</p>

        <label className="admin-login__field">
          Usuario
          <input
            type="text"
            name="username"
            value={credentials.username}
            onChange={handleChange}
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-login__field">
          Contraseña
          <input
            type="password"
            name="password"
            value={credentials.password}
            onChange={handleChange}
            autoComplete="current-password"
            required
          />
        </label>

        {errorMessage && (
          <p className="admin-login__error" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          className="admin-login__submit"
          disabled={isLoading}
        >
          {isLoading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}

export default AdminLogin
