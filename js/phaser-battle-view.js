(()=>{
"use strict";

/*
  Card Tactics Phaser Battle Renderer
  -----------------------------------
  Rules/state remain owned by the existing runtime.
  This file has three explicit layers:
  1. BattleStateAdapter: converts current runtime/DOM state into one normalized snapshot.
  2. IsoProjection: pure grid -> screen geometry. No stage-specific coordinates.
  3. BattleRenderer: Phaser rendering/input/camera only.

  The DOM battlefield is a temporary compatibility input, never a visual layer.
*/

const host=document.getElementById("phaserBattlefield");
const source=document.getElementById("battlefield");
const battleScreen=document.getElementById("battleScreen");
if(!host||!source||!battleScreen)return;

const CONFIG=Object.freeze({
  tileWidth:104,
  tileHeight:68,
  elevationHeight:34,
  viewportPadding:22,
  worldPadding:120,
  unitLift:42,
  minZoom:.62,
  maxZoom:1.55
});

const COLORS=Object.freeze({
  PLAIN:0x405b49,MUD:0x6b573f,FOREST:0x2d6745,HIGH_GROUND:0x817243,
  WATER:0x287292,WALL:0x606873,grid:0x9aa6af,
  cliffA:0x51472f,cliffB:0x65583a
});

let game=null,sceneRef=null,drawQueued=false,drag=null,pinch=null,lastViewportKey="";

/* ---------- State adapter ---------- */
const BattleStateAdapter=(()=>{
  function stage(){
    const id=window.CardTacticsBattleSetup?.stageId||"prototype_battle";
    return window.StageDatabase?.get?.(id)||window.STAGES?.[id]||null;
  }
  function map(){
    const s=stage();
    if(!s)return null;
    return window.MapDatabase?.createMap?.(s.mapId)||null;
  }
  function domCells(){return [...source.querySelectorAll(":scope > .tile")];}
  function characterByName(name){
    return Object.values(window.CHARACTERS||{}).find(c=>c?.name===name)||null;
  }
  function parseUnit(cell,index,cols){
    const el=cell.querySelector(".unit");
    if(!el)return null;
    const x=index%cols,y=Math.floor(index/cols);
    const text=(el.textContent||"").trim().replace(/\s+/g," ");
    const hpMatch=text.match(/(\d+)\s*$/);
    const hp=hpMatch?Number(hpMatch[1]):0;
    const name=text.replace(/\d+\s*$/,"").trim();
    const character=characterByName(name);
    return {
      x,y,name,hp,
      maxHp:Number(character?.combat?.hp||hp||1),
      team:el.classList.contains("player")?"PLAYER":"ENEMY",
      selected:cell.classList.contains("selected"),
      finished:el.classList.contains("finished"),
      visualId:character?.visualId||null,
      character
    };
  }
  function effectsAt(cell){
    const icon=cell.querySelector(".icon")?.textContent||"";
    const effects=[];
    if(icon.includes("🔥"))effects.push("BURNING");
    if(icon.includes("♨"))effects.push("STEAM");
    if(cell.querySelector(".trap-marker"))effects.push("TRAP");
    return effects;
  }
  function snapshot(){
    const m=map(),s=stage();
    if(!m||!s)return null;
    const cells=domCells();
    const tiles=m.tiles.map((tile,index)=>{
      const cell=cells[index]||null;
      return {
        ...tile,
        reachable:!!cell?.classList.contains("reachable"),
        attackable:!!cell?.classList.contains("attackable"),
        deployable:!!cell?.classList.contains("deployable"),
        inspected:!!cell?.classList.contains("tile-inspected"),
        effects:cell?effectsAt(cell):[],
        deployment:(s.deploymentPoints||[]).find(point=>
          (point.area||[]).some(pos=>pos.x===tile.x&&pos.y===tile.y)
        )?.owner||null,
        capturePoint:(s.deploymentPoints||[]).find(point=>
          (point.captureTiles||[]).some(pos=>pos.x===tile.x&&pos.y===tile.y)
        )||null
      };
    });
    const units=cells.map((cell,index)=>parseUnit(cell,index,m.width)).filter(Boolean);
    return {
      stage:s,map:{...m,tiles},units,
      selectedUnit:units.find(u=>u.selected)||null,
      phase:window.CardTacticsRuntime?.getPhase?.()||null
    };
  }
  function clickTile(x,y){
    const m=map();if(!m)return;
    const index=y*m.width+x;
    domCells()[index]?.click();
  }
  return {snapshot,clickTile};
})();

/* ---------- Pure projection ---------- */
const IsoProjection=(()=>{
  function displayGrid(x,y,map){
    // Rotate presentation so stage x=0 (player side) is visually at the bottom.
    // Logical coordinates are never changed.
    return {u:y,v:(map.width-1)-x};
  }
  function point(x,y,elevation,map){
    const {u,v}=displayGrid(x,y,map);
    return {
      x:(u-v)*CONFIG.tileWidth/2,
      y:(u+v)*CONFIG.tileHeight/2-Number(elevation||0)*CONFIG.elevationHeight
    };
  }
  function basePoint(x,y,map){return point(x,y,0,map);}
  function tileCorners(p){
    const hw=CONFIG.tileWidth/2,hh=CONFIG.tileHeight/2;
    return [
      {x:p.x,y:p.y-hh},{x:p.x+hw,y:p.y},
      {x:p.x,y:p.y+hh},{x:p.x-hw,y:p.y}
    ];
  }
  function bounds(snapshot){
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    snapshot.map.tiles.forEach(t=>{
      const p=point(t.x,t.y,t.elevation,snapshot.map);
      tileCorners(p).forEach(c=>{
        minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);
        minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);
      });
      minY=Math.min(minY,p.y-CONFIG.unitLift-72);
    });
    return {minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};
  }
  return {point,basePoint,tileCorners,bounds};
})();

