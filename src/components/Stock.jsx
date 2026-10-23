import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Package, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading } from './UI'
import { Pagination } from './Operations'
import { StockLots } from './StockLots'
import { colombiaDate } from '../utils/auth'
import './Stock.css'

const initialFilters = { buscar: '', campo: 'todos', unidad: '', lotes: 'todos', ordenar: 'nombre' }
const placeholders = {
  todos: 'Producto, código, referencia o lote',
  producto: 'Nombre del producto',
  codigo: 'Código del producto',
  referencia: 'Referencia del producto',
  lote: 'Número de lote Genika',
}
export function Stock() {
  const [filters, setFilters] = useState(initialFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ data: [], total: 0, unidades: [] })
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(null)
  const id = useId()
  const panel = useRef(null),
    scrollAfterPage = useRef(false)
  useEffect(() => {
    if (!loading && scrollAfterPage.current) {
      scrollAfterPage.current = false
      panel.current?.scrollIntoView({ block: 'start' })
    }
  }, [loading, result])
  const filterCount =
    Number(!!filters.unidad) +
    Number(filters.lotes !== 'todos') +
    Number(filters.ordenar !== 'nombre')
  const filtered = !!filters.buscar.trim() || !!filterCount
  function change(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setExpanded(null)
    setPage(1)
  }
  function clear() {
    setFilters(initialFilters)
    setExpanded(null)
    setPage(1)
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setExpanded(null)
    const timer = setTimeout(
      () => {
        api
          .inventoryProducts(page, {
            ...filters,
            buscar: filters.buscar.trim(),
            signal: controller.signal,
          })
          .then((data) => {
            if (controller.signal.aborted) return
            if (data.total > 0 && page > Math.ceil(data.total / 25)) {
              setPage(Math.ceil(data.total / 25))
              return
            }
            setResult(data)
          })
          .catch((error) => {
            if (!controller.signal.aborted) setError(error)
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          })
      },
      filters.buscar.trim() ? 300 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filters, page, revision])
  return (
    <section ref={panel} className="ops-panel ops-stock" aria-labelledby="stock-heading">
      <div className="section-heading">
        <div>
          <h2 id="stock-heading">Existencias actuales</h2>
          {!loading && !error && result.consultado_at && (
            <span className="inventory-updated">
              Actualizado: {colombiaDate(result.consultado_at)}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          busy={loading}
          onClick={() => {
            setPage(1)
            setRevision((value) => value + 1)
          }}
        >
          <RefreshCw size={17} />
          Actualizar inventario
        </Button>
      </div>
      <div className="stock-searchbar">
        <label className="stock-field stock-search-field">
          <span>Buscar en</span>
          <select
            aria-label="Buscar en"
            value={filters.campo}
            onChange={(event) => change('campo', event.target.value)}
          >
            <option value="todos">Todos los campos</option>
            <option value="producto">Producto</option>
            <option value="codigo">Código</option>
            <option value="referencia">Referencia</option>
            <option value="lote">Lote</option>
          </select>
        </label>
        <label className="ops-search">
          <Search size={18} aria-hidden="true" />
          <span className="ops-sr-only">Buscar en mi inventario</span>
          <input
            type="search"
            maxLength={250}
            value={filters.buscar}
            onChange={(event) => change('buscar', event.target.value)}
            placeholder={placeholders[filters.campo]}
          />
        </label>
        <Button
          variant="secondary"
          className={`stock-filter-toggle ${showFilters ? 'is-open' : ''}`}
          aria-expanded={showFilters}
          aria-controls={`${id}-filters`}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          Filtros{filterCount > 0 && <span className="stock-filter-count">{filterCount}</span>}
        </Button>
      </div>
      <div className="stock-filters" id={`${id}-filters`} hidden={!showFilters}>
        <label className="stock-field">
          <span>Unidad</span>
          <select
            aria-label="Unidad"
            value={filters.unidad}
            onChange={(event) => change('unidad', event.target.value)}
          >
            <option value="">Todas las unidades</option>
            {(result.unidades || []).map((unit) => (
              <option value={unit} key={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="stock-field">
          <span>Distribución en lotes</span>
          <select
            aria-label="Distribución en lotes"
            value={filters.lotes}
            onChange={(event) => change('lotes', event.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="uno">Un solo lote</option>
            <option value="varios">Varios lotes</option>
          </select>
        </label>
        <label className="stock-field">
          <span>Ordenar por</span>
          <select
            aria-label="Ordenar por"
            value={filters.ordenar}
            onChange={(event) => change('ordenar', event.target.value)}
          >
            <option value="nombre">Nombre del producto</option>
            <option value="cantidad_desc">Mayor existencia</option>
            <option value="cantidad_asc">Menor existencia</option>
            <option value="reciente">Movimiento más reciente</option>
          </select>
        </label>
      </div>
      <div className="stock-results-bar">
        {!loading && !error && (
          <span role="status">
            {result.total} {result.total === 1 ? 'producto' : 'productos'} con existencias
          </span>
        )}
        {filtered && (
          <Button variant="secondary" onClick={clear}>
            <X size={15} aria-hidden="true" />
            Limpiar filtros
          </Button>
        )}
      </div>
      {filters.buscar.trim() && filters.campo === 'lote' && (
        <p className="stock-filter-note">
          El total del producto incluye todos sus lotes con existencias.
        </p>
      )}
      <ErrorNotice error={error} />
      {loading ? (
        <Loading label="Consultando existencias de bodega…" />
      ) : error ? null : !result.data.length ? (
        <div className="ops-empty">
          <Package size={34} />
          <h3>
            {filtered
              ? 'No hay coincidencias en tu inventario'
              : 'Aún no hay existencias registradas'}
          </h3>
          {!filtered && <p>Los ingresos confirmados aparecerán aquí.</p>}
        </div>
      ) : (
        <>
          <div
            className="ops-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Tabla de existencias actuales"
          >
            <table className="ops-table stock-products-table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Referencia</th>
                  <th scope="col">Total existencias</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Último movimiento</th>
                  <th scope="col">Lotes</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row, index) => {
                  const key = JSON.stringify([row.codigo_wms, row.unidad_medida]),
                    open = expanded === key
                  const detailId = `${id}-lots-${index}`
                  return (
                    <Fragment key={key}>
                      <tr className={open ? 'stock-product-open' : ''}>
                        <td data-label="Código" className="inventory-code">
                          {row.codigo_wms}
                        </td>
                        <td data-label="Producto">
                          <strong>{row.nombre}</strong>
                        </td>
                        <td data-label="Referencia">
                          {row.referencia_cliente || row.referencia_wms || '—'}
                        </td>
                        <td data-label="Total existencias">
                          <strong className="ops-stock-quantity">{row.cantidad_actual}</strong>
                        </td>
                        <td data-label="Unidad">{row.unidad_medida}</td>
                        <td data-label="Último movimiento">
                          {row.ultimo_movimiento_at
                            ? colombiaDate(row.ultimo_movimiento_at)
                            : 'Sin fecha informada'}
                        </td>
                        <td data-label="Lotes">
                          <Button
                            variant="secondary"
                            className="stock-expand"
                            aria-expanded={open}
                            aria-controls={open ? detailId : undefined}
                            aria-label={`${open ? 'Ocultar' : 'Ver'} lotes de ${row.nombre} (${row.codigo_wms}, ${row.unidad_medida})`}
                            onClick={() => setExpanded(open ? null : key)}
                          >
                            {open
                              ? 'Ocultar'
                              : `Ver ${row.total_lotes} ${row.total_lotes === 1 ? 'lote' : 'lotes'}`}
                            <ChevronDown size={16} aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="stock-lots-row">
                          <td colSpan={7}>
                            <div id={detailId}>
                              <StockLots product={row} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={result.total}
            busy={loading}
            onChange={(next) => {
              scrollAfterPage.current = true
              setExpanded(null)
              setPage(next)
            }}
            ariaLabel="Páginas del inventario"
            itemLabel="productos"
          />
        </>
      )}
    </section>
  )
}
