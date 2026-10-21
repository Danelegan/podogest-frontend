import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import AdminLogin from './components/AdminLogin'
import Dashboard from './components/Dashboard'
import NotFoundPage from './components/NotFoundPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Enlace directo de reserva (Google Maps). Mismo index.html, así que
            hereda el canonical a https://www.pasossaludables.cl/. */}
        <Route path="/reservar" element={<LandingPage openBookingOnLoad />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
