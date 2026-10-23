import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronRight,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Truck,
  X,
} from 'lucide-react'
import { Brand } from '../components/Brand'
import { BicBadge } from '../components/BicBadge'
import { Help } from '../components/Help'
import { PublicTerms } from '../components/PublicTerms'
import { Button, ErrorNotice, Modal } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { navigation } from '../utils/navigation'
import { colombiaDate } from '../utils/auth'

export function PortalLayout() {
  const { session, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const [terms, setTerms] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const sidebarRef = useRef(null)
  const menuButtonRef = useRef(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  function openMenu(event) {
    menuButtonRef.current = event.currentTarget
    setMenu(true)
  }
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
    const frame = requestAnimationFrame(() =>
      document.getElementById('portal-content')?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [pathname])
  useEffect(() => {
    if (!menu) return
    const sidebar = sidebarRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebar.querySelector('button[aria-label="Cerrar menú"]')?.focus()
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(false)
      }
      if (event.key !== 'Tab') return
      const controls = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')].filter(
        (element) => element.getClientRects().length,
      )
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 961px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMenu(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      desktop.removeEventListener('change', closeOnDesktop)
      window.removeEventListener('keydown', handleKey)
      if (sidebar.contains(document.activeElement)) menuButtonRef.current?.focus()
    }
  }, [menu])
  const title = navigation.find((item) => item.path === pathname)?.label || 'Mi espacio'
  async function confirmLogout() {
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
    <div className="portal-layout">
      <a className="skip-link" href="#portal-content">
        Saltar al contenido
      </a>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          tabIndex={-1}
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar ${menu ? 'is-open' : ''}`}
        id="portal-sidebar"
        aria-label="Menú de Clients Fastway"
      >
        <div className="sidebar-brand">
          <NavLink to="/inicio" aria-label="Clients Fastway, inicio">
            <Brand />
          </NavLink>
          <button
            className="icon-button mobile-only"
            onClick={() => setMenu(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-label">CLIENTS FASTWAY</span>
        <div className="workspace-chip">
          <strong>{session.cliente.nombre}</strong>
        </div>
        <div className="nav-label">MI OPERACIÓN</div>
        <nav aria-label="Navegación principal">
          {navigation.map(({ path, label, icon: Icon, planned }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {planned && <small>Pronto</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-help"
            onClick={() => {
              setMenu(false)
              setHelp(true)
            }}
          >
            <Headphones size={23} />
            <span>
              <strong>Estamos para ayudarte</strong>
              <small>Cuenta con el equipo Fastway</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <div className="sidebar-account">
            <span className="user-avatar">
              {session.usuario.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{session.usuario.username}</strong>
              <small>
                {session.usuario.perfil === 'CONSULTA'
                  ? 'Usuario de consulta'
                  : 'Usuario solicitante'}
              </small>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                setMenu(false)
                setLeaving(true)
              }}
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="portal-main" inert={menu}>
        <header className="portal-header">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={openMenu}
              aria-label="Abrir menú"
              aria-expanded={menu}
              aria-controls="portal-sidebar"
            >
              <Menu size={21} />
            </button>
            <NavLink
              className="mobile-only mobile-header-brand"
              to="/inicio"
              aria-label="Clients Fastway, inicio"
            >
              <Brand compact />
            </NavLink>
            <span className="desktop-breadcrumb">Mi espacio</span>
            <ChevronRight className="desktop-breadcrumb" size={14} />
            <strong className="desktop-breadcrumb">{title}</strong>
          </div>
          <div className="portal-header-right">
            <span>{colombiaDate(new Date(), false)}</span>
            <span className="timezone-label">Colombia</span>
            <BicBadge />
            <button className="icon-button" onClick={() => setHelp(true)} aria-label="Ayuda">
              <Headphones size={19} />
            </button>
          </div>
        </header>
        <main className="portal-content" id="portal-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="portal-footer">
          <Brand compact />
          <span>Tu logística, más cerca.</span>
          <button onClick={() => setTerms(true)}>
            Términos y privacidad
            <ArrowUpRight size={13} />
          </button>
        </footer>
        <nav className="mobile-navigation" aria-label="Accesos rápidos">
          {[
            { path: '/inicio', label: 'Inicio', icon: LayoutDashboard },
            { path: '/inventario', label: 'Inventario', icon: Package },
            { path: '/operaciones', label: 'Operaciones', icon: Truck },
          ].map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={
              ['/precargas', '/movimientos', '/documentos', '/seguridad'].includes(pathname)
                ? 'active'
                : ''
            }
            onClick={openMenu}
            aria-expanded={menu}
            aria-controls="portal-sidebar"
          >
            <Menu size={21} aria-hidden="true" />
            <span>Menú</span>
          </button>
        </nav>
      </div>
      <Help open={help} onClose={() => setHelp(false)} />
      <PublicTerms open={terms} onClose={() => setTerms(false)} />
      <Modal
        open={leaving}
        onClose={() => {
          if (!busy) setLeaving(false)
        }}
        title="¿Quieres cerrar tu sesión?"
      >
        <p className="body-copy">Podrás volver a tu espacio cuando lo necesites.</p>
        <ErrorNotice error={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setLeaving(false)} disabled={busy}>
            Seguir aquí
          </Button>
          <Button busy={busy} onClick={confirmLogout}>
            <LogOut size={17} />
            Cerrar sesión
          </Button>
        </div>
      </Modal>
    </div>
  )
}
