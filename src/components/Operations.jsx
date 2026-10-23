import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from './UI'

export function Pagination({
  page,
  total,
  limit = 25,
  busy,
  onChange,
  ariaLabel = 'Páginas de resultados',
  itemLabel = 'registros',
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <nav className="ops-pagination" aria-label={ariaLabel}>
      <span>
        Página {page} de {pages} · {total} {itemLabel}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={busy || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={17} />
        </Button>
        <Button
          variant="secondary"
          disabled={busy || page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={17} />
        </Button>
      </div>
    </nav>
  )
}

export function Reload({ busy, onClick }) {
  return (
    <Button variant="secondary" disabled={busy} onClick={onClick}>
      <RefreshCw size={16} className={busy ? 'spin' : ''} />
      Actualizar
    </Button>
  )
}
