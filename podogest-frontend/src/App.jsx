import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import NotFoundPage from './components/NotFoundPage'
import ProtectedRoute from './components/ProtectedRoute'

// El panel se descarga solo al entrar a /login o /dashboard, no en la landing.
const AdminLogin = lazy(() => import('./components/AdminLogin'))
const Dashboard = lazy(() => import('./components/Dashboard'))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
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
      </Suspense>
    </BrowserRouter>
  )
}

export default App
