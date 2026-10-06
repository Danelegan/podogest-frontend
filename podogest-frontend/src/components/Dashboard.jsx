import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, LogOut, Trash2, UserPlus } from 'lucide-react'
import ClinicalRecordModal from './ClinicalRecordModal'
import DailyAgenda from './DailyAgenda'
import ManualAttentionModal from './ManualAttentionModal'
import API_BASE_URL from '../config/api'
import './Dashboard.css'

const APPOINTMENTS_URL = `${API_BASE_URL}/api/appointments/`
const BACKUP_URL = `${API_BASE_URL}/api/appointments/exportar-respaldo/`
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TOKEN_KEY = 'podogest_token'

// "2026-09-25" en horario local (evita el corrimiento de un día que da
// new Date().toISOString() cerca de medianoche por usar UTC).
// Reads the name from Content-Disposition (exposed via CORS by the backend);
// falls back to the backend's own naming pattern.
function getBackupFileName(response) {
  const header = response.headers.get('Content-Disposition') ?? ''
  const match = header.match(/filename="?([^";]+)"?/)
  return match?.[1] ?? `respaldo_pasos_saludables_${getTodayDateString().replaceAll('-', '')}.xlsx`
}

function getTodayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Spreadsheet sheet with a download arrow, drawn inline to match the Excel look.
function SpreadsheetIcon() {
  return (
    <svg
      className="dashboard__backup-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h3M12 13v4" />
      <path d="M17 15v5m-2-2 2 2 2-2" />
    </svg>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [activeTab, setActiveTab] = useState('agenda')
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)

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
  }

  // The walk-in endpoint returns the new appointment (its clinical record is
  // already created), so we add it to the top of the table instead of
  // refetching; "Ver Ficha" works on it right away.
  const handleManualCreated = (appointment) => {
    setAppointments((prev) => [appointment, ...prev])
    setSearchTerm('')
    setIsManualModalOpen(false)
  }

  const handleUnauthorized = () => {
    localStorage.removeItem(TOKEN_KEY)
    navigate('/login', { replace: true })
  }

  // Fetches the CSV with the JWT (a plain <a href> can't send it) and triggers
  // the download through a temporary object URL.
  const downloadBackup = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(BACKUP_URL, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      })

      if (response.status === 401) {
        handleUnauthorized()
        return
      }

      if (!response.ok) {
        window.alert(`No se pudo descargar el respaldo (error ${response.status}).`)
        return
      }

      // Re-wrap the bytes with the Excel MIME type so the browser saves an .xlsx.
      const blob = new Blob([await response.arrayBuffer()], { type: XLSX_MIME })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = getBackupFileName(response)
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Give the browser a moment to start the download before freeing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      window.alert('No se pudo conectar con el servidor.')
    } finally {
      setIsDownloading(false)
    }
  }

  // Deletes the appointment; the backend removes its clinical record too (CASCADE).
  const deleteAppointment = async (appointment) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro por completo?')) return

    setDeletingId(appointment.id)
    try {
      const response = await fetch(`${APPOINTMENTS_URL}${appointment.id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      })

      if (response.status === 401) {
        handleUnauthorized()
        return
      }

      // 404: someone already deleted it, so the row should go away as well.
      if (!response.ok && response.status !== 404) {
        window.alert(`No se pudo eliminar el registro (error ${response.status}).`)
        return
      }

      setAppointments((prev) => prev.filter((item) => item.id !== appointment.id))
    } catch {
      window.alert('No se pudo conectar con el servidor.')
    } finally {
      setDeletingId(null)
    }
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

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredAppointments = appointments.filter(
    (appointment) =>
      appointment.patient_name?.toLowerCase().includes(normalizedSearch) ||
      appointment.rut?.toLowerCase().includes(normalizedSearch),
  )

  // Citas de hoy para la pestaña "Agenda de Hoy", ordenadas por hora.
  const todayAppointments = useMemo(() => {
    const todayStr = getTodayDateString()
    return appointments
      .filter((appointment) => appointment.appointment_date === todayStr)
      .sort((a, b) => (a.appointment_time ?? '').localeCompare(b.appointment_time ?? ''))
  }, [appointments])

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__heading">
          <button type="button" className="dashboard__back" onClick={() => navigate('/')}>
            <Home size={20} aria-hidden="true" />
            Ir al sitio web
          </button>
          <h1 className="dashboard__title">Panel de Administración</h1>
        </div>
        <button type="button" className="dashboard__logout" onClick={handleLogout}>
          <LogOut size={20} aria-hidden="true" />
          Cerrar Sesión
        </button>
      </header>

      <div className="dashboard__tabs" role="tablist" aria-label="Secciones del panel">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'agenda'}
          className={`dashboard__tab ${activeTab === 'agenda' ? 'dashboard__tab--active' : ''}`}
          onClick={() => setActiveTab('agenda')}
        >
          Agenda de Hoy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'citas'}
          className={`dashboard__tab ${activeTab === 'citas' ? 'dashboard__tab--active' : ''}`}
          onClick={() => setActiveTab('citas')}
        >
          Todas las Citas
        </button>
      </div>

      {activeTab === 'agenda' &&
        (isLoading ? (
          <p className="dashboard__message">Cargando citas...</p>
        ) : errorMessage ? (
          <p className="dashboard__error" role="alert">
            {errorMessage}
          </p>
        ) : (
          <DailyAgenda appointments={todayAppointments} />
        ))}

      {activeTab === 'citas' &&
        (isLoading ? (
          <p className="dashboard__message">Cargando citas...</p>
        ) : errorMessage ? (
          <p className="dashboard__error" role="alert">
            {errorMessage}
          </p>
        ) : (
          <>
            <div className="dashboard__toolbar">
              <button
                type="button"
                className="dashboard__new-attention"
                onClick={() => setIsManualModalOpen(true)}
              >
                <UserPlus size={18} aria-hidden="true" />
                Nueva Atención Manual
              </button>
              <button
                type="button"
                className="dashboard__backup"
                onClick={downloadBackup}
                disabled={isDownloading}
              >
                <SpreadsheetIcon />
                {isDownloading ? 'Descargando...' : 'Descargar Respaldo Excel'}
              </button>
            </div>
            {appointments.length === 0 ? (
              <p className="dashboard__message">No hay citas registradas.</p>
            ) : (
              <>
                <input
                  type="text"
                  className="dashboard__search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nombre o RUT..."
                  aria-label="Buscar por nombre o RUT"
                />
                {filteredAppointments.length === 0 ? (
                  <p className="dashboard__message">
                    No se encontraron citas para “{searchTerm.trim()}”.
                  </p>
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
                        {filteredAppointments.map((appointment) => (
                          <tr key={appointment.id}>
                            <td>{appointment.patient_name}</td>
                            <td>{appointment.rut}</td>
                            <td>{appointment.appointment_date}</td>
                            <td>{appointment.appointment_time?.slice(0, 5)}</td>
                            <td>{appointment.email}</td>
                            <td>{appointment.phone}</td>
                            <td>
                              <div className="dashboard__actions">
                                <button
                                  type="button"
                                  className="dashboard__action"
                                  onClick={() => openRecord(appointment)}
                                >
                                  Ver Ficha
                                </button>
                                <button
                                  type="button"
                                  className="dashboard__action dashboard__action--danger"
                                  onClick={() => deleteAppointment(appointment)}
                                  disabled={deletingId === appointment.id}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  {deletingId === appointment.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        ))}

      <ManualAttentionModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onCreated={handleManualCreated}
        onUnauthorized={handleUnauthorized}
      />

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
