import { useEffect, useId, useRef, useState } from 'react'
import ValesDialog from './ValesDialog'
import Field from './ValesField'
import { valesRequest } from './valesApi'
import {
  NOTE_MAX,
  classifyError,
  formatClp,
  newRedeemKey,
  remainingAfter,
  singleFlight,
  validateAjuste,
  validateCanje,
  validateMonths,
  validateReason,
} from './valesUtils'

const digitsOnly = (value) => value.replace(/\D/g, '')
// Para el ajuste: un signo al comienzo y el resto, dígitos.
const signedOnly = (value) => {
  const clean = value.replace('−', '-').replace(/[^\d+-]/g, '')
  return clean.charAt(0).match(/[+-]/) ? clean.charAt(0) + clean.slice(1).replace(/\D/g, '') : clean.replace(/\D/g, '')
}

const TITLES = {
  canjear: 'Canjear vale',
  activar: 'Vender vale (activar)',
  anular: 'Anular vale',
  ajustar: 'Ajustar saldo',
}

const FIELD_OF_API = {
  monto: 'monto',
  nota: 'nota',
  vigencia_meses: 'meses',
  motivo: 'motivo',
}

// Canjear, activar, anular o ajustar un vale: formulario, confirmación
// obligatoria y resultado, todo dentro del mismo diálogo.
function ValeActionDialog({ kind, vale, onClose, onVale, onRefresh, onSessionExpired }) {
  const uid = useId()
  const fieldId = (name) => `${uid}-${name}`
  const [step, setStep] = useState('form') // form | confirm | done
  const [values, setValues] = useState({ monto: '', nota: '', meses: '12', motivo: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const headingRef = useRef(null)
  const focusFieldRef = useRef('')
  // Una sola clave por canje: se crea al abrir el diálogo y se reutiliza si
  // hay que reintentar tras un error de red.
  const [redeemKey] = useState(() => (kind === 'canjear' ? newRedeemKey() : ''))

  const setValue = (name, formatter) => (event) => {
    const next = formatter ? formatter(event.target.value) : event.target.value
    setValues((prev) => ({ ...prev, [name]: next }))
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev))
  }

  // Al cambiar de paso, el foco va al título del paso (o al campo con error).
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    if (step === 'form' && focusFieldRef.current) {
      document.getElementById(focusFieldRef.current)?.focus()
      focusFieldRef.current = ''
    } else {
      headingRef.current?.focus()
    }
  }, [step])

  const showFieldError = (name, message) => {
    setFieldErrors({ [name]: message })
    focusFieldRef.current = fieldId(name)
    setStep('form')
  }

  const handleContinue = (event) => {
    event.preventDefault()
    if (kind === 'canjear') {
      const result = validateCanje(values.monto, vale.saldo)
      if (result.error) return showFieldError('monto', result.error)
      if (values.nota.length > NOTE_MAX) return showFieldError('nota', 'Debe tener como máximo 80 caracteres.')
      setParsed({ monto: result.value })
    } else if (kind === 'activar') {
      const result = validateMonths(values.meses)
      if (result.error) return showFieldError('meses', result.error)
      setParsed({ meses: result.value })
    } else if (kind === 'anular') {
      const result = validateReason(values.motivo)
      if (result.error) return showFieldError('motivo', result.error)
      setParsed({ motivo: result.value })
    } else {
      const result = validateAjuste(values.monto, vale)
      if (result.error) return showFieldError('monto', result.error)
      const note = validateReason(values.nota)
      if (note.error) return showFieldError('nota', note.error === 'Escribe el motivo.' ? 'Explica qué se corrige.' : note.error)
      setParsed({ monto: result.value, nota: note.value, after: result.after })
    }
    setError('')
    setStep('confirm')
  }

  const buildRequest = () => {
    const base = `${vale.id}/${kind}/`
    if (kind === 'canjear') {
      const nota = values.nota.trim()
      return { path: base, body: { monto: parsed.monto, clave: redeemKey, ...(nota ? { nota } : {}) } }
    }
    if (kind === 'activar') return { path: base, body: { vigencia_meses: parsed.meses } }
    if (kind === 'anular') return { path: base, body: { motivo: parsed.motivo } }
    return { path: base, body: { monto: parsed.monto, nota: parsed.nota } }
  }

  const finish = (text, saldo) => {
    setOutcome({ text, saldo })
    setStep('done')
  }

  const send = async () => {
    setBusy(true)
    setError('')
    const { path, body } = buildRequest()
    const response = await valesRequest(path, { method: 'POST', body })
    setBusy(false)
    if (response.aborted) return
    if (response.ok) {
      const next = response.data?.vale
      if (next) onVale(next)
      const saldo = next?.saldo ?? 0
      if (kind === 'canjear') {
        finish(response.data?.repetido ? 'Este canje ya estaba registrado. No se descontó de nuevo.' : 'Canje registrado.', saldo)
      } else if (kind === 'activar') {
        finish('El vale quedó activo y listo para usar.', saldo)
      } else if (kind === 'anular') {
        finish('El vale quedó anulado.', saldo)
      } else {
        finish('Ajuste registrado.', saldo)
      }
      return
    }
    const problem = classifyError(response, kind)
    if (problem.kind === 'session') return onSessionExpired()
    if (problem.kind === 'repeated') {
      // El canje ya estaba hecho: se lee el vale tal como está y no es un error.
      const fresh = await onRefresh(vale.id)
      return finish('Este canje ya estaba registrado. No se descontó de nuevo.', fresh?.saldo ?? vale.saldo)
    }
    if (problem.kind === 'field') {
      const name = FIELD_OF_API[problem.field]
      if (name) return showFieldError(name, problem.message)
    }
    if (problem.kind === 'conflict') {
      // El estado del vale cambió: se actualiza la lista y no se deja reintentar.
      onRefresh(vale.id)
      setBlocked(true)
    }
    setError(problem.message)
  }

  // Mientras hay una petición en curso, las demás llamadas se ignoran.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })
  const guardRef = useRef(null)

  const handleConfirm = () => {
    if (busy) return
    guardRef.current ??= singleFlight(() => sendRef.current())
    guardRef.current()
  }

  const amountPreview = parsed?.monto ?? 0
  const confirmText = () => {
    if (kind === 'canjear') {
      return `Vas a descontar ${formatClp(amountPreview)} de este vale. Quedará ${formatClp(remainingAfter(vale.saldo, amountPreview))}.`
    }
    if (kind === 'activar') {
      return `Vas a vender este vale de ${formatClp(vale.monto_inicial)}. Quedará activo por ${parsed.meses} ${parsed.meses === 1 ? 'mes' : 'meses'}.`
    }
    if (kind === 'anular') {
      return `Vas a anular este vale${vale.saldo > 0 ? ` y se perderá su saldo de ${formatClp(vale.saldo)}` : ''}. Motivo: ${parsed.motivo}`
    }
    const verb = parsed.monto > 0 ? 'sumar' : 'restar'
    return `Vas a ${verb} ${formatClp(Math.abs(parsed.monto))} al saldo. Quedará ${formatClp(parsed.after)}.`
  }
  const irreversible = kind === 'anular' || kind === 'ajustar'
  const confirmLabel = {
    canjear: 'Confirmar canje',
    activar: 'Confirmar venta',
    anular: 'Anular vale',
    ajustar: 'Confirmar ajuste',
  }[kind]

  const description =
    step === 'form'
      ? {
          canjear: `Saldo disponible: ${formatClp(vale.saldo)}.`,
          activar: `Vale de ${formatClp(vale.monto_inicial)}. Al venderlo queda listo para usar.`,
          anular: 'Anular un vale no se puede deshacer.',
          ajustar: 'Sirve para corregir un error de canje o de saldo. No se puede deshacer.',
        }[kind]
      : undefined

  return (
    <ValesDialog title={TITLES[kind]} description={description} onClose={onClose} closeLocked={busy}>
      {step === 'form' && (
        <form className="vales-form" onSubmit={handleContinue} noValidate>
          {(kind === 'canjear' || kind === 'ajustar') && (
            <Field
              id={fieldId('monto')}
              label={kind === 'canjear' ? 'Monto a descontar (en pesos)' : 'Monto del ajuste (con + o -)'}
              hint={
                kind === 'ajustar'
                  ? 'Escribe + para sumar o - para restar. Ejemplo: -5000.'
                  : 'Solo números, sin puntos.'
              }
              error={fieldErrors.monto}
            >
              {(props) => (
                <input
                  {...props}
                  className="vales-input"
                  type="text"
                  inputMode={kind === 'canjear' ? 'numeric' : 'text'}
                  autoComplete="off"
                  value={values.monto}
                  onChange={setValue('monto', kind === 'canjear' ? digitsOnly : signedOnly)}
                />
              )}
            </Field>
          )}
          {kind === 'activar' && (
            <Field
              id={fieldId('meses')}
              label="Vigencia (en meses)"
              hint="De 1 a 24 meses. Lo habitual son 12."
              error={fieldErrors.meses}
            >
              {(props) => (
                <input
                  {...props}
                  className="vales-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values.meses}
                  onChange={setValue('meses', digitsOnly)}
                />
              )}
            </Field>
          )}
          {kind === 'anular' && (
            <Field
              id={fieldId('motivo')}
              label="Motivo"
              counter={`${values.motivo.length}/${NOTE_MAX}`}
              error={fieldErrors.motivo}
            >
              {(props) => (
                <input
                  {...props}
                  className="vales-input"
                  type="text"
                  maxLength={NOTE_MAX}
                  autoComplete="off"
                  value={values.motivo}
                  onChange={setValue('motivo')}
                />
              )}
            </Field>
          )}
          {(kind === 'canjear' || kind === 'ajustar') && (
            <Field
              id={fieldId('nota')}
              label={kind === 'ajustar' ? 'Qué se corrige' : 'Nota'}
              optional={kind === 'canjear'}
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
          )}
          <div className="vales-actions">
            <button type="submit" className="vales-btn vales-btn--primary">
              Continuar
            </button>
            <button type="button" className="vales-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="vales-form">
          <h3 ref={headingRef} tabIndex={-1} className="vales-step-title">
            Confirma antes de seguir
          </h3>
          <p className="vales-confirm-text">{confirmText()}</p>
          {irreversible && <p className="vales-warning">Esto no se puede deshacer.</p>}
          {busy && (
            <p role="status" className="vales-note">
              Enviando…
            </p>
          )}
          {error && (
            <p role="alert" className="vales-alert">
              {error}
            </p>
          )}
          <div className="vales-actions">
            {blocked ? (
              <button type="button" className="vales-btn vales-btn--primary" onClick={onClose}>
                Cerrar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`vales-btn ${kind === 'anular' ? 'vales-btn--danger' : 'vales-btn--primary'}`}
                  aria-disabled={busy}
                  onClick={handleConfirm}
                >
                  {busy ? 'Enviando…' : error ? 'Reintentar' : confirmLabel}
                </button>
                <button
                  type="button"
                  className="vales-btn"
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) {
                      setError('')
                      setStep('form')
                    }
                  }}
                >
                  Volver
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'done' && outcome && (
        <div className="vales-form" role="status">
          <h3 ref={headingRef} tabIndex={-1} className="vales-step-title">
            {outcome.text}
          </h3>
          <p className="vales-confirm-text">Saldo actual: {formatClp(outcome.saldo)}</p>
          <div className="vales-actions">
            <button type="button" className="vales-btn vales-btn--primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      )}
    </ValesDialog>
  )
}

export default ValeActionDialog
