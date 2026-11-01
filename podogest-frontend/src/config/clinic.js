// Dirección de la clínica, compartida por el footer y la reserva.
export const CLINIC_ADDRESS = 'Av. José Joaquín Pérez 4435, Local A, Quinta Normal, Santiago'

// La búsqueda usa la dirección original para que "Abrir en Google Maps" y
// "Cómo llegar" apunten al mismo lugar.
const CLINIC_MAPS_QUERY = 'Av. José Joaquín Pérez 4435, Quinta Normal, Santiago, Chile'
export const CLINIC_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_MAPS_QUERY)}`

// Mapa incrustado del footer: solo se carga cuando el visitante lo pide.
export const CLINIC_MAP_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3329.683499213773!2d-70.69840248873771!3d-33.431494996430736!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9662c4152b181411%3A0xe049811f8493a61a!2sAv.%20Jos%C3%A9%20Joaqu%C3%ADn%20P%C3%A9rez%204435%2C%208500124%20Quinta%20Normal%2C%20Regi%C3%B3n%20Metropolitana!5e0!3m2!1ses-419!2scl!4v1789690410363!5m2!1ses-419!2scl'
