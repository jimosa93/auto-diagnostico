'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = { mode: 'merge', pdfs: [], wordName: '', busy: false, resultURL: null };
  const preview = { token: 0, doc: null, task: null, load: null, page: 1 };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titles = {
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
    if (!value) { renderPDFs(); }
  }
  function summary() {
    $('summary-title').textContent = titles[state.mode][3];
    $('summary-count').textContent = state.mode === 'merge' ? `${state.pdfs.length} archivos · ${state.pdfs.reduce((n,p)=>n+p.pages,0)} páginas` : `${$('word-text').value.length.toLocaleString('es-CO')} caracteres`;
    $('summary-detail').textContent = state.mode === 'merge' ? 'Se conserva el tamaño de cada página.' : 'Formato A4 · Texto con diseño sencillo';
  }
  function switchMode(mode) {
    if (state.busy || !titles[mode]) return;
    state.mode = mode; invalidate(); notice();
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    ['tool-kicker', 'tool-title', 'tool-description'].forEach((id, i) => $(id).textContent = titles[mode][i]);
    $('merge-tool').hidden = mode !== 'merge'; $('word-tool').hidden = mode !== 'word';
    renderPDFs(); summary();
  }
  function controls(i, length, kind) {
    return `<div class="row-actions"><button type="button" data-action="up" data-kind="${kind}" data-index="${i}" aria-label="Subir ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="down" data-kind="${kind}" data-index="${i}" aria-label="Bajar ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}" ${i === length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="remove" data-action="remove" data-kind="${kind}" data-index="${i}">Quitar ${kind === 'photo' ? 'foto' : 'PDF'} ${i + 1}</button></div>`;
  }
  function renderPDFs() {
    $('pdf-list').innerHTML = state.pdfs.length ? state.pdfs.map((p, i) => `<article class="pdf-row"><strong>${i + 1}. ${escape(p.name)}</strong><p>${p.pages} páginas · ${(p.size / 1024 / 1024).toFixed(1)} MB</p>${controls(i, state.pdfs.length, 'pdf')}</article>`).join('') : '<p class="empty">Todavía no has agregado PDFs.</p>';
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
    if(state.busy)return;
    busy(true,'Preparando el documento…'); invalidate(); notice();
    try {
      const merged=state.mode==='merge';
      const output=merged ? await AnexoPDF.mergePDFs(state.pdfs) : await AnexoPDF.textPDF($('word-text').value,state.wordName||'Documento de texto');
      const name=merged ? 'EXPEDIENTE_UNIDO.pdf' : (state.wordName.replace(/\.docx$/i,'').replace(/[^\p{L}\p{N}_-]/gu,'_')||'Documento')+'_TEXTO.pdf';
      state.resultURL=URL.createObjectURL(new Blob([output.bytes],{type:'application/pdf'}));
      $('download').href=$('open-pdf').href=state.resultURL; $('download').download=name;
      $('result-name').textContent=`${name} · ${output.pages} páginas`; $('result').hidden=false;
      notice('PDF generado. Puedes descargarlo o abrir su vista previa.');
      $('result').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(e){notice(e.message||'No se pudo generar el PDF.',true);}finally{busy(false);}
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  $('word-text').addEventListener('input',()=>{invalidate();summary();});
  $('pdfs-input').addEventListener('change', async e => { const files = Array.from(e.target.files); e.target.value = ''; if (files.length) await addPDFs(files); });
  $('word-input').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (file) await readWord(file); });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]'); if (!button || state.busy) return;
    const list = state.pdfs, i = +button.dataset.index;
    if (button.dataset.action === 'remove') { const removed = list.splice(i, 1)[0]; if (removed.url) URL.revokeObjectURL(removed.url); }
    else { const next = i + (button.dataset.action === 'up' ? -1 : 1); if (next < 0 || next >= list.length) return; [list[i], list[next]] = [list[next], list[i]]; }
    invalidate(); renderPDFs(); summary();
  });
  $('generate').addEventListener('click', generate);
  $('show-preview').addEventListener('click', showPreview);
  $('close-preview').addEventListener('click', closePreview);
  $('preview-prev').addEventListener('click', () => { if (preview.doc && preview.page > 1) { preview.page--; renderPreviewPage(); } });
  $('preview-next').addEventListener('click', () => { if (preview.doc && preview.page < preview.doc.numPages) { preview.page++; renderPreviewPage(); } });
  window.addEventListener('beforeunload', e => {
    if (state.pdfs.length || $('word-text').value.trim()) { e.preventDefault(); e.returnValue = ''; }
  });
  switchMode(new URLSearchParams(location.search).get('modo') === 'word' ? 'word' : 'merge');
})();
