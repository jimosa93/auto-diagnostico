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
