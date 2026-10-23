import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading } from './UI'
import { Pagination } from './Operations'

export function BodegaCatalog({ canWrite, onAdded, onBusyChange }) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], total: 0 }),
    [busy, setBusy] = useState(true)
  const [error, setError] = useState(null),
    [adding, setAdding] = useState(null),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    setError(null)
    const timer = setTimeout(() => {
      api
        .bodegaProducts(
          { page, limit: 25, ...(search.trim() ? { buscar: search.trim() } : {}) },
          { signal: controller.signal },
        )
        .then((data) => {
          if (!controller.signal.aborted) setResult(data)
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(error)
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [page, search, retry])
  async function add(product) {
    if (!canWrite || adding) return
    onBusyChange?.(true)
    setAdding(product.codigo_wms)
    setError(null)
    try {
      const selected = await api.useBodegaProduct(product.codigo_wms)
      onAdded(
        `Producto ${selected.codigo_wms} añadido a tu catálogo. Ya puedes usarlo en tus precargas.`,
      )
    } catch (error) {
      setError(error)
    } finally {
      setAdding(null)
      onBusyChange?.(false)
    }
  }
  return (
    <section className="ops-bodega" aria-labelledby="bodega-heading">
      <h3 id="bodega-heading" className="ops-sr-only">
        Productos Bodega
      </h3>
      <label className="ops-search">
        <Search size={18} aria-hidden="true" />
        <span className="ops-sr-only">Buscar productos Bodega</span>
        <input
          type="search"
          maxLength={250}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder="Busca por nombre, referencia o código"
        />
      </label>
      <ErrorNotice error={error} />
      {error && (
        <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
          Reintentar productos Bodega
        </Button>
      )}
      {busy ? (
        <Loading label="Consultando productos Bodega…" />
      ) : (
        <>
          {!result.data.length ? (
            <p className="ops-caption">No hay fichas para esta búsqueda.</p>
          ) : (
            <div
              className="ops-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tabla de productos Bodega"
            >
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Referencia</th>
                    <th>Unidad / dimensiones</th>
                    {canWrite && <th>Mi catálogo</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((item) => (
                    <tr key={item.codigo_wms}>
                      <td data-label="Producto">
                        <strong>{item.nombre}</strong>
                        <small>{item.codigo_wms}</small>
                      </td>
                      <td data-label="Referencia">{item.referencia}</td>
                      <td data-label="Unidad / dimensiones">
                        {item.unidad_medida}
                        <small>
                          {item.alto_cm} × {item.ancho_cm} × {item.largo_cm} cm
                        </small>
                      </td>
                      {canWrite && (
                        <td data-label="Mi catálogo">
                          <Button
                            variant="secondary"
                            disabled={!!adding}
                            busy={adding === item.codigo_wms}
                            onClick={() => add(item)}
                          >
                            Añadir a mi catálogo
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.total > 0 && (
            <Pagination
              page={page}
              total={result.total}
              busy={busy}
              onChange={setPage}
              ariaLabel="Páginas de productos Bodega"
            />
          )}
        </>
      )}
    </section>
  )
}
