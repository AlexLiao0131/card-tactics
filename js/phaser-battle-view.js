(()=>{
  "use strict";
  const host=document.getElementById("phaserBattlefield");
  const source=document.getElementById("battlefield");
  const battleScreen=document.getElementById("battleScreen");
  if(!host||!source||!battleScreen)return;

  const TILE_W=100;
  const TILE_H=50;
  const ELEV_H=30;
  const PAD_X=28;
  const PAD_Y=150;
  const TERRAIN={
    plain:0x405b49,mud:0x6b573f,forest:0x2d6745,
    high_ground:0x7b6d43,water:0x287292,wall:0x606873
  };
  let game=null,sceneRef=null,queued=false,drag=null,pinch=null,lastOrientation=null;

  function mapData(){
    const stageId=window.CardTacticsBattleSetup?.stageId||"prototype_battle";
    const stage=window.StageDatabase?.get?.(stageId)||window.STAGES?.[stageId]||window.STAGES?.prototype_battle;
    return window.MAPS?.[stage?.mapId]||window.MAPS?.prototype_field||{width:8,height:6,terrain:[]};
  }
  function dims(){
    const m=mapData();
    return {cols:Number(m.width||8),rows:Number(m.height||6)};
  }
  function cells(){return [...source.children].filter(el=>el.classList.contains("tile"));}
  function portrait(){return host.clientHeight>=host.clientWidth;}
  function tileData(x,y){
    const m=mapData();
    return (m.terrain||[]).find(t=>t.x===x&&t.y===y)||null;
  }
  function elevation(x,y,cell){
    const t=tileData(x,y);
    if(Number.isFinite(t?.elevation))return Number(t.elevation);
    const n=Number((cell?.querySelector(".elev")?.textContent||"").replace(/\D/g,""));
    return Number.isFinite(n)?n:0;
  }
  function terrainColor(cell){
    for(const [name,color] of Object.entries(TERRAIN))if(cell.classList.contains(name))return color;
    return TERRAIN.plain;
  }

  /* Formal projection:
     portrait rotates the PRESENTATION only. Logical x/y never change.
     Logical X is the battle-front axis (player x=0 -> enemy x=max), therefore it
     runs vertically on a portrait phone. Logical Y spans the phone width. */
  function geometry(){
    const {cols,rows}=dims(),p=portrait();
    if(p){
      const usable=Math.max(220,host.clientWidth-PAD_X*2);
      const across=Math.max(1,rows-1);
      const stepAcross=Math.min(TILE_W*.56,(usable-TILE_W*.55)/across);
      const tileW=Math.min(TILE_W,Math.max(62,stepAcross*1.78));
      const tileH=tileW*.50;
      const depthStep=tileH*.92;
      const worldW=Math.max(host.clientWidth,usable+PAD_X*2);
      const worldH=Math.max(host.clientHeight+260,PAD_Y*2+(cols-1)*depthStep+tileH*3+ELEV_H*3);
      return {p,cols,rows,tileW,tileH,acrossStep:stepAcross,depthStep,
        originX:worldW/2,originY:PAD_Y,worldW,worldH};
    }
    const tileW=TILE_W,tileH=TILE_H;
    const worldW=(cols+rows)*tileW/2+220;
    const worldH=(cols+rows)*tileH/2+ELEV_H*3+240;
    return {p,cols,rows,tileW,tileH,acrossStep:tileW/2,depthStep:tileH/2,
      originX:worldW/2,originY:130,worldW,worldH};
  }
  function project(x,y,e=0,G=geometry()){
    if(G.p){
      return {
        x:G.originX+(y-(G.rows-1)/2)*G.acrossStep,
        y:G.originY+x*G.depthStep+Math.abs(y-(G.rows-1)/2)*G.tileH*.16-e*ELEV_H
      };
    }
    return {
      x:G.originX+(x-y)*G.tileW/2,
      y:G.originY+(x+y)*G.tileH/2-e*ELEV_H
    };
  }
  function diamond(g,x,y,w,h){
    g.beginPath();g.moveTo(x,y-h/2);g.lineTo(x+w/2,y);g.lineTo(x,y+h/2);g.lineTo(x-w/2,y);g.closePath();
  }
  function neighborElevation(x,y){
    const {cols,rows}=dims();
    if(x<0||y<0||x>=cols||y>=rows)return 0;
    return elevation(x,y,cells()[x*rows+y]||null);
  }
  function drawCliff(scene,x,y,e,G,depth){
    if(e<=0)return;
    const p=project(x,y,e,G),base=project(x,y,0,G);
    const g=scene.add.graphics().setDepth(depth-2);

    /* Only exposed height differences get a wall. Adjacent equal-height tiles
       stay connected instead of each becoming a separate brown box. */
    const nextDepth=G.p?neighborElevation(x+1,y):neighborElevation(x,y+1);
    const nextAcross=G.p?neighborElevation(x,y+1):neighborElevation(x+1,y);
    const dropDepth=Math.max(0,e-nextDepth);
    const dropAcross=Math.max(0,e-nextAcross);

    if(dropDepth>0){
      const h=dropDepth*ELEV_H;
      g.fillStyle(0x51472f,.98);
      g.beginPath();
      g.moveTo(p.x-G.tileW/2,p.y);g.lineTo(p.x,p.y+G.tileH/2);
      g.lineTo(p.x,p.y+G.tileH/2+h);g.lineTo(p.x-G.tileW/2,p.y+h);
      g.closePath();g.fillPath();
    }
    if(dropAcross>0){
      const h=dropAcross*ELEV_H;
      g.fillStyle(0x625538,.98);
      g.beginPath();
      g.moveTo(p.x+G.tileW/2,p.y);g.lineTo(p.x,p.y+G.tileH/2);
      g.lineTo(p.x,p.y+G.tileH/2+h);g.lineTo(p.x+G.tileW/2,p.y+h);
      g.closePath();g.fillPath();
    }
  }
  function outline(scene,p,G,color,depth,scale=.9){
    const g=scene.add.graphics().setDepth(depth);
    g.lineStyle(4,color,1);diamond(g,p.x,p.y,G.tileW*scale,G.tileH*scale);g.strokePath();
  }
  function unitLabel(dom){
    const raw=(dom?.textContent||"").trim().replace(/\s+/g," ");
    const hp=(raw.match(/(\d+)\s*$/)||[])[1]||"";
    return {name:raw.replace(/\d+\s*$/,"").trim()||"?",hp};
  }
  function drawUnit(scene,cell,p,G,depth){
    const dom=cell.querySelector(".unit");if(!dom)return;
    const player=dom.classList.contains("player"),finished=dom.classList.contains("finished"),d=unitLabel(dom);
    const scale=G.tileW/100;
    const c=scene.add.container(p.x,p.y-35*scale).setDepth(depth+20);
    c.add(scene.add.ellipse(0,34*scale,52*scale,15*scale,0x000000,.38));
    c.add(scene.add.rectangle(0,0,56*scale,70*scale,player?0x2d67a7:0xa74444,.98)
      .setStrokeStyle(2.5,cell.classList.contains("selected")?0xffffff:0xd8e0e8).setAlpha(finished?.48:1));
    c.add(scene.add.text(0,-9*scale,d.name,{fontFamily:"system-ui,sans-serif",fontSize:`${Math.max(9,12*scale)}px`,
      fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:52*scale}}).setOrigin(.5));
    c.add(scene.add.text(0,17*scale,"HP "+d.hp,{fontFamily:"system-ui,sans-serif",fontSize:`${Math.max(8,10*scale)}px`,
      color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5));
  }
  function drawDetail(scene,cell,p,G,depth){
    const s=G.tileW/100;
    if(cell.classList.contains("forest"))scene.add.text(p.x,p.y-19*s,"🌲",{fontSize:`${23*s}px`}).setOrigin(.5,1).setDepth(depth+8);
    else if(cell.classList.contains("water"))scene.add.text(p.x,p.y,"≈",{fontSize:`${21*s}px`,color:"#b9ecff"}).setOrigin(.5).setDepth(depth+4);
    else if(cell.classList.contains("wall")){
      scene.add.rectangle(p.x,p.y-20*s,40*s,40*s,0x747b85).setStrokeStyle(2,0xaab0b8).setDepth(depth+9);
    }
    if(cell.querySelector(".trap-marker"))scene.add.text(p.x,p.y-5*s,"🪤",{fontSize:`${20*s}px`}).setOrigin(.5).setDepth(depth+10);
  }
  function visible(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10;}

  function draw(scene,reset=false){
    if(!visible())return;
    const G=geometry(),list=cells(),cam=scene.cameras.main;
    scene.children.removeAll();
    cam.setBounds(0,0,G.worldW,G.worldH);

    list.forEach((cell,i)=>{
      const x=Math.floor(i/G.rows),y=i%G.rows,e=elevation(x,y,cell);
      const p=project(x,y,e,G),depth=100+x*30+y;
      drawCliff(scene,x,y,e,G,depth);
      const g=scene.add.graphics().setDepth(depth);
      g.fillStyle(terrainColor(cell),1);diamond(g,p.x,p.y,G.tileW,G.tileH);g.fillPath();
      g.lineStyle(2,0x8d99a2,.78);diamond(g,p.x,p.y,G.tileW,G.tileH);g.strokePath();
      if(e>0)scene.add.text(p.x+G.tileW*.31,p.y-G.tileH*.17,"H"+e,
        {fontSize:"10px",fontStyle:"bold",color:"#fff0ad",stroke:"#17140d",strokeThickness:3}).setOrigin(.5).setDepth(depth+5);
      if(cell.classList.contains("reachable"))outline(scene,p,G,0x4da6ff,depth+6);
      if(cell.classList.contains("attackable"))outline(scene,p,G,0xff5e5e,depth+6);
      if(cell.classList.contains("deployable"))outline(scene,p,G,0x70e38b,depth+6);
      if(cell.classList.contains("tile-inspected"))outline(scene,p,G,0xffd166,depth+7,.76);
      drawDetail(scene,cell,p,G,depth);
      drawUnit(scene,cell,p,G,depth);
    });

    if(reset||!cam.__ctReady){
      if(G.p){
        /* Width always fits. Long maps intentionally extend vertically. */
        const contentWidth=Math.max(1,(G.rows-1)*G.acrossStep+G.tileW);
        const fit=(host.clientWidth-PAD_X*2)/contentWidth;
        cam.setZoom(Phaser.Math.Clamp(fit,.72,1.25));
        const playerFront=project(0,(G.rows-1)/2,0,G);
        const visibleWorldH=host.clientHeight/cam.zoom;
        cam.centerOn(G.worldW/2,Math.max(visibleWorldH/2,playerFront.y+visibleWorldH*.20));
      }else{
        const fit=Math.min(host.clientWidth/G.worldW,host.clientHeight/G.worldH);
        cam.setZoom(Phaser.Math.Clamp(fit*.98,.62,1.15));
        cam.centerOn(G.worldW/2,G.worldH/2);
      }
      cam.__ctReady=true;
    }
  }
  function nearest(wx,wy){
    const G=geometry();let best=null,score=Infinity;
    cells().forEach((cell,i)=>{
      const x=Math.floor(i/G.rows),y=i%G.rows,e=elevation(x,y,cell),p=project(x,y,e,G);
      const d=Math.abs((wx-p.x)/(G.tileW/2))+Math.abs((wy-p.y)/(G.tileH/2));
      if(d<score){score=d;best=cell;}
    });
    return score<=1.08?best:null;
  }
  function ensure(){
    if(game||!visible())return;
    if(!window.Phaser){host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。</div>';return;}
    game=new Phaser.Game({type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,
      backgroundColor:"#111820",render:{antialias:true,pixelArt:false,roundPixels:true},
      scale:{mode:Phaser.Scale.NONE},scene:{create(){
        sceneRef=this;this.input.addPointer(2);draw(this,true);
        this.input.on("pointerdown",p=>{
          if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
            pinch={d:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),z:this.cameras.main.zoom};drag=null;return;
          }
          drag={x:p.x,y:p.y,sx:this.cameras.main.scrollX,sy:this.cameras.main.scrollY,moved:false};
        });
        this.input.on("pointermove",p=>{
          if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
            const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);
            if(pinch?.d)this.cameras.main.setZoom(Phaser.Math.Clamp(pinch.z*d/pinch.d,.62,1.55));
            return;
          }
          if(!p.isDown||!drag)return;
          const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>7)drag.moved=true;
          const G=geometry(),z=this.cameras.main.zoom;
          this.cameras.main.scrollX=drag.sx-dx/z*(G.p?.18:1);
          this.cameras.main.scrollY=drag.sy-dy/z;
        });
        this.input.on("pointerup",p=>{
          if(drag&&!drag.moved){const w=p.positionToCamera(this.cameras.main);nearest(w.x,w.y)?.click();}
          drag=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinch=null;
        });
        this.input.on("wheel",(_p,_g,_dx,dy)=>{const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*(dy>0?.9:1.1),.62,1.55));});
      }}});
  }
  function queue(reset=false){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;ensure();if(sceneRef&&visible()){game.scale.resize(host.clientWidth,host.clientHeight);draw(sceneRef,reset);}});
  }
  new MutationObserver(()=>queue()).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  new MutationObserver(()=>queue(true)).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
  if(window.ResizeObserver)new ResizeObserver(()=>{
    const o=portrait();const changed=lastOrientation!==null&&o!==lastOrientation;lastOrientation=o;queue(changed);
  }).observe(host);
  lastOrientation=portrait();
  window.addEventListener("cardtactics:state",()=>queue());
  window.addEventListener("resize",()=>queue(true));
  queue(true);
})();