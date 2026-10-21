/* A local PDF.js viewer, shared with no external conversion service. */
(() => {
  let dialog, doc, load, task, pageNumber=1, token=0;
  const $=id=>document.getElementById(id);
  function mount(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='document-viewer';
    dialog.innerHTML='<div class="modal-head"><h2>Vista previa del PDF</h2><button id="document-close">Cerrar ×</button></div><div class="document-controls"><button id="document-prev">← Anterior</button><span id="document-page" role="status"></span><button id="document-next">Siguiente →</button></div><div id="document-canvas-wrap"><canvas id="document-canvas" role="img" aria-label="Página del PDF"></canvas></div><p class="hint">También puedes descargar el PDF o abrirlo en otra pestaña desde el resultado.</p>';
    document.body.appendChild(dialog);
    $('document-close').onclick=close;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    $('document-prev').onclick=()=>{if(doc&&pageNumber>1){pageNumber--;render();}};
    $('document-next').onclick=()=>{if(doc&&pageNumber<doc.numPages){pageNumber++;render();}};
  }
  function close(){
    token++;task?.cancel();task=null;
    if(doc)doc.destroy().catch(()=>{});else if(load)load.destroy().catch(()=>{});
    doc=null;load=null;
    if(dialog){dialog.close();$('document-canvas').width=$('document-canvas').height=1;}
  }
  async function render(){
    const current=++token,old=task;old?.cancel();if(old)await old.promise.catch(()=>{});
    if(current!==token||!doc)return;
    $('document-prev').disabled=$('document-next').disabled=true;
    try{
      const page=await doc.getPage(pageNumber);if(current!==token)return;
      const width=Math.min(1050,Math.max(240,$('document-canvas-wrap').clientWidth-24));
      const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width*Math.min(devicePixelRatio||1,2)});
      const canvas=$('document-canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=width+'px';canvas.setAttribute('aria-label',`Página ${pageNumber} de ${doc.numPages}`);
      task=page.render({canvasContext:canvas.getContext('2d'),viewport});await task.promise;if(current!==token)return;
      $('document-page').textContent=`${pageNumber} / ${doc.numPages}`;
    }catch(e){if(current===token&&e.name!=='RenderingCancelledException')$('document-page').textContent='No se pudo mostrar la página. Usa la descarga del PDF.';}
    finally{if(current===token&&doc){$('document-prev').disabled=pageNumber===1;$('document-next').disabled=pageNumber===doc.numPages;}}
  }
  async function open(url){
    mount();close();const current=token;dialog.showModal();$('document-page').textContent='Cargando…';$('document-prev').disabled=$('document-next').disabled=true;
    try{
      const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');if(current!==token)return;
      const base=new URL('/generador/vendor/pdfjs/',location.origin);pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',base).href;
      load=pdfjs.getDocument({url,standardFontDataUrl:new URL('standard_fonts/',base).href,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,wasmUrl:new URL('wasm/',base).href,isEvalSupported:false});
      const result=await load.promise;if(current!==token){await result.destroy();return;}doc=result;pageNumber=1;await render();
    }catch{if(current===token)$('document-page').textContent='Vista previa no disponible. Usa la descarga del PDF.';}
  }
  window.PhotoViewer={open,close};
})();
