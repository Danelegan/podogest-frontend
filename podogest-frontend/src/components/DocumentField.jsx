import { useRef } from 'react'
import { DOCUMENT_TYPES, formatDocumentNumber } from '../utils/documentValidation'
import './DocumentField.css'

const HINTS = {
  rut: 'Ej: 12.345.678-9',
  pasaporte: 'Tal como aparece en tu pasaporte',
}

const PLACEHOLDERS = {
  rut: '12.345.678-9',
  pasaporte: 'AB1234567',
}

// "Documento": compact type selector [RUT ▾] plus the number. The wrapper
// takes the form's own field class (className), so the label and the number
// input look like the other fields of that form.
// onChange receives { documentType, documentNumber }; the number arrives
// already formatted. Changing the type clears the number and focuses it.
function DocumentField({
  id,
  className,
  documentType,
  documentNumber,
  onChange,
  error,
  required = false,
  ref,
}) {
  const ownInputRef = useRef(null)
  // The parent may pass its own ref to focus the number (e.g. on an error).
  const inputRef = ref ?? ownInputRef
  const typeId = `${id}-type`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const isPassport = documentType === 'pasaporte'

  const handleTypeChange = (event) => {
    onChange({ documentType: event.target.value, documentNumber: '' })
    inputRef.current?.focus()
  }

  const handleNumberChange = (event) => {
    onChange({
      documentType,
      documentNumber: formatDocumentNumber(documentType, event.target.value),
    })
  }

  return (
    <div className={`document-field ${className ?? ''}`.trim()}>
      <label htmlFor={id}>Documento</label>
      <div className="document-field__row">
        <select
          id={typeId}
          className="document-field__type"
          value={documentType}
          onChange={handleTypeChange}
          aria-label="Tipo de documento"
        >
          {DOCUMENT_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="document-field__number"
          name="documentNumber"
          value={documentNumber}
          onChange={handleNumberChange}
          placeholder={PLACEHOLDERS[documentType]}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize={isPassport ? 'characters' : 'off'}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          required={required}
        />
      </div>
      <p id={hintId} className="document-field__hint">
        {HINTS[documentType]}
      </p>
      {error && (
        <p id={errorId} className="document-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

export default DocumentField
