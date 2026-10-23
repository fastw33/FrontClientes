import { useEffect, useRef, useState } from 'react'
import { Check, Download, Eye, FileText, Search, Upload } from 'lucide-react'
import { api } from '../services/api'
import { Button, ErrorNotice, Loading, Modal } from '../components/UI'
import { Pagination, Reload } from '../components/Operations'
import { useAuth } from '../context/AuthContext'
import { colombiaDate } from '../utils/auth'
import './Operations.css'
import './Documents.css'

export function Documents() {
  const { session } = useAuth()
  const [search, setSearch] = useState(''),
    [state, setState] = useState('')
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ total: 0, data: [] })
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(null)
  const [selected, setSelected] = useState(null),
    [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState(null)
  const [busyFile, setBusyFile] = useState(null),
    [fileError, setFileError] = useState(null)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const pending = useRef(false),
    download = useRef(null),
    fileInput = useRef(null)
  const canUpload = result.permite_carga && session.usuario.perfil === 'SOLICITANTE'
  const availableTypes = result.tipos_disponibles || []
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const timer = setTimeout(
      () =>
        api
          .documents(page, { buscar: search.trim(), estado: state, signal: controller.signal })
          .then((data) => {
            if (!controller.signal.aborted) setResult(data)
          })
          .catch((error) => {
            if (!controller.signal.aborted) setError(error)
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          }),
      search.trim() ? 300 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, state, page, revision])
  useEffect(() => () => download.current?.abort(), [])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url)
    },
    [preview],
  )
  async function downloadFile(row, view = false) {
    if (download.current) return
    const controller = new AbortController()
    download.current = controller
    setBusyFile(row.tipo)
    setFileError(null)
    try {
      const blob = await api.documentFile(row.tipo, { signal: controller.signal })
      if (controller.signal.aborted) return
      const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[
        blob.type.split(';')[0]
      ]
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a')
      if (view) {
        setPreview({ url, row, mime: blob.type.split(';')[0] })
        return
      }
      anchor.href = url
      anchor.download = `${row.tipo}.${ext}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (!controller.signal.aborted) setFileError(error)
    } finally {
      if (!controller.signal.aborted) {
        setBusyFile(null)
        download.current = null
      }
    }
  }
  function openUpload(row) {
    setSelected(row || { tipo: '', nombre: '', estado: 'PENDIENTE' })
    setFile(null)
    setFormError(null)
    if (fileInput.current) fileInput.current.value = ''
  }
  async function uploadFile(event) {
    event.preventDefault()
    if (!canUpload || !selected?.tipo || !file || pending.current) return
    const allowed = result.formatos || ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type) || !file.size || file.size > result.max_archivo_bytes) {
      setFormError('Selecciona un archivo PDF, JPG o PNG dentro del tamaño permitido.')
      return
    }
    pending.current = true
    setSaving(true)
    setFormError(null)
    try {
      await api.uploadDocument(selected.tipo, file)
      setNotice(
        `${selected.nombre} ${selected.estado === 'PENDIENTE' ? 'cargado' : 'actualizado'} correctamente.`,
      )
      setSelected(null)
      setFile(null)
      setPage(1)
      setRevision((value) => value + 1)
    } catch (error) {
      setFormError(error)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  return (
    <div className="ops-page inventory-page documents-page">
      <div className="page-title">
        <div>
          <span className="section-number">TU EMPRESA / DOCUMENTACIÓN</span>
          <h1>Mis documentos</h1>
        </div>
        <div className="ops-actions">
          {canUpload && (
            <Button
              disabled={loading || !!error || !availableTypes.length}
              onClick={() => openUpload()}
            >
              <Upload size={17} aria-hidden="true" />
              Cargar documento
            </Button>
          )}
          <Reload busy={loading} onClick={() => setRevision((value) => value + 1)} />
        </div>
      </div>
      {notice && (
        <div className="notice notice-success" role="status">
          <Check size={18} aria-hidden="true" />
          {notice}
        </div>
      )}
      <section className="ops-panel" aria-labelledby="documents-heading">
        <div className="section-heading">
          <div>
            <h2 id="documents-heading">Documentación de tu empresa</h2>
            {!loading && !error && result.actualizado_at && (
              <span className="inventory-updated">
                Expediente actualizado: {colombiaDate(result.actualizado_at)}
              </span>
            )}
          </div>
        </div>
        <div className="document-filters">
          <label className="ops-search">
            <Search size={18} aria-hidden="true" />
            <span className="ops-sr-only">Buscar documentos</span>
            <input
              type="search"
              maxLength={250}
              placeholder="Buscar por documento o archivo"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="document-filter-state">
            <span id="document-state-label">Estado</span>
            <select
              aria-labelledby="document-state-label"
              value={state}
              onChange={(event) => {
                setState(event.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="ADJUNTO">Adjuntos</option>
              <option value="PENDIENTE">Pendientes</option>
            </select>
          </label>
        </div>
        <ErrorNotice error={error} />
        <ErrorNotice error={fileError} />
        {loading ? (
          <Loading label="Consultando documentación de tu empresa…" />
        ) : error ? null : !result.data.length ? (
          <div className="ops-empty">
            <FileText size={32} aria-hidden="true" />
            <h3>
              {search || state
                ? 'No hay documentos con estos filtros'
                : 'Aún no hay documentos cargados'}
            </h3>
            {(search || state) && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setState('')
                  setPage(1)
                }}
              >
                Ver todos
              </Button>
            )}
          </div>
        ) : (
          <>
            <div
              className="ops-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Documentación de mi empresa"
            >
              <table className="ops-table documents-table">
                <thead>
                  <tr>
                    <th scope="col">Documento</th>
                    <th scope="col">Archivo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.tipo}>
                      <td data-label="Documento" className="document-name">
                        <strong>{row.nombre}</strong>
                      </td>
                      <td data-label="Archivo">{row.nombre_archivo || '—'}</td>
                      <td data-label="Estado">
                        <span
                          className={`ops-status ${row.estado === 'ADJUNTO' ? 'ops-status-habilitado' : 'ops-status-pendiente'}`}
                        >
                          {row.estado === 'ADJUNTO' ? 'Adjunto' : 'Pendiente'}
                        </span>
                      </td>
                      <td data-label="Acciones">
                        <div className="document-actions">
                          {row.estado === 'ADJUNTO' && (
                            <Button
                              variant="secondary"
                              disabled={!!busyFile}
                              aria-label={`Ver ${row.nombre}`}
                              onClick={() => downloadFile(row, true)}
                            >
                              <Eye size={15} aria-hidden="true" />
                              Ver
                            </Button>
                          )}
                          {row.estado === 'ADJUNTO' && (
                            <Button
                              variant="secondary"
                              busy={busyFile === row.tipo}
                              disabled={!!busyFile}
                              aria-label={`Descargar ${row.nombre}`}
                              onClick={() => downloadFile(row)}
                            >
                              <Download size={15} aria-hidden="true" />
                              Descargar
                            </Button>
                          )}
                          {canUpload && row.estado === 'ADJUNTO' && (
                            <Button
                              variant="secondary"
                              aria-label={`Actualizar ${row.nombre}`}
                              onClick={() => openUpload(row)}
                            >
                              <Upload size={15} aria-hidden="true" />
                              Actualizar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={result.total}
              busy={loading}
              onChange={setPage}
              ariaLabel="Páginas de documentos"
            />
          </>
        )}
      </section>
      <Modal
        open={!!selected}
        onClose={() => {
          if (!saving) setSelected(null)
        }}
        title={
          selected?.estado === 'PENDIENTE'
            ? 'Cargar documento'
            : `Actualizar ${selected?.nombre || 'documento'}`
        }
      >
        <form className="document-upload" onSubmit={uploadFile}>
          {selected?.estado === 'PENDIENTE' && (
            <>
              <label htmlFor="company-document-type">Tipo de documento</label>
              <select
                id="company-document-type"
                value={selected.tipo}
                required
                disabled={saving}
                onChange={(event) => {
                  const type = availableTypes.find((item) => item.tipo === event.target.value)
                  setSelected({ ...(type || { tipo: '', nombre: '' }), estado: 'PENDIENTE' })
                  setFile(null)
                  setFormError(null)
                  if (fileInput.current) fileInput.current.value = ''
                }}
              >
                <option value="">Selecciona un tipo de documento</option>
                {availableTypes.map((type) => (
                  <option key={type.tipo} value={type.tipo}>
                    {type.nombre}
                  </option>
                ))}
              </select>
            </>
          )}
          {selected?.estado === 'ADJUNTO' && (
            <p>
              El nuevo archivo quedará como documento actual. La versión anterior se conservará en
              Genika.
            </p>
          )}
          <label htmlFor="company-document-file">Archivo PDF, JPG o PNG</label>
          <input
            ref={fileInput}
            id="company-document-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            disabled={saving}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setFormError(null)
            }}
          />
          <small>
            Máximo {Math.floor((result.max_archivo_bytes || 0) / (1024 * 1024))} MB por archivo.
          </small>
          <ErrorNotice error={formError} />
          <div className="document-upload-actions">
            <Button variant="secondary" disabled={saving} onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button type="submit" busy={saving} disabled={!file || !selected?.tipo}>
              Guardar documento
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.row.nombre || 'Ver documento'}
        wide
      >
        {preview && (
          <>
            {preview.mime === 'application/pdf' ? (
              <iframe
                className="document-preview"
                title={`Archivo ${preview.row.nombre}`}
                src={preview.url}
              />
            ) : (
              <img className="document-preview-image" src={preview.url} alt={preview.row.nombre} />
            )}
            <div className="document-upload-actions">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Cerrar
              </Button>
              <Button disabled={!!busyFile} onClick={() => downloadFile(preview.row)}>
                <Download size={16} aria-hidden="true" />
                Descargar archivo
              </Button>
            </div>
            <ErrorNotice error={fileError} />
          </>
        )}
      </Modal>
    </div>
  )
}
