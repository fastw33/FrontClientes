export function productCodeLabel(product) {
  return product.codigo_wms || `${product.prefijo || 'Código'} · Por sincronizar`
}

export const productStates = {
  PENDIENTE: 'Creación pendiente',
  HABILITADO: 'Habilitado',
  DESHABILITADO: 'Deshabilitado',
}

export const preloadStates = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Registrada',
  OBSERVADA: 'Requiere corrección',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELACION_SOLICITADA: 'Cancelación solicitada',
  CANCELADA: 'Cancelada',
  CERRADA: 'Cerrada',
}

export const receptionStates = {
  SIN_LOTE: 'Lote por asignar',
  PENDIENTE: 'Pendiente por revisión',
  PARCIAL: 'Ingreso parcial',
  RECIBIDA: 'Ingreso confirmado',
  CERRADA: 'Lote cerrado',
  POR_CONCILIAR: 'Revisión de recepción',
  NO_DISPONIBLE: 'Recepción por verificar',
}

export function preloadStatus(row) {
  if (['CANCELADA', 'RECHAZADA', 'CANCELACION_SOLICITADA', 'OBSERVADA'].includes(row.estado))
    return { label: preloadStates[row.estado], tone: row.estado.toLowerCase() }
  if (!row.wms_lote_id)
    return {
      label: row.integracion ? 'Registro en proceso' : 'Lote por asignar',
      tone: 'pendiente',
    }
  const state = row.recepcion?.estado
  return {
    label: receptionStates[state] || receptionStates.NO_DISPONIBLE,
    tone:
      {
        PENDIENTE: 'pendiente',
        PARCIAL: 'parcial',
        RECIBIDA: 'habilitado',
        CERRADA: 'cerrada',
        POR_CONCILIAR: 'observada',
      }[state] || 'por-verificar',
  }
}

// Se conserva el decimal como texto para no redondear cantidades al enviarlas.
export function validDecimal(value, integers = 14, decimals = 6, positive = true) {
  return (
    typeof value === 'string' &&
    new RegExp(`^(0|[1-9][0-9]{0,${integers - 1}})(\\.[0-9]{1,${decimals}})?$`).test(value) &&
    (!positive || /[1-9]/.test(value))
  )
}

export function moduleError(error) {
  if (error.status === 404) {
    return {
      message:
        'Este servicio aún no está habilitado. No se guardaron cambios. Intenta de nuevo cuando Fastway lo habilite.',
      reference: error.reference,
    }
  }
  return error
}

export function preloadInput(draft, products, requestId) {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(draft.fecha_programada_at || '') ||
    !Number.isFinite(+new Date(draft.fecha_programada_at + ':00-05:00'))
  )
    throw new Error('Selecciona la fecha y hora de llegada de la mercancía.')
  if (!draft.referencia_lote.trim())
    throw new Error('Escribe una referencia para identificar tu carga.')
  if (!draft.detalles.length || draft.detalles.length > 25)
    throw new Error('Incluye entre 1 y 25 productos.')
  const selected = new Set()
  const detalles = draft.detalles.map((row) => {
    const product = products.find((item) => item.cliente_producto_id === row.cliente_producto_id)
    if (!product || product.estado !== 'HABILITADO' || !product.codigo_wms)
      throw new Error('Selecciona productos habilitados de tu catálogo.')
    if (selected.has(row.cliente_producto_id))
      throw new Error('Incluye cada producto una sola vez; ajusta su cantidad.')
    selected.add(row.cliente_producto_id)
    if (!validDecimal(row.cantidad_declarada))
      throw new Error(
        `Revisa la cantidad de ${product.nombre}. Usa un valor mayor que cero, con hasta 6 decimales.`,
      )
    return {
      cliente_producto_id: row.cliente_producto_id,
      producto_version_id: product.producto_version_id,
      cantidad_declarada: row.cantidad_declarada,
    }
  })
  return {
    request_id: requestId,
    fecha_programada_at: draft.fecha_programada_at + ':00-05:00',
    referencia_lote: draft.referencia_lote.trim(),
    referencia_contenedor: draft.referencia_contenedor.trim() || null,
    referencia_transporte: draft.referencia_transporte.trim() || null,
    observacion: draft.observacion.trim() || null,
    detalles,
  }
}
