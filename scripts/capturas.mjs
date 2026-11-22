// Genera las capturas y el recorrido en GIF del README.
//
//   npm run capturas
//
// Requisitos:
//   - `npm run dev` corriendo en http://localhost:5173 (el único origen que se abre).
//   - Backend Django LOCAL en http://127.0.0.1:8000 con datos de demostración.
//   - Cuenta de demostración en `.env.capturas` (ignorado por git):
//       CAPTURAS_USUARIO=...
//       CAPTURAS_CLAVE=...
//
// Seguridad: nunca captura producción. El script se niega a correr si
// VITE_API_URL (en su entorno) no es local, y además bloquea toda petición del
// navegador que no vaya a localhost:5173 o 127.0.0.1:8000; si la app intenta
// salir a otro lado (por ejemplo, porque el servidor de desarrollo apunta a
// producción), aborta sin guardar nada.
//
// Salida (docs/capturas/): PNG de escritorio (1440×900 @2x) y celular (390×844 @2x),
// y recorrido.gif (≤ 3 MB). El GIF se escribe primero en un archivo temporal y solo
// reemplaza al anterior si pesa menos del límite. No se borra ningún otro archivo.

import { chromium } from 'playwright'
import gifenc from 'gifenc'
import pngjs from 'pngjs'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import gifsicle from 'gifsicle'

const { GIFEncoder, quantize, applyPalette } = gifenc
const { PNG } = pngjs
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs', 'capturas')
const WEB_ORIGIN = 'http://localhost:5173'
const API_ORIGIN = 'http://127.0.0.1:8000'
const GIF_LIMIT_BYTES = 3 * 1024 * 1024
const GIF_TARGET_FRAMES = 90
const GIF_WIDTH = 640

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}

const fail = (message) => {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

// ---------- Guardas de seguridad ----------

const isLocalUrl = (value) => {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const allowedOrigins = new Set([WEB_ORIGIN, API_ORIGIN])

if (process.env.VITE_API_URL !== undefined && !isLocalUrl(process.env.VITE_API_URL)) {
  fail(
    `VITE_API_URL no es local (${process.env.VITE_API_URL}). Este script solo corre contra ` +
      `el backend local ${API_ORIGIN}. Nunca se capturan datos de producción.`,
  )
}

// ---------- Credenciales de la cuenta de demostración ----------

function readCredentials() {
  let user = process.env.CAPTURAS_USUARIO
  let password = process.env.CAPTURAS_CLAVE
  const file = join(ROOT, '.env.capturas')
  if ((!user || !password) && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(CAPTURAS_USUARIO|CAPTURAS_CLAVE)\s*=\s*(.*?)\s*$/.exec(line)
      if (!match) continue
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
      if (match[1] === 'CAPTURAS_USUARIO') user ||= value
      else password ||= value
    }
  }
  if (!user || !password) {
    fail('Faltan CAPTURAS_USUARIO y CAPTURAS_CLAVE (cuenta de demostración local). Ponlos en .env.capturas.')
  }
  return { user, password }
}

// ---------- Utilidades de página ----------

const pause = (ms) => new Promise((done) => setTimeout(done, ms))

let blockedProductionRequest = null

// Bloquea cualquier petición que no sea al servidor de desarrollo o al backend local.
async function guardContext(context) {
  await context.addInitScript(REDACTION_SCRIPT)
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return route.continue()
    const origin = new URL(url).origin
    if (allowedOrigins.has(origin)) return route.continue()
    blockedProductionRequest ??= url
    return route.abort()
  })
}

