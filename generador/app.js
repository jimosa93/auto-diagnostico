'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const categories = AnexoPDF.CATEGORIES;
  const state = { mode: 'simple', simple: [], classified: [], pdfs: [], wordName: '', busy: false, resultURL: null };
  const preview = { token: 0, doc: null, task: null, load: null, page: 1 };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categoryOptions = selected => categories.map((c, i) => `<option value="${i}"${i === selected ? ' selected' : ''}>${c}</option>`).join('');
  const photos = () => state[state.mode === 'classified' ? 'classified' : 'simple'];
  const vehicle = () => Object.fromEntries(['plate', 'brand', 'line', 'year', 'service'].map(k => [k, $(k).value.trim()]));
  const titles = {
    simple: ['ANEXO FOTOGRÁFICO', 'La evidencia, foto a foto', 'Agrega fotografías, revisa su orden y añade una descripción opcional.', 'Anexo fotográfico'],
    classified: ['ANEXO POR CATEGORÍAS', 'Cada hallazgo, en su lugar', 'Clasifica la evidencia. Cada categoría comienza en una página nueva del PDF.', 'Anexo clasificado'],
    merge: ['EXPEDIENTE COMPLETO', 'Todos los PDFs, un solo archivo', 'Organiza tus documentos en el orden en que deben aparecer.', 'Unión de PDFs'],
    word: ['CONVERSIÓN DE TEXTO', 'De Word a un PDF sencillo', 'Carga un .docx y revisa su texto antes de generar el documento.', 'Documento de texto']
  };
  function notice(message = '', error = false) {
    $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error);
    if (error) $('notice').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function invalidate() {
    $('result').hidden = true; closePreview();
    $('download').removeAttribute('href'); $('open-pdf').removeAttribute('href');
    if (state.resultURL) URL.revokeObjectURL(state.resultURL);
    state.resultURL = null;
  }
  function closePreview() {
    preview.token++;
    preview.task?.cancel(); preview.task = null;
    if (preview.doc) preview.doc.destroy().catch(() => {});
    else if (preview.load) preview.load.destroy().catch(() => {});
    preview.doc = null; preview.load = null;
    $('preview-section').hidden = true;
    $('preview-canvas').width = 1; $('preview-canvas').height = 1;
  }
  async function renderPreviewPage() {
    const token = ++preview.token;
    const oldTask = preview.task; oldTask?.cancel();
    if (oldTask) await oldTask.promise.catch(() => {});
    if (token !== preview.token || !preview.doc) return;
    $('preview-prev').disabled = $('preview-next').disabled = true;
    try {
      const page = await preview.doc.getPage(preview.page);
      if (token !== preview.token) return;
      const natural = page.getViewport({ scale: 1 });
      const width = Math.min(1100, Math.max(280, $('pdf-preview').clientWidth - 40));
      const scale = width / natural.width * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      const canvas = $('preview-canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.style.width = width + 'px';
      canvas.setAttribute('aria-label', `Página ${preview.page} de ${preview.doc.numPages} del PDF generado`);
      preview.task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await preview.task.promise;
      if (token !== preview.token) return;
      $('preview-page').textContent = `${preview.page} / ${preview.doc.numPages}`;
    } catch (error) {
      if (token === preview.token && error.name !== 'RenderingCancelledException') {
        $('preview-page').textContent = 'Vista previa no disponible';
        notice('No se pudo mostrar esta página. Puedes descargar el PDF o abrirlo en otra pestaña.', true);
      }
    } finally {
      if (token === preview.token && preview.doc) {
        $('preview-prev').disabled = preview.page <= 1;
        $('preview-next').disabled = preview.page >= preview.doc.numPages;
      }
    }
  }
  async function showPreview() {
    if (!state.resultURL) return;
    closePreview(); const token = preview.token;
    $('preview-section').hidden = false;
    $('preview-page').textContent = 'Cargando PDF…';
    $('preview-prev').disabled = $('preview-next').disabled = true;
    $('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
      if (token !== preview.token || !state.resultURL) return;
      const base = new URL('/generador/vendor/pdfjs/', window.location.origin);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      preview.load = pdfjs.getDocument({ url: state.resultURL, standardFontDataUrl: new URL('standard_fonts/', base).href, cMapUrl: new URL('cmaps/', base).href, cMapPacked: true, wasmUrl: new URL('wasm/', base).href, isEvalSupported: false });
      const doc = await preview.load.promise;
      if (token !== preview.token) { await doc.destroy(); return; }
      preview.doc = doc; preview.page = 1;
      await renderPreviewPage();
    } catch {
      if (token === preview.token) {
        $('preview-page').textContent = 'Vista previa no disponible';
        notice('No se pudo abrir la vista previa. Utiliza la descarga o «Abrir en otra pestaña».', true);
      }
    }
  }
  function busy(value, message = '') {
    state.busy = value;
    document.querySelectorAll('button,input,select,textarea').forEach(e => { e.disabled = value; });
    $('progress').textContent = message;
    if (!value) { renderPhotos(); renderPDFs(); }
  }
  function summary() {
    const mode = state.mode, isPhoto = mode === 'simple' || mode === 'classified';
    $('summary-title').textContent = titles[mode][3];
    $('summary-plate').hidden = !isPhoto;
    $('summary-plate').textContent = $('plate').value.toUpperCase() || 'SIN PLACA';
    if (isPhoto) {
      const list = photos(), perPage = +$('density').value;
      const pages = mode === 'classified' ? categories.reduce((n, _, i) => n + Math.ceil(list.filter(p => p.category === i).length / perPage), 0) : Math.ceil(list.length / perPage);
      $('summary-count').textContent = `${list.length} fotografías · ${pages} ${pages === 1 ? 'página' : 'páginas'}`;
      $('summary-detail').textContent = `Formato A4 · ${perPage} fotos por página`;
    } else if (mode === 'merge') {
      $('summary-count').textContent = `${state.pdfs.length} archivos · ${state.pdfs.reduce((n, p) => n + p.pages, 0)} páginas`;
      $('summary-detail').textContent = 'Se conserva el tamaño de cada página.';
    } else {
      $('summary-count').textContent = `${$('word-text').value.length.toLocaleString('es-CO')} caracteres`;
      $('summary-detail').textContent = 'Formato A4 · Texto con diseño sencillo';
    }
  }
  function switchMode(mode) {
    if (state.busy || !titles[mode]) return;
    state.mode = mode; invalidate(); notice();
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    ['tool-kicker', 'tool-title', 'tool-description'].forEach((id, i) => $(id).textContent = titles[mode][i]);
    $('photo-tool').hidden = !['simple', 'classified'].includes(mode);
    $('merge-tool').hidden = mode !== 'merge'; $('word-tool').hidden = mode !== 'word';
    $('category-field').hidden = mode !== 'classified';
    renderPhotos(); renderPDFs(); summary();
  }
  function controls(i, length, kind) {
    return `<div class="row-actions"><button type="button" data-action="up" data-kind="${kind}" data-index="${i}" aria-label="Subir ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="down" data-kind="${kind}" data-index="${i}" aria-label="Bajar ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}" ${i === length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="remove" data-action="remove" data-kind="${kind}" data-index="${i}">Quitar ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}</button></div>`;
  }
  function renderPhotos() {
    const list = photos();
    $('photo-count').textContent = `Fotografías (${list.length})`;
    $('photo-list').innerHTML = list.length ? list.map((p, i) => `<article class="photo-card"><img src="${p.url}" alt="Fotografía ${i + 1}: ${escape(p.name)}"><div class="photo-body"><p class="photo-name" title="${escape(p.name)}">${String(i + 1).padStart(2, '0')} · ${escape(p.name)}</p>${state.mode === 'classified' ? `<label>Categoría de foto ${i + 1}<select data-category="${i}">${categoryOptions(p.category)}</select></label>` : ''}<label>Descripción de foto ${i + 1}<textarea data-caption="${i}" maxlength="180" rows="2" placeholder="Opcional · hasta 180 caracteres">${escape(p.caption)}</textarea></label>${controls(i, list.length, 'photo')}</div></article>`).join('') : '<p class="empty">Aquí aparecerán las fotos que agregues.</p>';
  }
  function renderPDFs() {
    $('pdf-list').innerHTML = state.pdfs.length ? state.pdfs.map((p, i) => `<article class="pdf-row"><strong>${i + 1}. ${escape(p.name)}</strong><p>${p.pages} páginas · ${(p.size / 1024 / 1024).toFixed(1)} MB</p>${controls(i, state.pdfs.length, 'pdf')}</article>`).join('') : '<p class="empty">Todavía no has agregado PDFs.</p>';
  }
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async blob => {
            if (!blob) return reject(Error('No se pudo procesar la imagen.'));
            try { resolve({ data: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), name: file.name, caption: '', category: +$('upload-category').value }); } catch (e) { reject(e); }
          }, 'image/jpeg', .87);
        } catch { reject(Error('No se pudo procesar la imagen.')); } finally { URL.revokeObjectURL(url); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(Error('Formato de imagen no compatible. Usa JPG, PNG o WebP.')); };
      image.src = url;
    });
  }
  async function addPhotos(files) {
    const list = photos();
    if (list.length + files.length > 80) return notice('Puedes incluir hasta 80 fotos por anexo. Quita algunas o selecciona menos archivos.', true);
    busy(true, 'Procesando fotografías…'); invalidate(); const errors = []; let added = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]; $('progress').textContent = `Procesando foto ${i + 1} de ${files.length}…`;
        try {
          if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw Error('Usa una imagen JPG, PNG o WebP.');
          if (file.size > 20 * 1024 * 1024) throw Error('Supera el límite de 20 MB.');
          list.push(await readImage(file)); added++;
        } catch (e) { errors.push(`${file.name}: ${e.message}`); }
      }
      notice(`${added} fotografías agregadas.${errors.length ? '\n' + errors.join('\n') : ''}`, errors.length > 0);
    } finally { busy(false); summary(); }
  }
  async function addPDFs(files) {
    if (state.pdfs.length + files.length > 30) return notice('Puedes unir hasta 30 PDFs a la vez.', true);
    if (state.pdfs.reduce((n, p) => n + p.size, 0) + files.reduce((n, f) => n + f.size, 0) > 150 * 1024 * 1024) return notice('La selección supera el límite total de 150 MB.', true);
    busy(true, 'Leyendo PDFs…'); invalidate(); const errors = []; let added = 0;
    try {
      for (const file of files) {
        try {
          if (!/\.pdf$/i.test(file.name) || file.size > 100 * 1024 * 1024) throw Error('Selecciona un PDF de hasta 100 MB.');
          const data = new Uint8Array(await file.arrayBuffer());
          let doc;
          try { doc = await PDFLib.PDFDocument.load(data); } catch { throw Error('No se pudo abrir: está dañado, protegido con contraseña o no es un PDF compatible.'); }
          if (!doc.getPageCount()) throw Error('El documento no tiene páginas.');
          state.pdfs.push({ name: file.name, size: file.size, data, pages: doc.getPageCount() }); added++;
        } catch (e) { errors.push(`${file.name}: ${e.message}`); }
      }
      notice(`${added} PDFs agregados.${errors.length ? '\n' + errors.join('\n') : ''}`, errors.length > 0);
    } finally { busy(false); summary(); }
  }
  async function readWord(file) {
    if (!/\.docx$/i.test(file.name)) return notice('Selecciona un .docx. Para un .doc antiguo, ábrelo en Word y guárdalo como .docx o PDF.', true);
    if (file.size > 10 * 1024 * 1024) return notice('El documento supera el límite de 10 MB.', true);
    busy(true, 'Extrayendo el texto…');
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entry = zip.file('word/document.xml');
      if (!entry) throw Error('El archivo no contiene un documento Word compatible.');
      // JSZip exposes declared ZIP sizes here; bound decompression before allocating XML.
      if (!entry._data || entry._data.uncompressedSize > 5 * 1024 * 1024) throw Error('El contenido del documento es demasiado grande para esta herramienta.');
      const xml = await entry.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw Error('El contenido del documento está dañado.');
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, 'p'));
      const extracted = paragraphs.map(p => Array.from(p.getElementsByTagNameNS(ns, '*')).filter(el => ['t', 'tab', 'br', 'cr'].includes(el.localName)).map(el => el.localName === 't' ? el.textContent : el.localName === 'tab' ? '\t' : '\n').join('')).join('\n\n');
      if (!extracted.trim()) throw Error('No se encontró texto principal. Este documento puede contener solo imágenes.');
      if (extracted.length > 250000) throw Error('El texto supera los 250.000 caracteres permitidos. Divide el documento.');
      invalidate(); $('word-text').value = extracted; state.wordName = file.name;
      $('word-name').textContent = file.name;
      notice('Texto extraído. Revisa el contenido antes de generar el PDF. No se conservarán imágenes ni el diseño de Word.');
    } catch (e) { notice(e.message || 'No se pudo abrir el documento.', true); } finally { busy(false); summary(); }
  }
  async function generate() {
    if (state.busy) return;
    const isPhoto = ['simple', 'classified'].includes(state.mode), data = vehicle();
    if (isPhoto && !data.plate) { notice('Escribe la placa del vehículo para generar el anexo.', true); $('plate').focus(); return; }
    if (isPhoto && data.year && (!/^\d{4}$/.test(data.year) || +data.year < 1900 || +data.year > 2100)) { notice('Revisa el modelo: debe ser un año entre 1900 y 2100.', true); $('year').focus(); return; }
    busy(true, 'Preparando el documento…'); invalidate(); notice();
    try {
      let output, name;
      if (isPhoto) {
        const response = await fetch('/generador/logo.png');
        if (!response.ok) throw Error('No se pudo cargar el logo. Recarga la página e inténtalo de nuevo.');
        output = await AnexoPDF.photoPDF({ vehicle: data, photos: photos(), classified: state.mode === 'classified', density: +$('density').value, logo: new Uint8Array(await response.arrayBuffer()), onProgress: (n, total) => $('progress').textContent = `Preparando foto ${n} de ${total}…` });
        name = `ANEXO_${data.plate.toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'VEHICULO'}_${state.mode === 'classified' ? 'CLASIFICADO' : 'SIMPLE'}.pdf`;
      } else if (state.mode === 'merge') {
        output = await AnexoPDF.mergePDFs(state.pdfs); name = 'EXPEDIENTE_UNIDO.pdf';
      } else {
        output = await AnexoPDF.textPDF($('word-text').value, state.wordName || 'Documento de texto');
        name = (state.wordName.replace(/\.docx$/i, '').replace(/[^\p{L}\p{N}_-]/gu, '_') || 'Documento') + '_TEXTO.pdf';
      }
      state.resultURL = URL.createObjectURL(new Blob([output.bytes], { type: 'application/pdf' }));
      $('download').href = $('open-pdf').href = state.resultURL; $('download').download = name;
      $('result-name').textContent = `${name} · ${output.pages} ${output.pages === 1 ? 'página' : 'páginas'}`;
      $('result').hidden = false;
      notice('PDF generado. Puedes descargarlo o abrir su vista previa.');
      $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { notice(e.message || 'No se pudo generar el PDF. Revisa los archivos e inténtalo de nuevo.', true); }
    finally { busy(false); }
  }
  async function demo() {
    const list = photos();
    if (list.length > 77) return notice('Libera espacio para tres imágenes de demostración.', true);
    busy(true, 'Preparando demostración…'); invalidate();
    try {
      const names = ['Vista general', 'Identificación', 'Hallazgos'];
      for (let i = 0; i < names.length; i++) {
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 620;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = ['#e9effa', '#eaf3ee', '#f6efe5'][i]; ctx.fillRect(0, 0, 1000, 620);
        ctx.fillStyle = '#526781'; ctx.beginPath(); ctx.moveTo(170, 350); ctx.lineTo(230, 310); ctx.lineTo(330, 210); ctx.lineTo(620, 210); ctx.lineTo(735, 305); ctx.lineTo(835, 340); ctx.lineTo(835, 400); ctx.lineTo(170, 400); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c4d5e8'; ctx.beginPath(); ctx.moveTo(305, 305); ctx.lineTo(360, 240); ctx.lineTo(485, 240); ctx.lineTo(485, 305); ctx.fill(); ctx.beginPath(); ctx.moveTo(505, 305); ctx.lineTo(505, 240); ctx.lineTo(605, 240); ctx.lineTo(680, 305); ctx.fill();
        for (const x of [300, 710]) { ctx.beginPath(); ctx.fillStyle = '#10213d'; ctx.arc(x, 400, 62, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.fillStyle = '#aab8ca'; ctx.arc(x, 400, 30, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#214acc'; ctx.font = 'bold 20px Arial'; ctx.fillText('IMAGEN DE DEMOSTRACIÓN', 55, 60);
        ctx.fillStyle = '#10213d'; ctx.font = 'bold 30px Arial'; ctx.fillText(names[i], 55, 540); ctx.font = '18px Arial'; ctx.fillText('Ilustración de prueba · No es evidencia de una inspección', 55, 580);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
        const photo = await readImage(new File([blob], `Demostración ${i + 1}.jpg`, { type: 'image/jpeg' }));
        photo.category = [1, 4, 6][i]; photo.caption = `${names[i]} · Imagen de demostración, sin valor de inspección.`; list.push(photo);
      }
      if (!$('plate').value) $('plate').value = 'DEMO01';
      notice('Se agregaron tres ilustraciones de demostración. Puedes generar el PDF o reemplazarlas por tus fotos.');
    } catch (e) { notice(e.message, true); } finally { busy(false); summary(); }
  }
  $('upload-category').innerHTML = categoryOptions(1);
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  for (const id of ['plate', 'brand', 'line', 'year', 'service', 'density', 'word-text']) $(id).addEventListener('input', () => { invalidate(); summary(); });
  $('photos-input').addEventListener('change', async e => { const files = Array.from(e.target.files); e.target.value = ''; if (files.length) await addPhotos(files); });
  $('pdfs-input').addEventListener('change', async e => { const files = Array.from(e.target.files); e.target.value = ''; if (files.length) await addPDFs(files); });
  $('word-input').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (file) await readWord(file); });
  $('photo-list').addEventListener('input', e => { if (e.target.dataset.caption !== undefined) { photos()[+e.target.dataset.caption].caption = e.target.value; invalidate(); } });
  $('photo-list').addEventListener('change', e => { if (e.target.dataset.category !== undefined) { photos()[+e.target.dataset.category].category = +e.target.value; invalidate(); summary(); } });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]'); if (!button || state.busy) return;
    const list = button.dataset.kind === 'photo' ? photos() : state.pdfs, i = +button.dataset.index;
    if (button.dataset.action === 'remove') { const removed = list.splice(i, 1)[0]; if (removed.url) URL.revokeObjectURL(removed.url); }
    else { const next = i + (button.dataset.action === 'up' ? -1 : 1); if (next < 0 || next >= list.length) return; [list[i], list[next]] = [list[next], list[i]]; }
    invalidate(); renderPhotos(); renderPDFs(); summary();
  });
  $('generate').addEventListener('click', generate); $('demo').addEventListener('click', demo);
  $('show-preview').addEventListener('click', showPreview);
  $('close-preview').addEventListener('click', closePreview);
  $('preview-prev').addEventListener('click', () => { if (preview.doc && preview.page > 1) { preview.page--; renderPreviewPage(); } });
  $('preview-next').addEventListener('click', () => { if (preview.doc && preview.page < preview.doc.numPages) { preview.page++; renderPreviewPage(); } });
  window.addEventListener('beforeunload', e => {
    if (state.simple.length || state.classified.length || state.pdfs.length || $('word-text').value.trim()) { e.preventDefault(); e.returnValue = ''; }
  });
  switchMode('simple');
})();
