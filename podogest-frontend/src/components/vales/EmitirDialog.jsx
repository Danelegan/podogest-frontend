import { useEffect, useId, useRef, useState } from 'react'
import { Copy, Printer } from 'lucide-react'
import ValesDialog from './ValesDialog'
import Field from './ValesField'
import { valesRequest } from './valesApi'
import {
  NOTE_MAX,
  classifyError,
  formatClp,
  groupCode,
  singleFlight,
  validateEmitir,
} from './valesUtils'

const digitsOnly = (value) => value.replace(/\D/g, '')

// Emitir un lote de vales nuevos. Al terminar muestra los códigos completos:
// es el único momento en que se ven todos juntos.
function EmitirDialog({ onClose, onIssued, onDisabled, onSessionExpired }) {
  const uid = useId()
  const [values, setValues] = useState({ cantidad: '1', monto: '', nota: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState(null)
  const [copyMessage, setCopyMessage] = useState('')
  const headingRef = useRef(null)
  const focusFieldRef = useRef('')
  const id = (name) => `${uid}-${name}`

  const setValue = (name, formatter) => (event) => {
    const next = formatter ? formatter(event.target.value) : event.target.value
    setValues((prev) => ({ ...prev, [name]: next }))
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev))
  }

  useEffect(() => {
    if (issued) headingRef.current?.focus()
  }, [issued])

  useEffect(() => {
    if (!focusFieldRef.current) return
    document.getElementById(focusFieldRef.current)?.focus()
    focusFieldRef.current = ''
  }, [fieldErrors])

  const reject = (errors) => {
    const first = ['cantidad', 'monto', 'nota'].find((name) => errors[name])
    focusFieldRef.current = id(first)
    setFieldErrors(errors)
  }

  const submit = async () => {
    const { errors, quantity, amount } = validateEmitir(values)
    if (Object.keys(errors).length) return reject(errors)
    setBusy(true)
    setError('')
    const nota = values.nota.trim()
    const response = await valesRequest('emitir/', {
      method: 'POST',
      body: { cantidad: quantity, monto: amount, ...(nota ? { nota } : {}) },
    })
    setBusy(false)
    if (response.aborted) return
    if (response.ok && Array.isArray(response.data?.vales)) {
      setIssued(response.data.vales)
      onIssued()
      return
    }
    const problem = classifyError(response, 'emitir')
    if (problem.kind === 'session') return onSessionExpired()
    if (problem.kind === 'disabled') return onDisabled()
    if (problem.kind === 'field' && ['cantidad', 'monto', 'nota'].includes(problem.field)) {
      return reject({ [problem.field]: problem.message })
    }
    setError(problem.message)
  }

  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  const guardRef = useRef(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (busy) return
    guardRef.current ??= singleFlight(() => submitRef.current())
    guardRef.current()
  }

  const copyAll = async () => {
    const text = issued.map((vale) => vale.codigo).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage('Códigos copiados.')
    } catch {
      setCopyMessage('No se pudo copiar. Anótalos o usa Imprimir.')
    }
  }

  const quantity = Number(values.cantidad) || 0
  const amount = Number(values.monto) || 0
  const total = quantity * amount

  if (issued) {
    const first = issued[0]
    return (
      <ValesDialog title="Vales emitidos" onClose={onClose} wide>
        <div className="vales-form vales-print-area">
          <h3 ref={headingRef} tabIndex={-1} className="vales-step-title" role="status">
            Se emitieron {issued.length} {issued.length === 1 ? 'vale' : 'vales'} de{' '}
            {formatClp(first?.monto_inicial)}
          </h3>
          <p className="vales-warning">
            Estos códigos solo se ven completos ahora. Cópialos o imprímelos antes de cerrar.
          </p>
          <ol className="vales-codes">
            {issued.map((vale) => (
              <li key={vale.id} className="vales-codes__item">
                <span className="vales-codes__code" aria-label={`Código ${vale.codigo.split('').join(' ')}`}>
                  {groupCode(vale.codigo)}
                </span>
                <span className="vales-codes__amount">{formatClp(vale.monto_inicial)}</span>
              </li>
            ))}
          </ol>
          <p role="status" className="vales-note vales-print-hide">
            {copyMessage}
          </p>
          <div className="vales-actions vales-print-hide">
            <button type="button" className="vales-btn vales-btn--primary" onClick={copyAll}>
              <Copy size={18} aria-hidden="true" /> Copiar todos
            </button>
            <button type="button" className="vales-btn" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" /> Imprimir
            </button>
            <button type="button" className="vales-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </ValesDialog>
    )
  }

  return (
    <ValesDialog
      title="Emitir vales"
      description="Crea vales nuevos. Quedan sin activar hasta que los vendas."
      onClose={onClose}
      closeLocked={busy}
    >
      <form className="vales-form" onSubmit={handleSubmit} noValidate>
        <Field id={id('cantidad')} label="Cantidad de vales" hint="De 1 a 50." error={fieldErrors.cantidad}>
          {(props) => (
            <input
              {...props}
              className="vales-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={values.cantidad}
              onChange={setValue('cantidad', digitsOnly)}
            />
          )}
        </Field>
        <Field
          id={id('monto')}
          label="Monto de cada vale (en pesos)"
          hint={
            amount > 0
              ? `Cada vale: ${formatClp(amount)}${total > 0 && quantity > 1 ? `. Total: ${formatClp(total)}.` : '.'}`
              : 'De $1 a $1.000.000. Solo números, sin puntos.'
          }
          error={fieldErrors.monto}
        >
          {(props) => (
            <input
              {...props}
              className="vales-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={values.monto}
              onChange={setValue('monto', digitsOnly)}
            />
          )}
        </Field>
        <Field
          id={id('nota')}
          label="Nota"
          optional
          counter={`${values.nota.length}/${NOTE_MAX}`}
          error={fieldErrors.nota}
        >
          {(props) => (
            <input
              {...props}
              className="vales-input"
              type="text"
              maxLength={NOTE_MAX}
              autoComplete="off"
              value={values.nota}
              onChange={setValue('nota')}
            />
          )}
        </Field>
        {busy && (
          <p role="status" className="vales-note">
            Emitiendo…
          </p>
        )}
        {error && (
          <p role="alert" className="vales-alert">
            {error}
          </p>
        )}
        <div className="vales-actions">
          <button type="submit" className="vales-btn vales-btn--primary" aria-disabled={busy}>
            {busy ? 'Emitiendo…' : 'Emitir vales'}
          </button>
          <button type="button" className="vales-btn" aria-disabled={busy} onClick={() => !busy && onClose()}>
            Cancelar
          </button>
        </div>
      </form>
    </ValesDialog>
  )
}

export default EmitirDialog
