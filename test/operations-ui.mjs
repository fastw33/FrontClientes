import { chromium, expect } from '@playwright/test'
import { assertMobileTables } from './mobile-layout.mjs'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import catalog from '../../externalclientes/src/config/productCatalog.js'
import inventoryProjection from '../../externalclientes/src/modules/inventario/inventario-proyeccion.js'
const { groupProducts, summary, filteredProducts } = inventoryProjection

// Respuestas ficticias y dist interceptado: no servidores ni escrituras reales.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.runtime')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  locale: 'es-CO',
})
const page = await context.newPage()
let bodegaReads = 0
const errors = [],
  mutations = [],
  a11y = []
let role = 'SOLICITANTE',
  listError = 0,
  failSend = false,
  failCreate = true,
  catalogFailure = false,
  products = [],
  preloads = []
const product = {
  cliente_producto_id: '7',
  producto_version_id: '9',
  codigo_cliente: 'REF-001',
  codigo_wms: 'CAJ123',
  prefijo: 'CAJ',
  nombre: 'Repuesto de prueba',
  referencia: 'M-01',
  tipo: 'Bodega',
  unidad_medida: 'unidades',
  alto_cm: '12.5',
  ancho_cm: '15',
  largo_cm: '20',
  estado: 'HABILITADO',
}
let stockRows = [],
  stockFailure = false,
  directoryRows = [],
  suggestedRows = []
