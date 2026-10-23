import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'

// Navegador aislado: todos los recursos y respuestas se interceptan. No inicia servidores.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const output = path.join(root, '.runtime')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'es-CO',
})
const page = await context.newPage()
const errors = []
const accessibility = []
const mutations = []
let phase = 'anonymous',
  published = false,
  changedOnce = false,
  version = 'prueba-1',
  revoked = false
const csrf = 'csrf-exclusivo-de-pruebas'
const document = () => ({
  version,
  titulo: 'Condiciones para la prueba local',
  contenido:
    'Documento ficticio para probar la interfaz.\n\nLos datos se usan para atender la operación del cliente.\n\n<script>window.noDebeEjecutarse=true</script>',
  contenido_sha256: (version === 'prueba-1' ? 'a' : 'b').repeat(64),
  publicado_at: '2026-10-19T14:00:00Z',
})
const terms = () => ({
  disponible: published,
  requerida: phase !== 'home',
  version: published ? version : null,
  aceptado: phase === 'home',
  aceptado_at: phase === 'home' ? '2026-10-19T15:00:00Z' : null,
})
const session = () => ({
  usuario: {
    id: '12',
    cliente_id: '3',
    username: 'cliente.fastway',
    correo: 'cliente@pruebas.invalid',
    perfil: 'SOLICITANTE',
    estado: 'ACTIVO',
    debe_cambiar_password: phase === 'password',
  },
  cliente: { id: '3', nombre: 'Empresa de prueba' },
  sesion: {
    id: '20',
    tipo: phase === 'password' ? 'PROVISIONAL' : 'NORMAL',
    expira_at: '2099-10-19T20:00:00Z',
  },
  dispositivo: { id: '8', nombre: 'Edge · Windows' },
  csrf_token: csrf,
  terminos: terms(),
  habilitado_para_operar: phase === 'home',
})
page.on('pageerror', (error) => errors.push(error.message))

await page.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.origin !== 'http://localhost:5174') {
    await route.abort()
    return
  }
  if (url.pathname.startsWith('/api/')) {
    const endpoint = url.pathname.slice(4)
    const method = request.method()
    let status = 200,
      body = {},
      headers = {}
    if (method !== 'GET')
      mutations.push({ endpoint, method, headers: request.headers(), body: request.postDataJSON() })
    if (endpoint === '/auth/me') {
      if (phase === 'anonymous') {
        status = 401
        body = { error: { code: 'SESION_REQUERIDA', message: 'Inicia sesión.' } }
      } else body = session()
    } else if (endpoint === '/auth/login') {
      assert.equal(request.postDataJSON().password, 'TemporalPrueba123!')
      phase = 'password'
      body = session()
      headers = {
        'Set-Cookie': 'fw_test_session=fixture-sin-valor-real; HttpOnly; SameSite=Lax; Path=/',
      }
    } else if (endpoint === '/auth/password') {
      assert.equal(request.headers()['x-csrf-token'], csrf)
      assert.equal(request.postDataJSON().password_nueva, 'Contraseña🌿Segura123!')
      if (request.postDataJSON().password_actual !== 'TemporalPrueba123!') {
        status = 401
        body = {
          error: {
            code: 'PASSWORD_ACTUAL_INVALIDA',
            message: 'La contraseña actual no es válida.',
          },
        }
      } else {
        phase = 'terms'
        body = session()
      }
    } else if (endpoint === '/auth/terminos')
      body = { ...terms(), documento: published ? document() : null }
    else if (endpoint === '/terminos')
      body = { disponible: published, documento: published ? document() : null }
    else if (endpoint === '/auth/terminos/aceptacion') {
      assert.equal(request.headers()['x-csrf-token'], csrf)
      assert.deepEqual(Object.keys(request.postDataJSON()).sort(), [
        'acepto',
        'autoriza_tratamiento_datos',
        'contenido_sha256',
        'version',
      ])
      if (!changedOnce) {
        changedOnce = true
        version = 'prueba-2'
        status = 409
        body = { error: { code: 'TERMINOS_CAMBIARON', message: 'Cambió el documento.' } }
      } else {
        assert.equal(request.postDataJSON().version, version)
        phase = 'home'
        body = terms()
      }
    } else if (endpoint === '/auth/sesiones')
      body = {
        data: [
          {
            id: '20',
            actual: true,
            nombre_dispositivo: 'Edge · Windows',
            navegador: 'Windows',
            ip_inicio: '192.0.2.10',
            ultimo_uso_at: '2026-10-19T15:00:00Z',
            expira_at: '2026-10-19T20:00:00Z',
          },
          ...(!revoked
            ? [
                {
                  id: '21',
                  actual: false,
                  nombre_dispositivo: 'Chrome · Android',
                  navegador: 'Android',
                  ip_inicio: '192.0.2.11',
                  ultimo_uso_at: '2026-10-19T14:00:00Z',
                  expira_at: '2026-10-19T20:00:00Z',
                },
              ]
            : []),
        ],
      }
    else if (endpoint === '/auth/sesiones/21' && method === 'DELETE') {
      assert.equal(request.headers()['x-csrf-token'], csrf)
      revoked = true
      status = 204
    } else if (endpoint === '/auth/logout') {
      assert.equal(request.headers()['x-csrf-token'], csrf)
      phase = 'anonymous'
      status = 204
      headers = { 'Set-Cookie': 'fw_test_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/' }
    } else {
      status = 404
      body = { error: { code: 'NO_EXISTE', message: 'Ruta de prueba no contemplada.' } }
    }
    await route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      ...(status === 204 ? {} : { body: JSON.stringify(body) }),
    })
    return
  }
  const pathname = decodeURIComponent(url.pathname)
  const candidate = path.resolve(dist, '.' + pathname)
  if (candidate !== dist && !candidate.startsWith(dist + path.sep)) {
    await route.abort()
    return
  }
  let file = candidate
  try {
    if (!(await fs.stat(file)).isFile()) file = path.join(dist, 'index.html')
  } catch {
    file = path.join(dist, 'index.html')
  }
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.otf': 'font/otf',
    '.svg': 'image/svg+xml',
  }
  await route.fulfill({
    status: 200,
    contentType: types[path.extname(file)] || 'application/octet-stream',
    body: await fs.readFile(file),
  })
})

