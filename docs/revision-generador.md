# Revisión del generador de escritorio

## Archivo revisado

`generador.cpython-314.pyc`, 36.055 bytes. El ZIP disponible junto al archivo solo
contiene el mismo `.pyc`; no incluye `generador.py` ni los recursos originales.
Se inspeccionaron los nombres, constantes y objetos de código del archivo
compilado, sin ejecutarlo. No se recuperó un código fuente completo ni se verificó
la apariencia exacta de sus ventanas.

El archivo declara una ventana Tkinter de 900 × 700 y estas funciones:

1. Anexo fotográfico simple, con placa obligatoria, marca, línea, modelo y servicio.
2. Anexo fotográfico clasificado con ocho categorías: documentación, vista
   general, habitáculo, instrumentación, identificación, mecánica/parte inferior,
   hallazgos y otros.
3. Unión de PDFs con `pypdf` o `PyPDF2`.
4. Conversión Word a PDF mediante `win32com.client` y Microsoft Word. Para `.docx`
   incluye una alternativa que dibuja texto de párrafos con ReportLab, sin
   preservar el diseño completo.

También utiliza Pillow, ReportLab y python-docx. La referencia al archivo fuente
es una ruta de Windows, lo cual no implica que toda la lógica requiera Windows.

## Uso en Mac

Python y Tkinter pueden ejecutarse en macOS. El problema no es exclusivamente el
sistema operativo: este archivo es bytecode para una versión específica de
CPython, necesita bibliotecas adicionales y la automatización COM de Microsoft
Word no funciona en Mac. El Python local detectado fue 3.13.2; el archivo indica
CPython 3.14. Lo más mantenible sería obtener el `generador.py` original y adaptar
sus dependencias, en lugar de distribuir únicamente el archivo compilado.

## Adaptación web

La ruta `/generador/` recrea las funciones observadas en HTML, CSS y JavaScript.
No ejecuta el `.pyc` ni es una decompilación exacta. Tkinter dibuja ventanas de
escritorio, mientras que Vercel sirve páginas y funciones HTTP; publicar el
archivo compilado no convertiría esa ventana en una página web.

Se conserva el formulario de peritaje existente en `/`. La nueva ruta usa la
configuración estática actual y no requiere un backend de Python, Microsoft Word
ni instalación en el dispositivo del cliente. La conversión de Word se limita
explícitamente a texto `.docx`. Para una conversión con fidelidad de formato,
exporta desde Word/LibreOffice o integra posteriormente un servicio de conversión
adecuado; eso sería una función adicional con infraestructura propia.

Mejoras respecto a lo identificado en el bytecode: miniaturas, descripción por
foto, controles de orden, cantidad de fotos por página configurable, revisión de
texto extraído, errores visibles por archivo y vista previa del resultado.

Fuentes técnicas:
- https://docs.python.org/3/library/tkinter.html
- https://vercel.com/docs/functions/runtimes/python
- https://pdf-lib.js.org/
- https://stuk.github.io/jszip/
