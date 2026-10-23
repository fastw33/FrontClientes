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
})
const page = await context.newPage(),
  errors = [],
  reads = [],
  posts = [],
  checks = []
const stocks = Array.from({ length: 400 }, (_, index) => ({
  codigo_wms: 'CAJ' + String(index + 1).padStart(4, '0'),
  wms_lote_id: 'GEN_BULK',
  nombre: 'Producto ' + String(index + 1).padStart(3, '0'),
  unidad_medida: 'unidades',
  cantidad_actual: '2',
  referencia_cliente: 'EXT-' + index,
  referencia_wms: 'INT-' + index,
}))
let saved = null
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (url.origin !== 'http://localhost:5174') return route.abort()
  if (url.pathname.startsWith('/api/')) {
    let data
    if (url.pathname === '/api/auth/me')
      data = {
        usuario: {
          id: '1',
          username: 'cliente.prueba',
          perfil: 'SOLICITANTE',
          debe_cambiar_password: false,
        },
        cliente: { id: '3', nombre: 'Empresa de 400 productos' },
        sesion: { tipo: 'NORMAL' },
        terminos: { aceptado: true },
        habilitado_para_operar: true,
        csrf_token: 'csrf-fixture',
      }
    else if (url.pathname === '/api/inventario') {
      const page = Number(url.searchParams.get('page')),
        limit = Number(url.searchParams.get('limit')),
        search = (url.searchParams.get('buscar') || '').toLowerCase()
      assert.equal(limit, 25)
      assert.equal(url.searchParams.has('cliente_id'), false)
      reads.push({ page, limit, search })
      const found = stocks.filter((row) =>
        [row.nombre, row.codigo_wms, row.wms_lote_id, row.referencia_cliente].some((value) =>
          value.toLowerCase().includes(search),
        ),
      )
      data = {
        data: found.slice((page - 1) * limit, page * limit),
        total: found.length,
        page,
        limit,
      }
    } else if (url.pathname === '/api/operaciones' && request.method() === 'POST') {
      assert.equal(request.headers()['x-csrf-token'], 'csrf-fixture')
      const body = request.postDataJSON()
      posts.push(body)
      assert.equal(body.modalidad, 'RECOGIDA')
      assert.equal(body.direccion_entrega, null)
      assert.equal(body.detalles.length, 400)
      saved = {
        ...body,
        public_id: '22222222-2222-4222-8222-222222222222',
        estado: 'PENDIENTE',
        wms_alistamiento_id: 77,
        detalles: body.detalles.map((line) => ({
          ...stocks.find((stock) => stock.codigo_wms === line.codigo_wms),
          ...line,
        })),
      }
      data = saved
    } else if (url.pathname === '/api/operaciones') {
      const summary = saved
        ? (({ detalles, ...rest }) => ({ ...rest, total_productos: detalles.length }))(saved)
        : null
      data = {
        data: summary ? [summary] : [],
        total: summary ? 1 : 0,
        page: 1,
        limit: 25,
        anticipacion_minutos: 120,
        horario_operacion: { inicio: '08:00', fin: '17:00', zona_horaria: 'America/Bogota' },
      }
    } else if (url.pathname.startsWith('/api/operaciones/')) data = saved
    else throw new Error('Petición no simulada: ' + request.url())
    return route.fulfill({
      status: request.method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  }
  let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname))
  assert.ok(file === dist || file.startsWith(dist + path.sep))
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
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  checks.push({ name, violations: report.violations })
  assert.deepEqual(
    report.violations.map((row) => ({
      id: row.id,
      nodes: row.nodes.map((node) => node.failureSummary),
    })),
    [],
    name,
  )
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': desbordamiento',
  )
  await page.screenshot({
    path: path.join(output, 'picking-' + name + '.png'),
    fullPage: true,
    animations: 'disabled',
  })
}
try {
  await page.goto('http://localhost:5174/operaciones')
  await page.getByRole('button', { name: 'Agendar recogida', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Agendar recogida en bodega', exact: true })
  await dialog.getByText('Producto 001', { exact: true }).waitFor()
  assert.equal(await dialog.locator('.picking-table tbody tr').count(), 25)
  assert.equal(await dialog.getByLabel('Modalidad', { exact: true }).count(), 0)
  await dialog.getByLabel('Nombre de la operación').fill('Recogida completa de bodega')
  await check('inventory-400')
  await dialog.getByLabel('Ir a página de inventario').fill('16')
  await dialog.getByRole('button', { name: 'Ir', exact: true }).click()
  await dialog.getByText('Producto 400', { exact: true }).waitFor()
  await dialog
    .locator('tr')
    .filter({ hasText: 'Producto 400' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  await dialog.getByLabel('Ir a página de inventario').fill('1')
  await dialog.getByRole('button', { name: 'Ir', exact: true }).click()
  await dialog.getByText('Producto 001', { exact: true }).waitFor()
  await dialog
    .locator('tr')
    .filter({ hasText: 'Producto 001' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Seleccionados (2)', exact: true }).click()
  await dialog.getByLabel('Cantidad Producto 001 GEN_BULK').fill('1.25')
  await dialog.getByLabel('Cantidad Producto 400 GEN_BULK').fill('1.5')
  await dialog.getByRole('button', { name: 'Mi inventario', exact: true }).click()
  await dialog.getByLabel('Buscar mercancía', { exact: true }).fill('CAJ0250')
  await dialog.getByText('Producto 250', { exact: true }).waitFor()
  assert.equal(await dialog.locator('.picking-table tbody tr').count(), 1)
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Seleccionados (3)', exact: true }).click()
  assert.equal(await dialog.getByLabel('Cantidad Producto 001 GEN_BULK').inputValue(), '1.25')
  assert.equal(await dialog.getByLabel('Cantidad Producto 400 GEN_BULK').inputValue(), '1.5')
  await dialog.getByRole('button', { name: 'Quitar Producto 250 GEN_BULK', exact: true }).click()
  const checkpoint = reads.length
  await dialog.getByRole('button', { name: 'Recoger todo mi inventario', exact: true }).click()
  await dialog.getByRole('button', { name: 'Seleccionados (400)', exact: true }).waitFor()
  const bulkReads = reads.slice(checkpoint).filter((row) => !row.search)
  assert.deepEqual(
    bulkReads.map((row) => row.page),
    Array.from({ length: 16 }, (_, i) => i + 1),
  )
  assert.equal(await dialog.locator('.picking-table tbody tr').count(), 25)
  await dialog.getByLabel('Ir a página de seleccionados').fill('16')
  await dialog.getByRole('button', { name: 'Ir', exact: true }).click()
  await dialog.getByLabel('Cantidad Producto 400 GEN_BULK').fill('999')
  await dialog.getByLabel('Buscar seleccionados', { exact: true }).fill('CAJ0001')
  await dialog.getByRole('button', { name: 'Agendar y crear alistamiento', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Revisa la cantidad' }).waitFor()
  assert.equal(await dialog.getByLabel('Buscar seleccionados', { exact: true }).inputValue(), '')
  const last = dialog.getByLabel('Cantidad Producto 400 GEN_BULK')
  await last.waitFor()
  assert.equal(await last.getAttribute('aria-invalid'), 'true')
  await last.fill('1.5')
  const frame = await dialog.boundingBox(),
    heading = await dialog.locator('.modal-heading').boundingBox(),
    footer = await dialog.locator('.modal-fixed-footer').boundingBox()
  assert.ok(
    heading.y >= frame.y && footer.y + footer.height <= frame.y + frame.height,
    'Encabezado y envío visibles al editar el último producto',
  )
  await check('selected-400-page-16')
  await dialog.getByRole('button', { name: 'Agendar y crear alistamiento', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Detalle de operación', exact: true })
  await detail.getByText('#77', { exact: true }).waitFor()
  assert.equal(posts.length, 1)
  assert.equal(new Set(posts[0].detalles.map((row) => row.codigo_wms)).size, 400)
  assert.equal(posts[0].detalles.find((row) => row.codigo_wms === 'CAJ0400').cantidad, '1.5')
  assert.equal(await detail.locator('.picking-table tbody tr').count(), 25)
  assert.equal(
    await detail.getByRole('heading', { name: 'Mercancía solicitada', exact: true }).count(),
    1,
  )
  assert.equal(await detail.evaluate((element) => getComputedStyle(element).overflowY), 'hidden')
  assert.ok(
    await detail.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    'El diálogo no añade otro desplazamiento vertical',
  )
  assert.ok(
    await detail
      .locator('.picking-table-wrap')
      .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    'La tabla usa el desplazamiento del contenido, sin otro scroll vertical',
  )
  await check('detail-400')
  await detail.getByLabel('Buscar en el alistamiento', { exact: true }).fill('CAJ0400')
  await detail.getByText('Producto 400', { exact: true }).waitFor()
  assert.equal(await detail.locator('.picking-table tbody tr').count(), 1)
  await detail.getByLabel('Buscar en el alistamiento', { exact: true }).fill('')
  await page.setViewportSize({ width: 390, height: 844 })
  await detail
    .getByRole('heading', { name: 'Mercancía solicitada', exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }))
  assert.equal(await detail.locator('.picking-table tbody tr').count(), 25)
  assert.equal(
    await detail.getByRole('heading', { name: 'Mercancía solicitada', exact: true }).count(),
    1,
  )
  assert.ok(await detail.evaluate((element) => element.scrollHeight <= element.clientHeight + 1))
  await check('detail-400-mobile')
  await detail.getByRole('button', { name: 'Cerrar ventana' }).click()
  await page.getByText('400 productos', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Agendar recogida', exact: true }).click()
  await dialog.getByText('Producto 001', { exact: true }).waitFor()
  await check('mobile-inventory-400')
  await page.setViewportSize({ width: 320, height: 740 })
  await check('small-mobile-inventory-400')
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  console.log(
    JSON.stringify({
      result: 'OK',
      products: 400,
      inventoryPages: 16,
      renderedRows: 25,
      posts: posts.length,
      checks: checks.length,
      errors,
      realRequests: 0,
    }),
  )
} finally {
  await fs.writeFile(path.join(output, 'picking-a11y.json'), JSON.stringify(checks, null, 2))
  await browser.close()
}
