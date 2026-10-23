import { useEffect, useId, useRef } from 'react'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'

export function Button({
  children,
  busy = false,
  variant = 'primary',
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
      {...props}
    >
      {busy && <LoaderCircle className="spin" size={18} aria-hidden="true" />}
      {children}
    </button>
  )
}

export function ErrorNotice({ error }) {
  if (!error) return null
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
      <div>
        {typeof error === 'string' ? error : error.message}
        {error.reference && <small>Referencia de atención: {error.reference}</small>}
      </div>
    </div>
  )
}

export function Loading({ label = 'Cargando tu espacio…' }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={26} />
      <span>{label}</span>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  footer = null,
  className = '',
}) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.scrollTop = 0
      dialog.querySelector('.modal-body-scroll')?.scrollTo(0, 0)
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="modal-content">
        <header className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            <X size={21} />
          </button>
        </header>
        {footer ? (
          <>
            <div className="modal-body-scroll" tabIndex={0} role="region" aria-label={title}>
              {children}
            </div>
            <footer className="modal-fixed-footer">{footer}</footer>
          </>
        ) : (
          children
        )}
      </div>
    </dialog>
  )
}
