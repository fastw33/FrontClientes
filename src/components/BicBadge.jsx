import './BicBadge.css'

export function BicBadge() {
  return (
    <a
      className="bic-badge"
      href="https://www.fastwaysas.com/docs/bic-presentacion.pdf"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Sociedades BIC · Empresa con propósito (abre en otra pestaña)"
    >
      <img
        src="/brand/bic-logo.webp"
        alt="Sociedades BIC · Empresa con propósito"
        width="1280"
        height="538"
        decoding="async"
      />
    </a>
  )
}
