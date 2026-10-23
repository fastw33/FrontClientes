const base = import.meta.env.VITE_API_BASE_URL
let csrfToken = null

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'CONEXION_NO_DISPONIBLE', reference = null } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.reference = reference
  }
}

export function setCsrf(token) {
  csrfToken = token || null
}

async function request(
  path,
  { method = 'GET', body, signal, notifyUnauthorized = true, responseType = 'json' } = {},
) {
  let response
  const multipart = body instanceof FormData
  const binary = body instanceof Blob
  try {
    const timeout = AbortSignal.timeout(Number(import.meta.env.VITE_API_TIMEOUT_MS))
    response = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(body === undefined || multipart
          ? {}
          : { 'Content-Type': binary ? body.type : 'application/json' }),
        ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: body === undefined ? undefined : multipart || binary ? body : JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('No podemos conectar con el portal en este momento. Intenta nuevamente.')
  }
  if (response.ok && responseType === 'file') {
    if (
      !['application/pdf', 'image/jpeg', 'image/png'].includes(
        response.headers.get('content-type')?.split(';')[0].trim().toLowerCase(),
      )
    )
      throw new ApiError('No fue posible descargar el documento. Intenta nuevamente.')
    return response.blob()
  }
  let data = null
  if (response.status !== 204) {
    try {
      data = await response.json()
    } catch {
      throw new ApiError('El portal no pudo completar la respuesta. Intenta nuevamente.', {
        status: response.status,
      })
    }
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      notifyUnauthorized &&
      data?.error?.code !== 'PASSWORD_ACTUAL_INVALIDA'
    )
      window.dispatchEvent(new Event('fastway:session-expired'))
    if (
      data?.error?.code === 'TERMINOS_REQUERIDOS' ||
      data?.error?.code === 'TERMINOS_NO_PUBLICADOS'
    ) {
      window.dispatchEvent(new Event('fastway:terms-required'))
    }
    const safeMessage =
      response.status >= 500
        ? 'El servicio no está disponible en este momento. Intenta nuevamente.'
        : response.status === 429
          ? 'Has realizado varios intentos. Espera un momento antes de continuar.'
          : data?.error?.message || 'No fue posible completar la solicitud.'
    throw new ApiError(safeMessage, {
      status: response.status,
      code: data?.error?.code,
      reference: data?.correlation_id || response.headers.get('x-correlation-id'),
    })
  }
  return data
}

export const api = {
  documents: (page = 1, { buscar, estado, ...options } = {}) =>
    request(
      `/documentos?${new URLSearchParams({
        page,
        limit: 25,
        ...(buscar ? { buscar } : {}),
        ...(estado ? { estado } : {}),
      })}`,
      options,
    ),
  documentFile: (tipo, options) =>
    request(`/documentos/${encodeURIComponent(tipo)}/archivo`, {
      ...options,
      responseType: 'file',
    }),
  uploadDocument: (tipo, file) => {
    return request(`/documentos/${encodeURIComponent(tipo)}`, { method: 'POST', body: file })
  },
  movements: (page = 1, { buscar, tipo, desde, hasta, ...options } = {}) =>
    request(
      `/movimientos?${new URLSearchParams({
        page,
        limit: 25,
        ...(buscar ? { buscar } : {}),
        ...(tipo ? { tipo } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
      })}`,
      options,
    ),
  operations: (page = 1, options) => request(`/operaciones?page=${page}&limit=25`, options),
  operation: (id, options) => request(`/operaciones/${encodeURIComponent(id)}`, options),
  createOperation: (body) => request('/operaciones', { method: 'POST', body }),
  changeOperation: (id, body) =>
    request(`/operaciones/${encodeURIComponent(id)}/cambios`, { method: 'POST', body }),
  confirmOperation: (id) =>
    request(`/operaciones/${encodeURIComponent(id)}/confirmar`, { method: 'POST', body: {} }),
  me: (options) => request('/auth/me', options),
  login: (body) => request('/auth/login', { method: 'POST', body, notifyUnauthorized: false }),
  changePassword: (body) => request('/auth/password', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  terms: () => request('/auth/terminos'),
  publicTerms: () => request('/terminos', { notifyUnauthorized: false }),
  acceptTerms: (body) => request('/auth/terminos/aceptacion', { method: 'POST', body }),
  sessions: () => request('/auth/sesiones'),
  revokeSession: (id) => request(`/auth/sesiones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  products: (page = 1, options) => request(`/productos?page=${page}&limit=25`, options),
  inventory: (page = 1, { buscar, ...options } = {}) =>
    request(
      `/inventario?${new URLSearchParams({ page, limit: 25, ...(buscar ? { buscar } : {}) })}`,
      options,
    ),
  inventoryProducts: (page = 1, { signal, ...filters } = {}) =>
    request(
      `/inventario/productos?${new URLSearchParams({ page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) })}`,
      { signal },
    ),
  inventoryLots: (code, page = 1, { signal, ...filters } = {}) =>
    request(
      `/inventario/productos/${encodeURIComponent(code)}/lotes?${new URLSearchParams({ page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) })}`,
      { signal },
    ),
  removeProduct: (id) =>
    request(`/productos/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} }),
  bodegaProducts: (query, options) =>
    request(`/productos/bodega?${new URLSearchParams(query)}`, options),
  similarProducts: (query, options) =>
    request(`/productos/similares?${new URLSearchParams(query)}`, options),
  useBodegaProduct: (codigo_wms) =>
    request('/productos/vincular', { method: 'POST', body: { codigo_wms } }),
  confirmProduct: (id) =>
    request(`/productos/${encodeURIComponent(id)}/confirmar`, { method: 'POST', body: {} }),
  createProduct: (body) => request('/productos', { method: 'POST', body }),
  productCatalog: (options) => request('/productos/catalogo', options),
  preloads: (page = 1, options) => request(`/precargas?page=${page}&limit=25`, options),
  preload: (publicId, options) => request(`/precargas/${encodeURIComponent(publicId)}`, options),
  createPreloadLot: (publicId, revision) =>
    request(`/precargas/${encodeURIComponent(publicId)}/crear-lote`, {
      method: 'POST',
      body: { revision },
    }),
  createPreload: (body) => request('/precargas', { method: 'POST', body }),
}
