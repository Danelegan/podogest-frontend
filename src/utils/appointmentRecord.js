import { DEFAULT_DOCUMENT_TYPE, DOCUMENT_TYPES, formatDocumentNumber } from './documentValidation'

// Label of the button that opens an appointment's clinical record: "Ver ficha"
// once the record has data, "Crear ficha" otherwise (the record itself is only
// created when the modal saves). Shared by the daily agenda and the table.
export function recordActionLabel(appointment) {
  return appointment?.ficha_con_datos === true ? 'Ver ficha' : 'Crear ficha'
}

// The appointment's document as the form keeps it. Older appointments only have
// `rut` and an empty type: they count as RUT. '' when there is no document.
function appointmentDocument(appointment) {
  const number = String(appointment?.document_number || appointment?.rut || '').trim()
  const knownType = DOCUMENT_TYPES.some(({ value }) => value === appointment?.document_type)
  const documentType = knownType ? appointment.document_type : DEFAULT_DOCUMENT_TYPE
  return { documentType, documentNumber: number ? formatDocumentNumber(documentType, number) : '' }
}

// "Nueva atención" is offered only when the appointment has a document: the new
// one is linked to the patient's history through it.
export function hasAppointmentDocument(appointment) {
  return appointmentDocument(appointment).documentNumber !== ''
}

// Patient data copied into a new attention (ManualAttentionModal's initialPatient).
export function patientFromAppointment(appointment) {
  return {
    nombre: (appointment?.patient_name ?? '').trim(),
    ...appointmentDocument(appointment),
    email: (appointment?.email ?? '').trim(),
    telefono: (appointment?.phone ?? '').trim(),
  }
}
