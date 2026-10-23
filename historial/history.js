'use strict';
const H=window.ReportHistory,$=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dates=new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'});
let offset=0,busy=false,currentFilters={},requestNumber=0;
function message(text='',error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
function params(){return {q:$('query').value.trim(),from:$('from').value,to:$('to').value};}
function openURL(id,version){return '/?'+new URLSearchParams({report:id,...(version?{version,copy:'1'}:{})});}
async function load(){
 const number=++requestNumber;message('Consultando informes…');
 try{const result=await H.request('reports',{params:{...currentFilters,offset}});if(number!==requestNumber)return;
 $('list').innerHTML=result.reports.length?result.reports.map(r=>`<article class="report-card"><div><span class="report-plate">${escape(r.plate)}</span><h2>${escape([r.brand,r.line,r.year].filter(Boolean).join(' ')||'Vehículo sin completar')}</h2><p>Servicio: <strong>${escape(r.service||'Sin consecutivo')}</strong> · ${escape(r.result)}</p><p>Perito: ${escape(r.perito||'Por diligenciar')} · Kilometraje: ${escape(r.mileage||'No consignado')}</p><p>Último registro: ${escape(dates.format(new Date(r.updated_at)))} · ${r.event_count} acciones</p></div><div class="report-actions"><a class="primary" href="${openURL(r.id)}">Abrir informe</a><button data-events="${r.id}" data-plate="${escape(r.plate)}">Ver actividad y versiones</button></div></article>`).join(''):'<p class="empty">No hay informes para estos filtros.</p>';
 $('previous').disabled=offset===0;$('next').disabled=!result.hasMore;$('page').textContent='Página '+(offset/50+1);$('count').textContent=result.reports.length+(result.reports.length===1?' informe':' informes')+' en esta página · fechas de guardado en Colombia';message();
 }catch(error){message(error.message,true);if(error.status===401){$('workspace').hidden=true;$('access').hidden=false;$('logout').hidden=true;}}
}
async function enter(){try{await H.authenticate();$('access').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;await load();await loadStorage();}catch(error){message(error.message,true);}}
$('login').onclick=enter;
$('logout').onclick=async()=>{try{await H.request('logout',{method:'POST',body:{}});$('workspace').hidden=true;$('access').hidden=false;$('logout').hidden=true;$('list').textContent='';$('events-list').textContent='';message('Sesión cerrada.');}catch(error){message(error.message,true);}};
$('filters').onsubmit=event=>{event.preventDefault();offset=0;currentFilters=params();load();};
$('previous').onclick=()=>{offset=Math.max(0,offset-50);load();};$('next').onclick=()=>{offset+=50;load();};
$('close-events').onclick=()=>{$('events').hidden=true;};
$('list').onclick=async event=>{const button=event.target.closest('[data-events]');if(!button)return;button.disabled=true;try{const result=await H.request('events',{params:{id:button.dataset.events}});$('events-title').textContent='Actividad · '+button.dataset.plate;$('events-list').innerHTML=result.events.map(e=>`<div class="event"><div><strong>${{save:'Guardado',download:'Descarga de PDF',preview:'Vista previa de PDF'}[e.action]}</strong><p>${escape(dates.format(new Date(e.created_at)))}</p></div><a href="${openURL(button.dataset.events,e.version_id)}">Abrir esta versión como copia</a></div>`).join('');$('events').hidden=false;$('events').scrollIntoView({behavior:'smooth'});}catch(error){message(error.message,true);}finally{button.disabled=false;}};
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
$('csv').onclick=async()=>{if(busy)return;busy=true;$('csv').disabled=true;try{const rows=[];let next=0,more=true;const selected={...currentFilters};while(more){const batch=await H.request('reports',{params:{...selected,offset:next}});rows.push(...batch.reports);more=batch.hasMore;next+=50;if(next>100000)throw Error('Hay demasiados resultados. Reduce el rango de fechas.');message(`Preparando CSV: ${rows.length} informes…`);}const table=[['ID','Fecha de creación (Colombia)','Último registro (Colombia)','Placa','Servicio','Marca','Línea','Modelo','Kilometraje','Resultado','Perito','Acciones'],...rows.map(r=>[r.id,dates.format(new Date(r.created_at)),dates.format(new Date(r.updated_at)),r.plate,r.service,r.brand,r.line,r.year,r.mileage,r.result,r.perito,r.event_count])];const blob=new Blob(['\ufeff'+table.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Historial_AutoDiagnostico.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);message('CSV exportado.');}catch(error){message(error.message,true);}finally{busy=false;$('csv').disabled=false;}};
H.session().then(state=>{if(state.authenticated)enter();else if(!state.configured)message('El historial todavía no está configurado en el servidor.',true);}).catch(error=>message(error.message,true));

function fileSize(bytes){if(bytes<1024)return bytes+' B';if(bytes<1048576)return (bytes/1024).toLocaleString('es-CO',{maximumFractionDigits:1})+' KB';return (bytes/1048576).toLocaleString('es-CO',{maximumFractionDigits:2})+' MB';}
function showStorage(state){
 $('storage-summary').textContent=state.mode==='r2'?(state.r2Count?'Las fotos optimizadas, logos y firmas se guardan en R2.':'Aún no hay imágenes guardadas. Se almacenarán en R2 al guardar tu primer informe.'):'El almacenamiento en R2 no está configurado. Revisa las variables en Vercel.';
 $('storage-metrics').innerHTML=`<div><strong>${state.r2Count}</strong><span>Archivos guardados</span></div><div><strong>${fileSize(state.r2Bytes)}</strong><span>Espacio utilizado en R2</span></div>`;
}
async function loadStorage(){
 $('refresh-storage').disabled=true;
 try{showStorage(await H.request('storage'));}catch(error){$('storage-summary').textContent=error.message;}finally{$('refresh-storage').disabled=false;}
}
$('refresh-storage').onclick=loadStorage;
