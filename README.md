# Clients Fastway

Portal de clientes en React + Vite. Node 24.22.0. Proyecto independiente de FrontWms y de las APIs existentes.

## Iniciar en tu equipo

```powershell
cd "C:\Users\tech\Desktop\Sistemas Genika\FrontClientes"
npm run dev
```

Abrir `http://localhost:5174`. Tú inicias el servidor; los comandos de compilación y pruebas no lo dejan corriendo. `scripts/node.cjs` selecciona Node 24.22.0 instalado con nvm para este proyecto, sin cambiar la versión global ni la de WMS.

Para instalar dependencias desde otra terminal, anteponer Node 24 en esa terminal antes de `npm install`:

```powershell
$env:Path = "$env:NVM_HOME\v24.22.0;$env:Path"
npm install
```

## Estructura

`src/pages` contiene las pantallas, `layouts` la estructura pública y del portal, `components` las piezas compartidas, `context` el estado de acceso en memoria, `services/api.js` el cliente HTTP y `utils` las reglas de navegación y presentación. La identidad visual se configura en `src/styles.css`.

`src/mobile.css` centraliza la adaptación del portal: barra inferior hasta 960 px (Inicio, Inventario, Operaciones y Menú), encabezado accesible durante el desplazamiento y fichas de productos, movimientos, documentos y operaciones hasta 700 px, conservando las tablas de escritorio. Los formularios usan controles táctiles de al menos 44 px y las ventanas se adaptan a la altura disponible y a las zonas seguras. La paginación y la selección entre páginas se conservan; el alistamiento sigue soportando 400 productos sin renderizarlos todos simultáneamente. Las pruebas de cada módulo verifican también que las tablas móviles no oculten columnas en un desplazamiento lateral.

El logo original se conserva en `public/brand/fastway.png`. La edición con transparencia real está en `public/brand/fastway-transparent.png`, seleccionada por `VITE_FASTWAY_LOGO_URL` en `.env` para las pantallas. Se realizó con la herramienta de edición de imágenes, solicitando retirar únicamente el fondo blanco y conservar texto, colores y proporciones de Fastway. También se reutilizaron la fotografía de bodega y la tipografía de marca de FrontWms. La marca aparece en acceso, navegación, portada y pie de página.

El favicon usa los archivos suministrados en Downloads/favicon, copiados sin modificar a `public/favicon.ico` y `public/icons` (16/32/96 px, Apple 180 px y Android 192 px). El distintivo BIC del encabezado usa el original `bic-logo.webp` de la página Fastway, servido localmente desde `public/brand` y enlazado al documento institucional de fastwaysas.com. `BicBadge` adapta su tamaño a móvil sin comprimir los logos ni retirar el acceso a ayuda.

El diseño se adapta desde 320 px. Hasta 960 px usa navegación desplegable con bloqueo del fondo, recorrido de teclado y cierre con Escape. Los formularios tienen campos de 16 px para evitar zoom automático en iOS, controles táctiles y márgenes para las zonas seguras de pantalla. La portada de acceso se compone según la altura disponible para mostrar el formulario y el pie sin scroll; simplifica elementos decorativos en teléfonos pequeños. La imagen de bodega se solicita únicamente en escritorio, con prioridad para que aparezca durante la entrada. La entrada dura 2,4 segundos: las puertas se abren, revelan la marca y el mensaje sobre un interior iluminado, y el conjunto se desvanece hacia el acceso. La marca aparece cuando las hojas ya han despejado el centro para evitar cortes. La entrada se elimina al terminar y se omite con `prefers-reduced-motion`. Los estilos de esta portada están en `src/pages/Login.css` y no afectan las pantallas de contraseña o términos. Se revisan teléfonos, tabletas y orientación horizontal; los reportes y capturas se guardan en `.runtime`. Los avisos de error y el teclado pueden requerir desplazamiento para conservar todo el contenido accesible.

## Integración actual

1. Inicio de sesión con usuario creado por Innovación. Sin registro público.
2. Cambio obligatorio de contraseña temporal y rotación de sesión.
3. Consulta de términos reales, dos confirmaciones independientes y aceptación de la versión exacta. Si los términos no están publicados, se muestra el estado pendiente y se bloquea el ingreso operativo.
4. Inicio con empresa y cuenta reales. Sin cantidades de inventario ni operaciones ficticias.
5. Perfil de consulta y sesiones activas: actualización, cierre de otra sesión y cierre de la propia, con confirmación.
6. Cambio posterior de contraseña y cierre de sesión.

Inventario y catálogo Bodega, creación directa de productos, reutilización y búsqueda de similitudes, registro automático de lotes, recogidas con alistamiento, movimientos y documentos de la empresa están conectados a externalclientes. Bodega confirma el ingreso físico y la salida en Genika. El cliente nunca ve ubicaciones de bodega. No se incorporaron pantallas internas de administración ni acceso directo a WMS.

