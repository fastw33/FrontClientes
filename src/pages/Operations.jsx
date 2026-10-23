import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Plus, Truck } from 'lucide-react'
import { ArrivalTimePicker } from '../components/ArrivalTimePicker'
import { PreloadReception } from '../components/PreloadReception'
import { Link } from 'react-router-dom'
import { OperationChanges } from '../components/OperationChanges'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading, Modal } from '../components/UI'
import { Pagination, Reload } from '../components/Operations'
import { PickingItems, PickingLines, pickingKey } from '../components/PickingItems'
import { colombiaDate } from '../utils/auth'
import { hasOperatingHours, nextArrival, arrivalTimes, timeLabel } from '../utils/operationSchedule'
import './Operations.css'
import './ScheduledOperations.css'

const states = {
  PENDIENTE_WMS: 'Pendiente de envío',
  PENDIENTE: 'Agendada',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Lista para cargar',
  SALIDA_CONFIRMADA: 'Salida confirmada',
  CANCELADA: 'Cancelada',
  INGRESO_AGENDADO: 'Pendiente por revisión',
  INGRESO_SIN_LOTE: 'Lote pendiente',
  INGRESO_PARCIAL: 'Ingreso parcial',
  INGRESO_CONFIRMADO: 'Ingreso confirmado',
  INGRESO_POR_CONCILIAR: 'Revisión de recepción',
}
const leadLabel = (minutes) => (minutes % 60 === 0 ? `${minutes / 60} horas` : `${minutes} minutos`)
const empty = () => ({
  nombre: '',
  fecha: '',
  destinatario: '',
  observacion: '',
})
const key = pickingKey
const label = (row) =>
  row.tipo_operacion === 'INGRESO' && row.recepcion?.estado === 'CERRADA'
    ? 'Lote cerrado'
    : states[row.estado] || 'Estado por verificar'