async function noOverflow() {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'La página tiene desbordamiento horizontal',
  )
}
async function loginFits(viewport) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('.login-screen .public-main').getBoundingClientRect()
    const blocks = ['.login-card', '.login-invitation', '.story-services'].map((selector) => {
      const element = document.querySelector(selector)
      const rect = element.getBoundingClientRect()
      return {
        selector,
        shown: element.getClientRects().length > 0,
        top: rect.top,
        bottom: rect.bottom,
      }
    })
    return {
      height: document.documentElement.scrollHeight,
      viewport: innerHeight,
      mainTop: main.top,
      mainBottom: main.bottom,
      blocks,
    }
  })
  assert.ok(
    geometry.height <= geometry.viewport + 1,
    `El acceso debe caber sin scroll en ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`,
  )
  assert.ok(
    geometry.blocks.every(
      (block) =>
        !block.shown ||
        (block.top >= geometry.mainTop - 1 && block.bottom <= geometry.mainBottom + 1),
    ),
    `Los bloques no deben solaparse con la cabecera o el pie: ${JSON.stringify(geometry)}`,
  )
}
async function screenshot(name) {
  if (await page.locator('.login-screen .warehouse-visual').isVisible()) {
    await page.waitForFunction(() => {
      const image = document.querySelector('.login-screen .warehouse-visual img')
      return image.complete && image.naturalWidth > 1
    })
  }
  await page
    .locator('img:visible')
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => {}))))
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
    document.activeElement?.blur()
    window.scrollTo(0, 0)
  })
  await noOverflow()
  await page.screenshot({ path: path.join(output, name), fullPage: true })
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  await fs.writeFile(
    path.join(output, name.replace('.png', '-a11y.json')),
    JSON.stringify(report.violations, null, 2),
  )
  accessibility.push(
    ...report.violations.map((item) => ({
      screen: name,
      id: item.id,
      nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  )
}

const phoneSizes = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
]
async function responsiveViews(screen, sizes = phoneSizes) {
  for (const viewport of sizes) {
    await page.setViewportSize(viewport)
    await screenshot(`${screen}-${viewport.width}x${viewport.height}.png`)
    if (screen === 'login') {
      await loginFits(viewport)
    }
    const inputs = await page.locator('input:not([type="checkbox"])').evaluateAll((elements) =>
      elements.map((element) => ({
        font: parseFloat(getComputedStyle(element).fontSize),
        height: element.getBoundingClientRect().height,
      })),
    )
    assert.ok(
      inputs.every(({ font, height }) => font >= 16 && height >= 44),
      'Los campos deben ser legibles y táctiles, sin zoom automático en iOS',
    )
  }
}

try {
  await page.goto('http://localhost:5174')
  await page.getByRole('heading', { name: 'Te damos la bienvenida.' }).waitFor()
  await page.locator('.door-entrance').waitFor()
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause()
      animation.currentTime = 650
    }
  })
  await page.screenshot({ path: path.join(output, 'entrada-puertas.png') })
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.currentTime = 1800
  })
  await page.locator('.entrance-sign img').evaluate((image) => image.decode())
  await page.screenshot({ path: path.join(output, 'entrada-marca-interior.png') })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.screenshot({ path: path.join(output, 'entrada-marca-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.play()
  })
  await screenshot('login-desktop.png')
  await page.locator('.door-entrance').waitFor({ state: 'detached' })
  await loginFits({ width: 1440, height: 1000 })
  for (const viewport of [
    { width: 1920, height: 900 },
    { width: 1536, height: 864 },
    { width: 1366, height: 650 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await screenshot(`login-${viewport.width}x${viewport.height}.png`)
    await loginFits(viewport)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '¿Necesitas ayuda?' }).click()
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('login-mobile.png')
  const alpha = await page.locator('.public-header .brand img').evaluate(async (image) => {
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let transparent = 0,
      opaque = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparent++
      if (pixels[i] >= 128) opaque++
    }
    return { corner: pixels[3], transparent, opaque, total: pixels.length / 4 }
  })
  assert.equal(alpha.corner, 0, 'El PNG debe tener transparencia real')
  assert.ok(alpha.transparent / alpha.total > 0.5 && alpha.opaque > 10000, JSON.stringify(alpha))
  await responsiveViews('login')
  await responsiveViews('login', [
    { width: 320, height: 640 },
    { width: 375, height: 667 },
    { width: 360, height: 700 },
    { width: 390, height: 740 },
    { width: 1024, height: 768 },
  ])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Usuario', { exact: true }).fill('cliente.fastway')
  await page.getByLabel('Contraseña', { exact: true }).fill('TemporalPrueba123!')
  await page.getByRole('button', { name: 'Ingresar a mi portal' }).click()
  await page.getByRole('heading', { name: 'Haz tuya la contraseña.' }).waitFor()
  await page.goto('http://localhost:5174/inicio')
  await page.getByRole('heading', { name: 'Haz tuya la contraseña.' }).waitFor()
  await screenshot('password-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('password-mobile.png')
  await responsiveViews('password', [phoneSizes[0], phoneSizes[3]])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Contraseña temporal', { exact: true }).fill('ContraseñaEquivocada')
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('Contraseña🌿Segura123!')
  await page
    .getByLabel('Confirma tu nueva contraseña', { exact: true })
    .fill('Contraseña🌿Segura123!')
  await page.getByRole('button', { name: 'Guardar y continuar' }).click()
  await page.getByRole('alert').filter({ hasText: 'La contraseña actual no es válida.' }).waitFor()
  assert.ok(
    page.url().endsWith('/primer-ingreso'),
    'Una contraseña actual incorrecta no debe cerrar la sesión',
  )
  await page.getByLabel('Contraseña temporal', { exact: true }).fill('TemporalPrueba123!')
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('Contraseña🌿Segura123!')
  await page
    .getByLabel('Confirma tu nueva contraseña', { exact: true })
    .fill('Contraseña🌿Segura123!')
  await page.getByRole('button', { name: 'Guardar y continuar' }).click()
  await page.getByRole('heading', { name: 'Estamos preparando las condiciones' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Aceptar y entrar' }).isDisabled(), true)
  published = true
  await page.getByRole('button', { name: 'Consultar nuevamente' }).click()
  await page.getByRole('heading', { name: 'Condiciones para la prueba local' }).waitFor()
  await screenshot('terms-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('terms-mobile.png')
  await responsiveViews('terms', [phoneSizes[0], phoneSizes[3]])
  await page.setViewportSize({ width: 1440, height: 1000 })
  assert.equal(await page.evaluate(() => window.noDebeEjecutarse), undefined)
  await page.getByRole('checkbox').nth(0).check()
  assert.equal(await page.getByRole('button', { name: 'Aceptar y entrar' }).isDisabled(), true)
  await page.getByRole('checkbox').nth(1).check()
  await page.getByRole('button', { name: 'Aceptar y entrar' }).click()
  await page.getByRole('alert').filter({ hasText: 'El documento se actualizó' }).waitFor()
  assert.equal(await page.getByRole('checkbox').nth(0).isChecked(), false)
  assert.equal(await page.getByRole('checkbox').nth(1).isChecked(), false)
  await page.getByRole('checkbox').nth(0).check()
  await page.getByRole('checkbox').nth(1).check()
  await page.getByRole('button', { name: 'Aceptar y entrar' }).click()
  await page.getByRole('heading', { name: 'Hola, cliente.fastway.' }).waitFor()
  await screenshot('home-desktop.png')
  await page.getByRole('link', { name: 'Mi cuenta y seguridad' }).click()
  await page.getByRole('heading', { name: /Sesiones activas/ }).waitFor()
  await page.getByRole('button', { name: 'Cerrar sesión de Chrome · Android' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByRole('status').filter({ hasText: 'La sesión seleccionada' }).waitFor()
  assert.equal(await page.getByText('Chrome · Android', { exact: true }).count(), 0)
  await screenshot('security-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('security-mobile.png')
  await responsiveViews('security', [phoneSizes[0], phoneSizes[3]])
  await page.setViewportSize({ width: 320, height: 568 })
  const quickNavigation = page.getByRole('navigation', { name: 'Accesos rápidos', exact: true })
  await quickNavigation.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click()
  assert.equal(
    await quickNavigation
      .getByRole('button', { name: 'Menú', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  )
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  assert.equal(await page.locator('.portal-main').evaluate((element) => element.inert), true)
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
  await screenshot('menu-mobile-320.png')
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  assert.equal(
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  )
  await page.keyboard.press('Tab')
  assert.equal(
    await page
      .locator('#portal-sidebar')
      .evaluate((element) => element.contains(document.activeElement)),
    true,
  )
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.portal-main').evaluate((element) => element.inert), false)
  assert.equal(
    await page
      .getByRole('button', { name: 'Abrir menú' })
      .evaluate((element) => element === document.activeElement),
    true,
  )
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page
    .getByRole('navigation', { name: 'Navegación principal', exact: true })
    .getByRole('link', { name: 'Inicio', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Hola, cliente.fastway.' }).waitFor()
  await screenshot('home-mobile.png')
  assert.equal(
    await quickNavigation
      .getByRole('link', { name: 'Inicio', exact: true })
      .getAttribute('aria-current'),
    'page',
  )
  await quickNavigation.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('link', { name: 'Mi cuenta y seguridad', exact: true }).click()
  await page.getByRole('heading', { name: /Sesiones activas/ }).waitFor()
  await quickNavigation.getByRole('link', { name: 'Inicio', exact: true }).click()
  await page.getByRole('heading', { name: 'Hola, cliente.fastway.' }).waitFor()
  await responsiveViews('home')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await screenshot('menu-landscape.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForFunction(() => !document.querySelector('.portal-main').inert)
  assert.equal(await quickNavigation.isVisible(), false)
  assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByRole('heading', { name: 'Te damos la bienvenida.' }).waitFor()
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.getByRole('heading', { name: 'Te damos la bienvenida.' }).waitFor()
  assert.equal(await page.locator('.door-entrance').count(), 0)
  await screenshot('login-reduced-motion.png')
  assert.ok(mutations.length >= 5)
  assert.deepEqual(errors, [])
  assert.deepEqual(accessibility, [], 'Accesibilidad WCAG AA de las pantallas revisadas')
  console.log(
    'UI verificada sin servidores: acceso, redirecciones, contraseña, términos, nueva versión, CSRF, sesiones y cierre. Vistas de escritorio y móvil guardadas en .runtime.',
  )
} finally {
  await browser.close()
}
