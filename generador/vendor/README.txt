Browser dependencies included locally; no CDN or runtime installation is required.

pdf-lib 1.17.1: https://github.com/Hopding/pdf-lib (MIT)
jszip 3.10.1: https://github.com/Stuk/jszip (MIT or GPLv3; used under MIT)

PDF.js 5.6.205: https://github.com/mozilla/pdf.js (Apache-2.0)
The legacy browser build, worker, fonts, CMaps and WASM decoders are included
under pdfjs/, with their corresponding license files.

Distributions copied from the installed Codex workspace dependency bundle.
Their license notices are included alongside the distribution files.

heic2any: https://github.com/alexcorvi/heic2any (MIT, see heic2any-LICENSE.txt).
The browser bundle is taken from the supplied Anexo_Fotografico_AutoDiagnostico.html;
its exact version is not declared in that file. It is loaded only when the native
image decoder cannot read a HEIC/HEIF file. Format variants may remain unsupported.
