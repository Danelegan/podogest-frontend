// Base URL del backend Django. Viene de la variable de entorno VITE_API_URL
// (ver .env.example) para no repetir la URL hardcodeada en cada componente.
// Si no está definida (por ejemplo, falta el .env local), cae de vuelta a
// producción para no romper un build que la haya olvidado.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://podogest-backend.onrender.com'

if (!import.meta.env.VITE_API_URL && import.meta.env.DEV) {
  console.warn(
    '[config/api] VITE_API_URL no está definida; usando la URL de producción como respaldo. ' +
      'Crea un .env en la raíz del frontend (ver .env.example) para apuntar a tu backend local.',
  )
}

export default API_BASE_URL
