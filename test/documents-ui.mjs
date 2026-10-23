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
  acceptDownloads: true,
})
const page = await context.newPage(),
  errors = [],
  unexpected = [],
  checks = [],
  uploads = []
let unavailable = false,
  downloadUnavailable = false,
  profile = 'SOLICITANTE',
  downloads = 0
let showImage = false
const docs = [
  { tipo: 'rut', nombre: 'RUT', estado: 'ADJUNTO', nombre_archivo: 'rut-123.pdf' },
  {
    tipo: 'camara_comercio',
    nombre: 'Cámara de Comercio',
    estado: 'ADJUNTO',
    nombre_archivo: 'camara-1.pdf',
  },
  {
    tipo: 'certificacion_bancaria',
    nombre: 'Certificación bancaria',
    estado: 'PENDIENTE',
    nombre_archivo: null,
  },
]
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const req = route.request(),
    url = new URL(req.url())
  if (url.origin !== 'http://localhost:5174') {
    unexpected.push(req.url())
    return route.abort()
  }
  if (url.pathname.startsWith('/api/')) {
    let data,
      status = 200
    if (url.pathname === '/api/auth/me' && req.method() === 'GET')
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
    else if (url.pathname === '/api/documentos' && req.method() === 'GET') {
      const q = Object.fromEntries(url.searchParams)
      assert.equal(q.limit, '25')
      assert.equal(Object.hasOwn(q, 'cliente_id'), false)
      const found = docs.filter(
        (row) =>
          (!q.buscar || row.nombre.toLowerCase().includes(q.buscar.toLowerCase())) &&
          (!q.estado || row.estado === q.estado),
      )
      data = {
        total: found.length,
        data: found,
        page: 1,
        limit: 25,
        permite_carga: true,
        tipos_disponibles: docs
          .filter((row) => row.estado === 'PENDIENTE')
          .map(({ tipo, nombre }) => ({ tipo, nombre })),
        max_archivo_bytes: 10485760,
        formatos: ['application/pdf', 'image/jpeg', 'image/png'],
        actualizado_at: '2026-10-20T17:00:00Z',
      }
      if (unavailable) {
        status = 503
        data = { error: { code: 'WMS_NO_DISPONIBLE' }, correlation_id: 'ref-documentos' }
      }
    } else if (url.pathname === '/api/documentos/rut/archivo' && req.method() === 'GET') {
      downloads++
      if (showImage)
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=',
            'base64',
          ),
        })
      if (!downloadUnavailable)
        return route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4\nfixture-descarga-segura\n%%EOF'),
        })
      status = 404
      data = { error: { code: 'DOCUMENTO_NO_EXISTE', message: 'El documento no está disponible.' } }
    } else if (
      ['/api/documentos/camara_comercio', '/api/documentos/certificacion_bancaria'].includes(
        url.pathname,
      ) &&
      req.method() === 'POST'
    ) {
      assert.equal(req.headers()['x-csrf-token'], 'csrf-fixture')
      assert.equal(req.headers()['content-type'], 'application/pdf')
      const body = req.postDataBuffer().toString('utf8')
      assert.match(body, /%PDF-1.4/)
      assert.ok(!body.includes('cliente_id'))
      uploads.push(url.pathname)
      const type = url.pathname.split('/').at(-1)
      const index = docs.findIndex((row) => row.tipo === type)
      docs[index] = { ...docs[index], estado: 'ADJUNTO', nombre_archivo: type + '-123.pdf' }
      data = { actualizado: true }
      status = 200
    } else {
      unexpected.push(req.method() + ' ' + url.pathname)
      return route.abort()
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  }
  if (req.method() !== 'GET') {
    unexpected.push(req.url())
    return route.abort()
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
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) })),
    [],
    name,
  )
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': desbordamiento',
  )
  await page.screenshot({
    path: path.join(output, 'documents-' + name + '.png'),
    fullPage: true,
    animations: 'disabled',
  })
  checks.push(name)
}
async function ready() {
  await page.getByRole('heading', { name: 'Documentación de tu empresa', exact: true }).waitFor()
  await page.getByText('RUT', { exact: true }).waitFor()
}
try {
  await page.goto('http://localhost:5174/documentos')
  await ready()
  assert.equal(await page.locator('.documents-table tbody tr').count(), 3)
  assert.equal(await page.getByRole('heading', { name: 'Ingresos y salidas' }).count(), 0)
  await check('desktop')
  await page.getByLabel('Estado', { exact: true }).selectOption('PENDIENTE')
  await page.waitForFunction(
    () => document.querySelectorAll('.documents-table tbody tr').length === 1,
  )
  await page.getByLabel('Estado', { exact: true }).selectOption('')
  await ready()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar RUT', exact: true }).click()
  const saved = await downloadEvent
  assert.equal(saved.suggestedFilename(), 'rut.pdf')
  assert.match(await fs.readFile(await saved.path(), 'utf8'), /^%PDF-1\.4/)
  await saved.delete()
  showImage = true
  await page.getByRole('button', { name: 'Ver RUT', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'RUT', exact: true })
  await preview.getByRole('img', { name: 'RUT' }).waitFor()
  assert.ok(await preview.getByRole('img').evaluate((img) => img.src.startsWith('blob:')))
  await check('preview')
  await preview.getByRole('button', { name: 'Cerrar', exact: true }).click()
  showImage = false
  await page.getByRole('button', { name: 'Actualizar Cámara de Comercio', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar Cámara de Comercio', exact: true })
  await dialog.getByLabel('Archivo PDF, JPG o PNG').setInputFiles({
    name: 'camara.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('MZ'),
  })
  await dialog.getByRole('button', { name: 'Guardar documento' }).click()
  await dialog.getByRole('alert').waitFor()
  assert.equal(uploads.length, 0)
  await dialog.getByLabel('Archivo PDF, JPG o PNG').setInputFiles({
    name: 'camara.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nfixture'),
  })
  await check('upload')
  await dialog.getByRole('button', { name: 'Guardar documento' }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Cámara de Comercio actualizado correctamente.' })
    .waitFor()
  await page.getByRole('button', { name: 'Actualizar Cámara de Comercio', exact: true }).waitFor()
  assert.equal(uploads.length, 1)
  await page.getByRole('button', { name: 'Cargar documento', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Cargar documento', exact: true })
  const type = create.getByLabel('Tipo de documento', { exact: true })
  assert.equal(await type.getByRole('option', { name: 'RUT', exact: true }).count(), 0)
  await type.selectOption('certificacion_bancaria')
  await create.getByLabel('Archivo PDF, JPG o PNG').setInputFiles({
    name: 'bancaria.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nfixture'),
  })
  await check('new-document')
  await page.setViewportSize({ width: 390, height: 844 })
  await check('new-document-mobile')
  await page.setViewportSize({ width: 320, height: 844 })
  await check('new-document-small-mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await create.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Certificación bancaria cargado correctamente.' })
    .waitFor()
  await page
    .getByRole('button', { name: 'Actualizar Certificación bancaria', exact: true })
    .waitFor()
  assert.equal(uploads.length, 2)
  assert.equal(
    await page.getByRole('button', { name: 'Cargar documento', exact: true }).isDisabled(),
    true,
  )
  await page.getByRole('button', { name: 'Actualizar RUT', exact: true }).click()
  await page
    .getByText(
      'El nuevo archivo quedará como documento actual. La versión anterior se conservará en Genika.',
      {
        exact: true,
      },
    )
    .waitFor()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  unavailable = true
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'ref-documentos' }).waitFor()
  assert.equal(await page.locator('.documents-table').count(), 0)
  await check('error')
  unavailable = false
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await ready()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await check('mobile-' + width)
    await page.getByRole('button', { name: 'Actualizar RUT', exact: true }).click()
    await check('upload-' + width)
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  }
  profile = 'CONSULTA'
  await page.reload()
  await ready()
  assert.equal(await page.getByRole('button', { name: /^Actualizar / }).count(), 0)
  assert.equal(
    await page.getByRole('button', { name: /^(Eliminar|Cargar|Reemplazar) / }).count(),
    0,
  )
  await check('consulta')
  await page.getByRole('searchbox', { name: 'Buscar documentos' }).fill('no-existe')
  await page.getByRole('heading', { name: 'No hay documentos con estos filtros' }).waitFor()
  await check('filtered-empty')
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [])
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  console.log(
    JSON.stringify({ result: 'PASS', checks, downloads, uploads: uploads.length, realRequests: 0 }),
  )
} finally {
  await context.close()
  await browser.close()
}
