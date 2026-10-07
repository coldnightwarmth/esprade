/* Native GIF animations and dependency-free, stored ZIP downloads. */
(function(root){
'use strict';
const safeName=s=>String(s||'asset').replace(/[^a-z0-9._-]+/gi,'_').replace(/^\.+/,'').slice(0,160)||'asset';
function statesFor(item,lookup=()=>null,seen=new Set()){
 if(!item||seen.has(item))return [];seen.add(item);
 let states=[];
 if(item.animations?.length){
  for(const a of item.animations){
   const fs=(a.frames||[]).filter(f=>f.file);if(!fs.length)continue;
   if(a.kind==='variants')fs.forEach((f,i)=>states.push({label:`${a.id} · ${f.label||'variant '+(i+1)}`,frames:[f]}));
   else states.push({label:a.id||item.id,frames:fs});
  }
 }else if(item.kind==='object'&&item.references?.length){
  for(const ref of item.references){
   const related=lookup(ref.category,ref.id,ref.category==='templates'?ref.file:null);
   for(const state of statesFor(related,lookup,seen))states.push({...state,label:`${ref.id} / ${state.label}`});
  }
 }else if(item.full_map){states.push({label:'Full map',frames:[{file:item.full_map}]});}
 else if(item.frames?.length){
  if(['variants','map_pages','font_atlas'].includes(item.kind))item.frames.filter(f=>f.file).forEach((f,i)=>states.push({label:f.label||'Variant '+(i+1),frames:[f]}));
  else states.push({label:item.id,frames:item.frames.filter(f=>f.file)});
 }
 if(!states.length&&item.file)states.push({label:item.title||item.id,frames:[{file:item.file}]});
 return states.map((s,i)=>({...s,name:safeName(s.label)+'_'+String(i+1).padStart(3,'0')}));
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size),v=new DataView(bytes.buffer);return {bytes,u16:(o,n)=>v.setUint16(o,n,true),u32:(o,n)=>v.setUint32(o,n,true)};}
async function zip(files){
 const body=[],directory=[];let offset=0,dirSize=0;
 if(files.length>65535)throw new Error('Too many files for one ZIP. Select fewer states.');
 for(const f of files){
  const name=new TextEncoder().encode(f.name),bytes=new Uint8Array(await f.blob.arrayBuffer()),crc=crc32(bytes);
  const h=header(30);h.u32(0,0x04034b50);h.u16(4,20);h.u16(6,0x800);h.u16(12,0x21);h.u32(14,crc);h.u32(18,bytes.length);h.u32(22,bytes.length);h.u16(26,name.length);
  body.push(h.bytes,name,bytes);
  const c=header(46);c.u32(0,0x02014b50);c.u16(4,20);c.u16(6,20);c.u16(8,0x800);c.u16(14,0x21);c.u32(16,crc);c.u32(20,bytes.length);c.u32(24,bytes.length);c.u16(28,name.length);c.u32(42,offset);
  directory.push(c.bytes,name);offset+=30+name.length+bytes.length;dirSize+=46+name.length;
  if(offset+dirSize>0xffffffff)throw new Error('This ZIP is too large. Select fewer states.');
 }
 const end=header(22);end.u32(0,0x06054b50);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,dirSize);end.u32(16,offset);
 return new Blob([...body,...directory,end.bytes],{type:'application/zip'});
}
function frameBounds(frames,sizes){
 const left=Math.floor(Math.min(...frames.map(f=>-(f.origin_upright_px?.[0]||0))));
 const top=Math.floor(Math.min(...frames.map(f=>-(f.origin_upright_px?.[1]||0))));
 const right=Math.ceil(Math.max(...frames.map((f,i)=>sizes[i].width-(f.origin_upright_px?.[0]||0))));
 const bottom=Math.ceil(Math.max(...frames.map((f,i)=>sizes[i].height-(f.origin_upright_px?.[1]||0))));
 return {left,top,width:right-left,height:bottom-top};
}
function exactPalette(rgba){
 let transparent=false;for(let i=3;i<rgba.length;i+=4)if(rgba[i]<128){transparent=true;break;}
 const palette=transparent?[[0,0,0]]:[],colors=new Map(),index=new Uint8Array(rgba.length/4);
 for(let i=0;i<index.length;i++){
  const j=i*4;if(rgba[j+3]<128){index[i]=0;continue;}
  const key=(rgba[j]<<16)|(rgba[j+1]<<8)|rgba[j+2];let n=colors.get(key);
  if(n===undefined){if(palette.length===256)return null;n=palette.length;colors.set(key,n);palette.push([rgba[j],rgba[j+1],rgba[j+2]]);}
  index[i]=n;
 }
 if(palette.length<2)palette.push([0,0,0]);
 return {palette,index,transparent};
}
async function fetchImage(path,signal){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(path,{signal});if(!r.ok)throw new Error(`Could not load ${path} (${r.status})`);return await r.blob();}
  catch(e){if(signal.aborted)throw e;last=e;if(attempt<2)await new Promise(r=>setTimeout(r,200*(attempt+1)));}
 }
 throw last;
}
async function stateFiles(state,signal,progress){
 if(state.frames.length===1)return [{name:state.name+'.png',blob:await fetchImage(state.frames[0].file,signal)}];
 const blob=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('catalog-gif-worker.js',document.baseURI),{type:'module'});
  const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return;}
  worker.onmessage=e=>{if(e.data.progress){progress(...e.data.progress);return;}cleanup();if(e.data.error)reject(new Error(e.data.error));else resolve(new Blob([e.data.bytes],{type:'image/gif'}));};
  worker.onerror=e=>{cleanup();reject(new Error(e.message||'GIF encoder failed'));};
  worker.postMessage({frames:state.frames.map(f=>({file:new URL(f.file,document.baseURI).href,origin_upright_px:f.origin_upright_px,duration_ticks:f.duration_ticks}))});
 });
 return [{name:state.name+'.gif',blob}];
}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function enableDrag(list,onChange){
 let drag=null;
 function apply(input){if(!input||input.disabled||drag.seen.has(input))return;drag.seen.add(input);input.checked=drag.checked;onChange();}
 list.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const input=e.target.closest('input[type=checkbox]');if(!input||input.disabled)return;
  e.preventDefault();input.focus();drag={id:e.pointerId,checked:!input.checked,seen:new Set()};apply(input);list.setPointerCapture(e.pointerId);
 });
 list.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('.download-state');if(row&&list.contains(row))apply(row.querySelector('input'));});
 const stop=e=>{if(drag?.id===e.pointerId)drag=null;};
 list.addEventListener('pointerup',stop);list.addEventListener('pointercancel',stop);list.addEventListener('lostpointercapture',()=>{drag=null;});
 // Pointer gestures are handled above. Keyboard activation keeps native checkbox semantics.
 list.addEventListener('click',e=>{if(e.target.matches('input[type=checkbox]')&&e.detail>0)e.preventDefault();});
 list.addEventListener('change',onChange);
}
let dialog;
function show(item,lookup){
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='download-dialog';dialog.setAttribute('aria-labelledby','download-title');
  dialog.innerHTML='<div class="controls"><h2 id="download-title"></h2><button type="button" data-close aria-label="Close downloads">Close</button></div><p class="small">Animations download as native-resolution GIFs; single frames as PNGs. Multiple selections download together as a ZIP.</p><div class="controls"><button type="button" data-all>All</button><button type="button" data-none>None</button><span class="small">Drag across checkboxes to select or clear.</span></div><div class="download-states"></div><div class="download-footer"><span class="small" role="status" aria-live="polite"></span><button type="button" data-submit>Download</button></div>';
  document.body.append(dialog);
 }
 const states=statesFor(item,lookup),list=dialog.querySelector('.download-states'),status=dialog.querySelector('[role=status]'),submit=dialog.querySelector('[data-submit]');
 const abort=new AbortController();let busy=false;
 dialog.querySelector('h2').textContent=item.title||item.id;list.replaceChildren();
 states.forEach((state,i)=>{const row=document.createElement('label');row.className='download-state';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.value=String(i);const text=document.createElement('span');text.textContent=state.label;row.append(input,text);list.append(row);});
 // Replace the list to avoid retaining gesture listeners from a previous object.
 const fresh=list.cloneNode(true);list.replaceWith(fresh);
 const selected=()=>[...fresh.querySelectorAll('input:checked')].map(c=>states[Number(c.value)]);
 const update=()=>{if(busy)return;const n=selected().length;status.textContent=`${n} of ${states.length} selected`;submit.disabled=n===0;submit.textContent=n>1?'Download ZIP':'Download';};
 enableDrag(fresh,update);
 dialog.querySelector('[data-all]').onclick=()=>{if(busy)return;fresh.querySelectorAll('input').forEach(c=>c.checked=true);update();};
 dialog.querySelector('[data-none]').onclick=()=>{if(busy)return;fresh.querySelectorAll('input').forEach(c=>c.checked=false);update();};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.onclose=()=>abort.abort();dialog.oncancel=()=>abort.abort();
 submit.onclick=async()=>{
  if(busy)return;const chosen=selected();if(!chosen.length)return;busy=true;submit.disabled=true;fresh.querySelectorAll('input').forEach(c=>c.disabled=true);
  try{
   const files=[];
   for(let i=0;i<chosen.length;i++){
    status.textContent=`Preparing ${i+1} of ${chosen.length}…`;
    files.push(...await stateFiles(chosen[i],abort.signal,(n,total)=>{status.textContent=`State ${i+1} of ${chosen.length} · ${n}/${total} images`; }));
   }
   abort.signal.throwIfAborted();status.textContent='Preparing download…';
   const packed=files.length>1?await zip(files):files[0].blob;abort.signal.throwIfAborted();
   save(packed,safeName(item.id)+(files.length>1?'.zip':'--'+files[0].name));
   status.textContent='Download ready.';
  }catch(e){if(!abort.signal.aborted)status.textContent='Download failed: '+e.message;}
  finally{busy=false;submit.disabled=false;fresh.querySelectorAll('input').forEach(c=>c.disabled=false);}
 };
 update();dialog.showModal();
 // A single state needs no selection step, but retain progress and an actionable retry.
 if(states.length===1)submit.click();
}
function button(item,options={}){const b=document.createElement('button');b.className='download-button';b.type='button';b.title='Download';b.setAttribute('aria-label','Download '+(item.title||item.id));b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';b.onclick=()=>show(item,options.lookup);return b;}
const api={statesFor,crc32,zip,frameBounds,exactPalette,enableDrag,button};
if(typeof module==='object'&&module.exports)module.exports=api;else root.CatalogDownloads=api;
})(typeof globalThis==='object'?globalThis:this);
