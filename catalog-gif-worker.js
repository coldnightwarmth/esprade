import {GIFEncoder,quantize,applyPalette} from './vendor/gifenc.esm.js';
import './catalog-downloads.js';
self.onmessage=async({data:{frames}})=>{
 const images=new Map();
 try{
  const files=[...new Set(frames.map(f=>f.file))];let cursor=0,done=0;
  await Promise.all(Array.from({length:Math.min(4,files.length)},async()=>{
   while(cursor<files.length){const file=files[cursor++];let blob;
    for(let n=0;n<3;n++){try{const r=await fetch(file);if(!r.ok)throw new Error(`Image request failed (${r.status})`);blob=await r.blob();break;}catch(e){if(n===2)throw e;await new Promise(r=>setTimeout(r,200*(n+1)));}}
    images.set(file,await createImageBitmap(blob));self.postMessage({progress:[++done,files.length+frames.length]});
   }
  }));
  const sizes=frames.map(f=>images.get(f.file)),p=CatalogDownloads.frameBounds(frames,sizes);
  const canvas=new OffscreenCanvas(p.width,p.height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
  const gif=GIFEncoder();let elapsed=0,encoded=0;
  for(let i=0;i<frames.length;i++){
   const f=frames[i];ctx.clearRect(0,0,p.width,p.height);
   ctx.drawImage(sizes[i],Math.round(-p.left-(f.origin_upright_px?.[0]||0)),Math.round(-p.top-(f.origin_upright_px?.[1]||0)));
   const rgba=ctx.getImageData(0,0,p.width,p.height).data;
   let pal=CatalogDownloads.exactPalette(rgba);
   if(!pal){
    const palette=quantize(rgba,255),index=applyPalette(rgba,palette);
    for(let j=0;j<index.length;j++)index[j]=rgba[j*4+3]<128?0:index[j]+1;
    pal={palette:[[0,0,0],...palette],index,transparent:true};
   }
   elapsed+=Math.max(1,Number(f.duration_ticks)||8)*17.376;
   // GIF stores centiseconds; sub-20ms frames are slowed by browser decoders.
   const delay=Math.max(20,Math.round((elapsed-encoded)/10)*10);encoded+=delay;
   gif.writeFrame(pal.index,p.width,p.height,{palette:pal.palette,transparent:pal.transparent,transparentIndex:0,delay,repeat:0,dispose:2});
   self.postMessage({progress:[files.length+i+1,files.length+frames.length]});
  }
  gif.finish();const bytes=gif.bytes();self.postMessage({bytes},[bytes.buffer]);
 }catch(e){self.postMessage({error:e.message});}
 finally{for(const im of images.values())im.close();}
};
