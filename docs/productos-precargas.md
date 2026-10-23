# Catálogo del cliente y precarga de mercancía

## Alcance de esta entrega

`/inventario`: existencias reales consolidadas por producto y unidad, lotes desplegables, catálogo propio, creación de ficha y acceso a registrar precarga.
`/precargas`: declaración de productos y cantidades, revisión, registro y consulta del lote asignado por Genika.
Las cantidades declaradas no se presentan como inventario disponible.
El cliente registra la precarga; externalclientes crea automáticamente el lote en Genika con sus productos habilitados y devuelve su identificador real al portal. El personal interno confirma el ingreso físico. La referencia interna del cliente nunca sustituye el número de lote.
El usuario autorizó ampliar `externalclientes`. Estas rutas están implementadas con Sequelize. Se consumen los endpoints existentes para crear productos Bodega, lotes y líneas; no se modifica el código de WMS ni se crean existencias automáticamente.

## Contrato de externalclientes

Las rutas requieren sesión NORMAL, cliente activo y términos vigentes aceptados.
Las escrituras además requieren CSRF válido y perfil SOLICITANTE; CONSULTA solo permite lecturas.
La pertenencia y el actor se obtienen de la sesión, nunca de campos enviados por el navegador.

### GET /api/inventario/productos

Lista los productos con saldo positivo, agrupados por `codigo_wms` y `unidad_medida` antes de paginar. Cada fila incluye `cantidad_actual` decimal exacta como texto, `total_lotes`, nombre, referencias y último movimiento; no descarga el detalle de todos los lotes. Respuesta: `{total,page,limit,unidades,consultado_at,data}`. `unidades` contiene las opciones de todo el inventario del cliente.

Filtros: `buscar` (250 caracteres), `campo` (todos/producto/codigo/referencia/lote), `unidad` (exacta), `lotes` (todos/uno/varios) y `ordenar` (nombre/cantidad_desc/cantidad_asc/reciente). `page` y `limit` conservan su validación; el portal solicita 25 productos por página. La búsqueda por lote selecciona productos coincidentes y mantiene el total de todos sus lotes, sin mostrar una suma parcial como total.

### GET /api/inventario/productos/:codigo/lotes

Exige `unidad` para distinguir grupos con unidades diferentes; admite `buscar` por número de lote, `page` y `limit`. Devuelve `{producto,total,page,limit,consultado_at,data:[{wms_lote_id,cantidad_actual,ultimo_movimiento_at}]}`. La consulta del detalle vuelve a verificar las existencias actuales del cliente de la sesión. Sin existencias, devuelve 404; una falla de WMS nunca se presenta como saldo cero. No expone ubicaciones.

`GET /api/inventario` conserva su contrato anterior por producto/lote/unidad para la selección del alistamiento. No se requieren migraciones ni cambios en WMS.

### GET /api/productos?page=1&limit=25

Respuesta: `{total,page,limit,data:[producto]}`.
Producto: `cliente_producto_id` y `producto_version_id` (strings), `codigo_cliente` (identificador técnico interno), `codigo_wms` (código confirmado en Genika o null), `prefijo`, `nombre`, `referencia`, `tipo`, `unidad_medida`, `alto_cm`, `ancho_cm`, `largo_cm` (decimales como strings), `estado` (PENDIENTE/HABILITADO/DESHABILITADO).
Solo vínculos del cliente autenticado; no exponer ubicaciones ni asociaciones ajenas.
La pantalla muestra el código de la equivalencia WMS confirmada o «CAJ · Pendiente Genika», nunca un consecutivo calculado por el navegador.

### GET /api/productos/catalogo

Devuelve `presentaciones:[{prefijo,nombre,tipo}]`, `tipos` y `unidades`.
El catálogo procede de la copia local `externalclientes/src/modules/productos/catalogo-genika.json`, contrastada con la maestra de Genika. Incluye prefijos Bodega (YUT, ROL, PAL, CAJ, UNI, EXT, BUL, GUA) y RS. Los cambios futuros en la maestra requieren actualizar esta copia; no existe sincronización automática en este bloque.
Tipo Bodega/RS y unidad unidades/kilos/pallet son independientes. El prefijo debe pertenecer al tipo seleccionado. Cambiar tipo limpia una presentación incompatible.

### POST /api/productos

Entrada estricta:
`{request_id,prefijo,nombre,referencia,tipo,unidad_medida,alto_cm,ancho_cm,largo_cm}`.
El cliente no escribe ni envía códigos. La referencia/modelo identifica su producto. Tipo y unidades se validan contra el catálogo de la ruta anterior.
Dimensiones decimales no negativas, hasta 10 enteros y 4 decimales.
En una transacción: crear productos (código maestro generado), producto_versiones versión 1 PROPUESTA y cliente_producto PENDIENTE, más auditoría con actor/sesión/contexto.
Sin aprobación humana: confirmar automáticamente la creación WMS y habilitar el producto. Si el resultado es incierto, conservar la ficha para verificar el mismo intento.
Los identificadores técnicos se generan en servidor y no sustituyen al código WMS. `request_id` deduplica guardados: misma clave y datos devuelven el mismo producto; otra ficha con la misma clave se rechaza con 409. El formulario conserva clave y datos al reintentar un resultado incierto.
`database/003-producto-prefijo.sql` añade la columna nullable `producto_versiones.prefijo`. Ya se aplicó en la base local; es aditivo y repetible. Los registros anteriores se conservan sin inferir una presentación.

