// Label of the button that opens an appointment's clinical record: "Ver ficha"
// once the record has data, "Crear ficha" otherwise (the record itself is only
// created when the modal saves). Shared by the daily agenda and the table.
export function recordActionLabel(appointment) {
  return appointment?.ficha_con_datos === true ? 'Ver ficha' : 'Crear ficha'
}