export function Operations() {
  const { session } = useAuth()
  const canWrite = session.usuario.perfil === 'SOLICITANTE'
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0)
  const [result, setResult] = useState({ data: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null)
  const [creating, setCreating] = useState(false),
    [draft, setDraft] = useState(empty),
    [selected, setSelected] = useState([])
  const [selectionBusy, setSelectionBusy] = useState(false),
    [validationTarget, setValidationTarget] = useState(null)
  const [sending, setSending] = useState(false),
    [formError, setFormError] = useState(null),
    [uncertain, setUncertain] = useState(false)
  const [detail, setDetail] = useState(null),
    [detailId, setDetailId] = useState(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState(null)
  const [changeBusy, setChangeBusy] = useState(false)
  const isIngreso = detail?.tipo_operacion === 'INGRESO'
  const payload = useRef(null),
    mutation = useRef(false)
  const detailRequest = useRef(null)
  const detailTarget = useRef(null)
  useEffect(
    () => () => {
      detailRequest.current?.controller.abort()
      detailTarget.current = null
    },
    [],
  )
  const lead = result.anticipacion_minutos
  const hours = result.horario_operacion
  const configured = Number.isInteger(lead) && hasOperatingHours(hours)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!creating) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [creating])
  const earliest = now + lead * 60000
  const firstArrival = nextArrival(earliest, hours)
  const dateValue = draft.fecha.slice(0, 10)
  const timeValue = draft.fecha.slice(11)
  const times = arrivalTimes(dateValue, earliest, hours)
  function selectDate(day) {
    const choices = arrivalTimes(day, Date.now() + lead * 60000, hours)
    const time = choices.includes(timeValue) ? timeValue : choices[0] || ''
    setDraft((current) => ({ ...current, fecha: day ? `${day}T${time}` : '' }))
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api
      .operations(page, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, version])
  function open() {
    payload.current = null
    setUncertain(false)
    setNow(Date.now())
    setDraft({ ...empty(), fecha: nextArrival(Date.now() + (lead + 5) * 60000, hours) })
    setSelected([])
    setFormError(null)
    setSelectionBusy(false)
    setValidationTarget(null)
    setCreating(true)
  }
  async function submit(event) {
    event.preventDefault()
    if (mutation.current || selectionBusy) return
    setFormError(null)
    if (!payload.current) {
      if (
        !configured ||
        !arrivalTimes(dateValue, Date.now() + lead * 60000, hours).includes(timeValue)
      ) {
        setFormError(
          'Elige una hora disponible dentro del horario de recogidas y con la anticipación requerida.',
        )
        return
      }
      if (!selected.length) {
        setFormError('Selecciona al menos un producto de tu inventario.')
        return
      }
      if (new Date(draft.fecha + ':00-05:00').getTime() - Date.now() < lead * 60000) {
        setFormError(
          `Agenda la recogida con al menos ${leadLabel(lead)} desde el registro de la solicitud.`,
        )
        return
      }
      const invalid = selected.find(
        (row) =>
          !/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(row.cantidad) ||
          Number(row.cantidad) <= 0 ||
          Number(row.cantidad) > Number(row.cantidad_actual),
      )
      if (invalid) {
        setFormError('Revisa la cantidad del producto señalado en Seleccionados.')
        setValidationTarget({ key: key(invalid), attempt: Date.now() })
        return
      }
      payload.current = {
        request_id: crypto.randomUUID(),
        nombre: draft.nombre.trim(),
        modalidad: 'RECOGIDA',
        fecha_programada_at: draft.fecha + ':00-05:00',
        destinatario: draft.destinatario.trim() || null,
        direccion_entrega: null,
        observacion: draft.observacion.trim() || null,
        detalles: selected.map((row) => ({
          codigo_wms: row.codigo_wms,
          wms_lote_id: row.wms_lote_id,
          cantidad: row.cantidad,
        })),
      }
    }
    mutation.current = true
    setSending(true)
    try {
      const saved = await api.createOperation(payload.current)
      setCreating(false)
      detailTarget.current = saved.public_id
      setDetailId(saved.public_id)
      setDetail(saved)
      setDetailError(null)
      setVersion((v) => v + 1)
      payload.current = null
      setUncertain(false)
    } catch (error) {
      setFormError(error)
      // Un fallo de transporte puede ocurrir después de guardar. Conservar exactamente el mismo envío.
      if (!error.status || error.status >= 500) setUncertain(true)
      else payload.current = null
    } finally {
      mutation.current = false
      setSending(false)
    }
  }
  async function show(id) {
    detailRequest.current?.controller.abort()
    const request = { controller: new AbortController() }
    detailRequest.current = request
    detailTarget.current = id
    setDetailId(id)
    setDetail((current) => (current?.public_id === id ? current : null))
    setDetailBusy(true)
    setDetailError(null)
    try {
      const data = await api.operation(id, { signal: request.controller.signal })
      if (detailRequest.current !== request || request.controller.signal.aborted) return
      if (data.public_id !== id)
        throw new Error('La respuesta no corresponde a esta operación. Actualiza el detalle.')
      setDetail(data)
    } catch (error) {
      if (detailRequest.current === request && !request.controller.signal.aborted)
        setDetailError(error)
    } finally {
      if (detailRequest.current === request) setDetailBusy(false)
    }
  }
  function closeDetail() {
    if (mutation.current || changeBusy) return
    detailRequest.current?.controller.abort()
    detailRequest.current = null
    detailTarget.current = null
    setDetailId(null)
    setDetail(null)
    setDetailError(null)
    setDetailBusy(false)
  }
  async function confirm() {
    if (mutation.current || !detail || detailBusy) return
    const id = detail.public_id
    mutation.current = true
    setDetailBusy(true)
    setDetailError(null)
    try {
      const data = await api.confirmOperation(id)
      if (detailTarget.current !== id) return
      if (data.public_id !== id)
        throw new Error('La respuesta no corresponde a esta operación. Actualiza el detalle.')
      setDetail(data)
      setVersion((v) => v + 1)
    } catch (error) {
      if (detailTarget.current === id) setDetailError(error)
    } finally {
      mutation.current = false
      if (detailTarget.current === id) setDetailBusy(false)
    }
  }
  const change = (event) => setDraft({ ...draft, [event.target.name]: event.target.value })
  return (
    <div className="ops-page scheduled-page">
      <header className="page-title">
        <div>
          <span className="eyebrow">TU OPERACIÓN FASTWAY</span>
          <h1>Mis operaciones</h1>
          <p>Consulta los ingresos de mercancía y las recogidas programadas en bodega.</p>
        </div>
        {canWrite && (
          <div className="ops-actions">
            <Link className="button button-secondary" to="/precargas?crear=1">
              <Plus size={18} />
              Agendar ingreso
            </Link>
            <Button disabled={!configured} onClick={open}>
              <Plus size={18} />
              Agendar recogida
            </Button>
          </div>
        )}
      </header>
      <section className="ops-panel" aria-labelledby="operations-title">
        <div className="section-heading">
          <div>
            <h2 id="operations-title">Operaciones agendadas</h2>
            <span className="ops-caption">Fechas en hora de Colombia</span>
          </div>
          <Reload busy={loading} onClick={() => setVersion((v) => v + 1)} />
        </div>
        <ErrorNotice error={error} />
        {!loading && !error && !configured && (
          <ErrorNotice error="No se pudo cargar el horario de recogidas. Actualiza la información antes de agendar." />
        )}
        {loading ? (
          <Loading />
        ) : result.data.length ? (
          <>
            <div
              className="ops-table-wrap"
              role="region"
              aria-label="Operaciones agendadas"
              tabIndex={0}
            >
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Operación</th>
                    <th>Fecha programada</th>
                    <th>Tipo</th>
                    <th>Lote / alistamiento</th>
                    <th>Estado</th>
                    <th>
                      <span className="ops-sr-only">Detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.public_id}>
                      <td data-label="Operación">
                        <strong>{row.nombre}</strong>
                        <small>{row.total_productos ?? row.detalles?.length ?? 0} productos</small>
                      </td>
                      <td data-label="Fecha programada">{colombiaDate(row.fecha_programada_at)}</td>
                      <td data-label="Tipo">
                        {row.tipo_operacion === 'INGRESO' ? 'Ingreso' : 'Recogida'}
                      </td>
                      <td data-label="Lote / alistamiento">
                        {row.tipo_operacion === 'INGRESO'
                          ? row.wms_lote_id || 'Lote pendiente'
                          : row.wms_alistamiento_id
                            ? `#${row.wms_alistamiento_id}`
                            : 'Por confirmar'}
                      </td>
                      <td data-label="Estado">
                        <span
                          className={`ops-status ${row.estado === 'SALIDA_CONFIRMADA' ? 'ops-status-habilitado' : 'ops-status-pendiente'}`}
                        >
                          {label(row)}
                        </span>
                        {row.cambio_pendiente && <small>Cambio pendiente</small>}
                      </td>
                      <td data-label="Detalle">
                        <Button
                          variant="secondary"
                          disabled={detailBusy}
                          onClick={() => show(row.public_id)}
                        >
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={result.total} busy={loading} onChange={setPage} />
          </>
        ) : (
          !error && (
            <div className="ops-empty">
              <Truck size={32} />
              <h3>Aún no tienes operaciones</h3>
              <p>Programa una recogida y selecciona la mercancía que cargaremos en tu vehículo.</p>
            </div>
          )
        )}
      </section>
      <Modal
        open={creating}
        onClose={() => {
          if (!sending && !uncertain && !selectionBusy) setCreating(false)
        }}
        title="Agendar recogida en bodega"
        wide
        className="preload-modal schedule-create-modal"
        footer={
          <div className="picking-submit-bar">
            <span aria-live="polite">{selected.length} productos seleccionados</span>
            <div className="ops-actions">
              <Button
                variant="secondary"
                disabled={sending || uncertain || selectionBusy}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="schedule-operation-form"
                busy={sending}
                disabled={selectionBusy}
              >
                {uncertain ? 'Verificar envío' : 'Agendar y crear alistamiento'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="schedule-operation-form" onSubmit={submit}>
          <ErrorNotice error={formError} />
          {uncertain && (
            <p role="status" className="notice">
              Conservamos tu envío. Reintenta para verificarlo sin duplicar la operación.
            </p>
          )}
          <fieldset disabled={sending || uncertain} className="schedule-fields">
            <div className="schedule-grid">
              <label className="schedule-name-field">
                Nombre de la operación
                <input
                  name="nombre"
                  value={draft.nombre}
                  onChange={change}
                  required
                  maxLength={120}
                  placeholder="Ej. Recogida de pedido 1024"
                />
              </label>
              <fieldset className="schedule-arrival">
                <legend>
                  <CalendarDays size={19} aria-hidden="true" />
                  <span>Llegada del vehículo</span>
                  <small>Hora de Colombia</small>
                </legend>
                <div className="schedule-arrival-inputs">
                  <label>
                    Fecha de llegada
                    <input
                      type="date"
                      value={dateValue}
                      min={firstArrival.slice(0, 10)}
                      required
                      onChange={(event) => selectDate(event.target.value)}
                    />
                  </label>
                  <ArrivalTimePicker
                    times={times}
                    value={timeValue}
                    onChange={(time) =>
                      setDraft((current) => ({ ...current, fecha: `${dateValue}T${time}` }))
                    }
                  />
                </div>
                {configured && (
                  <div className="schedule-arrival-policy">
                    <span>
                      {timeLabel(hours.inicio)} – {timeLabel(hours.fin)}
                    </span>
                  </div>
                )}
                {dateValue && !times.length && (
                  <small role="status">
                    No quedan horas disponibles para esta fecha. Selecciona otro día.
                  </small>
                )}
              </fieldset>
              <label className="schedule-carrier-field">
                Persona o transportadora que recoge (opcional)
                <input
                  name="destinatario"
                  value={draft.destinatario}
                  onChange={change}
                  maxLength={250}
                />
              </label>
            </div>
            {creating && (
              <PickingItems
                selected={selected}
                onChange={(rows) => {
                  setSelected(rows)
                  setValidationTarget(null)
                }}
                disabled={sending || uncertain}
                onBusy={setSelectionBusy}
                validationTarget={validationTarget}
              />
            )}
            <label>
              Observaciones (opcional)
              <textarea
                name="observacion"
                value={draft.observacion}
                onChange={change}
                maxLength={1000}
                rows={2}
              />
            </label>
          </fieldset>
          <p className="ops-caption">
            Las cantidades se verifican de nuevo al registrar. La salida la confirma Fastway después
            de alistar y cargar la mercancía en el vehículo.
          </p>
        </form>
      </Modal>
      <Modal
        open={!!detailId}
        onClose={closeDetail}
        title="Detalle de operación"
        wide
        className="preload-modal schedule-detail-modal"
        footer={
          detailId && (
            <div className="ops-actions">
              <Reload busy={detailBusy || changeBusy} onClick={() => show(detailId)} />
              {canWrite &&
                !isIngreso &&
                detail &&
                !detail.wms_alistamiento_id &&
                !detail.cambio_pendiente && (
                  <Button busy={detailBusy} disabled={changeBusy} onClick={confirm}>
                    Verificar envío a Genika
                  </Button>
                )}
            </div>
          )
        }
      >
        <ErrorNotice error={detailError} />
        {detailBusy && !detail && <Loading label="Consultando la operación…" />}
        {detail && (
          <>
            <ErrorNotice error={detail.integracion_error} />
            {detail.estado_no_disponible && (
              <p role="status" className="notice">
                No pudimos consultar el estado actual de Genika. Actualiza para verificarlo.
              </p>
            )}
            <div className="schedule-detail-heading">
              <CalendarDays size={25} />
              <div>
                <h3>{detail.nombre}</h3>
                <span className="ops-status">{label(detail)}</span>
              </div>
            </div>
            <dl className="schedule-summary">
              <div>
                <dt>{isIngreso ? 'Llegada de la mercancía' : 'Llegada del vehículo'}</dt>
                <dd>{colombiaDate(detail.fecha_programada_at)}</dd>
              </div>
              <div>
                <dt>Modalidad</dt>
                <dd>{isIngreso ? 'Ingreso de mercancía' : 'Recogida en bodega'}</dd>
              </div>
              <div>
                <dt>{isIngreso ? 'Lote Genika' : 'Alistamiento Genika'}</dt>
                <dd>
                  {isIngreso
                    ? detail.wms_lote_id || 'Lote pendiente'
                    : detail.wms_alistamiento_id
                      ? `#${detail.wms_alistamiento_id}`
                      : 'Pendiente de confirmación'}
                </dd>
              </div>
              {detail.destinatario && (
                <div>
                  <dt>{isIngreso ? 'Transporte' : 'Recoge'}</dt>
                  <dd>{detail.destinatario}</dd>
                </div>
              )}
              {detail.direccion_entrega && (
                <div>
                  <dt>Dirección</dt>
                  <dd>{detail.direccion_entrega}</dd>
                </div>
              )}
            </dl>
            {isIngreso ? (
              <PreloadReception key={detail.public_id} detail={detail} />
            ) : (
              <PickingLines key={detail.public_id} lines={detail.detalles} />
            )}
            {detail.observacion && <p>{detail.observacion}</p>}
            {configured && !isIngreso && (
              <div inert={detailBusy || undefined}>
                <OperationChanges
                  key={detail.public_id}
                  detail={detail}
                  canWrite={canWrite}
                  lead={lead}
                  hours={hours}
                  onBusy={(busy) => {
                    if (detailTarget.current === detail.public_id) setChangeBusy(busy)
                  }}
                  onUpdate={(value) => {
                    if (detailTarget.current !== value.public_id) return
                    setDetail(value)
                    setVersion((v) => v + 1)
                  }}
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
