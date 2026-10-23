import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { Button, ErrorNotice } from './UI'
import { ArrivalTimePicker } from './ArrivalTimePicker'
import { arrivalTimes, nextArrival } from '../utils/operationSchedule'
import { colombiaDate } from '../utils/auth'
import './OperationChanges.css'

const types = {
  CANCELAR: 'Cancelación',
  REPROGRAMAR: 'Cambio de fecha',
  CORREGIR: 'Corrección de datos',
}
const states = {
  SOLICITADO: 'Pendiente de revisión',
  EN_PROCESO: 'Verificando con Genika',
  CONCILIAR: 'Por verificar con Genika',
  APLICADO: 'Aplicado',
  RECHAZADO: 'Rechazado',
}
export function OperationChanges({ detail, canWrite, lead, hours, onUpdate, onBusy }) {
  const [type, setType] = useState(''),
    [reason, setReason] = useState(''),
    [date, setDate] = useState('')
  const [name, setName] = useState(detail.nombre),
    [contact, setContact] = useState(detail.destinatario || ''),
    [notes, setNotes] = useState(detail.observacion || '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [uncertain, setUncertain] = useState(false),
    [now, setNow] = useState(Date.now)
  const payload = useRef(null),
    lock = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const earliest = now + lead * 60000
  const first = nextArrival(earliest, hours),
    day = date.slice(0, 10),
    time = date.slice(11, 16)
  const times = arrivalTimes(day, earliest, hours)
  function start(value) {
    payload.current = null
    setError(null)
    setReason('')
    setType(value)
    setDate(first)
    setName(detail.nombre)
    setContact(detail.destinatario || '')
    setNotes(detail.observacion || '')
  }
  async function send(event) {
    event.preventDefault()
    if (lock.current) return
    if (!payload.current) {
      if (type === 'REPROGRAMAR' && !times.includes(time)) {
        setError('Selecciona una hora disponible.')
        return
      }
      payload.current = {
        request_id: crypto.randomUUID(),
        tipo: type,
        motivo: reason.trim(),
        datos:
          type === 'CANCELAR'
            ? {}
            : type === 'REPROGRAMAR'
              ? { fecha_programada_at: date + ':00-05:00' }
              : {
                  nombre: name.trim(),
                  destinatario: contact.trim() || null,
                  observacion: notes.trim() || null,
                },
      }
    }
    lock.current = true
    setBusy(true)
    onBusy(true)
    setError(null)
    try {
      const result = await api.changeOperation(detail.public_id, payload.current)
      onUpdate(result)
      setType('')
      setUncertain(false)
      payload.current = null
    } catch (error) {
      setError(error)
      if (!error.status || error.status >= 500) setUncertain(true)
      else {
        payload.current = null
        setUncertain(false)
      }
    } finally {
      lock.current = false
      setBusy(false)
      onBusy(false)
    }
  }
  const eligible =
    canWrite &&
    detail.permite_cambios === true &&
    !detail.estado_no_disponible &&
    ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'PENDIENTE_WMS'].includes(detail.estado)
  return (
    <section className="operation-changes" aria-label="Cambios de la operación">
      {detail.cambio_pendiente && (
        <p className="notice" role="status">
          Tienes un cambio pendiente de revisión. La programación actual se conserva hasta que
          Fastway lo confirme.
        </p>
      )}
      {eligible && !detail.cambio_pendiente && !type && (
        <div className="ops-actions">
          <Button variant="secondary" onClick={() => start('REPROGRAMAR')}>
            Solicitar otra fecha
          </Button>
          <Button variant="secondary" onClick={() => start('CORREGIR')}>
            Corregir datos
          </Button>
          <Button variant="secondary" onClick={() => start('CANCELAR')}>
            Solicitar cancelación
          </Button>
        </div>
      )}
      {type && (
        <form onSubmit={send} className="operation-change-form">
          <h3>{types[type]}</h3>
          <ErrorNotice error={error} />
          {uncertain && (
            <p className="notice" role="status">
              Verifica el mismo envío para evitar solicitudes duplicadas.
            </p>
          )}
          <fieldset disabled={busy || uncertain} className="schedule-fields">
            {type === 'REPROGRAMAR' && (
              <div className="operation-change-arrival">
                <label>
                  Fecha de recogida
                  <input
                    type="date"
                    required
                    min={first.slice(0, 10)}
                    value={day}
                    onChange={(e) => {
                      const list = arrivalTimes(e.target.value, Date.now() + lead * 60000, hours)
                      setDate(e.target.value + 'T' + (list.includes(time) ? time : list[0] || ''))
                    }}
                  />
                </label>
                <ArrivalTimePicker
                  times={times}
                  value={time}
                  onChange={(value) => setDate(day + 'T' + value)}
                />
                <small>Hora de Colombia</small>
              </div>
            )}
            {type === 'CORREGIR' && (
              <>
                <label>
                  Nombre de la operación
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Persona o transportadora que recoge (opcional)
                  <input
                    maxLength={250}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
                <label>
                  Observaciones (opcional)
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Motivo del cambio
              <textarea
                required
                maxLength={1000}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          <div className="ops-actions">
            <Button variant="secondary" disabled={busy || uncertain} onClick={() => setType('')}>
              Volver
            </Button>
            <Button type="submit" busy={busy}>
              {uncertain ? 'Verificar solicitud' : 'Enviar para revisión'}
            </Button>
          </div>
        </form>
      )}
      {detail.cambios?.length > 0 && (
        <details className="operation-change-history" open={detail.cambio_pendiente}>
          <summary>Historial de cambios · {detail.total_cambios}</summary>
          <ol>
            {detail.cambios.map((row) => (
              <li key={row.public_id}>
                <div>
                  <strong>{types[row.tipo]}</strong>
                  <span>{states[row.estado] || row.estado}</span>
                </div>
                <small>{colombiaDate(row.creado_at)}</small>
                {row.tipo === 'REPROGRAMAR' && (
                  <p>Fecha solicitada: {colombiaDate(row.datos.fecha_programada_at)}</p>
                )}
                {row.tipo === 'CORREGIR' && (
                  <p>
                    {row.datos.nombre} · {row.datos.destinatario || 'Sin transportadora indicada'}
                    {row.datos.observacion && ` · ${row.datos.observacion}`}
                  </p>
                )}
                <p>{row.motivo}</p>
                {row.motivo_decision && <p>Respuesta Fastway: {row.motivo_decision}</p>}
              </li>
            ))}
          </ol>
          {detail.total_cambios > 25 && <small>Se muestran los últimos 25 cambios.</small>}
        </details>
      )}
    </section>
  )
}