const stock = {
  codigo_wms: 'CAJ123',
  wms_lote_id: 'GEN_INVENTARIO',
  nombre: 'Mercancía de prueba recibida',
  referencia_cliente: 'EXTERNA',
  referencia_wms: 'INTERNA',
  unidad_medida: 'unidades',
  cantidad_actual: '5.25',
  ultimo_movimiento_at: '2026-10-19T16:00:00Z',
}
const incoming = () => ({
  ...preloads[0],
  tipo_operacion: 'INGRESO',
  modalidad: 'INGRESO',
  nombre: preloads[0].referencia_lote,
  estado: preloads[0].recepcion?.estado === 'CERRADA' ? 'INGRESO_CONFIRMADO' : 'INGRESO_AGENDADO',
  permite_cambios: false,
  wms_alistamiento_id: null,
  recepcion: { estado: preloads[0].recepcion?.estado === 'CERRADA' ? 'CERRADA' : 'PENDIENTE' },
  detalles: preloads[0].detalles.map((line) => ({
    ...product,
    ...line,
    cantidad: line.cantidad_declarada,
    cantidad_recibida: '0',
    recepcion_estado: 'PENDIENTE',
  })),
})
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (url.origin !== 'http://localhost:5174') return route.abort()
  if (url.pathname.startsWith('/api/')) {
    let status = 200,
      data = {}
    const method = request.method(),
      endpoint = url.pathname.slice(4)
    if (method !== 'GET') {
      assert.equal(request.headers()['x-csrf-token'], 'csrf-fixture')
      mutations.push({ endpoint, body: request.postDataJSON() })
    }
    if (endpoint === '/auth/me')
      data = {
        usuario: {
          id: '1',
          username: 'cliente.prueba',
          perfil: role,
          correo: 'prueba@example.invalid',
          debe_cambiar_password: false,
        },
        cliente: { id: '3', nombre: 'Empresa de prueba' },
        sesion: { tipo: 'NORMAL' },
        terminos: { aceptado: true, version: '1.0', aceptado_at: '2026-10-19T15:00:00Z' },
        habilitado_para_operar: true,
        csrf_token: 'csrf-fixture',
      }
    else if (endpoint.startsWith('/inventario/productos') && method === 'GET') {
      assert.equal(url.searchParams.has('cliente_id'), false)
      const query = Object.fromEntries(url.searchParams),
        currentPage = Number(query.page),
        limit = Number(query.limit)
      assert.equal(limit, 25)
      if (stockFailure) {
        status = 503
        data = { error: { code: 'WMS_NO_DISPONIBLE' } }
      } else {
        const grouped = groupProducts(stockRows)
        if (endpoint === '/inventario/productos') {
          const found = filteredProducts(grouped, query)
          data = {
            data: found.slice((currentPage - 1) * limit, currentPage * limit).map(summary),
            total: found.length,
            page: currentPage,
            limit,
            unidades: [...new Set(grouped.map((row) => row.unidad_medida))],
            consultado_at: '2026-10-19T17:00:00Z',
          }
        } else {
          const code = decodeURIComponent(endpoint.split('/')[3])
          const product = grouped.find(
            (row) => row.codigo_wms === code && row.unidad_medida === query.unidad,
          )
          assert.ok(product, endpoint)
          const found = product.lotes.filter(
            (lot) =>
              !query.buscar || lot.wms_lote_id.toLowerCase().includes(query.buscar.toLowerCase()),
          )
          data = {
            producto: summary(product),
            data: found.slice((currentPage - 1) * limit, currentPage * limit),
            total: found.length,
            page: currentPage,
            limit,
            consultado_at: '2026-10-19T17:00:00Z',
          }
        }
      }
    } else if (endpoint === '/inventario' && method === 'GET') {
      assert.equal(url.searchParams.has('cliente_id'), false)
      if (stockFailure) {
        status = 503
        data = { error: { code: 'WMS_NO_DISPONIBLE', message: 'Consulta no disponible.' } }
      } else {
        const pageNumber = Number(url.searchParams.get('page'))
        const normalize = (value) =>
          String(value || '')
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
        const q = normalize(url.searchParams.get('buscar'))
        const found = stockRows.filter((row) =>
          [
            row.nombre,
            row.codigo_wms,
            row.referencia_cliente,
            row.referencia_wms,
            row.wms_lote_id,
          ].some((value) => normalize(value).includes(q)),
        )
        data = {
          data: found.slice((pageNumber - 1) * 25, pageNumber * 25),
          total: found.length,
          page: pageNumber,
          limit: 25,
          consultado_at: '2026-10-19T17:00:00Z',
        }
      }
    } else if (/^\/productos\/\d+$/.test(endpoint) && method === 'DELETE') {
      assert.deepEqual(request.postDataJSON(), {})
      const id = endpoint.split('/').at(-1),
        selected = products.find((row) => row.cliente_producto_id === id)
      if (stockFailure) {
        status = 503
        data = { error: { code: 'WMS_NO_DISPONIBLE', message: 'WMS no disponible.' } }
      } else if (
        selected &&
        stockRows.some(
          (row) => row.codigo_wms === selected.codigo_wms && Number(row.cantidad_actual) !== 0,
        )
      ) {
        status = 409
        data = {
          error: {
            code: 'PRODUCTO_CON_EXISTENCIAS',
            message:
              'No puedes quitar este producto de tu catálogo porque tiene existencias en tu inventario.',
          },
        }
      } else {
        products = products.filter((row) => row.cliente_producto_id !== id)
        data = { cliente_producto_id: id, retirado: true }
      }
    } else if (endpoint === '/productos/bodega' && method === 'GET') {
      bodegaReads++
      const number = Number(url.searchParams.get('page'))
      const q = url.searchParams.get('buscar') || ''
      const all = directoryRows.filter((row) => row.nombre.includes(q))
      data = {
        data: all.slice((number - 1) * 25, number * 25),
        total: all.length,
        page: number,
        limit: 25,
      }
    } else if (endpoint === '/productos/similares' && method === 'GET')
      data = {
        data: suggestedRows.map((row) => ({
          ...row,
          exacta: url.searchParams.get('nombre') === row.nombre,
        })),
      }
    else if (endpoint === '/productos/vincular' && method === 'POST') {
      data = { ...product, cliente_producto_id: '8', codigo_wms: request.postDataJSON().codigo_wms }
      products = [...products.filter((row) => row.cliente_producto_id !== '8'), data]
    } else if (endpoint.endsWith('/crear-lote') && method === 'POST') {
      Object.assign(preloads[0], { wms_lote_id: 'GEN_VERIFICADO' })
      data = {
        ...preloads[0],
        detalles: preloads[0].detalles.map((line) => ({ ...product, ...line })),
      }
    } else if (endpoint === '/productos/catalogo' && method === 'GET') {
      if (catalogFailure) {
        status = 503
        data = {
          error: { code: 'CATALOGO_NO_DISPONIBLE', message: 'Prueba de catálogo no disponible.' },
        }
      } else
        data = {
          ...catalog,
          tipos: ['Bodega'],
          presentaciones: catalog.presentaciones.filter((row) => row.tipo === 'Bodega'),
        }
    } else if (endpoint === '/productos' && method === 'GET') {
      if (listError) {
        status = listError
        data = { error: { code: 'ERROR_PRUEBA', message: 'Error controlado de prueba.' } }
      } else data = { data: products, total: products.length, page: 1, limit: 25 }
    } else if (endpoint === '/productos' && method === 'POST') {
      assert.deepEqual(
        Object.keys(request.postDataJSON())
          .filter((key) => key !== 'confirmar_diferente')
          .sort(),
        [
          'alto_cm',
          'ancho_cm',
          'largo_cm',
          'nombre',
          'prefijo',
          'referencia',
          'request_id',
          'tipo',
          'unidad_medida',
        ],
      )
      if (failCreate) {
        failCreate = false
        status = 503
        data = { error: { code: 'PRUEBA', message: 'Resultado no confirmado.' } }
      } else {
        products = [product]
        data = product
        status = 201
      }
    } else if (endpoint === '/operaciones' && method === 'GET')
      data = {
        data: preloads.length ? [incoming()] : [],
        total: preloads.length,
        page: 1,
        limit: 25,
        anticipacion_minutos: 300,
        horario_operacion: { inicio: '08:00', fin: '17:00', zona_horaria: 'America/Bogota' },
      }
    else if (endpoint.startsWith('/operaciones/') && method === 'GET') data = incoming()
    else if (endpoint === '/precargas' && method === 'GET')
      data = {
        data: preloads,
        total: preloads.length,
        page: 1,
        limit: 25,
        anticipacion_minutos: 300,
        horario_operacion: { inicio: '08:00', fin: '17:00', zona_horaria: 'America/Bogota' },
      }
    else if (endpoint.startsWith('/precargas/') && method === 'GET') {
      data = {
        ...preloads[0],
        recepcion: { estado: preloads[0].recepcion?.estado === 'CERRADA' ? 'CERRADA' : 'PARCIAL' },
        detalles: preloads[0].detalles.map((line) => ({
          ...product,
          ...line,
          cantidad_recibida: preloads[0].recepcion?.estado === 'CERRADA' ? '0' : '3.5',
          recepcion_estado: preloads[0].recepcion?.estado === 'CERRADA' ? 'PENDIENTE' : 'PARCIAL',
        })),
      }
    } else if (endpoint === '/precargas' && method === 'POST') {
      if (failSend) {
        failSend = false
        status = 503
        data = { error: { code: 'ERROR_PRUEBA', message: 'No disponible.' } }
      } else {
        const body = request.postDataJSON()
        data = {
          ...body,
          public_id: body.request_id,
          estado: 'ENVIADA',
          revision: 1,
          wms_lote_id: 'GEN_010',
          recepcion: { estado: 'PENDIENTE' },
          total_productos: body.detalles.length,
          creado_at: '2026-10-19T16:00:00Z',
        }
        preloads = [data]
        status = 201
      }
    } else {
      status = 404
      data = { error: { code: 'RUTA_NO_EXISTE', message: 'No existe.' } }
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  }
  const dist = path.join(root, 'dist')
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
    '.png': 'image/png',
    '.webp': 'image/webp',
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
        .filter((animation) => Number.isFinite(animation.effect.getTiming().iterations))
        .map((animation) => animation.finished.catch(() => {})),
    ),
  )
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': desbordamiento',
  )
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  a11y.push({ name, violations: report.violations })
  await page.screenshot({ path: path.join(output, `operations-${name}.png`), fullPage: true })
  assert.equal(
    report.violations.length,
    0,
    JSON.stringify(
      report.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
    ),
  )
}
try {
  await page.goto('http://localhost:5174/inventario')
  await page.getByRole('heading', { name: 'Tu catálogo empieza aquí' }).waitFor()
  await check('empty-desktop')
  assert.equal(bodegaReads, 0, 'No se consulta el catálogo Bodega fuera de la creación')
  assert.equal(await page.getByRole('list', { name: 'Cómo funciona tu catálogo' }).count(), 1)
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Crear producto nuevo', exact: true }).click()
  await dialog.getByLabel('Presentación / prefijo').selectOption('CAJ')
  assert.equal(await dialog.getByLabel('Código Genika (automático)').getAttribute('readonly'), '')
  assert.equal(
    await dialog.getByLabel('Código Genika (automático)').inputValue(),
    'CAJ · Pendiente de asignación',
  )
  await dialog.getByLabel('Nombre del producto').fill('Repuesto de prueba')
  await dialog.getByLabel('Referencia / modelo').fill('M-01')
  await dialog.getByLabel('Tipo de producto').selectOption('Bodega')
  for (const [name, value] of [
    ['Alto (cm)', '12.5'],
    ['Ancho (cm)', '15'],
    ['Largo (cm)', '20'],
  ])
    await dialog.getByLabel(name, { exact: true }).fill(value)
  await check('product-desktop')
  await dialog.getByRole('button', { name: 'Crear producto', exact: true }).click()
  await dialog.getByRole('button', { name: 'Reintentar guardado' }).waitFor()
  assert.equal(await dialog.getByLabel('Presentación / prefijo').isDisabled(), true)
  await dialog.getByRole('button', { name: 'Reintentar guardado' }).click()
  await page.getByText('Producto CAJ123 disponible en tu catálogo.', { exact: false }).waitFor()
  await page.getByText('Repuesto de prueba', { exact: true }).waitFor()
  await check('catalog-desktop')
  assert.equal(await page.getByRole('list', { name: 'Cómo funciona tu catálogo' }).count(), 0)
  assert.equal(await page.locator('.ops-bodega').count(), 0)
  const creations = mutations.filter((item) => item.endpoint === '/productos')
  assert.equal(creations.length, 2)
  assert.deepEqual(creations[0].body, creations[1].body)
  assert.equal('codigo_cliente' in creations[0].body, false)
  await page.getByText('CAJ123', { exact: true }).waitFor()
  products[0].codigo_wms = 'CAJ123'
  products[0].estado = 'HABILITADO'
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByText('CAJ123', { exact: true }).waitFor()
  await check('catalog-code-assigned')
  stockRows = [stock]
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click()
  await page.getByRole('heading', { name: 'Existencias actuales', exact: true }).waitFor()
  await page.locator('.ops-stock').getByText('5.25', { exact: true }).waitFor()
  await page
    .locator('.ops-stock')
    .getByRole('button', { name: /^Ver lotes de/ })
    .click()
  await page.locator('.ops-stock').getByText('GEN_INVENTARIO', { exact: true }).waitFor()
  await check('physical-stock-desktop')
  stockFailure = true
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click()
  await page.locator('.ops-stock').getByRole('alert').waitFor()
  assert.equal(
    await page
      .locator('.ops-stock')
      .getByRole('heading', { name: 'Aún no hay existencias registradas' })
      .count(),
    0,
  )
  stockFailure = false
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click()
  await page.locator('.ops-stock').getByText('5.25', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Registrar precarga', exact: true }).click()
  await dialog.getByLabel('Tu referencia de carga').fill('CARGA-001')
  assert.equal(await dialog.getByLabel('Fecha de llegada', { exact: true }).count(), 0)
  assert.equal(await dialog.getByRole('combobox', { name: 'Hora de llegada' }).count(), 0)
  await check('preload-suggested-desktop')
  await dialog.locator('.preload-extra > summary').click()
  await dialog.getByLabel('Contenedor (opcional)').fill('CONT-001')
  await dialog.locator('.preload-extra > summary').click()
  await dialog.getByLabel('Producto 1', { exact: true }).selectOption('7')
  await dialog.getByLabel('Cantidad 1', { exact: true }).fill('0')
  await dialog.getByRole('button', { name: 'Revisar precarga' }).click()
  await dialog.getByRole('alert').waitFor()
  assert.equal(mutations.filter((item) => item.endpoint === '/precargas').length, 0)
  await dialog.getByLabel('Cantidad 1', { exact: true }).fill('12.000001')
  await check('preload-desktop')
  const formBounds = await dialog.locator('.preload-entry-form').boundingBox()
  const arrivalBounds = await dialog.locator('.preload-arrival').boundingBox()
  assert.ok(arrivalBounds.width >= formBounds.width * 0.95, 'Agenda ocupa una fila completa')
  await dialog.getByRole('button', { name: 'Elegir manualmente' }).click()
  const suggestedDay = await dialog.getByLabel('Fecha de llegada', { exact: true }).inputValue()
  await dialog.getByLabel('Fecha de llegada', { exact: true }).fill('2026-12-15')
  await dialog.getByRole('combobox', { name: 'Hora de llegada' }).fill('10:30')
  await dialog.getByRole('combobox', { name: 'Hora de llegada' }).press('Enter')
  await expect(dialog.getByRole('combobox', { name: 'Hora de llegada' })).toHaveValue('10:30 a. m.')
  await dialog.getByRole('combobox', { name: 'Hora de llegada' }).click()
  await check('preload-hours-desktop')
  await dialog.getByRole('combobox', { name: 'Hora de llegada' }).press('Escape')
  await dialog.getByRole('button', { name: 'Usar hora sugerida' }).click()
  assert.equal(await dialog.getByLabel('Fecha de llegada', { exact: true }).count(), 0)
  await dialog.getByRole('button', { name: 'Revisar precarga' }).click()
  await dialog.getByRole('heading', { name: 'Revisa tu precarga' }).waitFor()
  assert.equal(mutations.filter((item) => item.endpoint === '/precargas').length, 0)
  await check('review-desktop')
  failSend = true
  await dialog.getByRole('button', { name: 'Registrar precarga' }).click()
  await dialog.getByRole('button', { name: 'Reintentar envío' }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Corregir' }).isDisabled(), true)
  await dialog.getByRole('button', { name: 'Reintentar envío' }).click()
  await page.getByText('Precarga registrada con el lote GEN_010.', { exact: false }).waitFor()
  const sent = mutations.filter((item) => item.endpoint === '/precargas')
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[0].body, sent[1].body)
  assert.equal(sent[0].body.detalles[0].cantidad_declarada, '12.000001')
  assert.match(sent[0].body.fecha_programada_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:00-05:00$/)
  assert.ok(
    sent[0].body.fecha_programada_at.startsWith(suggestedDay),
    'Usa la llegada sugerida al volver al modo automático',
  )
  assert.ok(!('cliente_id' in sent[0].body))
  await check('preloads-desktop')
  await page.getByText('GEN_010', { exact: true }).waitFor()
  await page.locator('.ops-table').getByText('Pendiente por revisión', { exact: true }).waitFor()
  preloads[0].recepcion = { estado: 'PARCIAL' }
  await page.reload()
  await page.locator('.ops-table').getByText('Ingreso parcial', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Ver precarga', exact: true }).click()
  await dialog.getByRole('heading', { name: 'Detalle de precarga registrada' }).waitFor()
  await dialog.getByText('Repuesto de prueba', { exact: true }).waitFor()
  await dialog.getByText('12.000001 unidades', { exact: true }).waitFor()
  await check('saved-preload-detail')
  await dialog.getByText('3.5 unidades', { exact: true }).waitFor()
  await dialog.getByText('Ingreso parcial', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Cerrar detalle' }).click()
  await page.goto('http://localhost:5174/operaciones')
  await page.getByRole('cell', { name: 'Ingreso', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await dialog.getByRole('heading', { name: 'Recepción en bodega', exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Verificar envío a Genika' }).count(), 0)
  assert.equal(await dialog.getByRole('button', { name: 'Solicitar otra fecha' }).count(), 0)
  await dialog.getByText('GEN_010', { exact: true }).waitFor()
  await check('ingreso-agendado-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await check('ingreso-agendado-mobile')
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click()
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('http://localhost:5174/precargas')
  // Se simula la respuesta posterior de Genika; no se crea un lote real en WMS.
  preloads[0].wms_lote_id = 'GENIKA-000123'
  preloads[0].estado = 'ENVIADA'
  preloads[0].aprobacion = { aprobado_por: 'Equipo de bodega', aprobado_at: '2026-10-19T17:00:00Z' }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByText('GENIKA-000123', { exact: true }).waitFor()
  await page.locator('.ops-table').getByText('Ingreso parcial', { exact: true }).waitFor()
  preloads[0].recepcion = { estado: 'RECIBIDA' }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.locator('.ops-table').getByText('Ingreso confirmado', { exact: true }).waitFor()
  await check('reception-confirmed-desktop')
  preloads[0].recepcion = { estado: 'CERRADA' }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.locator('.ops-table').getByText('Lote cerrado', { exact: true }).waitFor()
  assert.equal(
    await page.locator('.ops-table').getByText('Pendiente por revisión', { exact: true }).count(),
    0,
  )
  await check('closed-lot-desktop')
  await page.getByRole('button', { name: 'Ver precarga', exact: true }).click()
  await dialog
    .locator('section[aria-label="Recepción de la precarga"]')
    .getByText('Lote cerrado', { exact: true })
    .waitFor()
  await dialog.getByRole('button', { name: 'Cerrar detalle', exact: true }).click()
  await page.goto('http://localhost:5174/operaciones')
  await page.getByRole('cell', { name: 'Lote cerrado', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click()
  await dialog
    .locator('.schedule-detail-heading')
    .getByText('Lote cerrado', { exact: true })
    .waitFor()
  await dialog.getByRole('button', { name: 'Cerrar ventana', exact: true }).click()
  await page.goto('http://localhost:5174/precargas')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.ops-table').getByText('Lote cerrado', { exact: true }).waitFor()
  await check('closed-lot-mobile')
  await page.setViewportSize({ width: 1440, height: 1050 })
  preloads[0].recepcion = { estado: 'NO_DISPONIBLE' }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.locator('.ops-table').getByText('Recepción por verificar', { exact: true }).waitFor()
  delete preloads[0].recepcion
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.locator('.ops-table').getByText('Recepción por verificar', { exact: true }).waitFor()
  preloads[0].recepcion = { estado: 'PARCIAL' }
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.locator('.ops-table').getByText('Ingreso parcial', { exact: true }).waitFor()
  assert.equal(await page.getByText('Aún sin asignar', { exact: true }).count(), 0)
  await check('assigned-lot-desktop')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 740 })
    await check(`preloads-mobile-${width}`)
    await page.getByRole('button', { name: 'Ver precarga', exact: true }).click()
    await dialog.getByText('12.000001 unidades', { exact: true }).waitFor()
    await check(`saved-detail-mobile-${width}`)
    const footer = await dialog.locator('.modal-fixed-footer').boundingBox()
    assert.ok(
      footer.y >= 0 && footer.y + footer.height <= 740,
      'Confirmación visible dentro de la pantalla',
    )
    await dialog.getByRole('button', { name: 'Cerrar detalle' }).click()
    await page.getByRole('button', { name: 'Registrar precarga', exact: true }).click()
    await dialog.getByLabel('Tu referencia de carga').waitFor()
    await check(`form-mobile-${width}`)
    const formFooter = await dialog.locator('.modal-fixed-footer').boundingBox()
    assert.ok(
      formFooter.y >= 0 && formFooter.y + formFooter.height <= 740,
      'Acciones visibles al agendar ingreso',
    )
    assert.equal(await dialog.getByLabel('Fecha de llegada', { exact: true }).count(), 0)
    await dialog.getByRole('button', { name: 'Elegir manualmente' }).click()
    await dialog.getByRole('combobox', { name: 'Hora de llegada' }).click()
    await check(`preload-hours-mobile-${width}`)
    const popup = await dialog.locator('.arrival-time-popup').boundingBox()
    const body = await dialog.locator('.modal-body-scroll').boundingBox()
    assert.ok(
      popup.y >= body.y && popup.y + popup.height <= body.y + body.height,
      'Horas visibles dentro del formulario',
    )
    await dialog.getByRole('combobox', { name: 'Hora de llegada' }).press('Escape')
    await dialog.getByRole('button', { name: 'Usar hora sugerida' }).click()
    await dialog.getByLabel('Tu referencia de carga').fill(`MOVIL-${width}`)
    await dialog.getByLabel('Producto 1', { exact: true }).selectOption('7')
    await dialog.getByLabel('Cantidad 1', { exact: true }).fill('1')
    await dialog.getByRole('button', { name: 'Revisar precarga' }).click()
    await dialog.getByRole('heading', { name: 'Revisa tu precarga' }).waitFor()
    await check(`review-mobile-${width}`)
    const reviewFooter = await dialog.locator('.modal-fixed-footer').boundingBox()
    assert.ok(
      reviewFooter.y >= 0 && reviewFooter.y + reviewFooter.height <= 740,
      'Botón Registrar precarga visible en móvil',
    )
    await dialog.getByRole('button', { name: 'Corregir', exact: true }).click()
    await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
    await page.goto('http://localhost:5174/inventario')
    await page.getByText('Repuesto de prueba', { exact: true }).waitFor()
    await check(`catalog-mobile-${width}`)
    await page.getByRole('button', { name: 'Crear producto', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Crear producto nuevo', exact: true })
      .click()
    await check(`product-mobile-${width}`)
    await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
    await page.goto('http://localhost:5174/precargas')
    await page.getByText('CARGA-001', { exact: true }).waitFor()
  }
  role = 'CONSULTA'
  await page.goto('http://localhost:5174/inventario')
  await page.getByRole('heading', { name: 'Mi catálogo', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: /Crear producto/ }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'Registrar precarga' }).count(), 0)
  await check('readonly-mobile')
  await page.goto('http://localhost:5174/precargas?crear=1')
  await page.getByText('Puedes consultar las precargas de tu empresa.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  listError = 404
  await page.goto('http://localhost:5174/inventario')
  await page.getByRole('alert').waitFor()
  await page.getByText('Este servicio aún no está habilitado.', { exact: false }).waitFor()
  listError = 503
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page
    .getByText('El servicio no está disponible en este momento.', { exact: false })
    .waitFor()
  listError = 0
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByText('Repuesto de prueba', { exact: true }).waitFor()
  role = 'SOLICITANTE'
  catalogFailure = true
  await page.goto('http://localhost:5174/inventario')
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear producto nuevo', exact: true })
    .click()
  await dialog.getByRole('alert').waitFor()
  assert.equal(
    await dialog.getByRole('button', { name: 'Crear producto', exact: true }).isDisabled(),
    true,
  )
  await check('catalog-error-mobile')
  catalogFailure = false
  await dialog.getByRole('button', { name: 'Reintentar presentaciones' }).click()
  await dialog.getByLabel('Presentación / prefijo').selectOption('YUT')
  assert.deepEqual(
    await dialog.getByLabel('Unidad de medida').locator('option').allTextContents(),
    ['Unidades', 'Kilos', 'Pallet'],
  )
  assert.equal(
    await dialog.getByLabel('Código Genika (automático)').inputValue(),
    'YUT · Pendiente de asignación',
  )
  assert.deepEqual(
    await dialog.getByLabel('Tipo de producto').locator('option').allTextContents(),
    ['Bodega'],
  )
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
  // Catálogo común, reutilización y similitudes al escribir, también en móvil.
  directoryRows = Array.from({ length: 26 }, (_, index) => ({
    ...product,
    nombre: `Ficha Bodega ${index}`,
    codigo_wms: `UNI${String(index + 1).padStart(3, '0')}`,
  }))
  await page.reload()
  const directoryReadsBefore = bodegaReads
  assert.equal(await page.locator('.ops-bodega').count(), 0)
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click()
  const common = dialog.locator('.ops-bodega')
  await common.getByText('Ficha Bodega 0', { exact: true }).waitFor()
  assert.ok(bodegaReads > directoryReadsBefore)
  await check('bodega-picker-mobile-320')
  await common.getByRole('button', { name: 'Página siguiente' }).click()
  await common.getByText('Ficha Bodega 25', { exact: true }).waitFor()
  await common.getByRole('button', { name: 'Añadir a mi catálogo' }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Producto UNI026 añadido a tu catálogo' })
    .waitFor()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.ops-bodega').count(), 0)
  await check('catalog-after-reuse-mobile-320')
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear producto nuevo', exact: true })
    .click()
  suggestedRows = [
    {
      ...directoryRows[0],
      nombre: 'Caja plástica existente',
      referencia: 'REF-COINCIDE',
      exacta: false,
      similitud: 85,
    },
  ]
  await dialog.getByLabel('Presentación / prefijo').selectOption('CAJ')
  await dialog.getByLabel('Nombre del producto').fill('Caja plástica nueva')
  await dialog.getByLabel('Referencia / modelo').fill('REF-NUEVA')
  for (const [label, value] of [
    ['Alto (cm)', '1'],
    ['Ancho (cm)', '2'],
    ['Largo (cm)', '3'],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value)
  await dialog.getByText('Ficha parecida', { exact: false }).waitFor()
  assert.equal(
    await dialog.getByRole('button', { name: 'Crear producto', exact: true }).isDisabled(),
    true,
  )
  const ack = dialog.getByLabel('Revisé las coincidencias y confirmo que mi producto es diferente.')
  await ack.check()
  assert.equal(
    await dialog.getByRole('button', { name: 'Crear producto', exact: true }).isEnabled(),
    true,
  )
  await dialog.getByLabel('Unidad de medida').selectOption('kilos')
  await dialog.getByText('Ficha parecida', { exact: false }).waitFor()
  assert.equal(await ack.isChecked(), false, 'Cambiar ficha invalida la confirmación anterior')
  await check('similarity-warning-mobile')
  const beforeIdentical = mutations.filter((row) => row.endpoint === '/productos').length
  await dialog.getByLabel('Nombre del producto').fill('Caja plástica existente')
  await dialog.locator('small').filter({ hasText: 'Ficha idéntica' }).waitFor()
  await dialog.getByRole('button', { name: 'Reutilizar ficha idéntica' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(mutations.filter((row) => row.endpoint === '/productos').length, beforeIdentical)
  assert.equal(mutations.at(-1).endpoint, '/productos/vincular')
  suggestedRows = []
  preloads[0].wms_lote_id = null
  await page.goto('http://localhost:5174/precargas')
  await page.getByRole('button', { name: 'Ver precarga', exact: true }).click()
  await dialog.getByRole('button', { name: 'Verificar creación del lote' }).click()
  await dialog.getByText('GEN_VERIFICADO', { exact: true }).waitFor()
  assert.deepEqual(mutations.at(-1).body, { revision: 1 })
  await check('saved-preload-recovery-mobile')
  await dialog.getByRole('button', { name: 'Cerrar detalle' }).click()
  await page.goto('http://localhost:5174/inventario')
  const stockPanel = page.locator('.ops-stock')
  const findStock = page.getByRole('searchbox', { name: 'Buscar en mi inventario' })
  stockRows = Array.from({ length: 26 }, (_, index) => ({
    ...stock,
    codigo_wms: `SKU-${index}`,
    nombre: `Artículo ${index}`,
    wms_lote_id: `GEN_BUSQUEDA_${index}`,
    referencia_cliente: index === 25 ? 'REFERENCIA-ULTIMA' : `REF-${index}`,
  }))
  await stockPanel.getByRole('button', { name: 'Actualizar inventario' }).click()
  await stockPanel.getByRole('button', { name: 'Página siguiente' }).click()
  await stockPanel.getByText('Artículo 25', { exact: true }).waitFor()
  await findStock.fill('REFERENCIA-ULTIMA')
  await stockPanel.getByText('Página 1 de 1 · 1 productos', { exact: true }).waitFor()
  await stockPanel.getByText('Artículo 25', { exact: true }).waitFor()
  await findStock.fill('GEN_BUSQUEDA_25')
  await stockPanel.getByText('Artículo 25', { exact: true }).waitFor()
  await findStock.fill('SIN COINCIDENCIAS')
  await stockPanel.getByRole('heading', { name: 'No hay coincidencias en tu inventario' }).waitFor()
  await check('inventory-search-mobile')
  await findStock.fill('')
  stockRows = [stock]
  await stockPanel.getByRole('button', { name: 'Actualizar inventario' }).click()
  const ownCatalog = page.locator('[aria-labelledby="catalog-heading"]')
  const inStock = ownCatalog
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: /\bCAJ123$/ }) })
  await inStock.getByRole('button', { name: /Quitar/ }).click()
  await dialog.getByRole('button', { name: 'Quitar de mi catálogo', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'tiene existencias' }).waitFor()
  assert.ok(products.some((row) => row.cliente_producto_id === '7'))
  await check('catalog-removal-blocked-mobile')
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
  const removable = ownCatalog
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: /\bUNI001$/ }) })
  await removable.getByRole('button', { name: /Quitar/ }).click()
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
  const deletesBefore = mutations.filter((row) => row.endpoint === '/productos/8').length
  await removable.getByRole('button', { name: /Quitar/ }).click()
  stockFailure = true
  await dialog.getByRole('button', { name: 'Quitar de mi catálogo', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'El servicio no está disponible' }).waitFor()
  assert.ok(products.some((row) => row.cliente_producto_id === '8'))
  stockFailure = false
  await dialog.getByRole('button', { name: 'Quitar de mi catálogo', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('status').filter({ hasText: 'Producto quitado de tu catálogo.' }).waitFor()
  assert.equal(await removable.count(), 0)
  assert.ok(products.some((row) => row.cliente_producto_id === '7'))
  assert.equal(mutations.filter((row) => row.endpoint === '/productos/8').length, deletesBefore + 2)
  assert.equal(directoryRows.length, 26, 'Retirar de mi catálogo no borra el producto Bodega')
  await check('catalog-removal-success-mobile')
  // Más de una página de lotes, unidades distintas y filtros sobre totales completos.
  stockRows = Array.from({ length: 60 }, (_, index) => ({
    ...stock,
    codigo_wms: 'YUT002',
    nombre: 'Yute de prueba',
    wms_lote_id: `GEN_${String(index + 1).padStart(3, '0')}`,
    cantidad_actual: '0.1',
  }))
  stockRows.push(
    { ...stock, codigo_wms: 'YUT001', nombre: 'Yute medias rosadas', cantidad_actual: '2' },
    {
      ...stock,
      codigo_wms: 'YUT001',
      nombre: 'Yute medias rosadas',
      unidad_medida: 'kg',
      cantidad_actual: '3',
    },
  )
  await page.setViewportSize({ width: 1440, height: 1050 })
  await stockPanel.getByRole('button', { name: 'Actualizar inventario' }).click()
  await stockPanel.getByText('3 productos con existencias', { exact: true }).waitFor()
  assert.equal(await stockPanel.locator('.stock-products-table > tbody > tr').count(), 3)
  await stockPanel.getByRole('button', { name: /^Filtros/ }).click()
  await stockPanel.getByLabel('Ordenar por', { exact: true }).selectOption('cantidad_desc')
  await stockPanel.getByRole('button', { name: /^Ver lotes de Yute de prueba/ }).waitFor()
  await expect(stockPanel.locator('.stock-products-table > tbody > tr').first()).toContainText(
    'YUT002',
  )
  await check('consolidated-stock-desktop')
  await stockPanel.getByRole('button', { name: /^Ver lotes de Yute de prueba/ }).click()
  const lots = stockPanel.getByRole('region', { name: 'Lotes de Yute de prueba', exact: true })
  await lots.getByText('GEN_025', { exact: true }).waitFor()
  assert.equal(await lots.locator('tbody tr').count(), 25)
  assert.match(await lots.locator('.inventory-updated').textContent(), /6 unidades en 60 lotes/)
  await lots.getByRole('button', { name: 'Página siguiente' }).click()
  await lots.getByText('GEN_050', { exact: true }).waitFor()
  await expect(
    lots.getByRole('heading', { name: 'Lotes de Yute de prueba', exact: true }),
  ).toBeInViewport()
  await lots
    .getByRole('searchbox', { name: 'Buscar lote de Yute de prueba', exact: true })
    .fill('GEN_060')
  await lots.getByText('GEN_060', { exact: true }).waitFor()
  assert.equal(await lots.locator('tbody tr').count(), 1)
  await check('consolidated-lot-search-desktop')
  await stockPanel.getByLabel('Buscar en', { exact: true }).selectOption('lote')
  await findStock.fill('GEN_060')
  await stockPanel.getByText('1 producto con existencias', { exact: true }).waitFor()
  await stockPanel.getByText('6', { exact: true }).waitFor()
  assert.equal(await stockPanel.getByText('Ver 60 lotes', { exact: true }).count(), 1)
  await stockPanel.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await stockPanel.getByLabel('Unidad', { exact: true }).selectOption('kg')
  await stockPanel.getByText('1 producto con existencias', { exact: true }).waitFor()
  await stockPanel.getByText('3', { exact: true }).waitFor()
  await stockPanel.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await stockPanel.getByLabel('Distribución en lotes', { exact: true }).selectOption('varios')
  await stockPanel.getByText('1 producto con existencias', { exact: true }).waitFor()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await stockPanel.getByRole('button', { name: /^Ver lotes de Yute de prueba/ }).click()
    await lots.getByText('GEN_025', { exact: true }).waitFor()
    await check(`consolidated-lots-mobile-${width}`)
    const hidden = await stockPanel
      .locator('.stock-lots-table')
      .evaluate((table) => table.scrollWidth > table.clientWidth + 1)
    assert.equal(hidden, false, 'Todos los datos del lote caben en móvil')
    await lots.getByRole('searchbox', { name: 'Buscar lote de Yute de prueba' }).fill('NO-EXISTE')
    await lots.getByText('No hay lotes con esta búsqueda.', { exact: true }).waitFor()
    await stockPanel.getByRole('button', { name: /^Ocultar lotes de Yute de prueba/ }).click()
  }
  assert.deepEqual(errors, [])
  assert.equal(
    await page.evaluate(
      () => Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
    0,
  )
  console.log(
    JSON.stringify({
      checks: a11y.length,
      errors,
      mutations: mutations.length,
      result: 'OK (API ficticia; sin servidores ni escrituras reales)',
    }),
  )
} finally {
  await fs.writeFile(path.join(output, 'operations-a11y.json'), JSON.stringify(a11y, null, 2))
  await browser.close()
}
