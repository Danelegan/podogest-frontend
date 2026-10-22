import { Navigate } from 'react-router-dom'

// Same keys as src/utils/auth.js; read directly so the landing bundle doesn't
// pull in the auth module. With only the refresh token, the panel renews on
// its first request.
function ProtectedRoute({ children }) {
  const hasSession =
    localStorage.getItem('podogest_token') || localStorage.getItem('podogest_refresh')

  if (!hasSession) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
