(()=>{
"use strict";
const host=document.getElementById("phaserBattlefield"),battleScreen=document.getElementById("battleScreen");
if(!host||!battleScreen)return;
const C={tw:104,th:68,eh:34,pad:120,minZoom:.62,maxZoom:1.55,grid:0x9aa6af};
let game=null,scene=null,queued=false,projection="ISO",rotation=0,drag=null,pinch=null,lastSize="",lastRenderMs=0,lastRevision=-1;
const V={tiles:new Map(),units:new Map(),objects:new Map(),terrainMarkers:new Map(),cores:new Map(),effects:new Map(),structuralKey:""};

const snap=()=>window.CardTacticsRuntime?.getBattleSnapshot?.()||null;
const key=(x,y)=>`${x},${y}`;
const visual=(group,id)=>window.VisualDatabase?.presentation?.(group,id)||null;
function rotated(x,y,m){const q=((rotation%4)+4)%4;if(q===0)return{x,y,w:m.width,h:m.height};if(q===1)return{x:m.height-1-y,y:x,w:m.height,h:m.width};if(q===2)return{x:m.width-1-x,y:m.height-1-y,w:m.width,h:m.height};return{x:y,y:m.width-1-x,w:m.height,h:m.width}}
function grid(x,y,m){const r=rotated(x,y,m);return{u:r.y,v:r.w-1-r.x}}
function point(x,y,e,m){const g=grid(x,y,m);if(projection==="TOP"){const z=76;return{x:g.u*z,y:g.v*z}}return{x:(g.u-g.v)*C.tw/2,y:(g.u+g.v)*C.th/2-Number(e||0)*C.eh}}
function corners(p){if(projection==="TOP"){const h=38;return[{x:p.x-h,y:p.y-h},{x:p.x+h,y:p.y-h},{x:p.x+h,y:p.y+h},{x:p.x-h,y:p.y+h}]}return[{x:p.x,y:p.y-C.th/2},{x:p.x+C.tw/2,y:p.y},{x:p.x,y:p.y+C.th/2},{x:p.x-C.tw/2,y:p.y}]}
function bounds(s){let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;s.map.tiles.forEach(t=>corners(point(t.x,t.y,t.elevation,s.map)).forEach(p=>{a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.y);d=Math.max(d,p.y)}));return{minX:a,maxX:b,minY:c-110,maxY:d,width:b-a,height:d-(c-110)}}
function norm(s){const b=bounds(s);return{b,ox:C.pad-b.minX,oy:C.pad-b.minY,w:b.width+C.pad*2,h:b.height+C.pad*2}}
function wp(s,t,n){const p=point(t.x,t.y,t.elevation,s.map);return{x:p.x+n.ox,y:p.y+n.oy}}
function depth(s,x,y,l=0){return 1000+point(x,y,0,s.map).y*10+l}
function tile(s,x,y){return s.map.tiles.find(t=>t.x===x&&t.y===y)||null}
function path(g,pts){g.beginPath();g.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(v=>g.lineTo(v.x,v.y));g.closePath()}
function terrainFill(t){return visual("terrain",t.terrain)?.fill??visual("terrain","PLAIN")?.fill??0x405b49}
function drawTileGraphic(g,t,p){
  g.clear();const q=corners({x:0,y:0});
  if(projection==="ISO"&&t.elevation>0){
    const drop=t.elevation*C.eh;
    const front=[q[3],q[2],{x:q[2].x,y:q[2].y+drop},{x:q[3].x,y:q[3].y+drop}];
    const right=[q[2],q[1],{x:q[1].x,y:q[1].y+drop},{x:q[2].x,y:q[2].y+drop}];
    g.fillStyle(0x3a352b,.95);path(g,front);g.fillPath();g.fillStyle(0x4b4435,.95);path(g,right);g.fillPath();
  }
  g.fillStyle(terrainFill(t),1);path(g,q);g.fillPath();g.lineStyle(2,C.grid,.78);path(g,q);g.strokePath();
  const line=(color,scale,width=4)=>{const r=q.map(v=>({x:v.x*scale,y:v.y*scale}));g.lineStyle(width,color,1);path(g,r);g.strokePath()};
  if(t.deploymentAreaOwner)line(t.deploymentAreaOwner==="PLAYER"?0x397bd1:t.deploymentAreaOwner==="ENEMY"?0xcf4c4c:0xd0ae54,.94,2);
  if(t.capturePoint)line(t.capturePoint.owner==="PLAYER"?0x4da6ff:t.capturePoint.owner==="ENEMY"?0xff5e5e:0xd0ae54,.70,4);
  if(t.reachable)line(0x4da6ff,.86);if(t.attackable)line(0xff5e5e,.86);if(t.deployable)line(0x70e38b,.80);if(t.inspected)line(0xffd166,.66);
  g.setPosition(p.x,p.y);
}
function drawRock(g,def={}){
  const h=Math.max(28,Number(def.height||46)),top=-h;
  g.clear();g.fillStyle(Number(def.fill??0x727a84),1);g.lineStyle(2,Number(def.stroke??0xaab1b8),.9);
  g.beginPath();g.moveTo(-23,-15);g.lineTo(0,-7);g.lineTo(22,-17);g.lineTo(18,top+11);g.lineTo(0,top);g.lineTo(-19,top+12);g.closePath();g.fillPath();g.strokePath();
}
function drawCrystal(g,owner,def={}){
  const main=Number(owner==="PLAYER"?(def.playerFill??0x4da6ff):(def.enemyFill??0xff5e6b));
  const light=Number(owner==="PLAYER"?(def.playerLight??0xbfe4ff):(def.enemyLight??0xffc2c8));
  g.clear();g.fillStyle(main,.98);g.lineStyle(3,0xf0dfb0,.95);
  g.beginPath();g.moveTo(0,-58);g.lineTo(24,-26);g.lineTo(15,17);g.lineTo(0,32);g.lineTo(-15,17);g.lineTo(-24,-26);g.closePath();g.fillPath();g.strokePath();
  g.fillStyle(light,.42);g.beginPath();g.moveTo(0,-51);g.lineTo(0,23);g.lineTo(-13,12);g.lineTo(-19,-23);g.closePath();g.fillPath();
  g.lineStyle(2,light,.65);g.beginPath();g.moveTo(0,-51);g.lineTo(0,23);g.moveTo(-19,-23);g.lineTo(19,-23);g.strokePath();
}
function makePrimitive(def,owner=null){
  if(!def)return null;
  if(def.primitive==="TEXT")return scene.add.text(0,0,def.text||"",{fontSize:`${Number(def.fontSize||24)}px`,color:def.color||"#ffffff",stroke:"#101418",strokeThickness:3}).setOrigin(.5,1);
  const g=scene.add.graphics();
  if(def.primitive==="ROCK")drawRock(g,def);
  else if(def.primitive==="CRYSTAL")drawCrystal(g,owner,def);
  else {g.destroy();return null}
  return g;
}
function refreshPrimitive(v,def,owner=null){
  if(!v||!def)return;
  if(def.primitive==="TEXT"&&v.setText)v.setText(def.text||"");
  else if(def.primitive==="ROCK"&&v.clear)drawRock(v,def);
  else if(def.primitive==="CRYSTAL"&&v.clear)drawCrystal(v,owner,def);
}
function reconcileTiles(s,n){
  const live=new Set();
  for(const t of s.map.tiles){const k=key(t.x,t.y);live.add(k);const p=wp(s,t,n),z=depth(s,t.x,t.y);let v=V.tiles.get(k);
    if(!v){v={g:scene.add.graphics(),height:null};V.tiles.set(k,v)}
    drawTileGraphic(v.g,t,p);v.g.setDepth(z);
    if(v.height){v.height.destroy();v.height=null}
    if(t.elevation)v.height=scene.add.text(p.x+31,p.y-13,`H${t.elevation}`,{fontSize:"10px",fontStyle:"bold",color:"#fff0ad",stroke:"#17140d",strokeThickness:3}).setOrigin(.5).setDepth(z+1);
  }
  for(const [k,v] of V.tiles)if(!live.has(k)){v.g.destroy();v.height?.destroy();V.tiles.delete(k)}
}
function reconcileTerrainMarkers(s,n){
  const live=new Set(),objectsAt=new Set((s.map.objects||[]).filter(o=>!o.destroyed&&o.type!=="CORE").map(o=>key(o.x,o.y)));
  for(const t of s.map.tiles){
    const def=visual("terrain",t.terrain)?.marker;if(!def)continue;
    if(def.primitive==="ROCK"&&objectsAt.has(key(t.x,t.y)))continue;
    const k=key(t.x,t.y);live.add(k);const p=wp(s,t,n),z=depth(s,t.x,t.y,1);let v=V.terrainMarkers.get(k);
    if(!v||v._primitive!==def.primitive){v?.destroy();v=makePrimitive(def);if(!v)continue;v._primitive=def.primitive;V.terrainMarkers.set(k,v)}
    refreshPrimitive(v,def);v.setPosition(p.x,p.y-Number(def.lift||0)).setDepth(z);
  }
  for(const [k,v] of V.terrainMarkers)if(!live.has(k)){v.destroy();V.terrainMarkers.delete(k)}
}
function reconcileObjects(s,n){
  const live=new Set();
  for(const o of s.map.objects||[]){if(o.destroyed||o.type==="CORE")continue;const def=visual("objects",o.visualType||o.type);if(!def)continue;
    const k=o.id||key(o.x,o.y);live.add(k);const t=tile(s,o.x,o.y);if(!t)continue;const p=wp(s,t,n),z=depth(s,o.x,o.y,2);let v=V.objects.get(k);
    if(!v||v._primitive!==def.primitive){v?.destroy();v=makePrimitive(def,o.owner);if(!v)continue;v._primitive=def.primitive;V.objects.set(k,v)}
    refreshPrimitive(v,def,o.owner);v.setPosition(p.x,p.y+Number(def.offsetY||0)).setDepth(z);
  }
  for(const [k,v] of V.objects)if(!live.has(k)){v.destroy();V.objects.delete(k)}
}
function reconcileEffects(s,n){
  const live=new Set();
  for(const t of s.map.tiles)for(const type of t.effects||[]){const def=visual("effects",type);if(!def)continue;const k=`${t.x},${t.y}:${type}`;live.add(k);const p=wp(s,t,n),z=depth(s,t.x,t.y,3);let v=V.effects.get(k);
    if(!v||v._primitive!==def.primitive){v?.destroy();v=makePrimitive(def);if(!v)continue;v._primitive=def.primitive;V.effects.set(k,v)}
    refreshPrimitive(v,def);v.setPosition(p.x,p.y-8).setDepth(z);
  }
  for(const [k,v] of V.effects)if(!live.has(k)){v.destroy();V.effects.delete(k)}
}
function reconcileCores(s,n){
  const live=new Set(),def=visual("objects","CORE")||{primitive:"CRYSTAL"};
  for(const c of s.cores||[]){const k=c.id||c.owner;live.add(k);const t=tile(s,c.x,c.y);if(!t)continue;const p=wp(s,t,n),z=depth(s,c.x,c.y,4);let v=V.cores.get(k);
    if(!v){const crystal=makePrimitive(def,c.owner),txt=scene.add.text(0,40,"",{fontSize:"10px",fontStyle:"bold",align:"center",color:"#fff2c2",stroke:"#071018",strokeThickness:3}).setOrigin(.5);v=scene.add.container(0,0,[crystal,txt]);v._crystal=crystal;v._txt=txt;V.cores.set(k,v)}
    refreshPrimitive(v._crystal,def,c.owner);v.setPosition(p.x,p.y-(projection==="TOP"?18:30)).setDepth(z);v._txt.setText(`${c.name||"CORE"}\n${c.hp}/${c.maxHp}`);
  }
  for(const [k,v] of V.cores)if(!live.has(k)){v.destroy(true);V.cores.delete(k)}
}
function reconcileUnits(s,n){
  const live=new Set();
  for(const u of s.units){live.add(u.id);const t=tile(s,u.x,u.y);if(!t)continue;const p=wp(s,t,n),z=depth(s,u.x,u.y,5);let v=V.units.get(u.id);
    if(!v){const shadow=scene.add.ellipse(0,38,55,16,0x000000,.38),body=scene.add.rectangle(0,0,58,72,u.team==="PLAYER"?0x2d67a7:0xa74444,.98),name=scene.add.text(0,-9,"",{fontFamily:"system-ui,sans-serif",fontSize:"11px",fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:52}}).setOrigin(.5),hp=scene.add.text(0,18,"",{fontSize:"10px",color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5);v=scene.add.container(0,0,[shadow,body,name,hp]);v._body=body;v._name=name;v._hp=hp;V.units.set(u.id,v)}
    v.setPosition(p.x,p.y-(projection==="TOP"?20:42)).setDepth(z).setAlpha(u.finished?.5:1);v._body.setFillStyle(u.team==="PLAYER"?0x2d67a7:0xa74444).setStrokeStyle(3,u.selected?0xffffff:0xd8e0e8);v._name.setText(u.name);v._hp.setText(`HP ${u.hp}`);
  }
  for(const [k,v] of V.units)if(!live.has(k)){v.destroy(true);V.units.delete(k)}
}
function controls(){
  let box=document.getElementById("battleViewControls");if(!box){box=document.createElement("div");box.id="battleViewControls";box.className="battle-view-controls";battleScreen.querySelector("main")?.appendChild(box)}
  if(!box.children.length){const l=document.createElement("button"),v=document.createElement("button"),r=document.createElement("button");l.textContent="↺";r.textContent="↻";v.id="projectionToggle";v.textContent="正視圖";l.onclick=()=>{rotation=(rotation+3)%4;resync(true)};r.onclick=()=>{rotation=(rotation+1)%4;resync(true)};v.onclick=()=>{projection=projection==="ISO"?"TOP":"ISO";v.textContent=projection==="ISO"?"正視圖":"45°視角";resync(true)};box.append(l,v,r)}
  const back=document.getElementById("battleBack");if(back&&back.parentElement!==box){back.textContent="← 主選單";box.prepend(back)}
}
function anchor(s,n){const bar=document.getElementById("skillBar"),a=window.CardTacticsRuntime?.getActionMenuAnchor?.();if(!bar||!scene||!a){bar?.style.removeProperty("--menu-x");bar?.style.removeProperty("--menu-y");return}const t=tile(s,a.x,a.y);if(!t)return;const p=wp(s,t,n),cam=scene.cameras.main;bar.style.setProperty("--menu-x",`${Math.round((p.x-cam.worldView.x)*cam.zoom)}px`);bar.style.setProperty("--menu-y",`${Math.round((p.y-(projection==="TOP"?20:42)-cam.worldView.y)*cam.zoom)}px`)}
function structuralKey(s){return `${s.map.id||""}|${s.map.width}x${s.map.height}|${projection}|${rotation}`}
function reconcile(reset=false){
  const started=performance.now();controls();const s=snap();if(!s||!scene)return;const n=norm(s),cam=scene.cameras.main;
  if(V.structuralKey!==structuralKey(s)){V.structuralKey=structuralKey(s);reset=true}
  cam.setBounds(0,0,n.w,n.h);reconcileTiles(s,n);reconcileTerrainMarkers(s,n);reconcileObjects(s,n);reconcileEffects(s,n);reconcileCores(s,n);reconcileUnits(s,n);
  if(reset||!cam.__ready){const z=Phaser.Math.Clamp((host.clientWidth-44)/Math.max(1,n.b.width),C.minZoom,1.18);cam.setZoom(z);cam.centerOn(n.w/2,n.h/2);cam.__ready=true}
  anchor(s,n);lastRevision=s.revision;lastRenderMs=+(performance.now()-started).toFixed(2);
  window.CardTacticsDiagnostics?.push?.("PRESENTATION_RECONCILE",{revision:s.revision,renderMs:lastRenderMs,expected:{tiles:s.map.tiles.length,objects:(s.map.objects||[]).filter(o=>!o.destroyed&&o.type!=="CORE").length,cores:(s.cores||[]).length,units:s.units.length},actual:{tiles:V.tiles.size,objects:V.objects.size,cores:V.cores.size,units:V.units.size}});
}
function resync(reset=false){V.structuralKey="";queue(reset)}
function nearest(wx,wy){const s=snap();if(!s)return null;const n=norm(s);let best=null,score=Infinity;s.map.tiles.forEach(t=>{const p=wp(s,t,n),dx=Math.abs(wx-p.x),dy=Math.abs(wy-p.y),v=projection==="TOP"?Math.max(dx/38,dy/38):dx/(C.tw/2)+dy/(C.th/2);if(v<score){score=v;best=t}});return score<=1.02?best:null}
function visible(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10}
function ensure(){if(game||!visible())return;if(!window.Phaser){host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。</div>';return}game=new Phaser.Game({type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,backgroundColor:"#111820",scale:{mode:Phaser.Scale.NONE},scene:{create(){scene=this;this.input.addPointer(2);reconcile(true);this.input.on("pointerdown",p=>{if(this.input.pointer1.isDown&&this.input.pointer2.isDown){pinch={d:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),z:this.cameras.main.zoom};drag=null;return}drag={x:p.x,y:p.y,sx:this.cameras.main.scrollX,sy:this.cameras.main.scrollY,m:false}});this.input.on("pointermove",p=>{if(this.input.pointer1.isDown&&this.input.pointer2.isDown){const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);if(pinch?.d)this.cameras.main.setZoom(Phaser.Math.Clamp(pinch.z*d/pinch.d,C.minZoom,C.maxZoom));return}if(!p.isDown||!drag)return;const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>7)drag.m=true;const z=this.cameras.main.zoom;this.cameras.main.scrollX=drag.sx-dx/z;this.cameras.main.scrollY=drag.sy-dy/z;const s=snap();if(s)anchor(s,norm(s))});this.input.on("pointerup",p=>{if(drag&&!drag.m){const w=p.positionToCamera(this.cameras.main),t=nearest(w.x,w.y);if(t)window.CardTacticsRuntime?.clickBattleTile?.(t.x,t.y)}drag=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinch=null});this.input.on("wheel",(_p,_g,_x,dy)=>{const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*(dy>0?.9:1.1),C.minZoom,C.maxZoom))})}}})}
function queue(reset=false){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;ensure();if(scene&&visible()){game.scale.resize(host.clientWidth,host.clientHeight);reconcile(reset)}})}
new MutationObserver(()=>queue(true)).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
if(window.ResizeObserver)new ResizeObserver(()=>{const k=`${host.clientWidth}x${host.clientHeight}`,chg=k!==lastSize;lastSize=k;queue(chg)}).observe(host);
window.addEventListener("cardtactics:battle-render",()=>queue(false));window.addEventListener("resize",()=>queue(true));
window.CardTacticsBattleView={resync:()=>resync(true),diagnostics:()=>({alive:!!scene,children:scene?.children?.length||0,zoom:+(scene?.cameras?.main?.zoom||0).toFixed(2),projection,rotation,lastRenderMs,lastRevision,objects:{tiles:V.tiles.size,units:V.units.size,mapObjects:V.objects.size,terrainMarkers:V.terrainMarkers.size,cores:V.cores.size,effects:V.effects.size}})};
queue(true);
})();
