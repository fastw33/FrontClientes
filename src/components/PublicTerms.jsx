import { useEffect, useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { colombiaDate } from '../utils/auth'
import { Button, ErrorNotice, Loading, Modal } from './UI'

export function PublicTerms({ open, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    setData(null)
    api
      .publicTerms()
      .then((value) => {
        if (active) setData(value)
      })
      .catch((error) => {
        if (active) setError(error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, attempt])
  return (
    <Modal open={open} onClose={onClose} title="Términos y privacidad" wide>
      {loading ? (
        <Loading label="Consultando el documento vigente…" />
      ) : error ? (
        <>
          <ErrorNotice error={error} />
          <Button variant="secondary" onClick={() => setAttempt(attempt + 1)}>
            <RefreshCw size={16} />
            Volver a intentar
          </Button>
        </>
      ) : data?.disponible ? (
        <>
          <div className="document-meta">
            <span>Versión {data.documento.version}</span>
            <span>{colombiaDate(data.documento.publicado_at, false)}</span>
          </div>
          <h3>{data.documento.titulo}</h3>
          <div className="legal-text">{data.documento.contenido}</div>
        </>
      ) : (
        <div className="empty-state">
          <FileText size={34} />
          <h3>Documento pendiente de publicación</h3>
          <p>
            Estamos preparando las condiciones de uso del portal. Podrás consultarlas aquí cuando
            estén disponibles.
          </p>
        </div>
      )}
    </Modal>
  )
}
