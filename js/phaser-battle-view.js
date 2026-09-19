(()=>{
"use strict";
const host=document.getElementById("phaserBattlefield");
const battleScreen=document.getElementById("battleScreen");
if(!host||!battleScreen)return;

const C={tw:104,th:68,eh:34,pad:120,minZoom:.62,maxZoom:1.55};
const COLORS={PLAIN:0x405b49,MUD:0x6b573f,FOREST:0x2d6745,HIGH_GROUND:0x817243,WATER:0x287292,WALL:0x606873,grid:0x9aa6af};
let game=null,scene=null,queued=false,projection="ISO",rotation=0,drag=null,pinch=null,lastSize="",lastRenderMs=0;

function snap(){return window.CardTacticsRuntime?.getBattleSnapshot?.()||null}
function rotated(x,y,m){const q=((rotation%4)+4)%4;if(q===0)return{x,y,w:m.width,h:m.height};if(q===1)return{x:m.height-1-y,y:x,w:m.height,h:m.width};if(q===2)return{x:m.width-1-x,y:m.height-1-y,w:m.width,h:m.height};return{x:y,y:m.width-1-x,w:m.height,h:m.width}}
function grid(x,y,m){const r=rotated(x,y,m);return{u:r.y,v:r.w-1-r.x}}
function point(x,y,e,m){const g=grid(x,y,m);if(projection==="TOP"){const z=76;return{x:g.u*z,y:g.v*z}}return{x:(g.u-g.v)*C.tw/2,y:(g.u+g.v)*C.th/2-Number(e||0)*C.eh}}
function corners(p){if(projection==="TOP"){const h=38;return[{x:p.x-h,y:p.y-h},{x:p.x+h,y:p.y-h},{x:p.x+h,y:p.y+h},{x:p.x-h,y:p.y+h}]}return[{x:p.x,y:p.y-C.th/2},{x:p.x+C.tw/2,y:p.y},{x:p.x,y:p.y+C.th/2},{x:p.x-C.tw/2,y:p.y}]}
function bounds(s){let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;s.map.tiles.forEach(t=>corners(point(t.x,t.y,t.elevation,s.map)).forEach(p=>{a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.y);d=Math.max(d,p.y)}));return{minX:a,maxX:b,minY:c-110,maxY:d,width:b-a,height:d-(c-110)}}
function norm(s){const b=bounds(s);return{b,ox:C.pad-b.minX,oy:C.pad-b.minY,w:b.width+C.pad*2,h:b.height+C.pad*2}}
function wp(s,t,n){const p=point(t.x,t.y,t.elevation,s.map);return{x:p.x+n.ox,y:p.y+n.oy}}
function depth(s,x,y,l=0){return 1000+point(x,y,0,s.map).y*10+l}
function tile(s,x,y){return s.map.tiles.find(t=>t.x===x&&t.y===y)||null}
function poly(g,p,fill,line=COLORS.grid){const q=corners(p);g.fillStyle(fill,1);g.beginPath();g.moveTo(q[0].x,q[0].y);q.slice(1).forEach(v=>g.lineTo(v.x,v.y));g.closePath();g.fillPath();g.lineStyle(2,line,.78);g.strokePath()}
function outline(sc,p,color,z,scale=.88){const g=sc.add.graphics().setDepth(z),q=corners(p).map(v=>({x:p.x+(v.x-p.x)*scale,y:p.y+(v.y-p.y)*scale}));g.lineStyle(4,color,1);g.beginPath();g.moveTo(q[0].x,q[0].y);q.slice(1).forEach(v=>g.lineTo(v.x,v.y));g.closePath();g.strokePath()}
function env(sc,t,p,z){
 if(t.deployment||t.capturePoint){const col={PLAYER:0x397bd1,ENEMY:0xcf4c4c,NEUTRAL:0xd0ae54}[t.deployment||t.capturePoint?.owner]||0xd0ae54;outline(sc,p,col,z+1,.62)}
 if(t.terrain==="FOREST")sc.add.text(p.x,p.y-18,"🌲",{fontSize:"25px"}).setOrigin(.5,1).setDepth(z+.6);
 if(t.terrain==="WATER")sc.add.text(p.x,p.y,"≈",{fontSize:"23px",color:"#b9ecff"}).setOrigin(.5).setDepth(z+.3);
 if(t.effects?.includes("BURNING"))sc.add.text(p.x-14,p.y-10,"🔥",{fontSize:"18px"}).setOrigin(.5).setDepth(z+1.2);
 if(t.effects?.includes("STEAM"))sc.add.text(p.x+13,p.y-9,"♨",{fontSize:"17px"}).setOrigin(.5).setDepth(z+1.2);
 if(t.core)sc.add.text(p.x,p.y-10,`CORE\n${t.core.hp}/${t.core.maxHp}`,{fontSize:"10px",fontStyle:"bold",align:"center",color:"#ffe7a8",stroke:"#071018",strokeThickness:3}).setOrigin(.5).setDepth(z+2);
}
function unit(sc,u,p,z){const pl=u.team==="PLAYER",a=u.finished?.5:1,c=sc.add.container(p.x,p.y-(projection==="TOP"?20:42)).setDepth(z);c.add(sc.add.ellipse(0,38,55,16,0x000000,.38));c.add(sc.add.rectangle(0,0,58,72,pl?0x2d67a7:0xa74444,.98).setStrokeStyle(3,u.selected?0xffffff:0xd8e0e8).setAlpha(a));c.add(sc.add.text(0,-9,u.name,{fontFamily:"system-ui,sans-serif",fontSize:"11px",fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:52}}).setOrigin(.5));c.add(sc.add.text(0,18,`HP ${u.hp}`,{fontSize:"10px",color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5))}
function controls(){let box=document.getElementById("battleViewControls");if(!box){box=document.createElement("div");box.id="battleViewControls";box.className="battle-view-controls";battleScreen.querySelector("main")?.appendChild(box)}
 if(!box.children.length){const l=document.createElement("button"),v=document.createElement("button"),r=document.createElement("button");l.textContent="↺";r.textContent="↻";v.id="projectionToggle";v.textContent="正視圖";l.onclick=()=>{rotation=(rotation+3)%4;queue(true)};r.onclick=()=>{rotation=(rotation+1)%4;queue(true)};v.onclick=()=>{projection=projection==="ISO"?"TOP":"ISO";v.textContent=projection==="ISO"?"正視圖":"45°視角";queue(true)};box.append(l,v,r)}}
function anchor(s,n){const bar=document.getElementById("skillBar"),a=window.CardTacticsRuntime?.getActionMenuAnchor?.();if(!bar||!scene||!a){bar?.style.removeProperty("--menu-x");bar?.style.removeProperty("--menu-y");return}const t=tile(s,a.x,a.y);if(!t)return;const p=wp(s,t,n),cam=scene.cameras.main;bar.style.setProperty("--menu-x",`${Math.round((p.x-cam.worldView.x)*cam.zoom)}px`);bar.style.setProperty("--menu-y",`${Math.round((p.y-(projection==="TOP"?20:42)-cam.worldView.y)*cam.zoom)}px`)}
function draw(reset=false){const renderStarted=performance.now();controls();const s=snap();if(!s||!scene)return;const n=norm(s),cam=scene.cameras.main;scene.children.removeAll(true);cam.setBounds(0,0,n.w,n.h);s.map.tiles.forEach(t=>{const p=wp(s,t,n),z=depth(s,t.x,t.y),g=scene.add.graphics().setDepth(z);poly(g,p,COLORS[t.terrain]??COLORS.PLAIN);if(t.elevation)scene.add.text(p.x+31,p.y-13,`H${t.elevation}`,{fontSize:"10px",fontStyle:"bold",color:"#fff0ad",stroke:"#17140d",strokeThickness:3}).setOrigin(.5).setDepth(z+.4);if(t.reachable)outline(scene,p,0x4da6ff,z+1);if(t.attackable)outline(scene,p,0xff5e5e,z+1);if(t.deployable)outline(scene,p,0x70e38b,z+1);if(t.inspected)outline(scene,p,0xffd166,z+1.1,.74);env(scene,t,p,z)});s.units.forEach(u=>{const t=tile(s,u.x,u.y);if(t)unit(scene,u,wp(s,t,n),depth(s,u.x,u.y,3))});if(reset||!cam.__ready){const z=Phaser.Math.Clamp((host.clientWidth-44)/Math.max(1,n.b.width),C.minZoom,1.18);cam.setZoom(z);cam.centerOn(n.w/2,n.h/2);cam.__ready=true}anchor(s,n);lastRenderMs=+(performance.now()-renderStarted).toFixed(2)}
function nearest(wx,wy){const s=snap();if(!s)return null;const n=norm(s);let best=null,score=Infinity;s.map.tiles.forEach(t=>{const p=wp(s,t,n),dx=Math.abs(wx-p.x),dy=Math.abs(wy-p.y),v=projection==="TOP"?Math.max(dx/38,dy/38):dx/(C.tw/2)+dy/(C.th/2);if(v<score){score=v;best=t}});return score<=1.02?best:null}
function visible(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10}
function ensure(){if(game||!visible())return;if(!window.Phaser){host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。</div>';return}game=new Phaser.Game({type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,backgroundColor:"#111820",scale:{mode:Phaser.Scale.NONE},scene:{create(){scene=this;this.input.addPointer(2);draw(true);this.input.on("pointerdown",p=>{if(this.input.pointer1.isDown&&this.input.pointer2.isDown){pinch={d:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),z:this.cameras.main.zoom};drag=null;return}drag={x:p.x,y:p.y,sx:this.cameras.main.scrollX,sy:this.cameras.main.scrollY,m:false}});this.input.on("pointermove",p=>{if(this.input.pointer1.isDown&&this.input.pointer2.isDown){const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);if(pinch?.d)this.cameras.main.setZoom(Phaser.Math.Clamp(pinch.z*d/pinch.d,C.minZoom,C.maxZoom));return}if(!p.isDown||!drag)return;const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>7)drag.m=true;const z=this.cameras.main.zoom;this.cameras.main.scrollX=drag.sx-dx/z;this.cameras.main.scrollY=drag.sy-dy/z;const s=snap();if(s)anchor(s,norm(s))});this.input.on("pointerup",p=>{if(drag&&!drag.m){const w=p.positionToCamera(this.cameras.main),t=nearest(w.x,w.y);if(t)window.CardTacticsRuntime?.clickBattleTile?.(t.x,t.y)}drag=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinch=null});this.input.on("wheel",(_p,_g,_x,dy)=>{const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*(dy>0?.9:1.1),C.minZoom,C.maxZoom))})}}})}
function queue(reset=false){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;ensure();if(scene&&visible()){game.scale.resize(host.clientWidth,host.clientHeight);draw(reset)}})}
new MutationObserver(()=>queue(true)).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
if(window.ResizeObserver)new ResizeObserver(()=>{const k=`${host.clientWidth}x${host.clientHeight}`,chg=k!==lastSize;lastSize=k;queue(chg)}).observe(host);
window.addEventListener("cardtactics:battle-render",()=>queue(false));
window.addEventListener("resize",()=>queue(true));
window.CardTacticsBattleView={
 diagnostics:()=>({alive:!!scene,children:scene?.children?.length||0,zoom:+(scene?.cameras?.main?.zoom||0).toFixed(2),projection,rotation,lastRenderMs})
};
queue(true);
})();