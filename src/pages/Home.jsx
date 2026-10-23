import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  FileCheck2,
  PackagePlus,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { colombiaDate } from '../utils/auth'

export function Home() {
  const { session } = useAuth()
  return (
    <div className="home-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">TU ESPACIO FASTWAY</span>
          <h1>Hola, {session.usuario.username}.</h1>
          <p>Qué bueno tenerte aquí. Este es el espacio de {session.cliente.nombre}.</p>
        </div>
        <span className="account-status">
          <span className="status-dot" />
          Cuenta habilitada
        </span>
      </div>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Brand compact />
          <span className="eyebrow">UN PASO MÁS CERCA DE TU OPERACIÓN</span>
          <h2>
            Tu logística.
            <br />
            <em>Siempre contigo.</em>
          </h2>
          <p>Crea tus productos, registra tu precarga y consulta el lote asignado por Genika.</p>
          <Link to="/inventario" className="hero-link">
            Ir a mis productos
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="dashboard-hero-photo">
          <img src="/brand/bodega.webp" alt="Bodega Fastway" />
          <span>FASTWAY / ALMACENAMIENTO Y LOGÍSTICA</span>
        </div>
      </section>
      <section className="home-access">
        <div className="section-heading">
          <div>
            <span className="section-number">01 / TU OPERACIÓN</span>
            <h2>Tu operación, paso a paso</h2>
          </div>
          <span className="muted">Empieza por tu catálogo</span>
        </div>
        <div className="operation-grid">
          {[
            {
              icon: Box,
              title: 'Tu inventario',
              description: 'Productos y cantidades de tu empresa, en un solo lugar.',
              path: '/inventario',
            },
            {
              icon: PackagePlus,
              title: 'Precargas',
              description: 'Anticipa la llegada de tu mercancía y sus documentos.',
              path: '/precargas',
            },
            {
              icon: Truck,
              title: 'Mis operaciones',
              description: 'Programa la llegada de tu vehículo y el alistamiento en bodega.',
              path: '/operaciones',
            },
          ].map(({ icon: Icon, title, description, path, planned }) => (
            <Link to={path} className="operation-card" key={path}>
              <div className="operation-card-top">
                <span className="tile-icon">
                  <Icon size={22} />
                </span>
                <ArrowUpRight size={18} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="planned-label">{planned ? 'Próximamente' : 'Abrir módulo'}</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="home-bottom">
        <section className="account-summary">
          <div className="section-heading">
            <h2>Todo listo para empezar</h2>
            <ShieldCheck size={21} />
          </div>
          <div className="summary-row">
            <span>
              <Check size={15} />
              Contraseña personal configurada
            </span>
            <strong>Lista</strong>
          </div>
          <div className="summary-row">
            <span>
              <FileCheck2 size={15} />
              Términos aceptados
            </span>
            <strong>Versión {session.terminos.version}</strong>
          </div>
          <p className="field-hint">
            Aceptación registrada el {colombiaDate(session.terminos.aceptado_at)} · hora de
            Colombia.
          </p>
          <Link to="/seguridad" className="text-button">
            Revisar mi acceso
            <ArrowRight size={15} />
          </Link>
        </section>
        <aside className="operating-note">
          <span className="section-number">UNA OPERACIÓN COORDINADA</span>
          <h3>
            Planeamos contigo.
            <br />
            Avanzamos juntos.
          </h3>
          <p>
            Las recepciones y salidas de mercancía siempre requieren la validación del equipo de
            bodega Fastway.
          </p>
          <span className="note-line" />
        </aside>
      </div>
    </div>
  )
}
