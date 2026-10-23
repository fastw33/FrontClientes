import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Clock3 } from 'lucide-react'
import { navigation } from '../utils/navigation'

const journeys = {
  '/precargas': [
    'Tú preparas la información',
    'Fastway valida la recepción',
    'Bodega confirma el ingreso',
  ],
  '/alistamientos': [
    'Tú solicitas con anticipación',
    'Fastway prepara tu mercancía',
    'Bodega confirma la salida',
  ],
  '/agenda': [
    'Tú propones la operación',
    'Fastway revisa la disponibilidad',
    'Ambos coordinamos la atención',
  ],
}
export function Upcoming() {
  const { pathname } = useLocation()
  const item = navigation.find((entry) => entry.path === pathname)
  const Icon = item.icon
  const steps = journeys[pathname]
  return (
    <div className="upcoming-page">
      <Link className="text-button" to="/inicio">
        <ArrowLeft size={16} />
        Volver a mi espacio
      </Link>
      <div className="upcoming-panel">
        <span className="planned-label">
          <Clock3 size={13} />
          Próximamente
        </span>
        <span className="upcoming-icon">
          <Icon size={38} />
        </span>
        <span className="eyebrow">{item.label}</span>
        <h1>{item.action}</h1>
        <p>{item.description} Te avisaremos cuando este servicio esté disponible en tu portal.</p>
        {steps && (
          <ol className="journey-preview">
            {steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{step}</p>
                {index < 2 && <ArrowRight size={16} />}
              </li>
            ))}
          </ol>
        )}
        <div className="coming-note">
          <Check size={17} />
          <span>
            Mientras tanto, continúa coordinando tus operaciones con tu ejecutivo Fastway.
          </span>
        </div>
      </div>
    </div>
  )
}
