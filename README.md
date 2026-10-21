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
- Hallazgos editables, imágenes de improntas y firma dibujada o adjunta.
- PDF con logo, datos del centro y páginas adicionales para textos extensos.
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

Disponible en `/generador/`, dentro del mismo despliegue de Vercel. El formulario
principal incluye un enlace a esta herramienta.

- **Anexo simple:** fotos en el orden elegido, con miniaturas, descripciones y
  controles para ordenar o quitar archivos.
- **Anexo clasificado:** las ocho categorías del aplicativo de escritorio. Cada
  categoría comienza en una página nueva; las fotos conservan su orden dentro de
  la categoría. Se puede elegir entre 2, 4 o 6 fotos por página A4.
- **Unir PDFs:** valida los archivos y concatena sus páginas en el orden elegido.
  No conserva firmas digitales, marcadores ni funciones de formularios.
- **Texto de Word a PDF:** extrae el texto principal de `.docx`, permite revisarlo
  y genera un PDF sencillo. No reproduce imágenes, tablas, encabezados ni la
  maquetación de Word. Los `.doc` antiguos no son compatibles. Los caracteres que
  Helvetica no admite (por ejemplo, algunos emojis) se sustituyen por `?`.

Usa **Probar con imágenes de demostración** para explorar los dos tipos de
anexos sin seleccionar archivos. Las imágenes se identifican como ilustraciones
sin valor de inspección. Después pulsa **Generar PDF** y abre la vista previa o
la descarga.

Los archivos de esta herramienta solo viven en la memoria de la pestaña. No se
sincronizan con el borrador del formulario principal ni se guardan al recargar.
Las fotos se reducen a un máximo de 1800 píxeles en su lado mayor y se convierten
a JPEG para limitar el tamaño del PDF; conserva los originales por separado.

Límites del prototipo: 80 fotos por modalidad, 20 MB por foto; 30 PDFs, 100 MB por
PDF y 150 MB acumulados; `.docx` de 10 MB, XML principal de 5 MB y hasta 250.000
caracteres. Los límites no garantizan memoria suficiente en todos los celulares.

Las bibliotecas `pdf-lib 1.17.1`, `JSZip 3.10.1` y el visor `PDF.js 5.6.205` se sirven desde `generador/vendor/`,
con sus licencias. No hay llamadas a servicios externos de conversión.

### Verificación

Con Node.js instalado:

```sh
node --test tests/generador.test.cjs
```

Las pruebas comprueban paginación, imágenes por página, categorías, validación,
orden y dimensiones al unir PDFs, y texto extenso. Para revisar visualmente, sirve
el repositorio con el comando local indicado arriba y abre `/generador/`.

El análisis del archivo compilado está en `docs/revision-generador.md`.
