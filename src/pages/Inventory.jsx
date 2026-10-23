import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Package, PackagePlus, Plus, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading, Modal } from '../components/UI'
import { Pagination, Reload } from '../components/Operations'
import { BodegaCatalog } from '../components/BodegaCatalog'
import { Stock } from '../components/Stock'
import { moduleError, productStates, productCodeLabel, validDecimal } from '../utils/operations'
import './Operations.css'

const emptyProduct = () => ({
  prefijo: '',
  nombre: '',
  referencia: '',
  tipo: 'Bodega',
  unidad_medida: 'unidades',
  alto_cm: '',
  ancho_cm: '',
  largo_cm: '',
})

export function Inventory() {
  const { session } = useAuth()
  const canWrite = session.usuario.perfil === 'SOLICITANTE'
  const [result, setResult] = useState({ data: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [productMode, setProductMode] = useState('existente')
  const [draft, setDraft] = useState(emptyProduct)
  const [saving, setSaving] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState(null)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(null)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState('')
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState(null)
  const [revision, setRevision] = useState(0)
  const [similar, setSimilar] = useState([])
  const [checking, setChecking] = useState(false)
  const [similarError, setSimilarError] = useState(null)
  const [confirmedDifferent, setConfirmedDifferent] = useState(false)
  const [similarRetry, setSimilarRetry] = useState(0)
  const mutation = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api
      .products(page, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(moduleError(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, revision])

  useEffect(() => {
    if (!open || productMode !== 'nuevo') return
    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError(null)
    api
      .productCatalog({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setCatalog(value)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(moduleError(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })
    return () => controller.abort()
  }, [open, productMode, catalogRevision])

  useEffect(() => {
    setConfirmedDifferent(false)
    setSimilar([])
    setSimilarError(null)
    if (!open || productMode !== 'nuevo' || (!draft.nombre.trim() && !draft.referencia.trim())) {
      setChecking(false)
      return
    }
    const controller = new AbortController()
    setChecking(true)
    const timer = setTimeout(() => {
      const query = Object.fromEntries(
        Object.entries(draft).filter(
          ([key, value]) =>
            value.trim() && (!key.endsWith('_cm') || validDecimal(value, 10, 4, false)),
        ),
      )
      api
        .similarProducts(query, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setSimilar(data.data)
        })
        .catch((error) => {
          if (!controller.signal.aborted) setSimilarError(error)
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false)
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [draft, open, productMode, similarRetry])
  function openProduct() {
    setFormError(null)
    setProductMode(uncertain ? 'nuevo' : 'existente')
    setOpen(true)
  }
  function finishExisting(message) {
    pending.current = null
    setUncertain(false)
    setOpen(false)
    setDraft(emptyProduct())
    added(message)
  }
  function added(message) {
    setNotice(message)
    setSearch('')
    setPage(1)
    setRevision((value) => value + 1)
  }
  async function useExisting(product) {
    if (!canWrite || mutation.current) return
    mutation.current = true
    setSaving(true)
    setFormError(null)
    try {
      const selected = await api.useBodegaProduct(product.codigo_wms)
      pending.current = null
      setOpen(false)
      setDraft(emptyProduct())
      setUncertain(false)
      added(
        `Producto ${selected.codigo_wms} añadido a tu catálogo. Puedes usarlo en tus precargas.`,
      )
    } catch (error) {
      setFormError(error)
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }
  async function confirmProduct(product) {
    if (mutation.current) return
    mutation.current = true
    try {
      const data = await api.confirmProduct(product.cliente_producto_id)
      added(
        data.creacion_error
          ? `Ficha guardada. ${data.creacion_error.message}`
          : `Producto ${data.codigo_wms} disponible para crear lotes.`,
      )
    } catch (error) {
      setError(error)
    } finally {
      mutation.current = false
    }
  }
  async function removeProduct() {
    if (!canWrite || !removeTarget || mutation.current) return
    mutation.current = true
    setRemoving(true)
    setRemoveError(null)
    try {
      await api.removeProduct(removeTarget.cliente_producto_id)
      setRemoveTarget(null)
      added('Producto quitado de tu catálogo.')
    } catch (error) {
      setRemoveError(error)
    } finally {
      mutation.current = false
      setRemoving(false)
    }
  }
  async function save(event) {
    event.preventDefault()
    if (
      !canWrite ||
      mutation.current ||
      catalogLoading ||
      catalogError ||
      !catalog ||
      checking ||
      similarError
    )
      return
    const exact = similar.find((row) => row.exacta)
    if (exact && !uncertain) return useExisting(exact)
    if (similar.length && !confirmedDifferent && !uncertain) {
      setFormError('Revisa las fichas similares o confirma que este producto es diferente.')
      return
    }
    setFormError(null)
    const input = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()]),
    )
    if (
      ['alto_cm', 'ancho_cm', 'largo_cm'].some((key) => !validDecimal(input[key], 10, 4, false))
    ) {
      setFormError('Revisa las dimensiones. Usa valores desde cero, con hasta 4 decimales.')
      return
    }
    mutation.current = true
    setSaving(true)
    try {
      pending.current ??= {
        ...input,
        ...(confirmedDifferent ? { confirmar_diferente: true } : {}),
        request_id: crypto.randomUUID(),
      }
      const created = await api.createProduct(pending.current)
      pending.current = null
      setUncertain(false)
      setOpen(false)
      setDraft(emptyProduct())
      setNotice(
        created.creacion_error
          ? `Ficha guardada. ${created.creacion_error.message}`
          : `Producto ${created.codigo_wms} disponible en tu catálogo. Ya puedes usarlo para crear lotes.`,
      )
      setSearch('')
      setPage(1)
      setRevision((value) => value + 1)
    } catch (error) {
      setFormError(moduleError(error))
      if (error.code === 'PRODUCTOS_SIMILARES') setSimilarRetry((value) => value + 1)
      if (!error.status || error.status >= 500 || uncertain) setUncertain(true)
      else pending.current = null
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }
  const filtered = result.data.filter((row) =>
    `${row.codigo_wms || ''} ${row.prefijo || ''} ${row.nombre} ${row.referencia}`
      .toLocaleLowerCase('es')
      .includes(search.toLocaleLowerCase('es')),
  )
  function update(event) {
    const { name, value } = event.target
    setDraft((draft) => ({
      ...draft,
      [name]: value,
      ...(name === 'tipo' &&
      catalog?.presentaciones.find((item) => item.prefijo === draft.prefijo)?.tipo !== value
        ? { prefijo: '' }
        : {}),
    }))
  }

  return (
    <div className="ops-page inventory-page">
      <div className="page-title">
        <div>
          <h1>Mi inventario</h1>
        </div>
        <div className="ops-actions">
          {canWrite && (
            <Button onClick={openProduct}>
              <Plus size={18} />
              Crear producto
            </Button>
          )}
          {canWrite && (
            <Link className="button button-secondary" to="/precargas?crear=1">
              <PackagePlus size={18} />
              Registrar precarga
            </Link>
          )}
        </div>
      </div>
      <Stock />
      {notice && (
        <p className="notice notice-success" role="status">
          <Check size={18} />
          {notice}
        </p>
      )}
      <section className="ops-panel" aria-labelledby="catalog-heading">
        <div className="section-heading">
          <div>
            <span className="section-number">PRODUCTOS DE {session.cliente.nombre}</span>
            <h2 id="catalog-heading">Mi catálogo</h2>
          </div>
          <Reload busy={loading} onClick={() => setRevision((value) => value + 1)} />
        </div>
        <label className="ops-search">
          <Search size={18} />
          <span className="ops-sr-only">Buscar en esta página</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por código, producto o referencia"
          />
        </label>
        <ErrorNotice error={error} />
        {loading ? (
          <Loading label="Consultando tu catálogo…" />
        ) : error ? null : !result.data.length ? (
          <div className="ops-empty">
            <Package size={36} />
            <h3>
              {result.total === 0 ? 'Tu catálogo empieza aquí' : 'No hay productos en esta página'}
            </h3>
            {result.total === 0 && (
              <ol className="inventory-first-steps" aria-label="Cómo funciona tu catálogo">
                <li>Añade productos</li>
                <li>Registra tu precarga</li>
                <li>Bodega confirma el ingreso</li>
              </ol>
            )}
            {canWrite && (
              <Button variant="secondary" onClick={openProduct}>
                <Plus size={17} />
                {result.total === 0 ? 'Crear mi primer producto' : 'Añadir producto'}
              </Button>
            )}
          </div>
        ) : !filtered.length ? (
          <div className="ops-empty">
            <Search size={30} />
            <h3>No hay coincidencias en esta página</h3>
            <p>Prueba otro código o consulta otra página.</p>
          </div>
        ) : (
          <div
            className="ops-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Tabla de mi catálogo"
          >
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Referencia</th>
                  <th>Unidad</th>
                  <th>Dimensiones (cm)</th>
                  <th>Estado</th>
                  {canWrite && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.cliente_producto_id}>
                    <td data-label="Código" className="inventory-code">
                      {productCodeLabel(row)}
                    </td>
                    <td data-label="Producto">
                      <strong>{row.nombre}</strong>
                    </td>
                    <td data-label="Referencia">{row.referencia}</td>
                    <td data-label="Unidad">{row.unidad_medida}</td>
                    <td data-label="Dimensiones (cm)" className="inventory-dimensions">
                      {row.alto_cm} × {row.ancho_cm} × {row.largo_cm}
                    </td>
                    <td data-label="Estado">
                      <span className={`ops-status ops-status-${row.estado.toLowerCase()}`}>
                        {productStates[row.estado] || row.estado}
                      </span>
                      {canWrite && row.estado === 'PENDIENTE' && (
                        <Button variant="secondary" onClick={() => confirmProduct(row)}>
                          Verificar creación
                        </Button>
                      )}
                    </td>
                    {canWrite && (
                      <td data-label="Acciones">
                        <Button
                          variant="secondary"
                          disabled={removing}
                          aria-label={`Quitar ${row.nombre} de mi catálogo`}
                          onClick={() => {
                            setRemoveError(null)
                            setRemoveTarget(row)
                          }}
                        >
                          <Trash2 size={16} />
                          Quitar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && result.total > 0 && (
          <Pagination page={page} total={result.total} busy={loading} onChange={setPage} />
        )}
      </section>
      <Modal
        open={!!removeTarget}
        onClose={() => {
          if (!removing) setRemoveTarget(null)
        }}
        title="Quitar de mi catálogo"
      >
        <p>
          ¿Quieres quitar <strong>{removeTarget?.nombre}</strong> de tu catálogo?
        </p>
        <p className="body-copy">El producto seguirá existiendo en Genika.</p>
        <ErrorNotice error={removeError} />
        <div className="modal-actions">
          <Button variant="secondary" disabled={removing} onClick={() => setRemoveTarget(null)}>
            Volver
          </Button>
          <Button busy={removing} onClick={removeProduct}>
            Quitar de mi catálogo
          </Button>
        </div>
      </Modal>
      <Modal
        open={open}
        onClose={() => {
          if (!saving) setOpen(false)
        }}
        title="Añadir producto a mi catálogo"
        className="inventory-product-modal"
        wide
      >
        <div
          className="inventory-product-options"
          role="group"
          aria-label="Opciones para añadir un producto"
        >
          <Button
            variant="secondary"
            aria-pressed={productMode === 'existente'}
            disabled={saving || uncertain}
            onClick={() => setProductMode('existente')}
          >
            Usar producto existente
          </Button>
          <Button
            variant="secondary"
            aria-pressed={productMode === 'nuevo'}
            disabled={saving}
            onClick={() => setProductMode('nuevo')}
          >
            Crear producto nuevo
          </Button>
        </div>
        {open && productMode === 'existente' && (
          <BodegaCatalog canWrite={canWrite} onAdded={finishExisting} onBusyChange={setSaving} />
        )}
        {productMode === 'nuevo' && (
          <form onSubmit={save} className="ops-form">
            <ErrorNotice error={catalogError} />
            {catalogLoading && <Loading label="Cargando presentaciones…" />}
            {catalogError && (
              <Button variant="secondary" onClick={() => setCatalogRevision((value) => value + 1)}>
                Reintentar presentaciones
              </Button>
            )}
            <fieldset
              disabled={saving || uncertain || catalogLoading || !!catalogError || !catalog}
              className="ops-fields"
            >
              <legend className="ops-sr-only">Ficha del producto</legend>
              <div className="field">
                <label htmlFor="product-prefix">Presentación / prefijo</label>
                <select
                  id="product-prefix"
                  name="prefijo"
                  value={draft.prefijo}
                  onChange={update}
                  required
                  autoFocus
                >
                  <option value="">Selecciona una presentación</option>
                  {catalog?.presentaciones
                    .filter((item) => item.tipo === draft.tipo)
                    .map((item) => (
                      <option key={item.prefijo} value={item.prefijo}>
                        {item.nombre} · {item.prefijo}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="product-code">Código Genika (automático)</label>
                <input
                  id="product-code"
                  value={
                    draft.prefijo
                      ? `${draft.prefijo} · Pendiente de asignación`
                      : 'Selecciona la presentación'
                  }
                  readOnly
                  aria-describedby="product-code-help"
                />
                <small id="product-code-help" className="field-hint">
                  El código se genera automáticamente según la presentación, sin aprobación manual.
                </small>
              </div>
              <div className="field">
                <label htmlFor="product-name">Nombre del producto</label>
                <input
                  id="product-name"
                  name="nombre"
                  value={draft.nombre}
                  onChange={update}
                  required
                  maxLength={250}
                />
              </div>
              <div className="field">
                <label htmlFor="product-ref">Referencia / modelo</label>
                <input
                  id="product-ref"
                  name="referencia"
                  value={draft.referencia}
                  onChange={update}
                  required
                  maxLength={250}
                />
              </div>
              <div className="field">
                <label htmlFor="product-type">Tipo de producto</label>
                <select id="product-type" name="tipo" value={draft.tipo} onChange={update} required>
                  {catalog?.tipos.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="product-unit">Unidad de medida</label>
                <select
                  id="product-unit"
                  name="unidad_medida"
                  value={draft.unidad_medida}
                  onChange={update}
                >
                  {catalog?.unidades.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit.charAt(0).toUpperCase() + unit.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="ops-form-help">
                Dimensiones por unidad en centímetros. Si una dimensión no aplica, indica 0.
              </p>
              <div className="ops-dimensions">
                {[
                  ['alto_cm', 'Alto'],
                  ['ancho_cm', 'Ancho'],
                  ['largo_cm', 'Largo'],
                ].map(([name, label]) => (
                  <div className="field" key={name}>
                    <label htmlFor={`product-${name}`}>{label} (cm)</label>
                    <input
                      id={`product-${name}`}
                      name={name}
                      value={draft[name]}
                      onChange={update}
                      inputMode="decimal"
                      required
                      maxLength={15}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <section
              className="ops-similar"
              aria-label="Revisión de productos existentes"
              aria-busy={checking}
            >
              <h3>Evitemos productos duplicados</h3>
              {checking && <p role="status">Buscando coincidencias mientras completas la ficha…</p>}
              <ErrorNotice error={similarError} />
              {similarError && (
                <Button variant="secondary" onClick={() => setSimilarRetry((value) => value + 1)}>
                  Reintentar coincidencias
                </Button>
              )}
              {!checking && !similarError && !similar.length && (
                <p>
                  Se comparan nombre, referencia, presentación, unidad y dimensiones al escribir y
                  al guardar.
                </p>
              )}
              {similar.map((item) => (
                <div key={item.codigo_wms} className="ops-similar-row">
                  <div>
                    <strong>{item.nombre}</strong>
                    <small>
                      {item.codigo_wms} · {item.referencia} · {item.unidad_medida}
                    </small>
                    <small>
                      {item.alto_cm} × {item.ancho_cm} × {item.largo_cm} cm ·{' '}
                      {item.exacta ? 'Ficha idéntica' : 'Ficha parecida'}
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={saving || uncertain || checking}
                    onClick={() => useExisting(item)}
                  >
                    Usar esta ficha
                  </Button>
                </div>
              ))}
              {similar.length > 0 && !similar.some((item) => item.exacta) && (
                <label className="ops-confirm-different">
                  <input
                    type="checkbox"
                    checked={confirmedDifferent}
                    disabled={saving || uncertain || checking}
                    onChange={(event) => setConfirmedDifferent(event.target.checked)}
                  />
                  Revisé las coincidencias y confirmo que mi producto es diferente.
                </label>
              )}
            </section>
            <ErrorNotice error={formError} />
            {uncertain && (
              <p className="field-hint" role="status">
                No se pudo confirmar el guardado. Reintenta con los mismos datos para evitar
                duplicados. Conservamos el identificador mientras permanezcas en esta página.
              </p>
            )}
            <div className="modal-actions">
              <Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
                Volver
              </Button>
              <Button
                type="submit"
                busy={saving}
                disabled={
                  catalogLoading ||
                  !!catalogError ||
                  !catalog ||
                  checking ||
                  !!similarError ||
                  (!uncertain &&
                    similar.length > 0 &&
                    !similar.some((item) => item.exacta) &&
                    !confirmedDifferent)
                }
              >
                {uncertain
                  ? 'Reintentar guardado'
                  : similar.some((item) => item.exacta)
                    ? 'Reutilizar ficha idéntica'
                    : 'Crear producto'}
                <Plus size={17} />
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