/* ---------- HUD ---------- */
const BattleHUD=(()=>{
  let el=null,manuallyHidden=false;
  function ensure(){
    if(el)return el;
    el=document.createElement("div");
    el.id="battleUnitHud";
    el.className="battle-unit-hud";
    el.innerHTML=`<div class="battle-unit-portrait"><span>?</span><img alt=""></div>
      <div class="battle-unit-summary"><div class="battle-unit-name"></div>
      <div class="battle-unit-hp"><i></i></div><div class="battle-unit-hp-text"></div>
      <div class="battle-unit-status"></div></div>
      <button class="battle-unit-hud-close" type="button" aria-label="關閉角色資訊">×</button>`;
    battleScreen.querySelector("main")?.appendChild(el);
    el.querySelector(".battle-unit-hud-close")?.addEventListener("click",()=>{
      manuallyHidden=true;
      el.classList.remove("visible");
    });
    return el;
  }
  function portrait(unit){
    if(!unit?.visualId)return null;
    return window.VisualDatabase?.asset?.("characters",unit.visualId,"portrait")||null;
  }
  function render(snapshot){
    const root=ensure(),u=snapshot?.selectedUnit;
    if(!u)manuallyHidden=false;
    root.classList.toggle("visible",!!u&&!manuallyHidden);
    if(!u)return;
    root.querySelector(".battle-unit-name").textContent=u.name;
    root.querySelector(".battle-unit-hp-text").textContent=`HP ${u.hp}/${u.maxHp}`;
    root.querySelector(".battle-unit-hp i").style.width=`${Math.max(0,Math.min(100,u.hp/u.maxHp*100))}%`;
    const statuses=[];
    if(u.finished)statuses.push("已完成行動");
    root.querySelector(".battle-unit-status").textContent=statuses.length?statuses.join(" · "):"正常";
    const img=root.querySelector("img"),fallback=root.querySelector(".battle-unit-portrait span"),src=portrait(u);
    if(src){
      img.src=src;img.style.display="block";fallback.style.display="none";
      img.onerror=()=>{img.style.display="none";fallback.style.display="grid";};
    }else{
      img.removeAttribute("src");img.style.display="none";fallback.style.display="grid";
      fallback.textContent=(u.name||"?").slice(0,1);
    }
  }
  function hide(){manuallyHidden=true;ensure().classList.remove("visible");}
  function allow(){manuallyHidden=false;}
  return {render,hide,allow};
})();

