// Same rule as the backend: body of 7 to 9 digits once leading zeros are
// dropped, plus the verifier digit (0-9 or K).
const RUT_RE = /^0*([1-9]\d{6,8})([\dK])$/

// Chilean RUT check (Módulo 11). Accepts "12.345.678-5", "12345678-5" or "123456785".
export function validarRut(rut) {
  const clean = String(rut ?? '').replace(/[.\-\s]/g, '').toUpperCase()
  const match = clean.match(RUT_RE)
  if (!match) return false

  const [, body, verifier] = match

  // Multiply digits right-to-left by 2,3,4,5,6,7,2,3...
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }

  const result = 11 - (sum % 11)
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result)
  return verifier === expected
}

// "1234567895" -> "123.456.789-5". Keeps only digits and K, drops leading
// zeros and allows up to 10 characters (9-digit body plus verifier).
export function formatRUT(value) {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase().replace(/^0+/, '').slice(0, 10)
  if (clean.length <= 1) return clean

  const body = clean.slice(0, -1).replace(/\D/g, '')
  const verifier = clean.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${verifier}`
}