Mi inventario muestra una fila/ficha por producto y unidad, con el total de existencias y sus lotes desplegables. La búsqueda permite escoger producto, código, referencia, lote o todos los campos. Filtros adicionales: unidad, un solo lote/varios lotes y orden por nombre, existencias o movimiento reciente. Los totales y filtros se calculan en externalclientes antes de paginar a 25 productos; cada detalle pagina sus lotes por separado y tiene su propia búsqueda. El alistamiento conserva la selección por producto/lote.

`/documentos` muestra el expediente del cliente (RUT, Cámara de Comercio, certificación bancaria y otros soportes habilitados en WMS). Permite ver, descargar, actualizar un archivo existente y cargar un tipo documental que aún falte mediante Cargar documento. El selector usa los tipos disponibles que entrega el backend, independientemente de la búsqueda o página actual. No permite eliminar documentos. SOLICITANTE puede cargar y actualizar; CONSULTA puede leer. El navegador solo llama a externalclientes, que transmite los bytes a WMS sin guardarlos en disco. Los documentos anteriores se conservan en WMS durante las actualizaciones del portal. La vista previa usa un blob temporal en memoria del navegador. `npm run test:documents` prueba consulta, descarga, carga inicial, actualización, perfiles y pantallas móviles con toda la red interceptada.

`/movimientos` consulta exclusivamente `GET /api/movimientos` de externalclientes con la cookie de sesión. Ese backend consulta el historial WMS, verifica la titularidad por lote-producto y devuelve un DTO sin ubicaciones, personal, comentarios ni archivos internos. Incluye productos anteriores al portal, retirados del catálogo o sin stock actual. Búsqueda y filtros por tipo y fechas de Colombia se aplican antes de paginar a 25 filas. `npm run test:movements` verifica esta pantalla con respuestas interceptadas, sin iniciar servidores ni llamar a WMS.

El flujo de acceso usa cookies HttpOnly y `credentials: include`. El CSRF y el contexto de usuario permanecen en memoria. No se almacenan credenciales, JWT, sesiones ni contraseñas en localStorage o sessionStorage. El texto legal y los datos del cliente se renderizan como texto React, sin `dangerouslySetInnerHTML`. No se inicia sesión automáticamente con credenciales de prueba. La autorización definitiva sigue correspondiendo al backend.

La API debe estar iniciada por ti. Vite reenvía `/api` a `DEV_API_TARGET`. El puerto 5174 ya corresponde a uno de los orígenes previstos en externalclientes; no se modificó esa API. Si cambias el puerto o dominio, revisa los orígenes permitidos de manera coordinada.

## Configuración

La configuración real está en `.env`; no se usa `.env.example`.

- `VITE_API_BASE_URL`: prefijo HTTP que consume el navegador, actualmente `/api`.
- `VITE_FASTWAY_LOGO_URL`: ruta pública al logo.
- `VITE_API_TIMEOUT_MS`: límite de espera del navegador, 15000 ms.
- `DEV_API_TARGET`: destino local de externalclientes, `http://127.0.0.1:3001`.
- `DEV_HOST` y `DEV_PORT`: dirección local de Vite, `localhost:5174`.

Las variables `VITE_*` son públicas: nunca colocar allí claves JWT, credenciales de base de datos ni secretos. No se copiaron secretos de la API.

La llegada del vehículo usa fecha y un único campo de hora con búsqueda, basado en el horario enviado por externalclientes. La lista sugiere horas cada quince minutos; buscar permite seleccionar cualquier minuto exacto disponible, sin cambiar la precisión ni las reglas del backend. Actualmente admite 08:00–17:00, hora de Colombia, con cinco horas de anticipación. Las horas anteriores a la anticipación desaparecen; al cierre solo se ofrece 17:00. Fuera de horario propone la siguiente fecha disponible a las 08:00. La API vuelve a validar ambas reglas y el navegador no permite agendar si no pudo obtener la configuración.

## Validación sin iniciar servidores

```powershell
npm test
npm run build
npm run test:ui
```

La prueba UI utiliza Edge en modo headless mediante Playwright y recursos compilados de `dist`. Intercepta todas las peticiones y usa respuestas ficticias solo dentro de la prueba. No abre puertos, no inicia Vite ni externalclientes, no escribe en bases de datos y no usa cuentas reales. Produce capturas y reportes automatizados de accesibilidad Axe (criterios WCAG A/AA) en `.runtime` para escritorio y móvil. `PLAYWRIGHT_CHANNEL` permite seleccionar otro canal instalado. Las fechas del portal se muestran en `America/Bogota`.