/* ---------- Renderer ---------- */
function diamond(g,p,fill,line=COLORS.grid){
  const hw=CONFIG.tileWidth/2,hh=CONFIG.tileHeight/2;
  g.fillStyle(fill,1);
  g.beginPath();g.moveTo(p.x,p.y-hh);g.lineTo(p.x+hw,p.y);g.lineTo(p.x,p.y+hh);g.lineTo(p.x-hw,p.y);g.closePath();g.fillPath();
  g.lineStyle(2,line,.78);g.strokePath();
}
function terrainColor(type){return COLORS[type]??COLORS.PLAIN;}
function tileAt(snapshot,x,y){return snapshot.map.tiles.find(t=>t.x===x&&t.y===y)||null;}
function elevationAt(snapshot,x,y){
  const t=tileAt(snapshot,x,y);return t?Number(t.elevation||0):0;
}
function terrainEdges(snapshot,tile,p){
  const hw=CONFIG.tileWidth/2,hh=CONFIG.tileHeight/2;
  const centerBase=IsoProjection.basePoint(tile.x,tile.y,snapshot.map);
  const candidates=[
    {dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}
  ];

  return candidates.map(dir=>{
    const neighborBase=IsoProjection.basePoint(tile.x+dir.dx,tile.y+dir.dy,snapshot.map);
    const sx=neighborBase.x-centerBase.x;
    const sy=neighborBase.y-centerBase.y;

    /* The shared diamond edge is derived from the projected neighbour vector.
       Nothing here assumes a particular map orientation. */
    let a,b;
    if(sx<0&&sy>0){ a={x:p.x-hw,y:p.y}; b={x:p.x,y:p.y+hh}; }
    else if(sx>0&&sy>0){ a={x:p.x+hw,y:p.y}; b={x:p.x,y:p.y+hh}; }
    else if(sx>0&&sy<0){ a={x:p.x,y:p.y-hh}; b={x:p.x+hw,y:p.y}; }
    else { a={x:p.x-hw,y:p.y}; b={x:p.x,y:p.y-hh}; }

    return {
      neighborX:tile.x+dir.dx,
      neighborY:tile.y+dir.dy,
      screenDx:sx,
      screenDy:sy,
      a,b
    };
  });
}
function drawExposedCliffs(scene,snapshot,tile,p,depth){
  const elevation=Number(tile.elevation||0);
  if(elevation<=0)return;

  terrainEdges(snapshot,tile,p)
    /* Front-facing is determined by projection itself: its neighbour projects
       lower on screen. Rotation/displayGrid changes need no cliff rewrite. */
    .filter(edge=>edge.screenDy>0)
    .forEach(edge=>{
      const neighbor=tileAt(snapshot,edge.neighborX,edge.neighborY);
      const neighborElevation=neighbor?Number(neighbor.elevation||0):0;
      const levels=elevation-neighborElevation;
      if(levels<=0)return;

      const drop=levels*CONFIG.elevationHeight;
      const g=scene.add.graphics().setDepth(depth-1);
      g.fillStyle(edge.screenDx<0?COLORS.cliffA:COLORS.cliffB,.98);
      g.beginPath();
      g.moveTo(edge.a.x,edge.a.y);
      g.lineTo(edge.b.x,edge.b.y);
      g.lineTo(edge.b.x,edge.b.y+drop);
      g.lineTo(edge.a.x,edge.a.y+drop);
      g.closePath();
      g.fillPath();
    });
}
function outline(scene,p,color,depth,scale=.88){
  const g=scene.add.graphics().setDepth(depth),hw=CONFIG.tileWidth/2*scale,hh=CONFIG.tileHeight/2*scale;
  g.lineStyle(4,color,1);g.beginPath();g.moveTo(p.x,p.y-hh);g.lineTo(p.x+hw,p.y);g.lineTo(p.x,p.y+hh);g.lineTo(p.x-hw,p.y);g.closePath();g.strokePath();
}
function drawDeployment(scene,tile,p,depth){
  if(!tile.deployment&&!tile.capturePoint)return;
  const colors={PLAYER:0x397bd1,ENEMY:0xcf4c4c,NEUTRAL:0xd0ae54};
  if(tile.deployment){
    const g=scene.add.graphics().setDepth(depth+2);
    const hw=CONFIG.tileWidth/2,hh=CONFIG.tileHeight/2;
    g.fillStyle(colors[tile.deployment]||colors.NEUTRAL,.24);
    g.beginPath();g.moveTo(p.x,p.y-hh);g.lineTo(p.x+hw,p.y);g.lineTo(p.x,p.y+hh);g.lineTo(p.x-hw,p.y);g.closePath();g.fillPath();
  }
  if(tile.capturePoint)outline(scene,p,colors[tile.capturePoint.owner]||colors.NEUTRAL,depth+13,.58);
}
function drawRock(scene,p,depth,object){
  const objectHeight=Math.max(28,Number(object.visualHeight||46));
  const topY=p.y-objectHeight;
  const g=scene.add.graphics().setDepth(depth+9);
  g.fillStyle(0x727a84,1);
  g.beginPath();
  g.moveTo(p.x-23,p.y-15);g.lineTo(p.x,p.y-7);g.lineTo(p.x+22,p.y-17);
  g.lineTo(p.x+18,topY+11);g.lineTo(p.x,topY);g.lineTo(p.x-19,topY+12);
  g.closePath();g.fillPath();
  g.lineStyle(2,0xaab1b8,.9);g.strokePath();
  const top=scene.add.graphics().setDepth(depth+10);
  top.fillStyle(0x9299a1,1);
  top.beginPath();top.moveTo(p.x,topY);top.lineTo(p.x+18,topY+11);
  top.lineTo(p.x,topY+20);top.lineTo(p.x-19,topY+12);top.closePath();top.fillPath();
}
function drawEnvironment(scene,snapshot,tile,p,depth){
  drawDeployment(scene,tile,p,depth);
  if(tile.terrain==="FOREST")scene.add.text(p.x,p.y-18,"🌲",{fontSize:"25px"}).setOrigin(.5,1).setDepth(depth+6);
  if(tile.terrain==="WATER")scene.add.text(p.x,p.y,"≈",{fontSize:"23px",color:"#b9ecff"}).setOrigin(.5).setDepth(depth+3);
  const object=(snapshot.map.objects||[]).find(o=>!o.destroyed&&o.x===tile.x&&o.y===tile.y);
  if(object?.type==="ROCK")drawRock(scene,p,depth,object);
  else if(object)scene.add.rectangle(p.x,p.y-24,40,48,0x747b85).setStrokeStyle(2,0xaab0b8).setDepth(depth+9);
  else if(tile.terrain==="WALL")scene.add.rectangle(p.x,p.y-22,42,44,0x747b85).setStrokeStyle(2,0xaab0b8).setDepth(depth+8);
  if(tile.effects.includes("BURNING"))scene.add.text(p.x-14,p.y-10,"🔥",{fontSize:"18px"}).setOrigin(.5).setDepth(depth+12);
  if(tile.effects.includes("STEAM"))scene.add.text(p.x+13,p.y-9,"♨",{fontSize:"17px"}).setOrigin(.5).setDepth(depth+12);
  if(tile.effects.includes("TRAP"))scene.add.text(p.x,p.y-5,"🪤",{fontSize:"20px"}).setOrigin(.5).setDepth(depth+12);
}
function drawUnit(scene,unit,p,depth){
  const player=unit.team==="PLAYER",alpha=unit.finished?.5:1;
  const c=scene.add.container(p.x,p.y-CONFIG.unitLift).setDepth(depth+20);
  c.add(scene.add.ellipse(0,38,55,16,0x000000,.38));
  c.add(scene.add.rectangle(0,0,58,72,player?0x2d67a7:0xa74444,.98).setStrokeStyle(3,unit.selected?0xffffff:0xd8e0e8).setAlpha(alpha));
  c.add(scene.add.text(0,-9,unit.name,{fontFamily:"system-ui,sans-serif",fontSize:"11px",fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:52}}).setOrigin(.5));
  c.add(scene.add.text(0,18,`HP ${unit.hp}`,{fontFamily:"system-ui,sans-serif",fontSize:"10px",color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5));
}
function normalized(snapshot){
  const B=IsoProjection.bounds(snapshot),pad=CONFIG.worldPadding;
  return {B,offsetX:pad-B.minX,offsetY:pad-B.minY,worldW:B.width+pad*2,worldH:B.height+pad*2};
}
function worldPoint(snapshot,tile,N){
  const p=IsoProjection.point(tile.x,tile.y,tile.elevation,snapshot.map);
  return {x:p.x+N.offsetX,y:p.y+N.offsetY};
}
function renderScene(scene,{resetCamera=false}={}){
  const snapshot=BattleStateAdapter.snapshot();if(!snapshot)return;
  BattleHUD.render(snapshot);
  const N=normalized(snapshot),cam=scene.cameras.main;
  scene.children.removeAll();
  cam.setBounds(0,0,N.worldW,N.worldH);

  snapshot.map.tiles.forEach(tile=>{
    const p=worldPoint(snapshot,tile,N);
    const display=IsoProjection.point(tile.x,tile.y,0,snapshot.map);
    const depth=100+display.y+Number(tile.elevation||0)*CONFIG.elevationHeight;
    drawExposedCliffs(scene,snapshot,tile,p,depth);
    const g=scene.add.graphics().setDepth(depth);
    diamond(g,p,terrainColor(tile.terrain));
    if(tile.elevation>0)scene.add.text(p.x+31,p.y-13,`H${tile.elevation}`,{fontSize:"10px",fontStyle:"bold",color:"#fff0ad",stroke:"#17140d",strokeThickness:3}).setOrigin(.5).setDepth(depth+4);
    if(tile.reachable)outline(scene,p,0x4da6ff,depth+10);
    if(tile.attackable)outline(scene,p,0xff5e5e,depth+10);
    if(tile.deployable)outline(scene,p,0x70e38b,depth+10);
    if(tile.inspected)outline(scene,p,0xffd166,depth+11,.74);
    drawEnvironment(scene,snapshot,tile,p,depth);
  });
  snapshot.units.forEach(unit=>{
    const tile=tileAt(snapshot,unit.x,unit.y);if(!tile)return;
    const p=worldPoint(snapshot,tile,N);
    const d=IsoProjection.point(unit.x,unit.y,0,snapshot.map);
    drawUnit(scene,unit,p,200+d.y+Number(tile.elevation||0)*CONFIG.elevationHeight);
  });

  if(resetCamera||!cam.__ctReady){
    const contentWidth=N.B.width;
    const widthZoom=(host.clientWidth-CONFIG.viewportPadding*2)/Math.max(1,contentWidth);
    const zoom=Phaser.Math.Clamp(widthZoom,CONFIG.minZoom,1.18);
    cam.setZoom(zoom);
    const visibleH=host.clientHeight/zoom;
    const playerTiles=snapshot.map.tiles.filter(t=>t.x===0);
    const playerY=playerTiles.length
      ?Math.max(...playerTiles.map(t=>worldPoint(snapshot,t,N).y))
      :N.worldH/2;
    const centerY=Math.max(visibleH/2,Math.min(N.worldH-visibleH/2,playerY-visibleH*.28));
    cam.centerOn(N.worldW/2,centerY);
    cam.__ctReady=true;
  }
}
function nearestTile(wx,wy){
  const snapshot=BattleStateAdapter.snapshot();if(!snapshot)return null;
  const N=normalized(snapshot);let best=null,bestScore=Infinity;
  snapshot.map.tiles.forEach(tile=>{
    const p=worldPoint(snapshot,tile,N);
    const dx=Math.abs((wx-p.x)/(CONFIG.tileWidth/2));
    const dy=Math.abs((wy-p.y)/(CONFIG.tileHeight/2));
    const score=dx+dy;
    if(score<bestScore){bestScore=score;best=tile;}
  });
  return bestScore<=1.02?best:null;
}
function visible(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10;}
function ensureGame(){
  if(game||!visible())return;
  if(!window.Phaser){host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。</div>';return;}
  game=new Phaser.Game({
    type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,
    backgroundColor:"#111820",render:{antialias:true,pixelArt:false,roundPixels:true},
    scale:{mode:Phaser.Scale.NONE},
    scene:{create(){
      sceneRef=this;this.input.addPointer(2);renderScene(this,{resetCamera:true});
      this.input.on("pointerdown",p=>{
        if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
          pinch={distance:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),zoom:this.cameras.main.zoom};
          drag=null;return;
        }
        drag={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};
      });
      this.input.on("pointermove",p=>{
        if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
          const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);
          if(pinch?.distance)this.cameras.main.setZoom(Phaser.Math.Clamp(pinch.zoom*d/pinch.distance,CONFIG.minZoom,CONFIG.maxZoom));
          return;
        }
        if(!p.isDown||!drag)return;
        const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>7)drag.moved=true;
        const z=this.cameras.main.zoom;
        // Portrait interaction is intentionally vertical-first. Horizontal remains available only as a small correction.
        const xFactor=host.clientHeight>=host.clientWidth?.18:1;
        this.cameras.main.scrollX=drag.scrollX-dx/z*xFactor;
        this.cameras.main.scrollY=drag.scrollY-dy/z;
      });
      this.input.on("pointerup",p=>{
        if(drag&&!drag.moved){
          const w=p.positionToCamera(this.cameras.main),tile=nearestTile(w.x,w.y);
          if(tile){
            const snapshot=BattleStateAdapter.snapshot();
            const hasUnit=!!snapshot?.units.some(u=>u.x===tile.x&&u.y===tile.y);
            if(hasUnit)BattleHUD.allow();else BattleHUD.hide();
            BattleStateAdapter.clickTile(tile.x,tile.y);
          }else BattleHUD.hide();
        }
        drag=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinch=null;
      });
      this.input.on("wheel",(_p,_go,_dx,dy)=>{
        const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*(dy>0?.9:1.1),CONFIG.minZoom,CONFIG.maxZoom));
      });
    }}
  });
}
function queue(resetCamera=false){
  if(drawQueued)return;drawQueued=true;
  requestAnimationFrame(()=>{
    drawQueued=false;ensureGame();
    if(sceneRef&&visible()){
      game.scale.resize(host.clientWidth,host.clientHeight);
      renderScene(sceneRef,{resetCamera});
    }
  });
}
new MutationObserver(()=>queue(false)).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
new MutationObserver(()=>queue(true)).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
if(window.ResizeObserver)new ResizeObserver(()=>{
  const key=`${host.clientWidth}x${host.clientHeight}`;
  const changed=key!==lastViewportKey;lastViewportKey=key;queue(changed);
}).observe(host);
window.addEventListener("cardtactics:state",()=>queue(false));
window.addEventListener("resize",()=>queue(true));
queue(true);
})();