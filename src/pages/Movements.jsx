import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Search } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading } from '../components/UI'
import { Pagination, Reload } from '../components/Operations'
import { colombiaDate } from '../utils/auth'
import './Operations.css'
import './Movements.css'

const types = {
  ENTRADA: 'Ingreso',
  SALIDA: 'Salida',
  REUBICACION: 'Reubicación',
  TRANSFORMACION: 'Transformación',
  ALISTAMIENTO: 'Alistamiento',
}
const emptyFilters = { buscar: '', tipo: '', desde: '', hasta: '' }

export function Movements() {
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const invalidRange = filters.desde && filters.hasta && filters.desde > filters.hasta
  const filtered = Object.values(filters).some((value) => value.trim())

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    if (invalidRange) {
      setLoading(false)
      return () => controller.abort()
    }
    const timer = setTimeout(
      () => {
        api
          .movements(page, { ...filters, buscar: filters.buscar.trim(), signal: controller.signal })
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
  }, [filters, page, revision, invalidRange])

  function change(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }
  function clear() {
    setFilters(emptyFilters)
    setPage(1)
  }

  return (
    <div className="ops-page inventory-page movements-page">
      <div className="page-title">
        <div>
          <span className="section-number">TU MERCANCÍA / HISTORIAL</span>
          <h1>Movimientos</h1>
        </div>
        <Reload busy={loading} onClick={() => setRevision((value) => value + 1)} />
      </div>
      <section className="ops-panel" aria-labelledby="movement-history-heading">
        <div className="section-heading">
          <div>
            <h2 id="movement-history-heading">Historial de productos</h2>
            <span className="inventory-updated">Fechas en hora de Colombia</span>
          </div>
          {!loading && !error && !invalidRange && (
            <span className="movements-count" role="status">
              {result.total} movimientos
            </span>
          )}
        </div>
        <div className="movements-filters">
          <label className="ops-search">
            <Search size={18} aria-hidden="true" />
            <span className="ops-sr-only">Buscar movimientos</span>
            <input
              type="search"
              maxLength={250}
              value={filters.buscar}
              onChange={(event) => change('buscar', event.target.value)}
              placeholder="Producto, código, referencia o lote"
            />
          </label>
          <label className="movements-field">
            <span id="movement-type-label">Tipo</span>
            <select
              aria-labelledby="movement-type-label"
              value={filters.tipo}
              onChange={(event) => change('tipo', event.target.value)}
            >
              <option value="">Todos los movimientos</option>
              {Object.entries(types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="movements-field">
            <span>Desde</span>
            <input
              type="date"
              min="1900-01-01"
              max={filters.hasta || '9999-12-31'}
              value={filters.desde}
              onChange={(event) => change('desde', event.target.value)}
            />
          </label>
          <label className="movements-field">
            <span>Hasta</span>
            <input
              type="date"
              min={filters.desde || '1900-01-01'}
              max="9999-12-31"
              value={filters.hasta}
              onChange={(event) => change('hasta', event.target.value)}
            />
          </label>
          {filtered && (
            <Button variant="secondary" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
        </div>
        <ErrorNotice
          error={invalidRange ? 'La fecha inicial debe ser anterior o igual a la final.' : error}
        />
        {invalidRange || error ? null : loading ? (
          <Loading label="Consultando movimientos…" />
        ) : !result.data.length ? (
          <div className="ops-empty">
            <ArrowLeftRight size={32} aria-hidden="true" />
            <h3>
              {filtered
                ? 'No hay movimientos con estos filtros'
                : 'Aún no hay movimientos registrados'}
            </h3>
            {filtered && (
              <Button variant="secondary" onClick={clear}>
                Ver todos los movimientos
              </Button>
            )}
          </div>
        ) : (
          <>
            <div
              className="ops-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tabla de movimientos de mis productos"
            >
              <table className="ops-table movements-table">
                <caption className="ops-sr-only">
                  Movimientos de los productos de tu empresa, del más reciente al más antiguo.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Movimiento</th>
                    <th scope="col">Fecha y hora</th>
                    <th scope="col">Referencia</th>
                    <th scope="col">Lote Genika</th>
                    <th scope="col" className="movement-quantity">
                      Cantidad
                    </th>
                    <th scope="col">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => {
                    const Icon =
                      row.tipo === 'ENTRADA'
                        ? ArrowDownLeft
                        : row.tipo === 'SALIDA'
                          ? ArrowUpRight
                          : ArrowLeftRight
                    return (
                      <tr key={row.id}>
                        <td data-label="Producto" className="movement-product">
                          <strong>{row.nombre}</strong>
                          <small>{row.codigo_wms}</small>
                        </td>
                        <td data-label="Movimiento">
                          <span className={`movement-type movement-type-${row.tipo.toLowerCase()}`}>
                            <Icon size={14} aria-hidden="true" />
                            {types[row.tipo] || row.tipo}
                          </span>
                        </td>
                        <td data-label="Fecha y hora" className="movement-date">
                          <time dateTime={row.fecha}>{colombiaDate(row.fecha)}</time>
                        </td>
                        <td data-label="Referencia">
                          {row.referencia_cliente || row.referencia_wms || '—'}
                        </td>
                        <td data-label="Lote Genika" className="inventory-code">
                          {row.wms_lote_id}
                        </td>
                        <td data-label="Cantidad" className="movement-quantity">
                          <strong>{row.cantidad}</strong>
                        </td>
                        <td data-label="Unidad">{row.unidad_medida}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={result.total}
              busy={loading}
              onChange={setPage}
              ariaLabel="Páginas de movimientos"
            />
            {result.consultado_at && (
              <small className="inventory-updated movements-updated">
                Actualizado: {colombiaDate(result.consultado_at)}
              </small>
            )}
          </>
        )}
      </section>
    </div>
  )
}
