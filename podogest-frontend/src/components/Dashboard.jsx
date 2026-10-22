import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Home, LogOut, Trash2, UserPlus } from 'lucide-react'
import ClinicalRecordModal from './ClinicalRecordModal'
import DailyAgenda, { StatusBadge } from './DailyAgenda'
import ManualAttentionModal from './ManualAttentionModal'
import API_BASE_URL from '../config/api'
import { authFetch, getAccessToken, logout, SESSION_EXPIRED_MESSAGE } from '../utils/auth'
import './Dashboard.css'

const APPOINTMENTS_URL = `${API_BASE_URL}/api/appointments/`
const BACKUP_URL = `${API_BASE_URL}/api/appointments/exportar-respaldo/`
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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

// "2026-09-25" -> local Date (no UTC day shift); null if it isn't a date.
function parseLocalDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString ?? '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// "2026-09-25" -> "jue, 25 sept"; adds the year when it isn't the current one
// so old records can't be mistaken for this year's.
function formatDisplayDate(dateString) {
  const date = parseLocalDate(dateString)
  if (!date) return dateString
  const options = { weekday: 'short', day: 'numeric', month: 'short' }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString('es-CL', options)
}

// "Octubre 2026" (es-CL alone would give "octubre de 2026").
function formatMonthLabel(dateString) {
  const date = parseLocalDate(dateString)
  if (!date) return 'Sin fecha'
  return `${capitalize(date.toLocaleDateString('es-CL', { month: 'long' }))} ${date.getFullYear()}`
}

// "Jueves 22".
function formatDayLabel(dateString) {
  const date = parseLocalDate(dateString)
  if (!date) return 'Sin fecha'
  return `${capitalize(date.toLocaleDateString('es-CL', { weekday: 'long' }))} ${date.getDate()}`
}

// "2026-10-22 10:30:00": sorts by date, then by time.
const sortKey = (appointment) =>
  `${appointment.appointment_date ?? ''} ${appointment.appointment_time ?? ''}`

const byDateAscending = (a, b) => sortKey(a).localeCompare(sortKey(b))
const byDateDescending = (a, b) => sortKey(b).localeCompare(sortKey(a))

// Sorted appointments -> months -> days, keeping the order they come in:
// [{ key: '2026-10', label: 'Octubre 2026', count, days: [{ key, label, appointments }] }]
function groupByMonth(appointments) {
  const months = []
  for (const appointment of appointments) {
    const dateKey = appointment.appointment_date ?? ''
    const monthKey = dateKey.slice(0, 7) || 'sin-fecha'
    let month = months.at(-1)
    if (month?.key !== monthKey) {
      month = { key: monthKey, label: formatMonthLabel(dateKey), count: 0, days: [] }
      months.push(month)
    }
    let day = month.days.at(-1)
    if (day?.key !== dateKey) {
      day = { key: dateKey, label: formatDayLabel(dateKey), appointments: [] }
      month.days.push(day)
    }
    day.appointments.push(appointment)
    month.count += 1
  }
  return months
}

const VIEWS = [
  { id: 'upcoming', label: 'Próximas' },
  { id: 'past', label: 'Pasadas' },
]

// "Pasadas" shows this many months with appointments, and as many more per click.
const PAST_MONTHS_STEP = 3

const OPEN_MONTHS_KEY = 'podogest_open_months'

