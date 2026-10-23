import { useEffect, useRef, useState } from 'react'
import { PreloadReception } from '../components/PreloadReception'
import { ArrivalTimePicker } from '../components/ArrivalTimePicker'
import { hasOperatingHours, nextArrival, arrivalTimes } from '../utils/operationSchedule'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  CalendarDays,
  ChevronDown,
  PackagePlus,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading, Modal } from '../components/UI'
import { Pagination, Reload } from '../components/Operations'
import { colombiaDate } from '../utils/auth'
import { moduleError, preloadInput, preloadStatus, productCodeLabel } from '../utils/operations'
import './Operations.css'
import './ScheduledOperations.css'
import './Preloads.css'

const emptyDraft = () => ({
  fecha_programada_at: '',
  referencia_lote: '',
  referencia_contenedor: '',
  referencia_transporte: '',
  observacion: '',
  detalles: [{ key: crypto.randomUUID(), cliente_producto_id: '', cantidad_declarada: '' }],
})

export function Preloads() {
  const { session } = useAuth()
  const canWrite = session.usuario.perfil === 'SOLICITANTE'
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState(emptyDraft)
  const [products, setProducts] = useState([])
  const [productPage, setProductPage] = useState(0)
  const [productTotal, setProductTotal] = useState(0)
  const [productLoading, setProductLoading] = useState(false)
  const [productError, setProductError] = useState(null)
  const [review, setReview] = useState(null)
  const [sending, setSending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [savedDetail, setSavedDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const [verifying, setVerifying] = useState(false)
  const mutation = useRef(false)
  const catalogController = useRef(null)
  const [now, setNow] = useState(Date.now)
  const [manualArrival, setManualArrival] = useState(false)
  const lead = result.anticipacion_minutos
  const hours = result.horario_operacion
  const configured = Number.isInteger(lead) && hasOperatingHours(hours)
  const dateValue = draft.fecha_programada_at.slice(0, 10)
  const timeValue = draft.fecha_programada_at.slice(11)
  const earliest = now + lead * 60000
  const firstArrival = nextArrival(earliest, hours)
  const times = arrivalTimes(dateValue, earliest, hours)
  const suggestedArrival = nextArrival(
    Math.ceil((now + (lead + 5) * 60000) / 900000) * 900000,
    hours,
  )
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    if (open && !review && configured && !manualArrival)
      setDraft((current) => ({
        ...current,
        fecha_programada_at: suggestedArrival,
      }))
  }, [open, review, configured, manualArrival, suggestedArrival])
  function selectDate(day) {
    const choices = arrivalTimes(day, Date.now() + lead * 60000, hours)
    setDraft((current) => ({
      ...current,
      fecha_programada_at: day
        ? `${day}T${choices.includes(timeValue) ? timeValue : choices[0] || ''}`
        : '',
    }))
  }
  useEffect(() => {
    if (!selectedId) {
      setSavedDetail(null)
      setDetailError(null)
      return
    }
    const controller = new AbortController()
    setSavedDetail(null)
    setDetailError(null)
    api
      .preload(selectedId, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSavedDetail(data)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailError(moduleError(error))
      })
    return () => controller.abort()
  }, [selectedId, detailRetry])

  useEffect(() => {
    if (params.get('crear') === '1') {
      if (canWrite) setOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams, canWrite])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api
      .preloads(page, { signal: controller.signal })
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

  async function loadProducts(nextPage = 1) {
    catalogController.current?.abort()
    const controller = new AbortController()
    catalogController.current = controller
    setProductLoading(true)
    setProductError(null)
    try {
      const data = await api.products(nextPage, { signal: controller.signal })
      if (controller.signal.aborted) return
      setProducts((rows) =>
        nextPage === 1
          ? [
              ...data.data,
              ...rows.filter(
                (row) =>
                  draft.detalles.some(
                    (line) => line.cliente_producto_id === row.cliente_producto_id,
                  ) &&
                  !data.data.some((item) => item.cliente_producto_id === row.cliente_producto_id),
              ),
            ]
          : [
              ...rows.filter(
                (row) =>
                  !data.data.some((item) => item.cliente_producto_id === row.cliente_producto_id),
              ),
              ...data.data,
            ],
      )
      setProductTotal(data.total)
      setProductPage(nextPage)
    } catch (error) {
      if (!controller.signal.aborted) setProductError(moduleError(error))
    } finally {
      if (!controller.signal.aborted) setProductLoading(false)
    }
  }
  useEffect(() => {
    if (open && !review) loadProducts()
    return () => catalogController.current?.abort()
  }, [open])

  function update(event) {
    setFormError(null)
    setDraft((value) => ({ ...value, [event.target.name]: event.target.value }))
  }
  function changeLine(key, field, value) {
    setFormError(null)
    setDraft((draft) => ({
      ...draft,
      detalles: draft.detalles.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    }))
  }
  function prepare(event) {
    event.preventDefault()
    if (!canWrite) return
    setFormError(null)
    try {
      if (
        !configured ||
        !arrivalTimes(dateValue, Date.now() + lead * 60000, hours).includes(timeValue)
      )
        throw new Error('Selecciona una hora disponible para la llegada de la mercancía.')
      setReview(preloadInput(draft, products, crypto.randomUUID()))
    } catch (error) {
      setFormError(error.message)
    }
  }
  async function send() {
    if (!canWrite || mutation.current || !review) return
    mutation.current = true
    setSending(true)
    setFormError(null)
    try {
      const created = await api.createPreload(review)
      setOpen(false)
      setDraft(emptyDraft())
      setManualArrival(false)
      setReview(null)
      setUncertain(false)
      setNotice(
        created.wms_lote_id
          ? `Precarga registrada con el lote ${created.wms_lote_id}. El ingreso físico lo confirma Bodega.`
          : `Precarga ${created.referencia_lote} guardada. La creación del lote está pendiente: ${created.creacion_error?.message || 'abre su detalle para verificar el mismo registro.'}`,
      )
      setPage(1)
      setRevision((value) => value + 1)
    } catch (error) {
      setFormError(moduleError(error))
      // Si no se conoce el resultado, el reintento conserva el mismo identificador y contenido.
      setUncertain((previous) => previous || !error.status || error.status >= 500)
    } finally {
      mutation.current = false
      setSending(false)
    }
  }
  async function verifyLot() {
    if (!canWrite || !savedDetail || mutation.current) return
    mutation.current = true
    setVerifying(true)
    setDetailError(null)
    try {
      const data = await api.createPreloadLot(savedDetail.public_id, savedDetail.revision)
      setSavedDetail(data)
      if (data.creacion_error) setDetailError(data.creacion_error)
      setRevision((value) => value + 1)
    } catch (error) {
      setDetailError(error)
    } finally {
      mutation.current = false
      setVerifying(false)
    }
  }
  const selectable = products.filter((row) => row.estado === 'HABILITADO' && row.codigo_wms)
  const unavailable = loading && !result.data.length

  return (
    <div className="ops-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">ANTICIPA TU PRÓXIMA LLEGADA</span>
          <h1>Mis precargas</h1>
          <p>Crea tu lote y acompaña la recepción de tu mercancía.</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setFormError(null)
              setOpen(true)
            }}
          >
            <Plus size={18} />
            {review ? 'Continuar precarga' : 'Registrar precarga'}
          </Button>
        )}
      </div>
      <div className="ops-process">
        <PackagePlus size={26} />
        <div>
          <strong>Tú creas el lote. Bodega confirma el ingreso.</strong>
          <p>
            Selecciona productos habilitados e indica las cantidades. El lote se crea
            automáticamente en Genika; el inventario se actualiza cuando bodega confirma el ingreso
            físico.
          </p>
        </div>
        <span className="ops-process-tag">PRECARGA</span>
      </div>
      {!canWrite && (
        <p className="notice ops-info">
          <ShieldCheck size={18} />
          Puedes consultar las precargas de tu empresa. El registro requiere acceso de solicitante.
        </p>
      )}
      {notice && (
        <p className="notice notice-success" role="status">
          <Check size={18} />
          {notice}
        </p>
      )}
      <section className="ops-panel" aria-labelledby="preloads-heading">
        <div className="section-heading">
          <div>
            <span className="section-number">SEGUIMIENTO / HORA DE COLOMBIA</span>
            <h2 id="preloads-heading">Cargas registradas y lotes asignados</h2>
          </div>
          <Reload busy={loading} onClick={() => setRevision((value) => value + 1)} />
        </div>
        <ErrorNotice error={error} />
        {unavailable || loading ? (
          <Loading label="Consultando tus precargas…" />
        ) : error ? null : !result.data.length ? (
          <div className="ops-empty">
            <ClipboardCheck size={38} />
            <h3>Prepara tu primera llegada</h3>
            <p>Selecciona productos de tu catálogo e indica las cantidades que vas a enviar.</p>
            {canWrite && (
              <Button variant="secondary" onClick={() => setOpen(true)}>
                Registrar precarga
                <ArrowRight size={17} />
              </Button>
            )}
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Tu carga</th>
                  <th>Lote Genika</th>
                  <th>Contenedor / transporte</th>
                  <th>Llegada programada</th>
                  <th>Estado del ingreso</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => {
                  const status = preloadStatus(row)
                  return (
                    <tr key={row.public_id}>
                      <td data-label="Tu carga">
                        <strong>{row.referencia_lote}</strong>
                        <small>{row.total_productos} productos declarados</small>
                      </td>
                      <td data-label="Lote Genika">
                        {row.wms_lote_id ? (
                          <strong>{row.wms_lote_id}</strong>
                        ) : (
                          <span>Aún sin asignar</span>
                        )}
                      </td>
                      <td data-label="Contenedor / transporte">
                        {row.referencia_contenedor || 'Sin contenedor'}
                        <small>{row.referencia_transporte || 'Sin referencia de transporte'}</small>
                      </td>
                      <td data-label="Llegada programada">
                        {row.fecha_programada_at
                          ? colombiaDate(row.fecha_programada_at)
                          : 'Sin programación'}
                      </td>
                      <td data-label="Estado del ingreso">
                        <span className={`ops-status ops-status-${status.tone}`}>
                          {status.label}
                        </span>
                      </td>
                      <td data-label="Detalle">
                        <Button variant="secondary" onClick={() => setSelectedId(row.public_id)}>
                          Ver precarga
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && result.total > 0 && (
          <Pagination page={page} total={result.total} busy={loading} onChange={setPage} />
        )}
      </section>
      <Link to="/inventario" className="ops-bottom-link">
        <ArrowLeft size={17} />
        Ir a mi catálogo de productos
      </Link>
      <Modal
        key={review ? 'review' : 'entry'}
        open={open}
        onClose={() => {
          if (!sending) setOpen(false)
        }}
        title={review ? 'Revisa tu precarga' : 'Registrar precarga'}
        className={`preload-modal${review ? '' : ' preload-entry-modal'}`}
        footer={
          review ? (
            <div className="modal-actions">
              <Button
                variant="secondary"
                disabled={sending || uncertain}
                onClick={() => {
                  setReview(null)
                  setFormError(null)
                  loadProducts()
                }}
              >
                Corregir
              </Button>
              <Button busy={sending} onClick={send}>
                {uncertain ? 'Reintentar envío' : 'Registrar precarga'}
                <ArrowRight size={17} />
              </Button>
            </div>
          ) : (
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Volver
              </Button>
              <Button
                type="submit"
                form="preload-entry"
                disabled={productLoading || !!productError || !selectable.length || !configured}
              >
                Revisar precarga
                <ArrowRight size={17} />
              </Button>
            </div>
          )
        }
        wide
      >
        {review ? (
          <div className="ops-review">
            <p className="body-copy">
              Aún no está registrada. Pulsa Registrar precarga para enviarla a Fastway y recibir tu
              comprobante. El lote se creará automáticamente en Genika con los productos
              habilitados.
            </p>
            <dl className="ops-review-data">
              <div>
                <dt>Llegada de la mercancía</dt>
                <dd>{colombiaDate(review.fecha_programada_at)}</dd>
              </div>
              <div>
                <dt>Empresa</dt>
                <dd>{session.cliente.nombre}</dd>
              </div>
              <div>
                <dt>Tu referencia de carga</dt>
                <dd>{review.referencia_lote}</dd>
              </div>
              <div>
                <dt>Contenedor</dt>
                <dd>{review.referencia_contenedor || 'No indicado'}</dd>
              </div>
              <div>
                <dt>Transporte</dt>
                <dd>{review.referencia_transporte || 'No indicado'}</dd>
              </div>
            </dl>
            <h3>Productos a recibir</h3>
            <ul className="ops-review-lines">
              {review.detalles.map((row) => {
                const product = products.find(
                  (item) => item.cliente_producto_id === row.cliente_producto_id,
                )
                return (
                  <li key={row.cliente_producto_id}>
                    <div>
                      <strong>{product.nombre}</strong>
                      <small>{productCodeLabel(product)}</small>
                    </div>
                    <span>
                      {row.cantidad_declarada} {product.unidad_medida}
                    </span>
                  </li>
                )
              })}
            </ul>
            {review.observacion && (
              <div className="ops-review-note">
                <strong>Observaciones</strong>
                <p>{review.observacion}</p>
              </div>
            )}
            <p className="notice ops-info">
              <ShieldCheck size={18} />
              Las cantidades son declaradas. El inventario se actualiza con la recepción confirmada
              por bodega.
            </p>
            <ErrorNotice error={formError} />
            {uncertain && (
              <p className="field-hint" role="status">
                No se pudo confirmar el resultado. Reintenta con esta misma precarga para evitar
                duplicados. Conservamos su identificador mientras permanezcas en esta página.
              </p>
            )}
          </div>
        ) : (
          <form id="preload-entry" className="ops-form preload-entry-form" onSubmit={prepare}>
            <div className="field">
              <label htmlFor="preload-reference">Tu referencia de carga</label>
              <input
                id="preload-reference"
                name="referencia_lote"
                value={draft.referencia_lote}
                onChange={update}
                required
                maxLength={120}
                placeholder="Ej. Orden OC-2026-001"
                autoFocus
              />
            </div>
            <section className="preload-arrival" aria-label="Llegada de la mercancía">
              <div className="preload-arrival-summary">
                <CalendarDays size={21} aria-hidden="true" />
                <div>
                  <span>{manualArrival ? 'Llegada programada' : 'Llegada sugerida'}</span>
                  <strong>
                    {configured && timeValue.length === 5 && dateValue.length === 10
                      ? colombiaDate(`${draft.fecha_programada_at}:00-05:00`)
                      : 'Selecciona fecha y hora'}
                  </strong>
                  <small>Hora de Colombia</small>
                </div>
                <Button
                  variant="secondary"
                  disabled={!configured}
                  aria-expanded={manualArrival}
                  aria-controls={manualArrival ? 'preload-manual-arrival' : undefined}
                  onClick={() => setManualArrival((value) => !value)}
                >
                  {manualArrival ? 'Usar hora sugerida' : 'Elegir manualmente'}
                </Button>
              </div>
              {!configured && (
                <ErrorNotice error="No se pudo cargar el horario de ingresos. Actualiza antes de registrar." />
              )}
              {manualArrival && (
                <div id="preload-manual-arrival" className="schedule-arrival-inputs">
                  <label>
                    Fecha de llegada
                    <input
                      type="date"
                      value={dateValue}
                      min={firstArrival.slice(0, 10)}
                      required
                      disabled={!configured}
                      onChange={(event) => selectDate(event.target.value)}
                    />
                  </label>
                  <ArrivalTimePicker
                    times={times}
                    value={timeValue}
                    onChange={(time) =>
                      setDraft((current) => ({
                        ...current,
                        fecha_programada_at: `${dateValue}T${time}`,
                      }))
                    }
                  />
                </div>
              )}
              {manualArrival && dateValue && !times.length && configured && (
                <small role="status">
                  No quedan horas disponibles para esta fecha. Selecciona otro día.
                </small>
              )}
            </section>
            <div className="ops-line-heading">
              <h3>Productos y cantidades</h3>
              <Link to="/inventario" className="text-button">
                Crear un producto
              </Link>
            </div>
            <ErrorNotice error={productError} />
            {productLoading && <Loading label="Cargando tus productos…" />}
            {productError && (
              <Button variant="secondary" onClick={() => loadProducts(productPage || 1)}>
                Reintentar catálogo
              </Button>
            )}
            {!productLoading && !productError && !selectable.length && (
              <p className="ops-form-help">
                Necesitas productos habilitados en Genika para crear el lote. Las fichas pendientes
                de sincronización permanecen en tu catálogo.
              </p>
            )}
            <div className="ops-lines">
              {draft.detalles.map((row, index) => (
                <div key={row.key} className="ops-line">
                  <span className="ops-line-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="field">
                    <label htmlFor={`line-product-${row.key}`}>Producto {index + 1}</label>
                    <select
                      id={`line-product-${row.key}`}
                      value={row.cliente_producto_id}
                      onChange={(event) =>
                        changeLine(row.key, 'cliente_producto_id', event.target.value)
                      }
                      required
                      disabled={productLoading}
                    >
                      <option value="">Selecciona un producto</option>
                      {selectable.map((product) => (
                        <option
                          key={product.cliente_producto_id}
                          value={product.cliente_producto_id}
                          disabled={draft.detalles.some(
                            (other) =>
                              other.key !== row.key &&
                              other.cliente_producto_id === product.cliente_producto_id,
                          )}
                        >
                          {productCodeLabel(product)} · {product.nombre} / {product.unidad_medida}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`line-qty-${row.key}`}>Cantidad {index + 1}</label>
                    <input
                      id={`line-qty-${row.key}`}
                      value={row.cantidad_declarada}
                      onChange={(event) =>
                        changeLine(row.key, 'cantidad_declarada', event.target.value)
                      }
                      required
                      inputMode="decimal"
                      maxLength={21}
                      placeholder="0"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={draft.detalles.length === 1}
                    aria-label={`Quitar producto ${index + 1}`}
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        detalles: value.detalles.filter((item) => item.key !== row.key),
                      }))
                    }
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="ops-actions">
              <Button
                variant="secondary"
                disabled={draft.detalles.length >= 25 || productLoading}
                onClick={() =>
                  setDraft((value) => ({
                    ...value,
                    detalles: [
                      ...value.detalles,
                      { key: crypto.randomUUID(), cliente_producto_id: '', cantidad_declarada: '' },
                    ],
                  }))
                }
              >
                <Plus size={17} />
                Agregar producto
              </Button>
              {productPage * 25 < productTotal && (
                <Button
                  variant="secondary"
                  disabled={productLoading}
                  onClick={() => loadProducts(productPage + 1)}
                >
                  Cargar más del catálogo
                </Button>
              )}
            </div>
            <details className="preload-extra">
              <summary>
                Transporte y observaciones <span>(opcional)</span>
                <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <div className="ops-fields">
                <div className="field">
                  <label htmlFor="preload-container">Contenedor (opcional)</label>
                  <input
                    id="preload-container"
                    name="referencia_contenedor"
                    value={draft.referencia_contenedor}
                    onChange={update}
                    maxLength={120}
                  />
                </div>
                <div className="field">
                  <label htmlFor="preload-transport">Referencia de transporte (opcional)</label>
                  <input
                    id="preload-transport"
                    name="referencia_transporte"
                    value={draft.referencia_transporte}
                    onChange={update}
                    maxLength={120}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="preload-notes">Observaciones (opcional)</label>
                <textarea
                  id="preload-notes"
                  name="observacion"
                  value={draft.observacion}
                  onChange={update}
                  maxLength={1000}
                  rows={3}
                  placeholder="Información que deba revisar el equipo Fastway"
                />
              </div>
            </details>
            <ErrorNotice error={formError} />
          </form>
        )}
      </Modal>
      <Modal
        open={!!selectedId}
        onClose={() => {
          if (!verifying) setSelectedId(null)
        }}
        title="Detalle de precarga registrada"
        wide
        className="preload-modal"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" disabled={verifying} onClick={() => setSelectedId(null)}>
              Cerrar detalle
            </Button>
            {canWrite &&
              savedDetail &&
              !savedDetail.wms_lote_id &&
              ['ENVIADA', 'APROBADA'].includes(savedDetail.estado) && (
                <Button busy={verifying} onClick={verifyLot}>
                  Verificar creación del lote
                </Button>
              )}
          </div>
        }
      >
        <ErrorNotice error={detailError} />
        {detailError && (
          <Button variant="secondary" onClick={() => setDetailRetry((value) => value + 1)}>
            Reintentar detalle
          </Button>
        )}
        {!savedDetail && !detailError && <Loading label="Consultando el registro…" />}
        {savedDetail && (
          <div className="ops-review">
            <p className="notice ops-info">
              {savedDetail.wms_lote_id
                ? `Lote ${savedDetail.wms_lote_id} asignado. Consulta la recepción física de los productos abajo.`
                : 'Precarga registrada · Lote por asignar'}
            </p>
            {savedDetail.aprobacion && (
              <p className="field-hint">
                Aprobación del flujo anterior: {savedDetail.aprobacion.aprobado_por} el{' '}
                {colombiaDate(savedDetail.aprobacion.aprobado_at)} · hora de Colombia.
              </p>
            )}
            <dl className="ops-review-data">
              {[
                ['Tu referencia de carga', savedDetail.referencia_lote],
                [
                  'Llegada de la mercancía',
                  savedDetail.fecha_programada_at
                    ? colombiaDate(savedDetail.fecha_programada_at)
                    : 'Sin programación',
                ],
                ['Comprobante', savedDetail.public_id],
                ['Registro', colombiaDate(savedDetail.creado_at)],
                ['Lote Genika', savedDetail.wms_lote_id || 'Aún sin asignar'],
                ['Contenedor', savedDetail.referencia_contenedor || 'No indicado'],
                ['Transporte', savedDetail.referencia_transporte || 'No indicado'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <PreloadReception key={savedDetail.public_id} detail={savedDetail} />
            <div className="ops-review-note">
              <strong>Observaciones</strong>
              <p>{savedDetail.observacion || 'Sin observaciones'}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
