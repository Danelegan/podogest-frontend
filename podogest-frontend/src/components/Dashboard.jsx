import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ClinicalRecordModal from './ClinicalRecordModal'
import './Dashboard.css'

const APPOINTMENTS_URL = 'https://podogest-backend.onrender.com/api/appointments/'
const TOKEN_KEY = 'podogest_token'

function Dashboard() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    navigate('/login')
  }

  const openRecord = (appointment) => {
    setSelectedAppointment(appointment)
    setIsModalOpen(true)
  }

  const closeRecord = () => {
    setIsModalOpen(false)
    setSelectedAppointment(null)
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadAppointments = async () => {
      try {
        const response = await fetch(APPOINTMENTS_URL, {
          headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          localStorage.removeItem(TOKEN_KEY)
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
          setErrorMessage(`No pudimos cargar las citas (error ${response.status}).`)
          return
        }

        const data = await response.json()
        // Support both a plain array and a paginated { results: [] } response.
        setAppointments(Array.isArray(data) ? data : data.results ?? [])
      } catch (error) {
        if (error.name === 'AbortError') return
        setErrorMessage('No se pudo conectar con el servidor.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadAppointments()
    return () => controller.abort()
  }, [navigate])

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Panel de Administración</h1>
        <button type="button" className="dashboard__logout" onClick={handleLogout}>
          Cerrar Sesión
        </button>
      </header>

      {isLoading ? (
        <p className="dashboard__message">Cargando citas...</p>
      ) : errorMessage ? (
        <p className="dashboard__error" role="alert">
          {errorMessage}
        </p>
      ) : appointments.length === 0 ? (
        <p className="dashboard__message">No hay citas registradas.</p>
      ) : (
        <div className="dashboard__table-wrapper">
          <table className="dashboard__table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>RUT/ID</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{appointment.patient_name}</td>
                  <td>{appointment.rut}</td>
                  <td>{appointment.appointment_date}</td>
                  <td>{appointment.appointment_time?.slice(0, 5)}</td>
                  <td>{appointment.email}</td>
                  <td>{appointment.phone}</td>
                  <td>
                    <button
                      type="button"
                      className="dashboard__action"
                      onClick={() => openRecord(appointment)}
                    >
                      Ver Ficha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClinicalRecordModal
        key={selectedAppointment?.id}
        isOpen={isModalOpen}
        onClose={closeRecord}
        appointmentId={selectedAppointment?.id}
        appointment={selectedAppointment}
      />
    </div>
  )
}

export default Dashboard
