/* PDF generation shared by the browser UI and validation scripts. */
(function (root) {
  'use strict';
  const CATEGORIES = ['01. DOCUMENTACIÓN', '02. VISTA GENERAL', '03. HABITÁCULO', '04. INSTRUMENTACIÓN', '05. IDENTIFICACIÓN', '06. MECÁNICA / PARTE INFERIOR', '07. HALLAZGOS', '08. OTROS'];
  const W = 595.28, H = 841.89, M = 36;
  function safeText(text, font) {
    return Array.from(String(text ?? '').replace(/\r/g, '').replace(/\t/g, '    ')).map(c => {
      if (c === '\n') return c;
      try { font.encodeText(c); return c; } catch { return '?'; }
    }).join('');
  }
  function wrap(text, width, font, size) {
    const lines = [];
    for (const paragraph of safeText(text, font).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (line && font.widthOfTextAtSize(line + ' ' + word, size) > width) { lines.push(line); line = ''; }
        if (font.widthOfTextAtSize(word, size) > width) {
          for (const char of word) {
            if (font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ''; }
            line += char;
          }
        } else line += (line ? ' ' : '') + word;
      }
      lines.push(line);
    }
    return lines;
  }
  async function base(lib, title) {
    const { PDFDocument, StandardFonts, rgb } = lib || root.PDFLib;
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const colors = { ink: rgb(.063, .13, .24), blue: rgb(.13, .29, .80), muted: rgb(.39, .45, .53), line: rgb(.85, .89, .94), pale: rgb(.97, .98, .99) };
    pdf.setTitle(title); pdf.setAuthor('AutoDiagnóstico');
    return { pdf, regular, bold, colors };
  }
  function text(page, value, x, top, size, font, color) {
    page.drawText(safeText(value, font), { x, y: H - top - size, size, font, color });
  }
  function finish(ctx) {
    const pages = ctx.pdf.getPages();
    pages.forEach((page, i) => {
      page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, color: ctx.colors.line, thickness: .7 });
      text(page, 'AutoDiagnóstico · Peritaje automotriz profesional', M, H - 29, 8, ctx.regular, ctx.colors.muted);
      text(page, `${i + 1} / ${pages.length}`, W - 70, H - 29, 8, ctx.regular, ctx.colors.muted);
    });
  }
  async function photoPDF({ vehicle, photos, classified = false, density = 4, logo, onProgress }, lib) {
    if (!vehicle.plate?.trim()) throw Error('Escribe la placa del vehículo.');
    if (!photos.length) throw Error('Agrega al menos una fotografía.');
    if (![2, 4, 6].includes(Number(density))) throw Error('Selecciona 2, 4 o 6 fotos por página.');
    const ctx = await base(lib, 'Anexo fotográfico ' + vehicle.plate.toUpperCase());
    const { pdf, regular, bold, colors } = ctx;
    const logoImage = logo ? await pdf.embedPng(logo) : null;
    const groups = classified ? CATEGORIES.map((name, category) => ({ name, photos: photos.filter(p => p.category === category) })).filter(g => g.photos.length) : [{ name: 'REGISTRO FOTOGRÁFICO', photos }];
    if (groups.reduce((n, g) => n + g.photos.length, 0) !== photos.length) throw Error('Revisa la categoría de las fotografías.');
    let number = 0;
    for (const group of groups) {
      for (let start = 0; start < group.photos.length; start += Number(density)) {
        const page = pdf.addPage([W, H]);
        if (logoImage) page.drawImage(logoImage, { x: M, y: H - 74, width: 110, height: 44 });
        else text(page, 'AutoDiagnóstico', M, 39, 17, bold, colors.blue);
        text(page, classified ? 'ANEXO CLASIFICADO' : 'ANEXO FOTOGRÁFICO', 302, 38, 12, bold, colors.ink);
        text(page, `${vehicle.plate.toUpperCase()} · Servicio: ${vehicle.service || 'No consignado'}`, M, 85, 10, bold, colors.ink);
        const vehicleLines = wrap([vehicle.brand, vehicle.line, vehicle.year].filter(Boolean).join(' ') || 'Datos complementarios no consignados', W - M * 2, regular, 9);
        vehicleLines.forEach((line, i) => text(page, line, M, 104 + i * 12, 9, regular, colors.muted));
        text(page, group.name, M, 139, 10, bold, colors.blue);
        const gap = 14, columns = 2, rows = Number(density) / columns;
        const cellW = (W - M * 2 - gap) / columns;
        const cellH = (H - 216 - gap * (rows - 1)) / rows;
        const batch = group.photos.slice(start, start + Number(density));
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i]; number++;
          const x = M + (i % columns) * (cellW + gap), top = 165 + Math.floor(i / columns) * (cellH + gap);
          page.drawRectangle({ x, y: H - top - cellH, width: cellW, height: cellH, color: colors.pale, borderColor: colors.line, borderWidth: .6 });
          const image = await pdf.embedJpg(item.data);
          const caption = wrap(item.caption || 'Sin descripción', cellW - 20, regular, 9);
          const captionH = 26 + caption.length * 12;
          const imageH = cellH - captionH - 20;
          if (imageH < 30) throw Error('Reduce la descripción o selecciona menos fotos por página.');
          const scale = Math.min((cellW - 20) / image.width, imageH / image.height);
          const w = image.width * scale, h = image.height * scale;
          page.drawImage(image, { x: x + (cellW - w) / 2, y: H - top - 10 - (imageH + h) / 2, width: w, height: h });
          const labelTop = top + imageH + 18;
          text(page, `FOTO ${String(number).padStart(2, '0')}`, x + 10, labelTop, 8, bold, colors.blue);
          caption.forEach((line, j) => text(page, line, x + 10, labelTop + 15 + j * 12, 9, regular, colors.ink));
          onProgress?.(number, photos.length);
        }
      }
    }
    finish(ctx);
    return { bytes: await pdf.save(), pages: pdf.getPageCount() };
  }
  async function mergePDFs(files, lib) {
    if (files.length < 2) throw Error('Agrega al menos dos PDFs para unirlos.');
    const { PDFDocument } = lib || root.PDFLib;
    const output = await PDFDocument.create();
    for (const file of files) {
      const source = await PDFDocument.load(file.data);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach(page => output.addPage(page));
    }
    output.setTitle('Expediente · AutoDiagnóstico');
    return { bytes: await output.save(), pages: output.getPageCount() };
  }
  async function textPDF(content, title, lib) {
    if (!content.trim()) throw Error('Carga un documento o escribe el texto que deseas convertir.');
    const ctx = await base(lib, title || 'Documento de texto');
    let page, top;
    function next() {
      page = ctx.pdf.addPage([W, H]);
      text(page, 'AUTODIAGNÓSTICO · DOCUMENTO DE TEXTO', M, 35, 10, ctx.bold, ctx.colors.blue);
      top = 70;
    }
    next();
    for (const line of wrap(content, W - M * 2, ctx.regular, 11)) {
      if (top + 16 > H - 60) next();
      text(page, line, M, top, 11, ctx.regular, ctx.colors.ink); top += 16;
    }
    finish(ctx);
    return { bytes: await ctx.pdf.save(), pages: ctx.pdf.getPageCount() };
  }
  root.AnexoPDF = { CATEGORIES, photoPDF, mergePDFs, textPDF };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AnexoPDF;
})(typeof window !== 'undefined' ? window : globalThis);
