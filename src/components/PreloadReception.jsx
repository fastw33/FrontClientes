import { useState } from 'react'
import { Pagination } from './Operations'
import { receptionStates } from '../utils/operations'
const lines = {
  PENDIENTE: 'Sin inventario',
  PARCIAL: 'Parcial',
  RECIBIDO: 'En inventario',
  DIFERENCIA: 'Diferencia',
  POR_CONCILIAR: 'Por verificar',
}
export function PreloadReception({ detail }) {
  const [page, setPage] = useState(1)
  return (
    <section aria-label="Recepción de la precarga">
      <div className="section-heading">
        <h3>Recepción en bodega</h3>
        <span className="ops-status">
          {receptionStates[detail.recepcion?.estado] || 'Por verificar'}
        </span>
      </div>
      {detail.recepcion?.estado === 'NO_DISPONIBLE' && (
        <p role="status" className="notice">
          {detail.recepcion.mensaje}
        </p>
      )}
      <div
        className="ops-table-wrap"
        role="region"
        aria-label="Productos declarados y en inventario"
        tabIndex={0}
      >
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Declarado</th>
              <th scope="col">En inventario</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {detail.detalles.slice((page - 1) * 25, page * 25).map((item, index) => (
              <tr key={index}>
                <td data-label="Producto">
                  <strong>{item.nombre}</strong>
                  <small>
                    {item.referencia} · {item.codigo_wms || 'Código pendiente'}
                  </small>
                </td>
                <td data-label="Declarado">
                  {item.cantidad_declarada} {item.unidad_medida}
                </td>
                <td data-label="En inventario">
                  {item.inventario_compartido
                    ? 'Stock compartido en Genika'
                    : (item.cantidad_en_inventario ?? item.cantidad_recibida) == null
                      ? 'Por verificar'
                      : `${item.cantidad_en_inventario ?? item.cantidad_recibida} ${item.unidad_inventario || item.unidad_medida}`}
                </td>
                <td data-label="Estado">{lines[item.recepcion_estado] || 'Por verificar'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.detalles.length > 25 && (
        <Pagination page={page} total={detail.detalles.length} onChange={setPage} />
      )}
    </section>
  )
}