// Enmascara datos personales de la base local antes de cualquier captura: nombres,
// RUT, teléfonos, correos y direcciones se reemplazan por valores ficticios y
// obviamente falsos. Solo cambia lo que se ve en el navegador de captura (los
// campos nunca se guardan). Se reaplica a menudo porque React vuelve a pintar.
const REDACTION_SCRIPT = String.raw`(() => {
  const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g
  const PHONE = /(\+?56\s?)?9[\s-]?\d{4}[\s-]?\d{4}\b|\b\d{9}\b/g
  const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
  const NAME_SELECTORS = '.dashboard__name, .daily-agenda__patient span:not([class])'
  const FIELD_VALUES = { nombre: 'Paciente de ejemplo', direccion: 'Calle Ejemplo 123', telefono: '+56 9 0000 0000', email: 'paciente@ejemplo.cl' }
  const maskText = (text) => text.replace(RUT, 'XX.XXX.XXX-X').replace(EMAIL, 'paciente@ejemplo.cl').replace(PHONE, '+56 9 0000 0000')
  const setValue = (input, value) => {
    if (input.value === value) return
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
  }
  const run = () => {
    for (const el of document.querySelectorAll(NAME_SELECTORS)) {
      if (el.children.length === 0 && el.textContent !== 'Paciente de ejemplo') el.textContent = 'Paciente de ejemplo'
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const masked = maskText(node.nodeValue)
      if (masked !== node.nodeValue) node.nodeValue = masked
    }
    for (const input of document.querySelectorAll('input, textarea')) {
      if (input.type === 'password') continue
      if (FIELD_VALUES[input.name] !== undefined && input.value) setValue(input, FIELD_VALUES[input.name])
      else if (input.value) setValue(input, maskText(input.value))
    }
  }
  window.__redactar = run
  setInterval(run, 50)
  document.addEventListener('DOMContentLoaded', run)
})()`

function assertNoLeak() {
  if (blockedProductionRequest) {
    fail(
      `La app intentó conectarse a ${blockedProductionRequest}. Se bloqueó y se detuvo el script: ` +
        `el servidor de desarrollo debe usar VITE_API_URL=${API_ORIGIN}.`,
    )
  }
}

// Sin barras de scroll y sin cursor parpadeante en los campos.
async function prepare(page) {
  await page.addStyleTag({
    content: `
      html { scrollbar-width: none !important; }
      ::-webkit-scrollbar { display: none !important; }
      * { caret-color: transparent !important; }
    `,
  })
}

// Espera animaciones CSS finitas y un margen para las de Framer Motion.
async function settle(page, extra = 700) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming?.().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  ).catch(() => {})
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await pause(extra)
}

async function go(page, path) {
  await page.goto(`${WEB_ORIGIN}${path}`, { waitUntil: 'load' })
  await prepare(page)
  assertNoLeak()
}

async function login(page, credentials) {
  await go(page, '/login')
  await page.locator('input[name="username"]').fill(credentials.user)
  await page.locator('input[name="password"]').fill(credentials.password)
  await page.locator('button[type="submit"]').click()
  try {
    await page.waitForURL('**/dashboard**', { timeout: 15000 })
  } catch {
    assertNoLeak()
    const message = await page.locator('[role="alert"]').first().innerText({ timeout: 1000 }).catch(() => '(sin mensaje en pantalla)')
    fail(`No se pudo iniciar sesión en el panel local: «${message}». Revisa la cuenta de demostración en .env.capturas.`)
  }
  await waitForPanel(page)
}

async function waitForPanel(page) {
  await page.locator('.dashboard__tabs').waitFor({ timeout: 15000 })
  await page.locator('.earnings[aria-busy="false"]').waitFor({ timeout: 15000 }).catch(() => {})
  await page
    .waitForFunction(() => !/Cargando/i.test(document.body.innerText), null, { timeout: 15000 })
    .catch(() => {})
  assertNoLeak()
}

async function openTab(page, name) {
  await page.getByRole('tab', { name }).first().click()
  await waitForPanel(page)
  await scrollToTabs(page)
}

// Deja las pestañas arriba para que la captura muestre el contenido y no solo el encabezado.
async function scrollToTabs(page) {
  await page.evaluate(() => document.querySelector('.dashboard__tabs')?.scrollIntoView({ block: 'start' }))
}

