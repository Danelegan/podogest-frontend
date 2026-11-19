// Campo con etiqueta, ayuda y error asociados (para lectores de pantalla).
function Field({ id, label, optional, hint, error, counter, children }) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ')
  return (
    <div className="vales-field">
      <label htmlFor={id} className="vales-field__label">
        {label}
        {optional && <span className="vales-field__optional"> (opcional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy || undefined, 'aria-invalid': error ? true : undefined })}
      {counter && <p className="vales-field__counter">{counter}</p>}
      {hint && (
        <p id={hintId} className="vales-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="vales-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

export default Field
