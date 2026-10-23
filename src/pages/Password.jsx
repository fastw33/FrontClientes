import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { PublicLayout } from '../layouts/PublicLayout'
import { Button, ErrorNotice } from '../components/UI'
import { PasswordInput } from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { accessStep, passwordIssues } from '../utils/auth'

export function Password({ firstEntry = false }) {
  const { session, changePassword, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const checks = passwordIssues(next, confirmation)
  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (!checks.length || !checks.matches) {
      setError('Revisa la longitud y la confirmación de tu contraseña.')
      return
    }
    setBusy(true)
    try {
      const value = await changePassword({ password_actual: current, password_nueva: next })
      navigate(firstEntry ? accessStep(value) : '/seguridad', { replace: true })
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
      setCurrent('')
      setNext('')
      setConfirmation('')
    }
  }
  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await logout()
      navigate('/ingreso', { replace: true })
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <PublicLayout>
      <section className="onboarding-layout">
        <div className="onboarding-aside">
          <div className="eyebrow">
            <span className="line" />
            {firstEntry ? 'BIENVENIDO A FASTWAY' : 'TU CUENTA FASTWAY'}
          </div>
          <h1>
            {firstEntry ? 'Tu acceso empieza contigo.' : 'Una nueva clave. La misma confianza.'}
          </h1>
          <p>Protege el espacio de {session.cliente.nombre} con una contraseña personal.</p>
          <div className="onboarding-steps">
            <div className="active">
              <span>01</span>
              <div>
                <strong>Define tu contraseña</strong>
                <small>Un acceso que solo tú conoces.</small>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <strong>Revisa las condiciones</strong>
                <small>Conoce cómo cuidamos tu información.</small>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <strong>Entra a tu espacio</strong>
                <small>Tu operación, más cerca.</small>
              </div>
            </div>
          </div>
        </div>
        <div className="form-panel">
          <span className="large-icon">
            <KeyRound size={25} />
          </span>
          <span className="section-number">
            {firstEntry ? 'PASO 01 / PRIMER INGRESO' : 'SEGURIDAD DE TU CUENTA'}
          </span>
          <h2>{firstEntry ? 'Haz tuya la contraseña.' : 'Cambiar contraseña'}</h2>
          <p className="muted">
            {firstEntry
              ? 'Reemplaza la contraseña temporal que recibiste.'
              : 'Elige una contraseña diferente a la actual.'}
          </p>
          <ErrorNotice error={error} />
          <form onSubmit={submit} className="auth-form">
            <PasswordInput
              id="password_actual"
              label={firstEntry ? 'Contraseña temporal' : 'Contraseña actual'}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={busy}
            />
            <PasswordInput
              id="password_nueva"
              label="Nueva contraseña"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
            <PasswordInput
              id="password_confirmacion"
              label="Confirma tu nueva contraseña"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
            <div className="password-checks">
              <span className={checks.length ? 'checked' : ''}>
                <Check size={15} />
                Entre 12 y 128 caracteres
              </span>
              <span className={checks.matches ? 'checked' : ''}>
                <Check size={15} />
                Las contraseñas coinciden
              </span>
            </div>
            <Button type="submit" busy={busy} className="full-width">
              {busy ? 'Guardando…' : firstEntry ? 'Guardar y continuar' : 'Guardar contraseña'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="security-note">
            <ShieldCheck size={17} />
            Este cambio cierra las sesiones anteriores de tu cuenta.
          </p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={firstEntry ? leave : () => navigate('/seguridad')}
          >
            <LogOut size={15} />
            {firstEntry ? 'Salir del portal' : 'Volver a seguridad'}
          </button>
        </div>
      </section>
    </PublicLayout>
  )
}