// Abre la reserva y elige el primer día y la primera hora disponibles.
async function pickSlot(page, { frame, beforeTime } = {}) {
  await go(page, '/reservar')
  await page.locator('.booking-modal').waitFor()
  await settle(page)
  await frame?.(4)
  const day = page.locator('.slot-picker__day:not(.is-disabled):not(.is-closed):not(.is-empty)').first()
  await day.waitFor({ timeout: 15000 }).catch(() => fail('El backend local no tiene días disponibles para reservar.'))
  await day.click()
  const time = page.locator('.slot-picker__time:not([disabled])').first()
  await time.waitFor({ timeout: 15000 }).catch(() => fail('El backend local no tiene horas disponibles ese día.'))
  await settle(page, 500)
  await frame?.(4)
  await beforeTime?.()
  await time.click()
  await settle(page, 500)
  await frame?.(4)
}

// ---------- Capturas PNG ----------

// Última red de seguridad: si queda algo con forma de dato personal, no se guarda nada.
async function assertNoPersonalData(page, wait = 250) {
  if (wait) await pause(wait)
  await page.evaluate(() => window.__redactar?.())
  const found = await page.evaluate(() => {
    const text = document.body.innerText
    const values = [...document.querySelectorAll('input, textarea')]
      .filter((input) => input.type !== 'password')
      .map((input) => input.value)
      .join('\n')
    const names = [...document.querySelectorAll('.dashboard__name, .daily-agenda__patient span:not([class]), input[name="nombre"]')]
      .map((el) => el.value ?? el.textContent)
      .filter((name) => name && name !== 'Paciente de ejemplo')
    const all = `${text}\n${values}`
    const rutMatch = /[^\n]{0,30}\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/.exec(all)
    if (rutMatch) {
      const rut = /\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/
      const where = [...document.querySelectorAll('body *')]
        .filter((el) => rut.test(el.value ?? '') || [...el.childNodes].some((n) => n.nodeType === 3 && rut.test(n.nodeValue)))
        .map((el) => `${el.tagName.toLowerCase()}.${el.className || ''}[name=${el.name || ''}] type=${el.type || ''} ro=${el.readOnly ?? ''}`)
      return `un RUT (contexto: «${rutMatch[0].replace(/\d/g, '#')}»; elementos: ${where.join(' | ') || 'texto repartido entre nodos'})`
    }
    if (/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(all.replace(/paciente@ejemplo\.cl/g, ''))) return 'un correo'
    if (/(\+?56\s?)?9[\s-]?\d{4}[\s-]?\d{4}\b/.test(all.replace(/\+56 9 0000 0000/g, ''))) return 'un teléfono'
    if (names.length) return 'un nombre'
    return ''
  })
  if (found) fail(`Se detectó ${found} sin enmascarar en pantalla. No se guardó la captura.`)
}

async function shoot(page, file) {
  await settle(page)
  assertNoLeak()
  // Dos verificaciones separadas: la segunda confirma que ninguna carga tardía repintó un dato real.
  await assertNoPersonalData(page)
  await assertNoPersonalData(page)
  await page.evaluate(() => window.__redactar?.())
  await page.screenshot({ path: join(OUT_DIR, file) })
  console.log(`  ✔ ${file}`)
}

async function capturePublic(browser, prefix, device, storageState) {
  const context = await browser.newContext({ ...device, locale: 'es-CL', reducedMotion: 'no-preference', storageState })
  await guardContext(context)
  const page = await context.newPage()

  await go(page, '/')
  await shoot(page, `${prefix}-portada.png`)

  await page.locator('#servicios').scrollIntoViewIfNeeded()
  await page.evaluate(() => document.getElementById('servicios')?.scrollIntoView())
  await shoot(page, `${prefix}-servicios.png`)

  // La captura muestra el calendario con el selector de horas, antes de elegir una.
  await pickSlot(page, { beforeTime: () => shoot(page, `${prefix}-reserva.png`) })

  return { context, page }
}