### GET /api/precargas?page=1&limit=25

Respuesta: `{total,page,limit,anticipacion_minutos,horario_operacion,data:[solicitud]}`. Cada solicitud incluye `fecha_programada_at`, en ISO UTC, presentada en hora de Colombia. Los registros anteriores sin fecha muestran «Sin programación».
La columna **Estado del ingreso** usa el inventario actual del mismo cliente y lote: ningún producto con saldo positivo → PENDIENTE (Pendiente por revisión), algunos productos → PARCIAL (Ingreso parcial), todos los productos → RECIBIDA (Ingreso confirmado). La regla compara la presencia de productos, no que sus cantidades coincidan con lo declarado. Las referencias externas que apuntan a una misma ficha WMS cuentan una sola vez. Si el inventario no puede verificarse, se devuelve NO_DISPONIBLE (Recepción por verificar), nunca saldo cero supuesto. Externalclientes consulta el inventario una vez por empresa para toda la página, sin modificar WMS ni guardar saldos paralelos. El detalle muestra `cantidad_en_inventario` y `unidad_inventario`; las referencias compartidas se identifican con `inventario_compartido`, sin duplicar cantidades. `cantidad_recibida` se conserva como alias compatible de la cantidad actual.

El cierre tiene prioridad: si existen registros de inventario del lote y todos sus saldos están en cero, `recepcion.estado` es CERRADA y Clients Fastway muestra **Lote cerrado**, tanto en Precargas como en Mis operaciones. Se comprueban todos los productos del lote, incluidos los que no aparecen en la declaración. Sin registros de inventario se conserva **Pendiente por revisión**, igual que la distinción nuevo/cerrado de Genika. El estado técnico de la operación de ingreso permanece confirmado; el cierre corresponde al lote.
Solicitud: `public_id`, `referencia_lote` (referencia interna de la carga del cliente, nombre conservado por compatibilidad), `wms_lote_id` (identificador real asignado por Genika o null), `referencia_contenedor`, `referencia_transporte`, `total_productos`, `estado`, `creado_at` (ISO UTC, mostrado en Colombia).
El formulario pide «Tu referencia de carga». El listado muestra «Tu carga» y «Lote Genika» por separado; sin respuesta interna muestra «Aún sin asignar».
Solo solicitudes PRECARGA de la empresa autenticada. No incluir ubicaciones WMS.

### GET /api/precargas/:public_id

`GET /api/precargas/:public_id` permite abrir el detalle de una precarga registrada. Obtiene los productos y cantidades de la revisión enviada, conservando nombres, referencias y observaciones originales. Mantiene aislamiento por empresa y términos; un identificador ajeno devuelve 404. Ambos perfiles pueden consultar. Genika tiene su bandeja interna en `/precargas-clientes`, bajo Admin, usando rutas internas protegidas por JWT esAdmin.

El cliente confirma **Registrar precarga** tras revisar, recibe un comprobante y ve su carga en el listado. Abrir o revisar el formulario no crea un registro. La revisión y el detalle usan un pie de ventana fijo para conservar visibles los botones en móvil.

### POST /api/precargas

Entrada estricta:
`{request_id,fecha_programada_at,referencia_lote,referencia_contenedor,referencia_transporte,observacion,detalles:[{cliente_producto_id,producto_version_id,cantidad_declarada}]}`.
La fecha de llegada es obligatoria y se envía como `YYYY-MM-DDTHH:mm:00-05:00`. El selector usa el horario y la anticipación recibidos de la API; el servidor vuelve a validarlos al guardar. La configuración actual permite 08:00–17:00 con 300 minutos de anticipación. La programación y la declaración se guardan en una sola transacción con las tablas existentes.
request_id UUID generado al revisar, conservado con el mismo cuerpo al reintentar un envío incierto.
Máximo 25 líneas, sin productos repetidos; cantidades positivas con hasta 14 enteros y 6 decimales, conservadas como texto.
Verificar en servidor que todos los vínculos pertenecen al cliente, están habilitados y sus versiones están sincronizadas con WMS.
La versión esperada se compara con la ficha actual del producto. Si cambió desde la consulta, se rechaza con 409 PRODUCTO_ACTUALIZADO para que el usuario revise el catálogo actualizado; no se sustituye la ficha silenciosamente.
Una transacción crea solicitud ENVIADA, precarga, un precarga_lote, detalles y solicitud_revisiones (instantánea y hash), más auditoría.
Usar comandos_idempotentes para que la misma clave y cuerpo devuelvan la misma solicitud; misma clave con distinto contenido devuelve 409.
El servidor vuelve a validar la sesión dentro de la transacción para las escrituras.
Respuesta 201: al menos `{public_id,referencia_lote,estado:'ENVIADA',creado_at}`.
Después de guardar la declaración se crea el lote y sus líneas en WMS. El inventario permanece sujeto a la recepción física interna.

