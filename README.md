# AutoDiagnóstico · Prototipo de peritaje automotriz

Aplicación estática para diligenciar una inspección vehicular y descargar su
informe PDF. Incluye el diseño del informe y la estructura de secciones acordados con el cliente.
No requiere React, instalación de dependencias, servidor de aplicación ni base
de datos. El logo y la biblioteca de generación de PDF están incluidos en
`index.html`.

## Publicar en Vercel

1. En Vercel, selecciona **Add New → Project** e importa el repositorio
   `jimosa93/auto-diagnostico`.
2. Usa la rama `main` y deja **Root Directory** en la raíz del repositorio.
3. El archivo `vercel.json` configura **Framework Preset: Other**, sin comandos
   de instalación ni compilación, y **Output Directory: .**.
4. Pulsa **Deploy** y abre la URL HTTPS que Vercel entregue.

No se necesitan variables de entorno. Los siguientes cambios en `main` se
publicarán automáticamente si mantienes conectada la integración de Git.

Referencia: [sitios estáticos en Vercel](https://vercel.com/docs/builds/configure-a-build).

## Probar localmente

Desde la carpeta del proyecto, con Python 3 instalado:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Abre <http://127.0.0.1:8080>. También puedes abrir `index.html` directamente en un
navegador de escritorio. Para probar en iPhone o iPad, usa la URL de Vercel en
Safari; la vista previa de la aplicación Archivos puede desactivar JavaScript.

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

## Alcance del prototipo

Los datos y las imágenes se procesan en el navegador; no se envían a una base de
datos. Solo se conserva un borrador por navegador y origen (dominio y protocolo).
El borrador local no se comparte entre equipos ni entre la URL local y Vercel.
Si borras los datos del navegador, puedes perderlo. Descarga el JSON para
conservarlo o trasladarlo a otro equipo.

El almacenamiento del navegador tiene un límite. Si las imágenes lo superan,
el formulario indica que debes descargar el borrador para conservarlo.

Esta versión no incluye inicio de sesión, historial centralizado ni consecutivos
automáticos. Una URL pública permite que cualquier persona con acceso a ella
utilice el formulario; los borradores de otros dispositivos no se publican.


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
