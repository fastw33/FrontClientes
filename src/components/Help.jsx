import { ArrowUpRight, Headphones, Mail, MessageCircle, ShieldCheck } from 'lucide-react'
import { Modal } from './UI'
import './Help.css'

export function Help({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Estamos para acompañarte">
      <div className="support-icon">
        <Headphones size={28} />
      </div>
      <p className="body-copy">
        El equipo de Innovación te acompaña con el acceso y el uso de Clients Fastway.
      </p>
      <div className="support-contacts">
        <a href="https://wa.me/573019565508" target="_blank" rel="noopener noreferrer">
          <MessageCircle size={22} aria-hidden="true" />
          <span>
            <strong>Escríbenos por WhatsApp</strong>
            <span>+57 301 956 5508</span>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <a href="mailto:tech@fastwaysas.com">
          <Mail size={22} aria-hidden="true" />
          <span>
            <strong>Envíanos un correo</strong>
            <span>tech@fastwaysas.com</span>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </div>
      <div className="support-item">
        <strong>¿Necesitas una cuenta?</strong>
        <p>Solicita tu habilitación al equipo de Innovación por WhatsApp o correo.</p>
      </div>
      <div className="support-item">
        <strong>¿Olvidaste tu contraseña?</strong>
        <p>
          Pide al equipo de Innovación una nueva contraseña temporal. Al ingresar, podrás elegir una
          nueva.
        </p>
      </div>
      <p className="security-note">
        <ShieldCheck size={17} />
        Nunca compartas tu contraseña para recibir ayuda.
      </p>
    </Modal>
  )
}