El ingreso también aparece en **Mis operaciones** y en **Mi agenda → Programación bodega** de Genika, junto a las recogidas. El detalle muestra fecha, transporte, lote y recepción de productos. El operador puede abrir el lote desde la agenda y continuar el ingreso mediante el proceso existente de Bodega. No se crea un alistamiento para una llegada de mercancía.

## Límites y errores

Listas paginadas, validación estricta de cuerpo/consulta y límite de tamaño existente.
Errores con `{error:{code,message},correlation_id}`; no exponer SQL ni credenciales.
Las escrituras deben mantener auditoría transaccional, incluidas las referencias de sesión y dispositivo disponibles en el modelo actual.

## Pendientes fuera de este bloque

La revisión y homologación de productos ya se realiza en Genika, **Admin → Productos de clientes** (`/productos-clientes`): crear producto en WMS y aprobar, o vincular una ficha existente por confirmación del administrador, aunque sus datos sean distintos. Cada ficha conserva su referencia externa o interna y demás datos; vincular no edita WMS ni convierte unidades o cantidades. El portal recibe el código real en `codigo_wms` y el estado HABILITADO al actualizar su catálogo. La aprobación conserva revisor, fecha y equivalencia en externalclientes.

El lote se crea al registrar la precarga. Su estado técnico sigue ENVIADA y la pantalla muestra **Lote creado** al confirmar `wms_lote_id`. No se genera una decisión de aprobación; el historial anterior se conserva. Si WMS no confirma el resultado, la precarga queda guardada y ambos portales ofrecen **Verificar creación del lote** sobre el mismo registro, sin duplicar escrituras inciertas.

Las existencias reales ya se consultan mediante `GET /api/inventario?page=1&limit=25`, con sesión y términos vigentes. Solo pertenecen a la empresa autenticada. Cada fila contiene código WMS, lote, nombre, referencia externa/interna, unidad real, cantidad actual y último movimiento; la respuesta incluye fecha de consulta. La API agrupa posiciones de bodega sin exponerlas y no mezcla unidades ni lotes. Se muestran también existencias propias anteriores al catálogo externo.

La vista distingue **Existencias actuales** de **Mi catálogo**. Actualizar inventario consulta WMS nuevamente; un fallo se muestra como error, nunca como saldo cero. La cantidad en bodega no supone disponibilidad libre de reservas. No se modifica WMS ni se guarda un libro de stock paralelo.

Siguen pendientes el historial detallado de movimientos; adjuntos; cancelaciones/correcciones y recepciones parciales en el portal. Aprobar una declaración no confirma la recepción física ni crea inventario. No se generan números de lote ficticios ni se simula la respuesta de Genika en el producto.
El formulario se conserva en memoria al cerrar la ventana, pero navegar o recargar descarta lo que no se haya enviado.

## Catálogo compartido Bodega

El portal muestra el catálogo general Bodega mediante `GET /api/productos/bodega`, con búsqueda y paginación. Solo se exponen nombre, código, referencia, presentación, unidad y dimensiones; no datos de clientes ni stock ajeno. **Añadir a mi catálogo** llama a `POST /api/productos/vincular` con `{codigo_wms}` y crea exclusivamente la relación con la empresa autenticada.

Al escribir una ficha nueva se consulta `GET /api/productos/similares` con espera de 350 ms y cancelación de respuestas anteriores. Las fichas idénticas se reutilizan. Las aproximadas se muestran y requieren confirmar que el producto es diferente; el POST lleva `confirmar_diferente:true`. La API repite la validación al guardar, sin confiar en la comprobación visual. Crear producto solo admite tipo Bodega y no requiere aprobación interna.

Una ficha guardada sin resultado WMS confirmado muestra **Creación pendiente** y ofrece **Verificar creación**, mediante `POST /api/productos/:id/confirmar`. El alta, la reutilización y la recuperación requieren SOLICITANTE, CSRF, sesión vigente y términos aceptados. CONSULTA solo puede leer.

La migración `externalclientes/database/004-catalogo-bodega-compartido.sql` permite reutilizar códigos WMS entre distintas referencias externas sin perder sus fichas anteriores. Ya está aplicada en la base local. No modifica wmsBack.

## Búsqueda de existencias y retirada del catálogo

Existencias actuales incluye un buscador por código, producto, referencia o lote. Consulta `GET /api/inventario?buscar=...` con espera de 300 ms; el servidor filtra antes de paginar.

Los solicitantes pueden **Quitar** una ficha de **Mi catálogo**, con confirmación y `DELETE /api/productos/:id`. La API valida las existencias reales de la propia empresa en todos los lotes; si hay stock o no puede consultar WMS, no retira el vínculo. Se marca la relación como retirada y se conserva el historial. No se elimina ningún producto de Genika. Añadir de nuevo una ficha existente recupera su relación anterior.
