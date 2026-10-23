import { useEffect, useMemo, useRef, useState } from 'react'
import { PackageCheck, Search, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading } from './UI'
import { Pagination } from './Operations'

export const pickingKey = (row) => JSON.stringify([row.codigo_wms, row.wms_lote_id])
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
const matches = (row, search) =>
  [row.nombre, row.codigo_wms, row.wms_lote_id, row.referencia_cliente, row.referencia_wms].some(
    (value) => normalize(value).includes(normalize(search)),
  )
const PAGE_SIZE = 25

function Pages({ page, total, busy, onChange, label }) {
  const [jump, setJump] = useState('')
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const go = () => {
    const target = Number(jump)
    if (Number.isInteger(target) && target >= 1 && target <= pages) {
      onChange(target)
      setJump('')
    }
  }
  return (
    <div className="picking-pagination">
      <Pagination page={page} total={total} busy={busy} onChange={onChange} ariaLabel={label} />
      {pages > 2 && (
        <div className="picking-jump">
          <label>
            Ir a página
            <input
              value={jump}
              inputMode="numeric"
              aria-label={`Ir a página de ${label === 'Páginas de inventario' ? 'inventario' : 'seleccionados'}`}
              onChange={(event) => setJump(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  go()
                }
              }}
            />
          </label>
          <Button
            variant="secondary"
            disabled={busy || !/^\d+$/.test(jump) || Number(jump) < 1 || Number(jump) > pages}
            onClick={go}
          >
            Ir
          </Button>
        </div>
      )}
    </div>
  )
}

