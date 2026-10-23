import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading } from './UI'
import { Pagination } from './Operations'
import { colombiaDate } from '../utils/auth'

export function StockLots({ product }) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
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
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const timer = setTimeout(
      () => {
        api
          .inventoryLots(product.codigo_wms, page, {
            unidad: product.unidad_medida,
            buscar: search.trim(),
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
      search.trim() ? 250 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [product.codigo_wms, product.unidad_medida, page, search, revision])
  return (
    <section ref={panel} className="stock-lots" aria-labelledby={id}>
      <div className="stock-lots-heading">
        <div>
          <h3 id={id}>Lotes de {product.nombre}</h3>
          {result && !loading && !error && (
            <span className="inventory-updated">
              {result.producto.cantidad_actual} {product.unidad_medida} en{' '}
              {result.producto.total_lotes} {result.producto.total_lotes === 1 ? 'lote' : 'lotes'} ·{' '}
              {colombiaDate(result.consultado_at)}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          busy={loading}
          aria-label={`Actualizar lotes de ${product.nombre}`}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </Button>
      </div>
      <label className="ops-search">
        <Search size={17} aria-hidden="true" />
        <span className="ops-sr-only">Buscar lote de {product.nombre}</span>
        <input
          type="search"
          maxLength={250}
          value={search}
          placeholder="Buscar lote"
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </label>
      <ErrorNotice error={error} />
      {loading ? (
        <Loading label="Consultando lotes…" />
      ) : error ? null : result?.data.length ? (
        <>
          <table className="stock-lots-table">
            <caption className="ops-sr-only">Existencias por lote de {product.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">Lote Genika</th>
                <th scope="col">Existencias ({product.unidad_medida})</th>
                <th scope="col">Último movimiento</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((lot) => (
                <tr key={lot.wms_lote_id}>
                  <td data-label="Lote Genika">
                    <strong>{lot.wms_lote_id}</strong>
                  </td>
                  <td data-label={`Existencias (${product.unidad_medida})`}>
                    <strong>{lot.cantidad_actual}</strong>
                  </td>
                  <td data-label="Último movimiento">
                    {lot.ultimo_movimiento_at
                      ? colombiaDate(lot.ultimo_movimiento_at)
                      : 'Sin fecha informada'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.total > 25 && (
            <Pagination
              page={page}
              total={result.total}
              busy={loading}
              onChange={(next) => {
                scrollAfterPage.current = true
                setPage(next)
              }}
              itemLabel="lotes"
              ariaLabel={`Páginas de lotes de ${product.nombre}`}
            />
          )}
        </>
      ) : (
        <p className="stock-filter-note">No hay lotes con esta búsqueda.</p>
      )}
    </section>
  )
}
