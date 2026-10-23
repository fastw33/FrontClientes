import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Headphones, ShieldCheck } from 'lucide-react'
import { Brand } from '../components/Brand'
import { BicBadge } from '../components/BicBadge'
import { Help } from '../components/Help'
import { PublicTerms } from '../components/PublicTerms'

export function PublicLayout({ children, className = '' }) {
  const [help, setHelp] = useState(false)
  const [terms, setTerms] = useState(false)
  return (
    <div className={`public-layout ${className}`}>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <header className="public-header">
        <Link to="/" aria-label="Clients Fastway, inicio">
          <Brand />
        </Link>
        <span className="portal-label">
          <span />
          CLIENTS FASTWAY
        </span>
        <BicBadge />
        <button
          className="help-button"
          onClick={() => setHelp(true)}
          aria-label="¿Necesitas ayuda?"
        >
          <Headphones size={18} />
          <span>¿Necesitas ayuda?</span>
          <ArrowUpRight size={15} />
        </button>
      </header>
      <main id="contenido" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <div className="footer-brand">
          <Brand compact />
          <span>Conectamos tu operación.</span>
        </div>
        <div className="footer-links">
          <span>
            <ShieldCheck size={15} />
            Acceso personal
          </span>
          <button onClick={() => setTerms(true)}>
            Términos y privacidad
            <ArrowUpRight size={13} />
          </button>
          <span>© {new Date().getFullYear()} Fastway</span>
        </div>
      </footer>
      <Help open={help} onClose={() => setHelp(false)} />
      <PublicTerms open={terms} onClose={() => setTerms(false)} />
    </div>
  )
}
