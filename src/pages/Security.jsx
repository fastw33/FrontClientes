import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  KeyRound,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { colombiaDate } from '../utils/auth'
import { Button, ErrorNotice, Loading, Modal } from '../components/UI'

export function Security() {
  const { session } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()
  async function load() {
    setLoading(true)
    setError(null)
    try {
      setSessions((await api.sessions()).data)
    } catch (error) {
      setError(error)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])
  async function revoke() {
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      await api.revokeSession(target.id)
      if (target.actual) {
        window.dispatchEvent(new Event('fastway:session-expired'))
        navigate('/ingreso', { replace: true })
        return
      }
      setSessions((rows) => rows.filter((row) => row.id !== target.id))
      setTarget(null)
      setNotice('La sesión seleccionada se cerró correctamente.')
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="security-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">TU ACCESO, BAJO CONTROL</span>
          <h1>Mi cuenta y seguridad</h1>
          <p>Consulta tu información y administra dónde está abierta tu sesión.</p>
        </div>
        <span className="account-status">
          <ShieldCheck size={16} />
          Acceso personal
        </span>
      </div>
      <div className="security-grid">
        <section className="profile-panel">
          <span className="profile-avatar">
            {session.usuario.username.slice(0, 2).toUpperCase()}
          </span>
          <h2>{session.usuario.username}</h2>
          <p className="muted">{session.cliente.nombre}</p>
          <dl className="profile-data">
            <div>
              <dt>Correo</dt>
              <dd>{session.usuario.correo}</dd>
            </div>
            <div>
              <dt>Tipo de acceso</dt>
              <dd>{session.usuario.perfil === 'CONSULTA' ? 'Consulta' : 'Solicitante'}</dd>
            </div>
            <div>
              <dt>Estado de la cuenta</dt>
              <dd>
                <span className="status-dot" />
                Activa
              </dd>
            </div>
          </dl>
          <Link to="/contrasena" className="button button-secondary full-width">
            <KeyRound size={17} />
            Cambiar contraseña
            <ArrowRight size={16} />
          </Link>
          <div className="terms-receipt">
            <Check size={17} />
            <div>
              <strong>Términos aceptados · {session.terminos.version}</strong>
              <p>{colombiaDate(session.terminos.aceptado_at)}</p>
              <small>Hora de Colombia</small>
            </div>
          </div>
        </section>
        <section className="sessions-panel">
          <div className="section-heading">
            <div>
              <span className="section-number">TUS NAVEGADORES</span>
              <h2>
                Sesiones activas{' '}
                {!loading && <span className="count-badge">{sessions.length}</span>}
              </h2>
            </div>
            <button
              className="icon-button"
              onClick={load}
              disabled={loading}
              aria-label="Actualizar sesiones"
            >
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
          </div>
          <p className="muted">Si no reconoces un acceso, ciérralo y cambia tu contraseña.</p>
          <ErrorNotice error={!target ? error : null} />
          {notice && (
            <p className="notice notice-success" role="status">
              <Check size={18} />
              {notice}
            </p>
          )}
          {loading ? (
            <Loading label="Consultando tus sesiones…" />
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <Monitor size={30} />
              <h3>No hay sesiones para mostrar</h3>
              <p>Puedes actualizar la lista para volver a consultar.</p>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((row) => {
                const Device = /Android|iPhone|iPad|móvil/i.test(row.navegador || '')
                  ? Smartphone
                  : Monitor
                return (
                  <article className="session-row" key={row.id}>
                    <span className="device-icon">
                      <Device size={22} />
                    </span>
                    <div className="session-info">
                      <div>
                        <h3>{row.nombre_dispositivo || 'Navegador registrado'}</h3>
                        {row.actual && <span className="current-label">Este navegador</span>}
                      </div>
                      <p>Última actividad: {colombiaDate(row.ultimo_uso_at)}</p>
                      <small>
                        IP {row.ip_inicio} · Vence {colombiaDate(row.expira_at)}
                      </small>
                    </div>
                    <button
                      className="session-revoke"
                      onClick={() => {
                        setError(null)
                        setTarget(row)
                      }}
                      aria-label={`Cerrar sesión de ${row.nombre_dispositivo || 'navegador registrado'}`}
                    >
                      <LogOut size={17} />
                      <span>Cerrar</span>
                    </button>
                  </article>
                )
              })}
            </div>
          )}
          <p className="field-hint sessions-note">
            <ShieldCheck size={15} />
            Las fechas se muestran en hora de Colombia. Cada sesión corresponde a un acceso de tu
            cuenta.
          </p>
        </section>
      </div>
      <Modal
        open={!!target}
        onClose={() => {
          if (!busy) setTarget(null)
        }}
        title={target?.actual ? 'Cerrar este navegador' : 'Cerrar una sesión'}
      >
        <p className="body-copy">
          {target?.actual
            ? 'Saldrás del portal en este navegador. Podrás iniciar sesión nuevamente cuando lo necesites.'
            : `Se cerrará el acceso de ${target?.nombre_dispositivo || 'este navegador'}. Tu sesión actual seguirá disponible.`}
        </p>
        <ErrorNotice error={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={revoke} busy={busy}>
            <LogOut size={17} />
            Cerrar sesión
          </Button>
        </div>
      </Modal>
    </div>
  )
}
