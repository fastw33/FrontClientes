import { chromium } from '@playwright/test'
import { assertMobileTables } from './mobile-layout.mjs'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  dist = path.join(root, 'dist'),
  output = path.join(root, '.runtime')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'es-CO',
  timezoneId: 'Europe/Madrid',
})
const page = await context.newPage(),
  errors = [],
  checks = [],
  mutations = []
await page.clock.setFixedTime(new Date('2026-10-20T16:50:00-05:00'))
let role = 'SOLICITANTE',
  first = true,
  operation = null,
  stage = 'PENDIENTE',
  wmsId = null
let otherOperation = null,
  delayedDetail = null,
  wrongDetail = false
const stock = {
  codigo_wms: 'YUT001',
  wms_lote_id: 'GEN_001',
  nombre: 'Yute medias rosadas',
  unidad_medida: 'unidades',
  cantidad_actual: '8.5',
}
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    method = request.method()
  if (url.origin !== 'http://localhost:5174') return route.abort()
  if (url.pathname.startsWith('/api/')) {
    let data = {},
      status = 200
    if (method !== 'GET') {
      assert.equal(request.headers()['x-csrf-token'], 'csrf-fixture')
      mutations.push({ path: url.pathname, body: request.postDataJSON() })
    }
    if (url.pathname === '/api/auth/me')
      data = {
        usuario: {
          id: '1',
          username: 'cliente.prueba',
          perfil: role,
          debe_cambiar_password: false,
        },
        cliente: { id: '3', nombre: 'Empresa de prueba' },
        sesion: { tipo: 'NORMAL' },
        terminos: { aceptado: true, version: '1.0' },
        habilitado_para_operar: true,
        csrf_token: 'csrf-fixture',
      }
    else if (url.pathname === '/api/inventario') {
      assert.equal(url.searchParams.has('cliente_id'), false)
      data = { data: [stock], total: 1, page: 1, limit: 25 }
    } else if (url.pathname === '/api/operaciones' && method === 'GET')
      data = {
        data: operation
          ? [
              { ...operation, estado: stage, wms_alistamiento_id: wmsId },
              ...(otherOperation ? [otherOperation] : []),
            ]
          : [],
        total: operation ? (otherOperation ? 2 : 1) : 0,
        page: 1,
        limit: 25,
        anticipacion_minutos: 300,
        horario_operacion: { inicio: '08:00', fin: '17:00', zona_horaria: 'America/Bogota' },
      }
    else if (url.pathname === '/api/operaciones' && method === 'POST') {
      const body = request.postDataJSON()
      assert.equal(Object.hasOwn(body, 'cliente_id'), false)
      assert.match(body.fecha_programada_at, /-05:00$/)
      if (first) {
        first = false
        status = 503
        data = { error: { code: 'OFFLINE', message: 'Fallo simulado' } }
      } else {
        operation = {
          ...body,
          public_id: '11111111-1111-4111-8111-111111111111',
          detalles: [{ ...stock, ...body.detalles[0] }],
          estado: 'PENDIENTE_WMS',
          wms_alistamiento_id: null,
          permite_cambios: true,
          integracion_error: 'Guardada, pendiente de Genika.',
        }
        stage = 'PENDIENTE_WMS'
        data = operation
        status = 201
      }
    } else if (url.pathname.endsWith('/confirmar')) {
      wmsId = 17
      stage = 'PENDIENTE'
      operation = {
        ...operation,
        integracion_error: null,
        wms_alistamiento_id: wmsId,
        estado: stage,
      }
      data = operation
    } else if (url.pathname.endsWith('/cambios') && method === 'POST') {
      const input = request.postDataJSON()
      assert.equal(Object.hasOwn(input, 'cliente_id'), false)
      const row = {
        ...input,
        public_id: 'change-fixture',
        estado: 'SOLICITADO',
        creado_at: new Date().toISOString(),
      }
      operation = { ...operation, cambio_pendiente: true, total_cambios: 1, cambios: [row] }
      data = { ...operation, estado: stage, wms_alistamiento_id: wmsId }
      status = 201
    } else if (url.pathname.startsWith('/api/operaciones/')) {
      data = url.pathname.endsWith(otherOperation?.public_id)
        ? otherOperation
        : { ...operation, estado: stage, wms_alistamiento_id: wmsId }
      if (wrongDetail) {
        data = otherOperation
        wrongDetail = false
      }
      if (delayedDetail) {
        const delayed = delayedDetail
        delayedDetail = null
        delayed.started()
        await delayed.wait
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
        delayed.finished()
        return
      }
    } else throw new Error('Petición inesperada: ' + url.pathname)
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  }
  let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname))
  if (!file.startsWith(dist + path.sep) && file !== dist) return route.abort()
  try {
    if (!(await fs.stat(file)).isFile()) file = path.join(dist, 'index.html')
  } catch {
    file = path.join(dist, 'index.html')
  }
  const types = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.otf': 'font/otf',
  }
  return route.fulfill({
    contentType: types[path.extname(file)] || 'application/octet-stream',
    body: await fs.readFile(file),
  })
})
async function check(name) {
  await assertMobileTables(page)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect.getTiming().iterations))
        .map((a) => a.finished.catch(() => {})),
    ),
  )
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': desbordamiento',
  )
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  checks.push({ name, violations: report.violations })
  assert.deepEqual(
    report.violations.map((row) => ({ id: row.id, nodes: row.nodes.map((n) => n.failureSummary) })),
    [],
    name,
  )
  await page.screenshot({ path: path.join(output, 'scheduled-' + name + '.png'), fullPage: true })
}
try {
  await page.goto('http://localhost:5174/operaciones')
  await page
    .getByRole('button', { name: 'Agendar recogida', exact: true })
    .waitFor({ state: 'visible' })
  await check('desktop-empty')
  await page.getByRole('button', { name: 'Agendar recogida', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Agendar recogida en bodega', exact: true })
  await dialog.getByLabel('Fecha de llegada', { exact: true }).waitFor()
  assert.equal(await dialog.getByText('5 horas de anticipación', { exact: true }).count(), 0)
  const date = dialog.getByLabel('Fecha de llegada', { exact: true })
  const hour = dialog.getByRole('combobox', { name: 'Hora de llegada', exact: true })
  assert.equal(await date.getAttribute('min'), '2026-10-21')
  assert.equal(await date.inputValue(), '2026-10-21')
  assert.match(await hour.inputValue(), /^8:00/)
  await hour.click()
  await check('desktop-time-picker')
  await hour.fill('17')
  assert.equal(await dialog.getByRole('option').count(), 1)
  await hour.press('Enter')
  assert.match(await hour.inputValue(), /^5:00/)
  await hour.click()
  await hour.fill('07:59')
  await dialog.getByText('No hay horas disponibles para esa búsqueda.', { exact: true }).waitFor()
  await hour.press('Escape')
  assert.equal(await dialog.getByRole('listbox').count(), 0)
  await hour.click()
  await hour.fill('8:07')
  await hour.press('ArrowDown')
  await hour.press('Enter')
  assert.match(await hour.inputValue(), /^8:07/)
  await hour.click()
  await dialog.getByRole('listbox', { name: 'Horas disponibles' }).waitFor()
  await dialog.getByRole('option', { name: /^8:15/ }).click()
  assert.match(await hour.inputValue(), /^8:15/)
  await date.fill('2026-10-20')
  await dialog.getByText('No quedan horas disponibles para esta fecha.', { exact: false }).waitFor()
  assert.ok(await hour.isDisabled())
  await date.fill('2026-10-21')
  assert.match(await hour.inputValue(), /^8:00/)
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click()
  await dialog.getByLabel('Nombre de la operación').fill('Recogida del pedido 1024')
  await dialog.getByRole('button', { name: 'Seleccionados (1)', exact: true }).click()
  await dialog.getByLabel('Cantidad Yute medias rosadas GEN_001').fill('2.5')
  await check('desktop-create')
  await dialog
    .locator('.schedule-arrival')
    .screenshot({ path: path.join(output, 'arrival-time-preview.png') })
  await dialog.getByRole('button', { name: 'Agendar y crear alistamiento' }).click()
  await dialog.getByText('Conservamos tu envío.', { exact: false }).waitFor()
  await dialog.getByRole('button', { name: 'Verificar envío', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Detalle de operación', exact: true })
  await detail.getByRole('button', { name: 'Verificar envío a Genika' }).waitFor()
  assert.equal(mutations[0].body.request_id, mutations[1].body.request_id)
  assert.deepEqual(mutations[0].body, mutations[1].body)
  await check('pending-integration')
  await detail.getByRole('button', { name: 'Verificar envío a Genika' }).click()
  await detail.getByText('#17', { exact: true }).waitFor()
  await check('created-detail')
  await detail.getByRole('button', { name: 'Solicitar otra fecha', exact: true }).click()
  const changeForm = detail.locator('.operation-change-form')
  await changeForm.getByLabel('Fecha de recogida', { exact: true }).fill('2026-10-22')
  await changeForm.getByLabel('Motivo del cambio').fill('Necesito otro vehículo')
  await check('change-date-desktop')
  await page.setViewportSize({ width: 320, height: 740 })
  await changeForm.scrollIntoViewIfNeeded()
  await check('change-date-mobile')
  await changeForm.getByRole('button', { name: 'Enviar para revisión' }).click()
  await detail.getByText('Tienes un cambio pendiente de revisión.', { exact: false }).waitFor()
  assert.equal(mutations.at(-1).body.tipo, 'REPROGRAMAR')
  assert.match(mutations.at(-1).body.datos.fecha_programada_at, /^2026-10-22T08:00:00-05:00$/)
  assert.equal(
    await detail.getByRole('button', { name: 'Solicitar cancelación', exact: true }).count(),
    0,
  )
  await check('change-pending-mobile')
  operation = {
    ...operation,
    cambio_pendiente: false,
    cambios: operation.cambios.map((row) => ({
      ...row,
      estado: 'RECHAZADO',
      motivo_decision: 'Contacta a bodega',
    })),
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detail.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await detail.getByText('Historial de cambios · 1', { exact: true }).click()
  await detail.getByText('Respuesta Fastway: Contacta a bodega', { exact: true }).waitFor()
  await detail.getByRole('button', { name: 'Corregir datos', exact: true }).click()
  await detail.getByLabel('Nombre de la operación', { exact: true }).fill('Nombre corregido')
  await check('correction-form')
  await detail.getByRole('button', { name: 'Volver', exact: true }).click()
  await detail.getByRole('button', { name: 'Solicitar cancelación', exact: true }).click()
  await detail.getByLabel('Motivo del cambio').fill('No enviaremos vehículo')
  await detail.getByRole('button', { name: 'Enviar para revisión', exact: true }).click()
  await detail.getByText('Tienes un cambio pendiente de revisión.', { exact: false }).waitFor()
  assert.equal(mutations.at(-1).body.tipo, 'CANCELAR')
  assert.deepEqual(mutations.at(-1).body.datos, {})
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  stage = 'EN_PREPARACION'
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByText('En preparación', { exact: true }).waitFor()
  await check('desktop-list')
  await page.setViewportSize({ width: 390, height: 844 })
  await check('mobile-list')
  await page.getByRole('button', { name: 'Agendar recogida', exact: true }).click()
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).waitFor()
  await check('mobile-create')
  await page.setViewportSize({ width: 320, height: 740 })
  await hour.click()
  await check('small-mobile-time-picker')
  await hour.press('Escape')
  await check('small-mobile-create')
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click()
  role = 'CONSULTA'
  await page.reload()
  await page.getByRole('heading', { name: 'Mis operaciones', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Agendar recogida', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await detail.getByText('En preparación', { exact: true }).waitFor()
  assert.equal(await detail.getByRole('button', { name: 'Verificar envío a Genika' }).count(), 0)
  assert.equal(
    await detail.getByRole('button', { name: 'Solicitar cancelación', exact: true }).count(),
    0,
  )
  await check('read-only-detail')
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  otherOperation = {
    ...operation,
    public_id: '22222222-2222-4222-8222-222222222222',
    nombre: 'Recogida diferente',
    wms_alistamiento_id: 18,
    estado: 'PENDIENTE',
    detalles: [
      { ...stock, codigo_wms: 'YUT002', nombre: 'Producto de otra operación', cantidad: '1' },
    ],
  }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByText('Recogida diferente', { exact: true }).waitFor()
  let release, started, finished
  const arrived = new Promise((resolve) => {
    started = resolve
  })
  const completed = new Promise((resolve) => {
    finished = resolve
  })
  delayedDetail = {
    started,
    finished,
    wait: new Promise((resolve) => {
      release = resolve
    }),
  }
  const firstRow = page.getByRole('row').filter({ hasText: operation.nombre })
  const otherRow = page.getByRole('row').filter({ hasText: 'Recogida diferente' })
  await firstRow.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await arrived
  await detail.getByText('Consultando la operación…', { exact: true }).waitFor()
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  await otherRow.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await detail.getByRole('heading', { name: 'Recogida diferente', exact: true }).waitFor()
  release()
  await completed
  for (let index = 0; index < 3; index++) {
    await detail.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await detail
      .getByRole('button', { name: 'Actualizar', exact: true })
      .isEnabled()
      .then(async (enabled) => {
        if (!enabled)
          await page.waitForFunction(
            () =>
              !document.querySelector('.schedule-detail-modal .modal-fixed-footer button').disabled,
          )
      })
    assert.equal(
      await detail.getByRole('heading', { name: 'Mercancía solicitada', exact: true }).count(),
      1,
    )
    assert.equal(
      await detail.getByRole('heading', { name: 'Recogida diferente', exact: true }).count(),
      1,
    )
    assert.equal(await detail.getByText('Producto de otra operación', { exact: true }).count(), 1)
    assert.equal(await detail.getByText(operation.nombre, { exact: true }).count(), 0)
  }
  assert.equal(await detail.evaluate((element) => getComputedStyle(element).overflowY), 'hidden')
  await check('stable-detail-after-late-response')
  await detail.getByLabel('Buscar en el alistamiento', { exact: true }).fill('SIN COINCIDENCIAS')
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  await otherRow.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await detail.getByText('Producto de otra operación', { exact: true }).waitFor()
  assert.equal(
    await detail.getByLabel('Buscar en el alistamiento', { exact: true }).inputValue(),
    '',
  )
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  wrongDetail = true
  await firstRow.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await detail.getByRole('alert').filter({ hasText: 'La respuesta no corresponde' }).waitFor()
  assert.equal(await detail.getByText('Producto de otra operación', { exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  console.log(
    JSON.stringify({
      checks: checks.length,
      mutations: mutations.length,
      errors,
      result: 'OK: API simulada, sin servidores ni datos reales',
    }),
  )
} finally {
  if (!checks.length)
    console.log(
      JSON.stringify({ url: page.url(), body: await page.locator('body').innerText(), errors }),
    )
  await fs.writeFile(path.join(output, 'scheduled-a11y.json'), JSON.stringify(checks, null, 2))
  await browser.close()
}
