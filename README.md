# AutoDiagnóstico · Prototipo de peritaje automotriz

Aplicación estática para diligenciar una inspección vehicular y descargar su
informe PDF. Conserva el diseño y las funciones del formulario HTML original.
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

- Formulario de cinco pasos: vehículo, resultado, inspección, improntas y PDF.
- Validación de campos esenciales y porcentajes.
- Calificación general de llantas en el PDF: promedio de los cuatro porcentajes,
  con el color del rango y hasta dos decimales. Si falta algún valor, queda pendiente.
- Selectores con búsqueda y texto libre en los elementos y hallazgos de carrocería
  y chasis: 83 elementos de carrocería, 34 de estructura y 32 hallazgos sugeridos.
  Búsqueda sin distinguir tildes o mayúsculas, con equivalencias como bumper /
  paragolpes y Bueno → Bien. La flecha abre todas las opciones; las teclas ↓/↑
  recorren la lista, Enter selecciona y Escape cierra. Alt+↓ abre la lista desde
  el teclado, incluso en hallazgos de varias líneas. Los hallazgos permiten
  varias líneas y los borradores anteriores conservan sus textos originales.
- Hallazgos editables, imágenes de improntas y firma dibujada o adjunta.
- Improntas optimizadas a un máximo de 1000 × 300 px, conservando proporción y
  sin ampliar imágenes pequeñas. JPEG con calidad de 84 % y ajuste hasta 76 %
  cuando supera el objetivo de 140 KB. También se optimizan al exportar PDFs
  de borradores antiguos; las que ya están compactas no se recomprimen.
- Observaciones prioritarias en un solo campo de texto, compatible con borradores anteriores.
- PDF con placa amarilla de letras negras y «COLOMBIA», referencia del vehículo
  destacada y estados en verde, ámbar o rojo (sin evaluar, gris).
- Concepto después del resultado en la primera hoja y
  porcentajes en negrilla: verde desde 80 %, amarillo desde 65 % y rojo por debajo
  de 65 %. El dictamen sigue siendo seleccionado por el perito.
- Encabezado principal en la primera página y compacto en las siguientes, con
  título y servicio centrados y logo y placa más pequeños.
- Hoja final de cláusulas con el contenido de `CLAUSULAS.pdf`, sin encabezado
  vehicular y con letra y espaciado ampliados. Se incluye siempre en la vista
  previa y la descarga del peritaje.
- Distribución automática del detalle técnico: chasis y llantas se colocan en
  dos columnas solo cuando permite conservar Fugas en esa misma hoja. Si hay
  demasiados elementos o texto, se mantiene una columna con páginas adicionales.
- PDF con logo, datos del centro y páginas adicionales para textos extensos;
  los conceptos muy largos continúan en la siguiente página sin recortar texto.
- Borrador automático en el navegador y exportación/importación como JSON.
- Descarga del formulario HTML para utilizarlo sin conexión.

## Recorrido de prueba

1. Completa los datos del vehículo o pulsa **Cargar ejemplo de la plantilla**.
   El ejemplo contiene datos precargados; no corresponde a una inspección nueva.
2. Revisa el resultado y modifica los hallazgos y porcentajes.
3. Adjunta una impronta, escribe el nombre del perito y dibuja una firma.
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

Las pruebas cubren perfiles y dimensiones, validación de borradores, categorías,
paginación, fotos ampliadas, unión de PDFs y texto extenso. También se verificaron
en navegador el PDF, su vista previa y ZIP con una imagen de prueba de 24 MP,
la recuperación local y la integridad de originales exportados.

El análisis del archivo compilado está en `docs/revision-generador.md`.
