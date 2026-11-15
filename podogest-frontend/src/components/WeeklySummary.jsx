import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import {
  fetchWeeklySummary,
  formatClp,
  formatDateShort,
  formatDayLong,
  formatDayShort,
  formatWeekRange,
  weekdayName,
  WeeklySummaryError,
} from '../utils/weeklySummary'
import './WeeklySummary.css'

// La preferencia "Ocultar montos" es la de la tarjeta "Ganancias" (que tiene el
// único botón): se lee de la misma clave y se escucha su aviso al cambiar.
const HIDE_KEY = 'podogest_ocultar_montos'
const HIDE_EVENT = 'podogest:montos-ocultos'
const MASK = '$ •••••'

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

const citasText = (n) => `${n} ${n === 1 ? 'cita' : 'citas'}`

// Cada gráfico es una tabla real: la fila dice qué es, la celda trae la barra
// (decorativa) y el valor escrito. Sin la barra no se pierde nada, y el color
// nunca es lo único que dice algo.
// rows: { key, label, srLabel?, tag?, tagTone?, value, display, srValue?, tone?, plain? }
function BarList({ caption, labelHeader, valueHeader, rows, hideBars = false }) {
  const max = Math.max(0, ...rows.map((row) => row.value))
  return (
    <table className="weekly__bars">
      <caption className="weekly__sr-only">{caption}</caption>
      <thead className="weekly__sr-only">
        <tr>
          <th scope="col">{labelHeader}</th>
          <th scope="col">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const width = !hideBars && max > 0 ? (row.value / max) * 100 : 0
          return (
            <tr key={row.key} className={row.plain ? 'weekly__bar-row--plain' : undefined}>
              <th scope="row">
                {row.srLabel ? (
                  <>
                    <span aria-hidden="true">{row.label}</span>
                    <span className="weekly__sr-only">{row.srLabel}</span>
                  </>
                ) : (
                  row.label
                )}
                {row.tag && (
                  <span className={`weekly__tag${row.tagTone === 'muted' ? ' weekly__tag--muted' : ''}`}>
                    {row.tag}
                  </span>
                )}
              </th>
              <td>
                <div className="weekly__cell">
                  <span className="weekly__track" aria-hidden="true">
                    {width > 0 && (
                      <span
                        className={`weekly__fill weekly__fill--${row.tone ?? 'primary'}`}
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    )}
                  </span>
                  {row.srValue ? (
                    <>
                      <span className="weekly__value" aria-hidden="true">
                        {row.display}
                      </span>
                      <span className="weekly__sr-only">{row.srValue}</span>
                    </>
                  ) : (
                    <span className="weekly__value">{row.display}</span>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Amount({ value, hidden }) {
  if (!hidden) return formatClp(value)
  return (
    <>
      <span aria-hidden="true">{MASK}</span>
      <span className="weekly__sr-only">Monto oculto</span>
    </>
  )
}

// Fila ganadora solo si es una sola (con empate no se marca ninguna).
function uniqueTop(items, key) {
  const max = Math.max(0, ...items.map((item) => item[key]))
  const tops = items.filter((item) => item[key] === max)
  return max > 0 && tops.length === 1 ? tops[0] : null
}

function Summary({ data, hidden }) {
  const { total, attended, noShow, cancelled, unmarked, upcoming, patients, earnings, services, days, hours } = data
  const percent = (n) => (total > 0 ? Math.round((n / total) * 100) : 0)

  const topDay = uniqueTop(days, 'busy')
  const topHour = uniqueTop(hours, 'count')

  const attendanceRows = [
    { key: 'a', label: 'Atendidas', value: attended, tone: 'primary' },
    { key: 'n', label: 'No asistió', value: noShow, tone: 'danger' },
    { key: 'c', label: 'Canceladas', value: cancelled, tone: 'muted' },
    { key: 'm', label: 'Sin marcar', value: unmarked, tone: 'warning' },
    { key: 'v', label: 'Por venir', value: upcoming, tone: 'muted' },
  ].map((row) => ({
    ...row,
    display: `${row.value} · ${percent(row.value)} %`,
    srValue: `${citasText(row.value)}, ${percent(row.value)} por ciento`,
  }))

  return (
    <>
      <dl className="weekly__kpis" aria-label="Cifras de la semana">
        <div className="weekly__kpi">
          <dt>Atendidas</dt>
          <dd>{attended}</dd>
        </div>
        <div className="weekly__kpi">
          <dt>No asistió</dt>
          <dd>{noShow}</dd>
        </div>
        <div className="weekly__kpi">
          <dt>Canceladas</dt>
          <dd>{cancelled}</dd>
        </div>
        <div className="weekly__kpi">
          <dt>Pacientes distintos</dt>
          <dd>{patients.distinct}</dd>
        </div>
      </dl>

      <div className="weekly__grid">
        <section className="weekly__card" aria-labelledby="weekly-money">
          <h3 id="weekly-money" className="weekly__card-title">
            Ganancias de la semana
          </h3>
          <p className="weekly__total" aria-live="polite">
            <span className="weekly__sr-only">Total de la semana: </span>
            <Amount value={earnings.total} hidden={hidden} />
          </p>
          <BarList
            caption="Ganancias de la semana por medio de pago"
            labelHeader="Medio de pago"
            valueHeader="Monto"
            hideBars={hidden}
            rows={earnings.methods.map((method) => ({
              key: method.id,
              label: method.label,
              value: method.amount,
              display: <Amount value={method.amount} hidden={hidden} />,
            }))}
          />
          <p className="weekly__note">
            Citas: {earnings.withPayment} con pago registrado y {earnings.unpaid} sin pago registrado.
          </p>
        </section>

        <section className="weekly__card" aria-labelledby="weekly-attendance">
          <h3 id="weekly-attendance" className="weekly__card-title">
            Asistencia
          </h3>
          <p className="weekly__lead">
            De {citasText(total)}, {attended} fueron atendidas ({percent(attended)} %).
          </p>
          <BarList
            caption="Citas de la semana según su estado"
            labelHeader="Estado"
            valueHeader="Citas"
            rows={attendanceRows}
          />
          <p className="weekly__note">
            <strong>Sin marcar:</strong> citas ya pasadas que no marcaste como atendida ni como no
            asistió. <strong>Por venir:</strong> citas que aún no llegan.
          </p>
        </section>

        <section className="weekly__card" aria-labelledby="weekly-patients">
          <h3 id="weekly-patients" className="weekly__card-title">
            Pacientes
          </h3>
          <p className="weekly__lead">Pacientes distintos de la semana: {patients.distinct}.</p>
          <BarList
            caption="Pacientes de la semana, nuevos y recurrentes"
            labelHeader="Tipo de paciente"
            valueHeader="Pacientes"
            rows={[
              {
                key: 'new',
                label: 'Pacientes nuevos',
                value: patients.newOnes,
                display: patients.newOnes,
                srValue: `${patients.newOnes} ${patients.newOnes === 1 ? 'paciente' : 'pacientes'}`,
              },
              {
                key: 'recurring',
                label: 'Pacientes recurrentes',
                value: patients.recurring,
                display: patients.recurring,
                srValue: `${patients.recurring} ${patients.recurring === 1 ? 'paciente' : 'pacientes'}`,
              },
            ]}
          />
          <p className="weekly__note">
            <strong>Citas sin documento: {patients.undocumentedAppointments}.</strong> Son citas, no
            personas: no tienen documento y no se cuentan como pacientes.
          </p>
        </section>

        <section className="weekly__card" aria-labelledby="weekly-services">
          <h3 id="weekly-services" className="weekly__card-title">
            Servicios más realizados
          </h3>
          <p className="weekly__lead">Citas por servicio.</p>
          {services.length === 0 ? (
            <p className="weekly__empty">Sin servicios esta semana.</p>
          ) : (
            <BarList
              caption="Citas por servicio"
              labelHeader="Servicio"
              valueHeader="Citas"
              rows={services.map((service) => ({
                key: service.label,
                label: service.label,
                value: service.count,
                display: service.count,
                srValue: citasText(service.count),
              }))}
            />
          )}
        </section>

        <section className="weekly__card" aria-labelledby="weekly-days">
          <h3 id="weekly-days" className="weekly__card-title">
            Días más ocupados
          </h3>
          <p className="weekly__lead">
            {topDay
              ? `El ${weekdayName(topDay.date)} fue el día con más citas (${topDay.busy}).`
              : 'Citas atendidas o con inasistencia, por día.'}
          </p>
          <BarList
            caption="Citas atendidas o con inasistencia, por día de la semana"
            labelHeader="Día"
            valueHeader="Citas"
            rows={days.map((day) => {
              const closedEmpty = day.closed && day.busy === 0
              return {
                key: day.date,
                label: formatDayShort(day.date),
                srLabel: formatDayLong(day.date),
                tag: topDay?.date === day.date ? 'más ocupado' : null,
                value: day.busy,
                display: closedEmpty ? 'Cerrado' : day.busy,
                srValue: closedEmpty ? 'Cerrado' : citasText(day.busy),
                plain: closedEmpty,
              }
            })}
          />
        </section>

        <section className="weekly__card" aria-labelledby="weekly-hours">
          <h3 id="weekly-hours" className="weekly__card-title">
            Horarios más ocupados
          </h3>
          <p className="weekly__lead">
            {topHour
              ? `La hora más pedida fue a las ${topHour.time} (${citasText(topHour.count)}).`
              : 'Citas por hora de inicio.'}
          </p>
          <BarList
            caption="Citas por hora de inicio"
            labelHeader="Hora"
            valueHeader="Citas"
            rows={hours.map((hour) => {
              const isTop = topHour?.time === hour.time
              return {
                key: hour.time,
                label: hour.time,
                tag: hour.offHours ? 'fuera de horario' : isTop ? 'más pedida' : null,
                tagTone: hour.offHours ? 'muted' : 'primary',
                value: hour.count,
                display: hour.count,
                srValue: citasText(hour.count),
                plain: hour.count === 0,
              }
            })}
          />
        </section>
      </div>
    </>
  )
}

// Pestaña "Resumen": una semana (lunes a domingo, hora de Chile) con cifras
// agregadas. Las semanas las decide el backend: la primera carga va sin
// parámetro y se navega con semana.anterior / semana.siguiente.
// `onSessionExpired` se llama si el servidor responde 401.
export default function WeeklySummary({ onSessionExpired }) {
  // week: null = semana actual (sin parámetro) o el "AAAA-MM-DD" que dio el
  // backend. `id` sube con cada petición, también al pedir lo mismo otra vez.
  const [request, setRequest] = useState({ week: null, id: 0 })
  // Navegación de la última semana cargada (null hasta que llega la primera).
  const [nav, setNav] = useState(null)
  const [isHidden, setIsHidden] = useState(readHidden)
  useEffect(() => {
    const sync = () => setIsHidden(readHidden())
    window.addEventListener(HIDE_EVENT, sync)
    return () => window.removeEventListener(HIDE_EVENT, sync)
  }, [])
  // El resultado lleva el id de lo que se pidió: si no coincide con la
  // petición actual, se está cargando (así una respuesta vieja nunca se muestra).
  const [result, setResult] = useState({ id: -1, data: null, error: '' })
  const expiredRef = useRef(onSessionExpired)
  useEffect(() => {
    expiredRef.current = onSessionExpired
  })

  const isLoading = result.id !== request.id
  const loaded = !isLoading && result.data ? result.data : null
  const isCurrentView = request.week === null || Boolean(loaded?.week.inProgress)

  useEffect(() => {
    const controller = new AbortController()
    fetchWeeklySummary(request.week, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setNav({ previous: data.week.previous, next: data.week.next })
        setResult({ id: request.id, data, error: '' })
      },
      (error) => {
        if (controller.signal.aborted) return
        if (error?.status === 401) {
          expiredRef.current?.()
          return
        }
        setResult({
          id: request.id,
          data: null,
          error:
            error instanceof WeeklySummaryError
              ? error.message
              : 'No pudimos cargar el resumen. Inténtalo de nuevo.',
        })
      },
    )
    return () => controller.abort()
  }, [request])

  const goTo = (week) => setRequest((current) => ({ week, id: current.id + 1 }))
  // Con aria-disabled el foco no se pierde al llegar al límite.
  const goPrevious = () => {
    if (nav?.previous) goTo(nav.previous)
  }
  const goNext = () => {
    if (nav?.next) goTo(nav.next)
  }
  const goCurrent = () => {
    if (!isCurrentView) goTo(null)
  }
  const reload = () => {
    if (!isLoading) goTo(request.week)
  }

  let range = 'Esta semana'
  if (loaded) range = formatWeekRange(loaded.week.from, loaded.week.to)
  else if (request.week) range = `Semana del ${formatDateShort(request.week)}`

  return (
    <section className="weekly" aria-labelledby="weekly-title" aria-busy={isLoading}>
      <header className="weekly__header">
        <h2 id="weekly-title" className="weekly__title">
          Resumen semanal
        </h2>
        <div className="weekly__tools">
          <button
            type="button"
            className="weekly__btn"
            onClick={reload}
            aria-disabled={isLoading || undefined}
          >
            <RefreshCw
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={isLoading ? 'weekly__spin' : undefined}
            />
            Actualizar
          </button>
        </div>
      </header>

      <div className="weekly__nav" role="group" aria-label="Elegir semana">
        <button
          type="button"
          className="weekly__btn weekly__btn--icon"
          onClick={goPrevious}
          aria-label="Semana anterior"
          aria-disabled={!nav?.previous || undefined}
        >
          <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <p className="weekly__range" aria-live="polite">
          <span className="weekly__range-dates">{range}</span>
          <span className="weekly__range-note">
            {isCurrentView ? 'Semana actual' : 'Lunes a domingo'}
          </span>
        </p>
        <button
          type="button"
          className="weekly__btn weekly__btn--icon"
          onClick={goNext}
          aria-label="Semana siguiente"
          aria-disabled={!nav?.next || undefined}
        >
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="weekly__btn weekly__current"
          onClick={goCurrent}
          aria-disabled={isCurrentView || undefined}
        >
          Esta semana
        </button>
      </div>

      {loaded?.week.inProgress && (
        <p className="weekly__partial">Semana en curso: las cifras aún pueden cambiar.</p>
      )}

      {isLoading && (
        <p className="weekly__message" role="status">
          Cargando resumen…
        </p>
      )}

      {!isLoading && result.error && (
        <div className="weekly__error" role="alert">
          <p>{result.error}</p>
          <button type="button" className="weekly__btn" onClick={reload}>
            <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      )}

      {loaded?.isEmpty && (
        <div className="weekly__card weekly__card--empty" role="status">
          <p className="weekly__empty-title">Sin atenciones esta semana</p>
          <p className="weekly__lead">Elige otra semana con los botones de arriba.</p>
        </div>
      )}

      {loaded && !loaded.isEmpty && <Summary data={loaded} hidden={isHidden} />}
    </section>
  )
}