async function capturePanel(page, prefix) {
  await go(page, '/dashboard?vista=agenda')
  await waitForPanel(page)
  await scrollToTabs(page)
  await shoot(page, `${prefix}-agenda.png`)

  const earnings = page.locator('.earnings')
  await page.evaluate(() => window.scrollTo(0, 0))
  await earnings.getByRole('button', { name: 'Mes' }).click().catch(() => {})
  await earnings.scrollIntoViewIfNeeded()
  await settle(page)
  await earnings.screenshot({ path: join(OUT_DIR, `${prefix}-ganancias.png`) })
  console.log(`  ✔ ${prefix}-ganancias.png`)

  await openTab(page, 'Todas las Citas')
  await shoot(page, `${prefix}-citas.png`)

  await openTab(page, 'Resumen')
  await shoot(page, `${prefix}-resumen.png`)

  await openTab(page, 'Vales')
  await shoot(page, `${prefix}-vales.png`)

  // Ficha clínica: desde la agenda de hoy, o desde la lista de citas si hoy no hay.
  await openTab(page, /Agenda de hoy|Hoy/)
  let recordButton = page.locator('.daily-agenda__action').first()
  if (!(await recordButton.count())) {
    await openTab(page, 'Todas las Citas')
    recordButton = page.getByRole('button', { name: /ficha/i }).first()
  }
  if (!(await recordButton.count())) fail('No hay ninguna cita en el backend local para abrir una ficha clínica.')
  await recordButton.click()
  await page.locator('[role="dialog"][aria-labelledby="clinical-modal-title"]').waitFor({ timeout: 15000 })
  await shoot(page, `${prefix}-ficha.png`)
}

// ---------- Recorrido en GIF ----------

// Reduce a la mitad exacta (1280 → 640) promediando bloques de 2×2.
function halve(png) {
  const width = png.width >> 1
  const height = png.height >> 1
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) sum += png.data[((y * 2 + dy) * png.width + x * 2 + dx) * 4 + c]
        }
        out[(y * width + x) * 4 + c] = sum >> 2
      }
    }
  }
  return { width, height, data: out }
}

