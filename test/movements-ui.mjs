import { chromium } from '@playwright/test'
import { assertMobileTables } from './mobile-layout.mjs'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist'),
  output = path.join(root, '.runtime')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'es-CO',
  timezoneId: 'Asia/Tokyo',
})
const page = await context.newPage(),
  errors = [],
  reads = [],
  unexpected = [],
  checks = []
let unavailable = false,
  empty = false,
  profile = 'SOLICITANTE'
const rows = Array.from({ length: 60 }, (_, index) => ({
  id: String(60 - index),
  tipo: index % 2 ? 'ENTRADA' : 'SALIDA',
  fecha: '2026-10-20T05:00:00.000Z',
  codigo_wms: 'CAJ' + String(60 - index).padStart(3, '0'),
  nombre: 'Producto ' + String(60 - index).padStart(3, '0'),
  referencia_cliente: 'EXT-' + (60 - index),
  referencia_wms: 'INTERNA',
  wms_lote_id: 'GEN_PRUEBA',
  cantidad: '12.125',
  unidad_medida: 'unidades',
}))
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (url.origin !== 'http://localhost:5174' || request.method() !== 'GET') {
    unexpected.push(request.url())
    return route.abort()
  }
  if (url.pathname.startsWith('/api/')) {
    let data,
      status = 200
    if (url.pathname === '/api/auth/me')
      data = {
        usuario: {
          id: '1',
          username: 'cliente.prueba',
          perfil: profile,
          debe_cambiar_password: false,
        },
        cliente: { id: '3', nombre: 'Empresa de prueba' },
        sesion: { tipo: 'NORMAL' },
        terminos: { aceptado: true },
        habilitado_para_operar: true,
        csrf_token: 'csrf-fixture',
      }
    else if (url.pathname === '/api/movimientos') {
      const query = Object.fromEntries(url.searchParams),
        number = Number(query.page)
      assert.equal(query.limit, '25')
      assert.equal(Object.hasOwn(query, 'cliente_id'), false)
      reads.push(query)
      const found = empty
        ? []
        : rows.filter(
            (row) =>
              (!query.buscar ||
                [row.codigo_wms, row.nombre, row.referencia_cliente, row.wms_lote_id].some(
                  (value) => value.toLowerCase().includes(query.buscar.toLowerCase()),
                )) &&
              (!query.tipo || row.tipo === query.tipo) &&
              (!query.desde || row.fecha >= query.desde + 'T05:00:00.000Z') &&
              (!query.hasta ||
                row.fecha <
                  new Date(Date.parse(query.hasta + 'T05:00:00Z') + 86400000).toISOString()),
          )
      data = {
        total: found.length,
        page: number,
        limit: 25,
        data: found.slice((number - 1) * 25, number * 25),
        consultado_at: '2026-10-20T17:00:00.000Z',
      }
      if (unavailable) {
        status = 503
        data = { error: { code: 'WMS_NO_DISPONIBLE' }, correlation_id: 'referencia-fixture' }
      }
    } else {
      unexpected.push(url.pathname)
      return route.abort()
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
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
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  )
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) })),
    [],
    name,
  )
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': desbordamiento',
  )
  await page.screenshot({
    path: path.join(output, 'movements-' + name + '.png'),
    fullPage: true,
    animations: 'disabled',
  })
  checks.push(name)
}
async function count(value) {
  await page
    .getByRole('status')
    .filter({ hasText: value + ' movimientos' })
    .waitFor()
}
try {
  await page.goto('http://localhost:5174/movimientos')
  await count(60)
  assert.equal(await page.locator('.movements-table tbody tr').count(), 25)
  assert.equal(await page.getByText('Próximamente', { exact: true }).count(), 0)
  const date = await page.locator('.movement-date').first().textContent()
  assert.match(date, /20.*2026.*12:00.*a\. m\./)
  await check('desktop')
  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await page.getByText('Página 2 de 3 · 60 registros', { exact: true }).waitFor()
  await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('CAJ001')
  await count(1)
  await page.getByText('Producto 001', { exact: true }).waitFor()
  assert.equal(reads.at(-1).page, '1')
  assert.equal(await page.locator('.movements-table tbody tr').count(), 1)
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await count(60)
  await page.getByLabel('Tipo', { exact: true }).selectOption('SALIDA')
  await count(30)
  assert.equal(await page.locator('.movement-type-salida').count(), 25)
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-20')
  await page.getByLabel('Hasta', { exact: true }).fill('2026-10-20')
  await count(30)
  await page.waitForFunction(
    () => document.querySelector('.movements-count')?.textContent === '30 movimientos',
  )
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-21')
  await page.getByRole('alert').filter({ hasText: 'La fecha inicial' }).waitFor()
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await count(60)
  await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('no-existe')
  await page.getByRole('heading', { name: 'No hay movimientos con estos filtros' }).waitFor()
  await check('filtered-empty')
  await page.getByRole('button', { name: 'Ver todos los movimientos', exact: true }).click()
  await count(60)
  unavailable = true
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'referencia-fixture' }).waitFor()
  assert.equal(await page.locator('.movements-table').count(), 0)
  assert.equal(
    await page.getByRole('heading', { name: 'Aún no hay movimientos registrados' }).count(),
    0,
  )
  await check('service-error')
  unavailable = false
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await count(60)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await check('mobile-' + width)
    assert.equal(await page.locator('.movements-table tbody tr').count(), 25)
    assert.equal(
      await page.locator('.movements-table').evaluate((table) => getComputedStyle(table).display),
      'block',
    )
  }
  profile = 'CONSULTA'
  await page.reload()
  await count(60)
  await check('consulta')
  empty = true
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByRole('heading', { name: 'Aún no hay movimientos registrados' }).waitFor()
  await check('empty')
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [])
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      backendReads: reads.length,
      realRequests: 0,
      mutations: 0,
    }),
  )
} finally {
  await context.close()
  await browser.close()
}
