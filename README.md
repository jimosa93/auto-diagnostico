# AutoDiagnóstico · Prototipo de peritaje automotriz

Aplicación web para diligenciar una inspección vehicular y descargar su
informe PDF. Incluye el diseño del informe y la estructura de secciones acordados con el cliente.
El formulario y el PDF funcionan en el navegador. El historial utiliza una
función de Vercel, PostgreSQL en Neon y archivos privados en Cloudflare R2; no requiere React. El logo y la biblioteca
de generación de PDF están incluidos en `index.html`.

## Publicar en Vercel

1. En Vercel, selecciona **Add New → Project** e importa el repositorio
   `jimosa93/auto-diagnostico`.
2. Usa la rama `main` y deja **Root Directory** en la raíz del repositorio.
3. `vercel.json` configura **Other**, instalación `npm ci`, compilación
   `npm run build` y salida `public`. El servidor `/api/history` queda separado
   de los archivos públicos. Usa Node.js 22.
4. Agrega las variables privadas **DATABASE_URL** (conexión completa de Neon)
   y **HISTORY_PASSWORD** (contraseña independiente del equipo, mínimo 16 caracteres).
   Configúralas para Production; usa otra base de datos para Preview/Development.
   Copia la conexión desde Neon, con la contraseña codificada para URL si contiene
   caracteres especiales. No uses prefijos públicos ni subas `.env.local` a Git.
5. Para guardar las imágenes en R2, configura un bucket privado y las variables
   `R2_ACCOUNT_ID` (sólo el identificador de 32 caracteres), `R2_REGION=auto`,
   `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`. El token debe
   permitir lectura y escritura de objetos sólo en ese bucket. Conserva las
   variables de Neon y del historial; son servicios complementarios.
6. Despliega o vuelve a desplegar después de cambiar las variables. Las tablas
   `ad_*` se crean automáticamente en la primera operación autenticada/inicio de
   sesión. También puedes ejecutar `npm run db:migrate` con `.env.local`.

Los siguientes cambios en `main` se publican automáticamente con la integración
Git. La contraseña del historial no es la contraseña de Neon. Al cambiarla se
invalidan las sesiones anteriores.