async function recordTour(browser, storageState, credentials) {
  const context = await browser.newContext({
    viewport: { width: GIF_WIDTH * 2, height: 800 },
    deviceScaleFactor: 1,
    locale: 'es-CL',
    reducedMotion: 'no-preference',
    storageState: undefined,
  })
  await guardContext(context)
  const page = await context.newPage()
  const frames = []

  const frame = async (times = 1, wait = 220) => {
    for (let i = 0; i < times; i++) {
      await pause(wait)
      await assertNoPersonalData(page, 0)
      frames.push(halve(PNG.sync.read(await page.screenshot({ type: 'png' }))))
    }
  }

  // 1. Landing
  await go(page, '/')
  await settle(page)
  await frame(6)
  for (let i = 1; i <= 10; i++) {
    await page.evaluate((step) => window.scrollTo({ top: step * 320 }), i)
    await frame(1, 160)
  }
  // 2. Reserva
  await pickSlot(page, { frame })
  // 3. Panel (el usuario y la clave no se muestran: se escriben sin tomar cuadros)
  await go(page, '/login')
  await frame(3)
  await page.locator('input[name="username"]').fill(credentials.user)
  await page.locator('input[name="password"]').fill(credentials.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/dashboard**', { timeout: 15000 })
  await waitForPanel(page)
  await settle(page)
  await frame(12)
  await openTab(page, 'Todas las Citas')
  await frame(12)
  await openTab(page, 'Resumen')
  await frame(12)
  await openTab(page, 'Vales')
  await frame(12)
  await openTab(page, /Agenda de hoy|Hoy/)
  const recordButton = page.locator('.daily-agenda__action').first()
  if (await recordButton.count()) {
    await recordButton.click()
    await page.locator('[role="dialog"][aria-labelledby="clinical-modal-title"]').waitFor({ timeout: 15000 })
    await settle(page)
    await frame(12)
  }
  assertNoLeak()
  await context.close()
  return frames
}

function encodeGif(frames, file, { colors, delay }) {
  const encoder = GIFEncoder()
  for (const { width, height, data } of frames) {
    const palette = quantize(data, colors, { format: 'rgb565' })
    encoder.writeFrame(applyPalette(data, palette, 'rgb565'), width, height, { palette, delay })
  }
  encoder.finish()
  writeFileSync(file, encoder.bytes())
}

// Prueba combinaciones de menos a más compresión hasta caber en el límite.
function buildGif(frames, tmpFile) {
  const attempts = [
    { keepEvery: 1, colors: 128, lossy: 40 },
    { keepEvery: 1, colors: 96, lossy: 80 },
    { keepEvery: 2, colors: 96, lossy: 80 },
    { keepEvery: 2, colors: 64, lossy: 120 },
  ]
  for (const { keepEvery, colors, lossy } of attempts) {
    const subset = frames.filter((_, index) => index % keepEvery === 0)
    const rawFile = `${tmpFile}.raw.gif`
    encodeGif(subset, rawFile, { colors, delay: 120 * keepEvery })
    execFileSync(gifsicle, ['-O3', `--lossy=${lossy}`, `--colors=${colors}`, rawFile, '-o', tmpFile])
    rmSync(rawFile, { force: true })
    const size = statSync(tmpFile).size
    console.log(`  · ${subset.length} cuadros, ${colors} colores, lossy ${lossy}: ${(size / 1024 / 1024).toFixed(2)} MB`)
    if (size < GIF_LIMIT_BYTES) return true
  }
  return false
}

// ---------- Principal ----------

async function main() {
  const credentials = readCredentials()

  try {
    await fetch(WEB_ORIGIN)
  } catch {
    fail(`No hay servidor de desarrollo en ${WEB_ORIGIN}. Ejecuta "npm run dev" en otra terminal.`)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'podogest-capturas-'))
  const browser = await chromium.launch()

  try {
    // Un solo inicio de sesión; el resto de los contextos reutilizan la sesión.
    const loginContext = await browser.newContext({ ...DESKTOP, locale: 'es-CL' })
    await guardContext(loginContext)
    const loginPage = await loginContext.newPage()
    await login(loginPage, credentials)
    const storageState = await loginContext.storageState()
    await loginContext.close()

    for (const [prefix, device] of [['escritorio', DESKTOP], ['movil', MOBILE]]) {
      console.log(`\nCapturas de ${prefix}`)
      const { context, page } = await capturePublic(browser, prefix, device, storageState)
      await capturePanel(page, prefix)
      await context.close()
    }

    console.log('\nRecorrido en GIF')
    const frames = await recordTour(browser, storageState, credentials)
    const step = Math.max(1, Math.round(frames.length / GIF_TARGET_FRAMES))
    const sampled = frames.filter((_, index) => index % step === 0)
    console.log(`  ${frames.length} cuadros grabados, ${sampled.length} usados`)

    if (process.env.CAPTURAS_GUARDAR_CUADROS) {
      // Solo para revisar a mano que no haya datos reales: va a la carpeta temporal.
      sampled.forEach((cuadro, index) => {
        if (index % 10 !== 0 && index !== sampled.length - 1) return
        const png = new PNG({ width: cuadro.width, height: cuadro.height })
        png.data = Buffer.from(cuadro.data)
        writeFileSync(join(work, `cuadro-${String(index).padStart(3, '0')}.png`), PNG.sync.write(png))
      })
      console.log(`  Cuadros de revisión en ${work}`)
    }

    const tmpGif = join(work, 'recorrido.gif')
    if (buildGif(sampled, tmpGif)) {
      copyFileSync(tmpGif, join(OUT_DIR, 'recorrido.gif'))
      console.log('  ✔ recorrido.gif')
    } else {
      console.warn('  ⚠ No se logró un GIF menor a 3 MB: se conserva el recorrido.gif anterior, si había.')
    }
  } finally {
    await browser.close()
    if (!process.env.CAPTURAS_GUARDAR_CUADROS) rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error) => fail(error?.message ?? String(error)))
