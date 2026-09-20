// Chilean RUT check (Módulo 11). Accepts "12.345.678-5", "12345678-5" or "123456785".
export function validarRut(rut) {
  const clean = String(rut ?? '').replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[\dK]$/.test(clean)) return false

  const body = clean.slice(0, -1)
  const verifier = clean.slice(-1)

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
