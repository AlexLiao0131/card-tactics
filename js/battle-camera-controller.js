(()=>{
"use strict";
function create({scene,minZoom=.62,maxZoom=1.55,onTap,onChanged}){
 const cam=scene.cameras.main,s={mode:"IDLE",primary:null,start:null,pinch:null,moved:false};
 const active=()=>[scene.input.pointer1,scene.input.pointer2].filter(p=>p?.isDown);
 const distance=(a,b)=>Phaser.Math.Distance.Between(a.x,a.y,b.x,b.y);
 const clamp=z=>Phaser.Math.Clamp(z,minZoom,maxZoom);
 function pan(p){s.mode="PAN";s.primary=p.id;s.start={x:p.x,y:p.y,sx:cam.scrollX,sy:cam.scrollY};s.pinch=null;s.moved=false}
 function pinch(){const a=active();if(a.length<2)return;s.mode="PINCH";s.primary=null;s.start=null;s.moved=true;s.pinch={distance:Math.max(1,distance(a[0],a[1])),zoom:cam.zoom}}
 function down(p){active().length>=2?pinch():pan(p)}
 function move(p){const a=active();if(a.length>=2){if(s.mode!=="PINCH")pinch();if(s.pinch){cam.setZoom(clamp(s.pinch.zoom*distance(a[0],a[1])/s.pinch.distance));onChanged?.()}return}if(s.mode!=="PAN"||p.id!==s.primary||!s.start)return;const dx=p.x-s.start.x,dy=p.y-s.start.y;if(Math.abs(dx)+Math.abs(dy)>7)s.moved=true;cam.scrollX=s.start.sx-dx/cam.zoom;cam.scrollY=s.start.sy-dy/cam.zoom;onChanged?.()}
 function up(p){const tap=s.mode==="PAN"&&!s.moved&&p.id===s.primary;s.mode="IDLE";s.primary=null;s.start=null;s.pinch=null;s.moved=false;const a=active();if(a.length===1)pan(a[0]);else if(tap)onTap?.(p);onChanged?.(true)}
 scene.input.on("pointerdown",down);scene.input.on("pointermove",move);scene.input.on("pointerup",up);scene.input.on("pointerupoutside",up);
 scene.input.on("wheel",(_p,_g,_x,dy)=>{cam.setZoom(clamp(cam.zoom*(dy>0?.9:1.1)));onChanged?.(true)});
 return{s};
}
window.BattleCameraController={create};
})();