// Months the user opened or closed, per view, since the current month shows
// up in both: { upcoming: { '2026-10': true }, past: { '2026-09': false } }.
// Storage may be unavailable (private mode, blocked): then start empty.
function readOpenMonths() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(OPEN_MONTHS_KEY))
    if (saved && typeof saved === 'object') {
      const isMap = (value) => value && typeof value === 'object' && !Array.isArray(value)
      const views = VIEWS.map(({ id }) => [id, isMap(saved[id]) ? saved[id] : {}])
      return Object.fromEntries(views)
    }
  } catch {
    // Unreadable: fall back to the defaults.
  }
  return { upcoming: {}, past: {} }
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
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [view, setView] = useState('upcoming')
  const [pastMonthsShown, setPastMonthsShown] = useState(PAST_MONTHS_STEP)
  // Month to focus once "Ver meses anteriores" has rendered it.
  const focusMonthRef = useRef(null)
  const [openMonths, setOpenMonths] = useState(readOpenMonths)
  // Opened/closed while searching: kept apart so the saved state comes back
  // untouched. Any change to the search text clears it, opening everything again.
  const [searchOpen, setSearchOpen] = useState({})

  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_MONTHS_KEY, JSON.stringify(openMonths))
    } catch {
      // Storage unavailable: the state just won't outlive this page.
    }
  }, [openMonths])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const handleSessionExpired = () => {
    navigate('/login', { replace: true, state: { notice: SESSION_EXPIRED_MESSAGE } })
  }

  const openRecord = (appointment) => {
    setSelectedAppointment(appointment)
    setIsModalOpen(true)
  }

  // A modal with unsaved changes stays open when the session expires; once it
  // is closed, the user goes on to the login.
  const closeRecord = () => {
    setIsModalOpen(false)
    if (!getAccessToken()) handleSessionExpired()
  }

  const closeManualAttention = () => {
    setIsManualModalOpen(false)
    if (!getAccessToken()) handleSessionExpired()
  }

  // The walk-in endpoint returns the new appointment (its clinical record is
  // already created), so we add it to the top of the table instead of
  // refetching; "Ver Ficha" works on it right away.
  const handleManualCreated = (appointment) => {
    setAppointments((prev) => [appointment, ...prev])
    setSearchTerm('')
    setSearchOpen({})
    setIsManualModalOpen(false)
  }

  // Fetches the CSV with the JWT (a plain <a href> can't send it) and triggers
  // the download through a temporary object URL.
  const downloadBackup = async () => {
    setIsDownloading(true)
    try {
      const response = await authFetch(BACKUP_URL)

      if (response.status === 401) {
        handleSessionExpired()
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

  // Deletes the appointment; the backend refuses with 409 if its clinical record has data.
  const deleteAppointment = async (appointment) => {
    if (
      !window.confirm(
        'Solo se pueden eliminar citas sin ficha o con la ficha vacía. Las fichas con datos clínicos se conservan. ¿Eliminar esta cita?',
      )
    )
      return

    setDeletingId(appointment.id)
    try {
      const response = await authFetch(`${APPOINTMENTS_URL}${appointment.id}/`, {
        method: 'DELETE',
      })

      if (response.status === 401) {
        handleSessionExpired()
        return
      }

      // 409: the record has clinical data; show the backend's reason and keep the row.
      if (response.status === 409) {
        const data = await response.json().catch(() => null)
        window.alert(data?.detail || `No se pudo eliminar el registro (error ${response.status}).`)
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
        const response = await authFetch(APPOINTMENTS_URL, { signal: controller.signal })

        if (response.status === 401) {
          navigate('/login', { replace: true, state: { notice: SESSION_EXPIRED_MESSAGE } })
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
  const isSearching = normalizedSearch !== ''

  // "Próximas": today onwards, soonest first. "Pasadas": before today, latest first.
  const { upcomingMonths, pastMonths } = useMemo(() => {
    const todayStr = getTodayDateString()
    const sorted = [...appointments].sort(byDateAscending)
    return {
      upcomingMonths: groupByMonth(sorted.filter((item) => (item.appointment_date ?? '') >= todayStr)),
      pastMonths: groupByMonth(sorted.filter((item) => (item.appointment_date ?? '') < todayStr).reverse()),
    }
  }, [appointments])

  // The search covers every appointment, whatever the view, latest first.
  const searchMonths = useMemo(() => {
    if (!isSearching) return []
    const matches = appointments.filter(
      (appointment) =>
        appointment.patient_name?.toLowerCase().includes(normalizedSearch) ||
        appointment.rut?.toLowerCase().includes(normalizedSearch),
    )
    return groupByMonth(matches.sort(byDateDescending))
  }, [appointments, isSearching, normalizedSearch])

  const visibleMonths = isSearching
    ? searchMonths
    : view === 'upcoming'
      ? upcomingMonths
      : pastMonths.slice(0, pastMonthsShown)
  const hasOlderMonths = !isSearching && view === 'past' && pastMonths.length > pastMonthsShown

  // Unless the user chose otherwise, only the first month of the list is open:
  // the current one in "Próximas", the latest in "Pasadas". While searching,
  // every month with results is open.
  const shownMonths = visibleMonths.map((month, index) => ({
    ...month,
    isOpen: isSearching
      ? (searchOpen[month.key] ?? true)
      : (openMonths[view][month.key] ?? index === 0),
  }))

  const toggleMonth = (monthKey, wasOpen) => {
    if (isSearching) {
      setSearchOpen((prev) => ({ ...prev, [monthKey]: !wasOpen }))
      return
    }
    setOpenMonths((prev) => ({ ...prev, [view]: { ...prev[view], [monthKey]: !wasOpen } }))
  }

  const showOlderMonths = () => {
    focusMonthRef.current = pastMonths[pastMonthsShown]?.key ?? null
    setPastMonthsShown((count) => count + PAST_MONTHS_STEP)
  }

  // Focus the first month just added: the button may have disappeared, and
  // this tells keyboard and screen reader users where the new rows begin.
  useEffect(() => {
    if (focusMonthRef.current == null) return
    document.getElementById(`dashboard-month-${focusMonthRef.current}`)?.focus()
    focusMonthRef.current = null
  }, [pastMonthsShown])

  const resultCount = searchMonths.reduce((total, month) => total + month.count, 0)
  const tableLabel = isSearching
    ? 'Resultados de la búsqueda'
    : view === 'upcoming'
      ? 'Citas próximas'
      : 'Citas pasadas'

  const emptyMessage = isSearching
    ? `No se encontraron citas para “${searchTerm.trim()}”.`
    : view === 'upcoming'
      ? 'No hay citas próximas.'
      : 'No hay citas pasadas.'

  // Citas de hoy para la pestaña "Agenda de hoy", ordenadas por hora.
  const todayAppointments = useMemo(() => {
    const todayStr = getTodayDateString()
    return appointments
      .filter((appointment) => appointment.appointment_date === todayStr)
      .sort((a, b) => (a.appointment_time ?? '').localeCompare(b.appointment_time ?? ''))
  }, [appointments])

  return (
    <div className="dashboard">
      {/* React 19 la lleva al <head>; respaldo de la cabecera X-Robots-Tag de vercel.json. */}
      <meta name="robots" content="noindex, nofollow" />
      <header className="dashboard__header">
        <div className="dashboard__heading">
          <button type="button" className="dashboard__back" onClick={() => navigate('/')}>
            <Home size={20} aria-hidden="true" />
            Ir al sitio web
          </button>
          <div className="dashboard__brand">
            <img src="/logo_sinfondo.png" alt="" className="dashboard__logo" />
            <div>
              <p className="dashboard__eyebrow">Pasos Saludables</p>
              <h1 className="dashboard__title">Panel de Administración</h1>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="dashboard__logout"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut size={20} aria-hidden="true" />
          {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar Sesión'}
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
          Agenda de hoy
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
              {appointments.length > 0 && (
                <div className="dashboard__segmented" role="group" aria-label="Mostrar citas">
                  {VIEWS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`dashboard__segment${view === id ? ' dashboard__segment--active' : ''}`}
                      aria-pressed={view === id}
                      // The search ignores the view, so the selector rests meanwhile.
                      disabled={isSearching}
                      onClick={() => setView(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="dashboard__new-attention"
                onClick={() => setIsManualModalOpen(true)}
              >
                <UserPlus size={18} aria-hidden="true" />
                Nueva atención manual
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
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setSearchOpen({})
                  }}
                  placeholder="Buscar por nombre o RUT..."
                  aria-label="Buscar por nombre o RUT"
                />
                {/* Always mounted, so the change is announced. */}
                <p className="dashboard__search-note" role="status">
                  {isSearching
                    ? `${resultCount} ${resultCount === 1 ? 'cita encontrada' : 'citas encontradas'} entre todas las citas.`
                    : ''}
                </p>
                {visibleMonths.length === 0 ? (
                  <p className="dashboard__message">{emptyMessage}</p>
                ) : (
                  <div className="dashboard__table-wrapper">
                    <table className="dashboard__table" aria-label={tableLabel}>
                      <thead>
                        <tr>
                          <th scope="col">Paciente</th>
                          <th scope="col" className="dashboard__col-date">Cita</th>
                          <th scope="col">Contacto</th>
                          <th scope="col" className="dashboard__col-status">Estado</th>
                          <th scope="col" className="dashboard__col-actions">Acciones</th>
                        </tr>
                      </thead>
                      {/* One tbody per month, so its sticky header stays within it.
                          A closed month keeps only its header row. */}
                      {shownMonths.map((month) => (
                        <tbody key={month.key} id={`dashboard-month-body-${month.key}`}>
                          <tr>
                            <th className="dashboard__month" colSpan={5} scope="rowgroup">
                              <button
                                id={`dashboard-month-${month.key}`}
                                type="button"
                                className="dashboard__month-toggle"
                                aria-expanded={month.isOpen}
                                aria-controls={`dashboard-month-body-${month.key}`}
                                onClick={() => toggleMonth(month.key, month.isOpen)}
                              >
                                <ChevronDown
                                  className="dashboard__month-icon"
                                  size={18}
                                  aria-hidden="true"
                                />
                                <span>
                                  {month.label}
                                  <span className="dashboard__month-count">
                                    {' · '}
                                    {month.count} {month.count === 1 ? 'cita' : 'citas'}
                                  </span>
                                </span>
                              </button>
                            </th>
                          </tr>
                          {month.isOpen && month.days.map((day) => (
                            <Fragment key={day.key}>
                              <tr>
                                <th className="dashboard__day" colSpan={5}>
                                  {day.key ? <time dateTime={day.key}>{day.label}</time> : day.label}
                                </th>
                              </tr>
                              {day.appointments.map((appointment) => (
                                <tr key={appointment.id} className="dashboard__row">
                                  {/* Row header: screen readers name each cell after the patient. */}
                                  <th scope="row" className="dashboard__cell-patient">
                                    <span className="dashboard__lines">
                                      <span className="dashboard__name">{appointment.patient_name}</span>
                                      <span className="dashboard__secondary dashboard__cell-mono">
                                        {appointment.rut}
                                      </span>
                                    </span>
                                  </th>
                                  <td data-label="Cita">
                                    <span className="dashboard__lines">
                                      <time dateTime={appointment.appointment_date}>
                                        {formatDisplayDate(appointment.appointment_date)}
                                      </time>
                                      <span className="dashboard__secondary dashboard__cell-mono">
                                        {appointment.appointment_time?.slice(0, 5)}
                                      </span>
                                    </span>
                                  </td>
                                  <td data-label="Contacto">
                                    <span className="dashboard__lines">
                                      <span className="dashboard__cell-mono">{appointment.phone}</span>
                                      {appointment.email && (
                                        <span
                                          className="dashboard__secondary dashboard__email"
                                          title={appointment.email}
                                        >
                                          {appointment.email}
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                  <td data-label="Estado">
                                    <StatusBadge status={appointment.status} />
                                  </td>
                                  <td className="dashboard__cell-actions">
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
                            </Fragment>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                )}
                {hasOlderMonths && (
                  <button type="button" className="dashboard__more" onClick={showOlderMonths}>
                    Ver meses anteriores
                  </button>
                )}
              </>
            )}
          </>
        ))}

      <ManualAttentionModal
        isOpen={isManualModalOpen}
        onClose={closeManualAttention}
        onCreated={handleManualCreated}
        onSessionExpired={handleSessionExpired}
      />

      <ClinicalRecordModal
        key={selectedAppointment?.id}
        isOpen={isModalOpen}
        onClose={closeRecord}
        onSessionExpired={handleSessionExpired}
        appointmentId={selectedAppointment?.id}
        appointment={selectedAppointment}
      />
    </div>
  )
}

export default Dashboard
