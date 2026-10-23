import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Download,
  FileCheck2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { PublicLayout } from '../layouts/PublicLayout'
import { Button, ErrorNotice, Loading } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { accessStep, colombiaDate } from '../utils/auth'

export function Terms() {
  const { session, refresh, logout } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const navigate = useNavigate()
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAccepted(false)
    setPrivacy(false)
    try {
      setData(await api.terms())
    } catch (error) {
      setError(error)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  async function submit(event) {
    event.preventDefault()
    if (!accepted || !privacy || !data?.documento) return
    setBusy(true)
    setError(null)
    try {
      await api.acceptTerms({
        version: data.documento.version,
        contenido_sha256: data.documento.contenido_sha256,
        acepto: accepted,
        autoriza_tratamiento_datos: privacy,
      })
      navigate(accessStep(await refresh()), { replace: true })
    } catch (error) {
      if (error.code === 'TERMINOS_CAMBIARON') {
        await load()
        setError('El documento se actualizó. Revisa la nueva versión y confirma nuevamente.')
      } else setError(error)
    } finally {
      setBusy(false)
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
  function download() {
    const document = data?.documento
    if (!document) return
    const url = URL.createObjectURL(
      new Blob([`${document.titulo}\nVersión ${document.version}\n\n${document.contenido}`], {
        type: 'text/plain;charset=utf-8',
      }),
    )
    const link = window.document.createElement('a')
    link.href = url
    link.download = `Fastway-terminos-${document.version.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <PublicLayout>
      <section className="terms-layout">
        <header className="terms-intro">
          <div>
            <div className="eyebrow">
              <span className="line" />
              PASO 02 / CONOCE TU PORTAL
            </div>
            <h1>
              La confianza empieza
              <br />
              con las cosas claras.
            </h1>
            <p>Antes de continuar, revisa nuestras condiciones y el uso de tu información.</p>
          </div>
          <span className="terms-seal">
            <ShieldCheck size={35} />
            <span>
              Tu espacio.
              <br />
              <strong>Tu confianza.</strong>
            </span>
          </span>
        </header>
        <div className="terms-grid">
          <section className="document-panel" aria-labelledby="document-title">
            <div className="document-heading">
              <div>
                <FileCheck2 size={22} />
                <h2 id="document-title">Términos y tratamiento de datos</h2>
              </div>
              {data?.documento && (
                <button className="icon-button" onClick={download} aria-label="Descargar términos">
                  <Download size={19} />
                </button>
              )}
            </div>
            {loading ? (
              <Loading label="Consultando las condiciones vigentes…" />
            ) : data?.disponible ? (
              <>
                <div className="document-meta">
                  <span>Versión {data.documento.version}</span>
                  <span>Publicado {colombiaDate(data.documento.publicado_at, false)}</span>
                </div>
                <div
                  className="legal-text terms-document"
                  tabIndex={0}
                  role="region"
                  aria-label="Contenido de los términos"
                >
                  <h3>{data.documento.titulo}</h3>
                  {data.documento.contenido}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <FileCheck2 size={36} />
                <h3>Estamos preparando las condiciones</h3>
                <p>
                  Cuando Fastway publique el documento podrás revisarlo y continuar. Tu cuenta sigue
                  disponible.
                </p>
                <Button variant="secondary" onClick={load}>
                  <RefreshCw size={16} />
                  Consultar nuevamente
                </Button>
              </div>
            )}
          </section>
          <aside className="acceptance-panel">
            <span className="section-number">CONFIRMA PARA CONTINUAR</span>
            <h2>
              Un último paso
              <br />
              antes de entrar.
            </h2>
            <p className="muted">
              Esta aceptación es personal y queda asociada a tu cuenta de {session.cliente.nombre}.
            </p>
            <div className="completed-step">
              <Check size={17} />
              <span>Contraseña personal configurada</span>
            </div>
            <ErrorNotice error={error} />
            <form onSubmit={submit}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  disabled={!data?.disponible || loading || busy}
                />
                <span>
                  He leído y acepto los <strong>términos de uso</strong> de Clients Fastway
                  {data?.documento ? `, versión ${data.documento.version}` : ''}.
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={privacy}
                  onChange={(event) => setPrivacy(event.target.checked)}
                  disabled={!data?.disponible || loading || busy}
                />
                <span>
                  He leído la información de privacidad y{' '}
                  <strong>autorizo el tratamiento de mis datos personales</strong> para las
                  finalidades descritas.
                </span>
              </label>
              <Button
                type="submit"
                busy={busy}
                disabled={!data?.disponible || !accepted || !privacy || loading}
                className="full-width"
              >
                Aceptar y entrar
                <ArrowRight size={17} />
              </Button>
            </form>
            <p className="field-hint">
              Podrás consultar el documento desde el portal. Si no deseas aceptar, puedes salir y
              contactar a tu ejecutivo Fastway.
            </p>
            <button className="text-button" disabled={busy} onClick={leave}>
              <LogOut size={15} />
              Salir del portal
            </button>
          </aside>
        </div>
      </section>
    </PublicLayout>
  )
}