export function PickingItems({ selected, onChange, disabled, onBusy, validationTarget }) {
  const [view, setView] = useState('inventory'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null)
  const [selectedQuery, setSelectedQuery] = useState(''),
    [selectedPage, setSelectedPage] = useState(1)
  const [bulk, setBulk] = useState(null),
    [bulkError, setBulkError] = useState(null)
  const bulkController = useRef(null)
  const selectedKeys = useMemo(() => new Set(selected.map(pickingKey)), [selected])
  useEffect(() => {
    if (view !== 'inventory') return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const timer = setTimeout(
      () =>
        api
          .inventory(page, { buscar: query, signal: controller.signal })
          .then((data) => {
            if (!controller.signal.aborted) setResult(data)
          })
          .catch((error) => {
            if (!controller.signal.aborted) setError(error)
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          }),
      250,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [page, query, view])
  useEffect(() => () => bulkController.current?.abort(), [])
  useEffect(() => {
    if (!validationTarget) return
    const index = selected.findIndex((row) => pickingKey(row) === validationTarget.key)
    setView('selected')
    setSelectedQuery('')
    setSelectedPage(Math.max(1, Math.floor(index / PAGE_SIZE) + 1))
  }, [validationTarget]) // La referencia cambia exclusivamente al validar el envío.
  const filtered = useMemo(
    () => selected.filter((row) => matches(row, selectedQuery)),
    [selected, selectedQuery],
  )
  const safePage = Math.min(selectedPage, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)))
  const selectedRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const busy = disabled || !!bulk
  async function selectAll() {
    if (bulkController.current) return
    const controller = new AbortController()
    bulkController.current = controller
    setBulk({ loaded: 0, total: 0 })
    setBulkError(null)
    onBusy(true)
    try {
      const complete = new Map(),
        seen = new Set()
      let total = 0,
        loaded = 0
      for (let current = 1; current === 1 || loaded < total; current++) {
        const data = await api.inventory(current, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (current === 1) total = data.total
        if (!data.data.length && loaded < total)
          throw new Error('El inventario cambió. Actualiza e intenta seleccionar todo nuevamente.')
        for (const row of data.data) {
          const id = pickingKey(row)
          if (seen.has(id))
            throw new Error(
              'El inventario cambió. Actualiza e intenta seleccionar todo nuevamente.',
            )
          seen.add(id)
          if (Number(row.cantidad_actual) > 0)
            complete.set(id, { ...row, cantidad: row.cantidad_actual })
        }
        loaded += data.data.length
        setBulk({ loaded: Math.min(loaded, total), total })
      }
      onChange([...complete.values()])
      setView('selected')
      setSelectedQuery('')
      setSelectedPage(1)
    } catch (error) {
      if (!controller.signal.aborted) setBulkError(error)
    } finally {
      if (bulkController.current === controller) {
        bulkController.current = null
        if (!controller.signal.aborted) {
          setBulk(null)
          onBusy(false)
        }
      }
    }
  }
  function stop() {
    bulkController.current?.abort()
    bulkController.current = null
    setBulk(null)
    onBusy(false)
  }
  return (
    <section className="picking-items" aria-label="Productos del alistamiento">
      <div className="picking-heading">
        <div>
          <h3>Mercancía para recoger</h3>
          <p>Selecciona productos y cantidades para alistar y cargar en bodega.</p>
        </div>
        <span className="picking-count" aria-live="polite">
          {selected.length} seleccionados
        </span>
      </div>
      <div className="picking-toolbar">
        <div className="picking-tabs">
          <Button
            variant={view === 'inventory' ? 'primary' : 'secondary'}
            aria-pressed={view === 'inventory'}
            disabled={busy}
            onClick={() => setView('inventory')}
          >
            Mi inventario
          </Button>
          <Button
            variant={view === 'selected' ? 'primary' : 'secondary'}
            aria-pressed={view === 'selected'}
            disabled={busy}
            onClick={() => setView('selected')}
          >
            Seleccionados ({selected.length})
          </Button>
        </div>
        <Button variant="secondary" disabled={busy} onClick={selectAll}>
          <PackageCheck size={17} />
          Recoger todo mi inventario
        </Button>
      </div>
      <ErrorNotice error={bulkError} />
      {bulk && (
        <div className="picking-progress" role="status">
          <span>
            Consultando inventario: {bulk.loaded} de {bulk.total || '…'} registros.
          </span>
          <Button variant="secondary" onClick={stop}>
            Detener selección
          </Button>
        </div>
      )}
      <fieldset disabled={busy} className="picking-controls">
        <label className="ops-search">
          <Search size={18} />
          <span className="ops-sr-only">
            {view === 'inventory' ? 'Buscar mercancía' : 'Buscar seleccionados'}
          </span>
          <input
            value={view === 'inventory' ? query : selectedQuery}
            placeholder="Buscar producto, referencia o lote"
            onChange={(event) => {
              if (view === 'inventory') {
                setQuery(event.target.value)
                setPage(1)
              } else {
                setSelectedQuery(event.target.value)
                setSelectedPage(1)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
        </label>
        {view === 'inventory' && <ErrorNotice error={error} />}
        {view === 'inventory' && loading ? (
          <Loading label="Consultando existencias…" />
        ) : (
          <>
            <div
              className="picking-table-wrap"
              role="region"
              aria-label={
                view === 'inventory' ? 'Inventario para seleccionar' : 'Productos seleccionados'
              }
              tabIndex={0}
            >
              <table className="picking-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Lote</th>
                    <th>En inventario</th>
                    <th>{view === 'selected' ? 'Cantidad a recoger' : 'Selección'}</th>
                    {view === 'selected' && (
                      <th>
                        <span className="ops-sr-only">Quitar</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(view === 'inventory' ? result.data : selectedRows).map((row) => (
                    <tr key={pickingKey(row)}>
                      <td data-label="Producto">
                        <strong>{row.nombre}</strong>
                        <small>
                          {row.codigo_wms}
                          {row.referencia_cliente ? ` · ${row.referencia_cliente}` : ''}
                        </small>
                      </td>
                      <td data-label="Lote">{row.wms_lote_id}</td>
                      <td data-label="En inventario">
                        {row.cantidad_actual} <small>{row.unidad_medida}</small>
                      </td>
                      {view === 'inventory' ? (
                        <td data-label="Selección">
                          <Button
                            variant="secondary"
                            disabled={
                              selectedKeys.has(pickingKey(row)) || Number(row.cantidad_actual) <= 0
                            }
                            onClick={() => onChange([...selected, { ...row, cantidad: '' }])}
                          >
                            {selectedKeys.has(pickingKey(row)) ? 'Agregado' : 'Agregar'}
                          </Button>
                        </td>
                      ) : (
                        <>
                          <td data-label="Cantidad a recoger">
                            <input
                              className="picking-quantity"
                              inputMode="decimal"
                              aria-label={`Cantidad ${row.nombre} ${row.wms_lote_id}`}
                              value={row.cantidad}
                              aria-invalid={validationTarget?.key === pickingKey(row) || undefined}
                              onFocus={(event) => {
                                const input = event.currentTarget
                                requestAnimationFrame(() =>
                                  input.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
                                )
                              }}
                              onChange={(event) =>
                                onChange(
                                  selected.map((item) =>
                                    pickingKey(item) === pickingKey(row)
                                      ? { ...item, cantidad: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td data-label="Quitar">
                            <Button
                              variant="secondary"
                              aria-label={`Quitar ${row.nombre} ${row.wms_lote_id}`}
                              onClick={() =>
                                onChange(
                                  selected.filter((item) => pickingKey(item) !== pickingKey(row)),
                                )
                              }
                            >
                              <Trash2 size={17} />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(view === 'inventory' ? result.data.length : filtered.length) && (
                <p className="picking-empty">
                  {view === 'inventory'
                    ? 'No hay existencias para esta búsqueda.'
                    : 'No hay productos seleccionados para esta búsqueda.'}
                </p>
              )}
            </div>
            <Pages
              page={view === 'inventory' ? page : safePage}
              total={view === 'inventory' ? result.total : filtered.length}
              busy={busy || (loading && view === 'inventory')}
              onChange={view === 'inventory' ? setPage : setSelectedPage}
              label={view === 'inventory' ? 'Páginas de inventario' : 'Páginas de seleccionados'}
            />
          </>
        )}
      </fieldset>
    </section>
  )
}

export function PickingLines({ lines }) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(1)
  const found = useMemo(() => lines.filter((row) => matches(row, query)), [lines, query])
  const safePage = Math.min(page, Math.max(1, Math.ceil(found.length / PAGE_SIZE)))
  return (
    <section aria-label="Mercancía solicitada" className="picking-detail">
      <div className="picking-heading">
        <h3>Mercancía solicitada</h3>
        <span className="picking-count">{lines.length} productos</span>
      </div>
      <label className="ops-search">
        <Search size={18} />
        <span className="ops-sr-only">Buscar en el alistamiento</span>
        <input
          value={query}
          placeholder="Buscar producto o lote"
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />
      </label>
      <div
        className="picking-table-wrap"
        role="region"
        aria-label="Detalle de productos del alistamiento"
        tabIndex={0}
      >
        <table className="picking-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Lote</th>
              <th>Cantidad solicitada</th>
            </tr>
          </thead>
          <tbody>
            {found.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).map((row) => (
              <tr key={pickingKey(row)}>
                <td data-label="Producto">
                  <strong>{row.nombre}</strong>
                  <small>{row.codigo_wms}</small>
                </td>
                <td data-label="Lote">{row.wms_lote_id}</td>
                <td data-label="Cantidad solicitada">
                  {row.cantidad} {row.unidad_medida}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!found.length && <p className="picking-empty">No hay productos para esta búsqueda.</p>}
      </div>
      <Pages
        page={safePage}
        total={found.length}
        onChange={setPage}
        label="Páginas del alistamiento"
      />
    </section>
  )
}
