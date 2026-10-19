/* Browse tags are many-to-many. Stage tags describe known usage, not an
   exclusivity or complete-coverage claim. No ROM bytes are shipped here. */
(function(root){
'use strict';
const types={player:'Player',enemies:'Enemies',fx:'FX',enviro:'Environment',menus:'Menus & UI',misc:'Misc'};
const stages={'0':'Yusuke opening','1':'J-B opening','2':'Irori opening','3':'Stage 4','4':'Stage 5','5':'Final battle',shared:'Shared / interludes',unknown:'Unassigned'};
// Original stage-wave table addresses, including all three opening-map orders.
const schedules={462848:0,606208:0,611840:0,467712:1,617472:1,622336:1,627200:2,633344:2,640000:2,646656:3,478208:4,485120:5};
const sceneTypes=new Set([141,143,150,151,155,156,157]);
const fxTypes=new Set([2,23,24,45,105,107,117,120,121,122,123,124,162,175,176,185,187,189,190,191]);
const envTypes=new Set([29,102,106,140,168,169,170,171,172,173,182]);
const miscTypes=new Set([1,28,54,67,69,138,181,184,186,188]);
function build(data,grouped){
 const objectStages=new Map(),byId=new Map(),memberships=new Map();
 const sources=grouped.sourceData||grouped;
 const objects=sources.objects||[];
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
 for(const [category,items] of Object.entries(sources))if(Array.isArray(items))for(const item of items){byId.set(item.id,item);add(memberships,item.id,category);}
 for(const [category,items] of Object.entries(data))if(category!=='all'&&Array.isArray(items))for(const item of items)add(memberships,item.id,category);
 for(const object of objects)for(const spawn of object.scheduled_spawns||[]){const stage=schedules[spawn.schedule_address];if(stage!==undefined)add(objectStages,object.type_id,String(stage));}
 // Scene introductions are direct first-map entries in the original controller.
 for(const [type,stage] of [[141,0],[143,1],[150,2]])add(objectStages,type,String(stage));
 for(let pass=0;pass<8;pass++){
  let changed=false;
  for(const object of objects)for(const child of object.standalone_spawns||[])for(const stage of objectStages.get(object.type_id)||[]){const n=objectStages.get(child.type_id)?.size||0;add(objectStages,child.type_id,stage);changed ||= objectStages.get(child.type_id).size!==n;}
  if(!changed)break;
 }
 const tags=new WeakMap();
 for(const item of data.all){
  const category=memberships.get(item.id)||new Set(),kind=new Set(),where=new Set();
  const name=(item.id+' '+(item.title||'')+' '+(item.graphics_role||'')).toLowerCase();
  const ids=new Set(item.object_types||[]);if(Number.isInteger(item.type_id))ids.add(item.type_id);
  const match=item.id.match(/^object_(\d+)/);if(match)ids.add(Number(match[1]));
  if(category.has('players')||category.has('playerEffects')||category.has('shots')||/(?:^|_)player_|yusuke|irori|j-b|player select|player-select/.test(name))kind.add('player');
  if(category.has('particles')||category.has('effects')||category.has('playerEffects')||category.has('shots')||['particles','playerEffects'].includes(item.gallery_category)||/particle|projectile|explosion|flame|trail|wake|debris|fragment|special.beam|multipart_death/.test(name))kind.add('fx');
  if(category.has('backgrounds')||/tile_|tile |background|backdrop|storefront|bridge|floor|pavement|environment/.test(name))kind.add('enviro');
  if(/^(text_|font_)/.test(item.id)||/title|menu|hud|ranking|name.entry|continue|game.over|credits|logo|poster|portrait|player.select|how.to.play|tutorial|demonstration|ending|screen.transition|health.gauge/.test(name))kind.add('menus');
  if(category.has('enemies')||/enemy|boss|tank|turret|robot|carrier|aircraft|vehicle/.test(name))kind.add('enemies');
  for(const id of ids){
   if(sceneTypes.has(id)){kind.add('menus');kind.add('player');}
   else if(fxTypes.has(id))kind.add('fx');
   else if(envTypes.has(id)){kind.add('enviro');if(id===29)kind.add('enemies');}
   else if(miscTypes.has(id))kind.add('misc');
   else if(id>2&&id<192)kind.add('enemies');
   for(const stage of objectStages.get(id)||[])where.add(stage);
  }
  for(const use of item.uses||[])if(Number.isInteger(use.stage)&&use.stage>=0&&use.stage<6)where.add(String(use.stage));
  if(Number.isInteger(item.stage)&&item.stage>=0&&item.stage<6)where.add(String(item.stage));
  const stageName=item.id.match(/(?:^|_)stage_(\d+)(?:_|$)/);if(stageName&&Number(stageName[1])<6)where.add(stageName[1]);
  if(!kind.size)kind.add('misc');
  if(!where.size){
   const shared=kind.has('player')||kind.has('menus')||/^(effect_|screen_(?:enemy_projectile|surface_effect|transient|attached|pickup|multiplier))/.test(item.id);
   where.add(shared?'shared':'unknown');
  }
  tags.set(item,{types:kind,stages:where});
 }
 return tags;
}
const api={types,stages,schedules,build};root.CatalogTags=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