Referencia: [sitios estáticos en Vercel](https://vercel.com/docs/builds/configure-a-build).

## Probar localmente

Para probar sólo el formulario estático (sin historial), con Python 3:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Abre <http://127.0.0.1:8080>. También puedes abrir `index.html` directamente en un
navegador de escritorio. Para probar en iPhone o iPad, usa la URL de Vercel en
Safari; la vista previa de la aplicación Archivos puede desactivar JavaScript.

Para probar el historial localmente, copia `.env.example` a `.env.local`, agrega
las credenciales de una base de desarrollo y ejecuta:

```sh
npm ci
npm run build
npm run dev
```

Abre <http://127.0.0.1:8081>. Los cambios de interfaz requieren repetir el build.

## Historial centralizado

- **Guardar informe** conserva una inspección incompleta; requiere una placa.
  Guardar, descargar y ver el PDF registran el informe sin pedir contraseña.
- **Descargar PDF**, **Ver PDF** y sus enlaces secundarios registran una acción
  después de generar correctamente el PDF. Registrar la descarga indica la
  solicitud, no que el archivo haya sido guardado finalmente por el dispositivo.
- Se conserva el formulario completo: vehículo, servicio, calificaciones,
  hallazgos, notas, llantas, fugas, responsable, firma, logo y fotografías del
  anexo incluidas en el peritaje. Las fotos son las versiones optimizadas que
  utiliza el formulario, no sus originales de alta resolución.
- Las imágenes se suben por separado (hasta 4 millones de caracteres por imagen),
  se identifican por SHA-256 y no se duplican al guardar otra versión. La app
  admite hasta 200 fotografías por informe en el historial. Con R2 configurado,
  se decodifican y se guardan como archivos JPEG/PNG binarios, conservando la
  optimización existente. Neon almacena el hash, ruta del objeto, tipo y tamaño;
  las versiones del informe conservan sus referencias originales.
- `/historial/` permite buscar por placa/servicio/vehículo, filtrar por fecha de
  guardado en Colombia, exportar los resultados a CSV y abrir informes. La
  actividad muestra hasta las últimas 500 acciones de cada informe.
- Si la placa cambia respecto al informe guardado, **Guardar informe**, **Descargar
  PDF** y **Ver PDF** crean automáticamente otro registro, conservando el anterior.
  La comparación se hace contra la base de datos, incluso tras recargar o abrir
  un informe desde el historial. Mayúsculas, espacios y guiones no cambian la
  identidad de una placa. Volver luego a una placa anterior crea otro registro;
  no se fusionan inspecciones distintas por tener la misma placa.
- Cada modificación de la misma placa crea una versión. Guardar/descargar/ver sin cambiar los datos
  conserva esa versión y añade un evento. Los reintentos del mismo evento son
  idempotentes. No hay eliminación de informes en esta versión.
- Abrir un informe actual permite continuar editándolo. Abrir una versión anterior
  crea una copia: no sustituye silenciosamente la versión más reciente.
- El servidor rechaza sobrescrituras con una versión desactualizada. La interfaz
  permite abrir el último registro o guardar como informe nuevo.
- Si falla el historial, el PDF sigue disponible y aparece **No se guardó en el
  historial** con un botón de reintento. Los reintentos pendientes se mantienen
  en memoria; descarga el borrador antes de salir si no puedes guardar. No se
  promete sincronización automática sin conexión.
- Se guardan datos y versiones, no el PDF binario. Al reabrirlo se genera con la
  plantilla vigente; por eso no es un archivo legal inmutable del PDF original.
- La consulta del historial utiliza una contraseña compartida del equipo, cookie HttpOnly/Secure
  con duración de 12 horas, validación del origen y límite de intentos de acceso.
  El campo Perito es un dato del informe, no una identidad de usuario verificada.
- Cada formulario recibe una clave aleatoria de escritura que se conserva en el
  borrador local. Permite guardar únicamente ese informe, nunca consultar datos,
  fotos o registros del historial. El servidor guarda sólo su hash. Abrir un
  informe desde el historial autoriza ese navegador para continuar guardándolo
  aunque expire la sesión de consulta. Los borradores previos pueden obtener su
  primera clave mediante el identificador privado de su versión guardada.
- Los envíos sin sesión tienen límites por IP y hora: 240 preparaciones/guardados
  por operación, 1000 cargas y 280 MB de solicitudes de imágenes. El formulario
  público acepta registros de cualquier visitante; estos límites reducen abusos
  pero no equivalen a identificar al perito.
- La conexión a Neon nunca se entrega al navegador. Las tablas incluyen registros
  de imágenes subidas antes de un fallo de guardado; no se eliminan automáticamente.
  Revisa el almacenamiento contratado conforme crezca el uso.

Este historial corresponde al **Peritaje vehicular**. Los originales del generador
fotográfico independiente y los archivos de Unir PDFs/Word continúan siendo locales.

## Almacenamiento de imágenes en R2

En `/historial/`, después de iniciar sesión, **Almacenamiento de imágenes** muestra
la cantidad de archivos guardados y el espacio utilizado en R2. Si aún no se ha
guardado ningún informe, ambos valores aparecen en cero. No se requiere un
traslado inicial: las nuevas fotos, logos y firmas se guardan directamente en R2.

Las cifras corresponden a los archivos registrados por la aplicación; no incluyen
objetos subidos fuera de ella ni cargas huérfanas. Cada imagen se vuelve a leer y
se verifica mediante SHA-256 antes de registrar su referencia en Neon.

El bucket sigue privado. Las operaciones pasan por la API de Vercel; la escritura se autoriza por informe
y la lectura requiere la sesión privada del historial;
no se exponen credenciales ni URLs públicas y no hace falta configurar CORS en R2.
La API devuelve temporalmente una data URL al navegador para mantener el PDF y los
borradores compatibles; ese base64 no se almacena en Neon para archivos de R2.
Se usa el SDK S3 [según Cloudflare](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

Sin ninguna variable de R2 se mantiene el almacenamiento anterior en Neon, para
entornos de desarrollo. Una configuración parcial o un fallo de R2 produce un
error visible; no cambia silenciosamente el destino. Si ya se migraron imágenes,
no retires las variables de R2 ni cambies el bucket sin trasladar sus objetos.
No se borran objetos automáticamente: fotos compartidas por otras versiones deben
conservarse. Evita reglas de expiración sobre `reports/assets/`.

## Funciones incluidas

- Formulario de cinco pasos: vehículo, resultado, inspección y responsable,
  fotografías y PDF. Incluye combustible y clase / carrocería.
- Selectores con búsqueda y texto libre: 83 elementos de carrocería, 34 de
  estructura y 32 hallazgos sugeridos. La búsqueda reconoce tildes, mayúsculas
  y equivalencias como bumper / paragolpes y Bueno → Bien. La flecha muestra
  todas las opciones; ↓/↑ recorren la lista, Enter selecciona y Escape cierra.
  Alt+↓ permite abrirla desde el teclado. Los hallazgos admiten varias líneas.
- Fugas en filas editables de sistema y hallazgo, con motor, caja de velocidades,
  dirección hidráulica y refrigerante como elementos iniciales. El selector
  ofrece nueve sistemas y componentes; sus hallazgos tienen un catálogo propio:
  Humedad, Fuga, Fuga con goteo, No aplica y Sin novedades. Los hallazgos quedan
  vacíos hasta que el perito los diligencia.
- Observaciones generales en un textarea; responsable y firma en Inspección.
- Observación de llantas debajo de su tabla y Observaciones adicionales debajo
  de las generales. Ambos campos son opcionales: el PDF omite cada título y
  contenido cuando el campo está vacío o contiene sólo espacios.
- Anexo fotográfico con dos espacios iniciales y botones para agregar, quitar
  y ordenar fotografías. Descripciones opcionales, sin títulos fijos VIN/Serie.
- Fotos optimizadas dentro de 1400 × 1000 px, conservando proporción y sin ampliar
  originales pequeños. JPEG con calidad de 84 %, ajustable hasta 76 % al superar
  el objetivo de 300 KB. Las fotos ya compactas se reutilizan sin recomprimir.
- Borrador automático local, exportación/importación JSON y formulario HTML
  descargable para trabajar sin conexión.

### Estructura del informe

1. **Resumen del peritaje:** resultado y calificaciones, información general del
   servicio, concepto y datos del vehículo.
2. **Inspección visual y estructural:** carrocería a la izquierda y chasis a la
   derecha. Las columnas continúan de forma independiente cuando hay muchos
   hallazgos. Las filas cortas se mantienen juntas; las extensas pueden continuar.
3. **Mecánica y cierre técnico:** llantas y promedio de sus cuatro porcentajes,
   fugas, observaciones generales, información adicional y firma del responsable.
4. **Anexo fotográfico:** solo fotos adjuntas, en dos columnas, con hasta seis por
   página con descripciones breves. Las descripciones más largas pueden reducir
   esa cantidad. Si no hay fotos adjuntas, se omite el anexo vacío.
5. **Cláusulas y alcance:** siempre al final, en una página sin encabezado vehicular.

Cada bloque comienza en página nueva. Los números anteriores identifican las
secciones: si hay continuaciones, su página física puede variar. El footer indica
la numeración real. No se imprimen los rótulos «Hoja 2», «Hoja 3» o «Hoja 4».

Se mantienen la placa amarilla, el encabezado principal y los encabezados
compactos de continuación, el logo y los datos de contacto. Las calificaciones
van en negrilla: verde desde 80 %, ámbar desde 65 % y rojo por debajo de 65 %.
El promedio de llantas queda pendiente si falta alguno de sus cuatro valores.
El dictamen siempre lo selecciona el perito.

### Compatibilidad de borradores

Los borradores anteriores (versión 1) se migran a versión 2 al abrirse. Las
improntas adjuntas pasan al anexo y sus códigos se conservan como descripciones;
los códigos antiguos sin imagen aparecen en Registros adicionales del cierre.
Las etiquetas originales permanecen en los datos del borrador. Fugas en texto
libre se conserva en Observaciones adicionales de fugas, sin asignar estados
por sistema automáticamente. Los hallazgos, observaciones, firma e información
adicional conservan sus textos. El formulario admite borradores JSON de hasta
100 MB; la memoria y el almacenamiento disponibles dependen del navegador.

## Recorrido de prueba

1. Completa los datos del vehículo o pulsa **Cargar ejemplo de la plantilla**.
   El ejemplo contiene datos precargados; no corresponde a una inspección nueva.
2. Revisa el resultado y modifica los hallazgos y porcentajes.
3. Completa las fugas y el responsable en Inspección, dibuja una firma y adjunta
   fotografías en el siguiente paso. Prueba agregar, ordenar y quitar una foto.
4. Pulsa **Generar PDF → Descargar PDF** y verifica los datos, las imágenes y la
   paginación. Comprueba también **Ver PDF**.
5. Recarga la página y verifica que el borrador se conserva.
6. Descarga el borrador, inicia un nuevo peritaje y vuelve a abrir el JSON.
7. Repite el recorrido en un celular desde la URL HTTPS.

## Borradores y acceso

El autoguardado local conserva un borrador por navegador y origen. Sigue siendo
independiente del historial: sólo los botones de guardado/PDF envían información
a Neon. El JSON descargado permite conservar o trasladar el borrador sin conexión;
al importarlo se trata como un informe nuevo. El formulario público puede usarse
sin sesión: guardar, descargar o ver un PDF registra automáticamente el informe.
La contraseña sólo se solicita para consultar el historial y recuperar informes.
Si falla el registro remoto, se entrega el PDF con un aviso visible y una opción
de reintento; no se pide la contraseña para reintentar el guardado.

## Generador de anexos y herramientas PDF

Disponible en `/generador/`, dentro del mismo despliegue de Vercel. Integra la
organización del archivo `Anexo_Fotografico_AutoDiagnostico.html`.

- Ocho categorías iniciales, categorías nuevas y nombres/orden editables.
- Orden, categoría, descripción, giro y ampliación individual de fotografías.
- PDF tamaño carta, por categorías o simple, con 2, 3 o 4 fotos por fila.
  Las categorías marcadas «Más detalle» usan dos fotos por fila en el modo
  clasificado. «Ampliar en PDF» usa el ancho completo.
- Tres perfiles de compresión: Compacto, Equilibrado y Más detalle. Se calculan
  las dimensiones según el espacio de impresión y se exporta JPEG, conservando
  proporción y encuadre. Cada exportación parte del original, sin acumular pérdidas.
- Vista previa del PDF, descarga y ZIP de fotos optimizadas organizado por categorías.
- Borrador automático en IndexedDB y exportación/importación de ZIP con los
  originales intactos, descripciones, categorías, giro y configuración.
- Logo, datos del centro y membrete editables; selección múltiple y captura desde
  cámara cuando el navegador lo permite.

El perfil Equilibrado usa aproximadamente 200 ppp para fotos generales y 280 ppp
para detalles. Por ejemplo, cuatro fotos por fila requieren un lado mayor de
hasta 350 px; una foto a todo el ancho puede usar hasta 2000 px. No se aumentan
imágenes pequeñas. El perfil Más detalle conserva un objetivo mínimo de 1400 px
para fotos generales y 2000 px para categorías de detalle, aunque se impriman
pequeñas; las fotos a todo el ancho pueden llegar a 2550 px. Esos objetivos se
limitan por la resolución original y el presupuesto de compresión de cada imagen.
Los resultados dependen de cada imagen: revisa la legibilidad
con la vista previa y usa Más detalle o Ampliar para números, daños o documentos.

Los originales se conservan en este navegador si hay espacio. Descarga el
borrador ZIP como respaldo o para continuar en otro dispositivo; el ZIP de
**fotos optimizadas** no sustituye ese respaldo. El borrador del anexo es
independiente del formulario principal. Las fotos se procesan en el dispositivo,
sin servicios externos ni almacenamiento en el servidor.

Límites: 200 fotos, 40 MB por imagen, 600 MB de originales y 30 categorías.
La memoria disponible puede imponer límites menores, especialmente en móviles.
JPG, PNG y WebP funcionan con los decodificadores del navegador. HEIC/HEIF se
intenta abrir de forma nativa y, si hace falta, con el conversor local incluido;
la compatibilidad depende del archivo y del navegador.

Las herramientas anteriores siguen disponibles en `/generador/documentos/`:

- `?modo=merge`: une PDFs en el orden elegido. No conserva firmas digitales,
  marcadores ni funciones de formularios. Máximo 30 archivos, 100 MB por PDF y
  150 MB acumulados.
- `?modo=word`: extrae y permite editar el texto principal de `.docx` para crear
  un PDF sencillo. No reproduce imágenes, tablas ni la maquetación de Word.
  Máximo 10 MB, XML principal de 5 MB y 250.000 caracteres. Los caracteres que
  Helvetica no admite se sustituyen por `?`.

Los documentos de estas dos herramientas viven en memoria hasta cerrar/recargar
la pestaña. Las bibliotecas y sus licencias se sirven desde `generador/vendor/`.
Para usar el generador localmente, sírvelo por HTTP con el comando anterior;
no abras sus archivos directamente mediante `file://`.

### Verificación

Con Node.js instalado:

```sh
node --test tests/*.test.cjs
```

Las pruebas cubren perfiles y dimensiones, migración de borradores, selectores,
columnas y continuaciones del peritaje, anexos dinámicos, categorías, fotos
ampliadas, unión de PDFs y texto extenso. También se verificaron
en navegador el PDF, su vista previa y ZIP con una imagen de prueba de 24 MP,
la recuperación local y la integridad de originales exportados.

El análisis del archivo compilado está en `docs/revision-generador.md`.
