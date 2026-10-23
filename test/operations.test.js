import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preloadInput, validDecimal } from '../src/utils/operations.js'

test('Cantidades decimales se validan sin redondeos, exponentes ni valores negativos', () => {
  for (const value of ['1', '0.000001', '99999999999999.999999', '15.500000'])
    assert.equal(validDecimal(value), true, value)
  for (const value of [
    '0',
    '0.000000',
    '-1',
    '1e6',
    '1,5',
    '01',
    '1.',
    '.5',
    '1.0000001',
    '100000000000000',
    'Infinity',
    'NaN',
    '',
    null,
  ])
    assert.equal(validDecimal(value), false, String(value))
  assert.equal(validDecimal('0', 10, 4, false), true)
  assert.equal(validDecimal('9999999999.9999', 10, 4, false), true)
  assert.equal(validDecimal('1.00001', 10, 4, false), false)
})

test('La solicitud solo incluye vínculos seleccionables y conserva la cantidad exacta', () => {
  const products = [
    {
      cliente_producto_id: '7',
      producto_version_id: '9',
      nombre: 'Producto',
      estado: 'HABILITADO',
      codigo_wms: 'YUT001',
    },
  ]
  const draft = {
    fecha_programada_at: '2026-12-01T08:00',
    referencia_lote: ' LOTE-1 ',
    referencia_contenedor: '',
    referencia_transporte: '',
    observacion: '',
    detalles: [
      { key: 'local', cliente_producto_id: '7', cantidad_declarada: '99999999999999.999999' },
    ],
  }
  const result = preloadInput(draft, products, 'uuid')
  assert.deepEqual(result, {
    request_id: 'uuid',
    fecha_programada_at: '2026-12-01T08:00:00-05:00',
    referencia_lote: 'LOTE-1',
    referencia_contenedor: null,
    referencia_transporte: null,
    observacion: null,
    detalles: [
      {
        cliente_producto_id: '7',
        producto_version_id: '9',
        cantidad_declarada: '99999999999999.999999',
      },
    ],
  })
  assert.throws(
    () =>
      preloadInput(
        { ...draft, detalles: [...draft.detalles, ...draft.detalles] },
        products,
        'uuid',
      ),
    /una sola vez/,
  )
  assert.throws(
    () => preloadInput(draft, [{ ...products[0], estado: 'DESHABILITADO' }], 'uuid'),
    /habilitados/,
  )
  assert.throws(() => preloadInput(draft, [], 'uuid'), /habilitados/)
  assert.throws(() => preloadInput({ ...draft, detalles: [] }, products, 'uuid'), /entre 1 y 25/)
})
