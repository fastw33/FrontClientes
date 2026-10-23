import { useState } from 'react'

export function Brand({ className = '', compact = false }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`brand ${compact ? 'brand-compact' : ''} ${className}`}>
      {failed ? (
        <strong className="brand-fallback">
          Fastway<span>››</span>
        </strong>
      ) : (
        <img
          src={import.meta.env.VITE_FASTWAY_LOGO_URL}
          alt="Fastway"
          width="2170"
          height="725"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
