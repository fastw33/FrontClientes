import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Headphones,
  PackageCheck,
  ShieldCheck,
  Truck,
  UserRound,
} from 'lucide-react'
import { Brand } from '../components/Brand'
import { Button, ErrorNotice } from '../components/UI'
import { PasswordInput } from '../components/PasswordInput'
import { Help } from '../components/Help'
import { useAuth } from '../context/AuthContext'
import { accessStep } from '../utils/auth'
import { PublicLayout } from '../layouts/PublicLayout'

function deviceName() {
  const agent = navigator.userAgent
  const browser = agent.includes('Edg/')
    ? 'Edge'
    : agent.includes('Firefox/')
      ? 'Firefox'
      : agent.includes('Chrome/')
        ? 'Chrome'
        : 'Navegador'
  const platform = agent.includes('Windows')
    ? 'Windows'
    : agent.includes('Android')
      ? 'Android'
      : /iPhone|iPad/.test(agent)
        ? 'iOS'
        : agent.includes('Mac')
          ? 'macOS'
          : 'Equipo'
  return `${browser} · ${platform}`
}

function DoorEntrance() {
  const [visible, setVisible] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  if (!visible) return null
  return (
    <div
      className="door-entrance"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setVisible(false)
      }}
    >
      <div className="entrance-room">
        <div className="entrance-sign">
          <Brand />
          <span>BIENVENIDO A TU ESPACIO</span>
        </div>
      </div>
      <div className="entrance-leaf entrance-leaf-left" />
      <div className="entrance-leaf entrance-leaf-right" />
    </div>
  )
}

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const { login, notice } = useAuth()
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      navigate(accessStep(await login({ username, password, nombre_dispositivo: deviceName() })), {
        replace: true,
      })
    } catch (error) {
      setError(error)
    } finally {
      setPassword('')
      setBusy(false)
    }
  }
  return (
    <PublicLayout className="login-screen">
      <DoorEntrance />
      <div className="login-layout">
        <section className="brand-story" aria-label="Tu espacio Fastway">
          <div className="eyebrow">
            <span className="line" />
            LOGÍSTICA QUE TE MUEVE
          </div>
          <h1>
            Tu operación.
            <br />
            <span>Siempre cerca.</span>
          </h1>
          <p className="story-intro">
            Un espacio pensado para conectar tu empresa
            <br className="desktop-break" /> con cada paso de su operación logística.
          </p>
          <div className="warehouse-visual">
            <picture>
              <source media="(min-width: 961px)" srcSet="/brand/bodega.webp" />
              <img
                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                alt="Bodega de almacenamiento Fastway"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <span className="photo-index">01 / ALMACENAMIENTO Y LOGÍSTICA</span>
            <div className="photo-caption">
              <span>Más cerca de tu mercancía.</span>
              <ArrowUpRight size={30} />
            </div>
            <div className="photo-badge">
              <span className="status-dot" />
              <span>Tu próximo paso empieza aquí</span>
            </div>
          </div>
          <div className="story-services">
            <span>
              <Box size={17} />
              Almacenamiento
            </span>
            <span>
              <PackageCheck size={17} />
              Preparación
            </span>
            <span>
              <Truck size={18} />
              Distribución
            </span>
          </div>
        </section>
        <section className="login-section" aria-labelledby="login-title">
          <div className="login-card">
            <div className="card-brand">
              <Brand compact />
              <span>PORTAL DE CLIENTES</span>
            </div>
            <div className="login-heading">
              <span className="section-number">TU ESPACIO, TU OPERACIÓN</span>
              <h2 id="login-title">Te damos la bienvenida.</h2>
              <p>Ingresa con el usuario asignado a tu empresa.</p>
            </div>
            <ErrorNotice error={error || notice} />
            <form onSubmit={submit} className="auth-form">
              <div className="field">
                <label htmlFor="username">Usuario</label>
                <div className="input-wrap">
                  <UserRound size={18} className="input-icon" aria-hidden="true" />
                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    maxLength={100}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Tu usuario de acceso"
                    disabled={busy}
                  />
                </div>
              </div>
              <PasswordInput
                id="password"
                label="Contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="text-button forgot-password"
                onClick={() => setHelp(true)}
              >
                ¿Olvidaste tu contraseña?
                <ArrowUpRight size={14} />
              </button>
              <Button type="submit" busy={busy} className="full-width">
                {busy ? 'Ingresando…' : 'Ingresar a mi portal'}
                {!busy && <ArrowRight size={19} />}
              </Button>
            </form>
            <div className="login-security">
              <ShieldCheck size={19} />
              <div>
                <strong>Tu información, en buenas manos.</strong>
                <span>Tu acceso es personal. Cuida tus credenciales.</span>
              </div>
            </div>
          </div>
          <div className="login-invitation">
            <button className="text-button" onClick={() => setHelp(true)}>
              <Headphones size={16} />
              ¿Primera vez? Conoce cómo ingresar
              <ArrowUpRight size={14} />
            </button>
            <span>Acceso por invitación del equipo de Innovación</span>
          </div>
        </section>
      </div>
      <Help open={help} onClose={() => setHelp(false)} />
    </PublicLayout>
  )
}
