(()=>{
  "use strict";
  const host=document.getElementById("phaserBattlefield");
  const source=document.getElementById("battlefield");
  const battleScreen=document.getElementById("battleScreen");
  if(!host||!source||!battleScreen)return;

  const MAP=window.MAPS?.prototype_field||{width:8,height:6,terrain:[]};
  const COLS=MAP.width||8, ROWS=MAP.height||6;
  const TILE_W=112, TILE_H=56, ELEV_H=28;
  const TERRAIN={plain:0x415844,mud:0x71563c,forest:0x25643b,high_ground:0x786a3d,water:0x236785,wall:0x5d626b};
  let game=null,sceneRef=null,redrawQueued=false,dragStart=null,pinchStart=null,layout=null;

  function cells(){return [...source.children].filter(el=>el.classList.contains("tile"));}
  function isPortrait(){return host.clientHeight>host.clientWidth;}
  function terrainElevation(x,y,cell){
    const data=(MAP.terrain||[]).find(t=>t.x===x&&t.y===y);
    if(Number.isFinite(data?.elevation))return data.elevation;
    const txt=cell?.querySelector(".elev")?.textContent||"";
    const m=txt.match(/-?\d+/); return m?Number(m[0]):0;
  }
  function colorFor(cell){for(const k of Object.keys(TERRAIN))if(cell.classList.contains(k))return TERRAIN[k];return TERRAIN.plain;}

  /* Portrait layout deliberately maps logical map Y to screen depth (vertical thumb travel).
     Landscape keeps the classic isometric spread. Game coordinates never change. */
  function computeLayout(){
    const portrait=isPortrait();
    if(portrait){
      const stepX=TILE_W*.50, stepY=TILE_H*.86;
      return {portrait,stepX,stepY,originX:host.clientWidth*.5,originY:150,
        worldW:Math.max(host.clientWidth,(COLS+2)*stepX+TILE_W),
        worldH:Math.max(host.clientHeight,(ROWS+COLS*.34+2)*stepY+320)};
    }
    return {portrait,stepX:TILE_W/2,stepY:TILE_H/2,originX:(COLS+ROWS)*TILE_W/4+100,originY:100,
      worldW:(COLS+ROWS)*TILE_W/2+220,worldH:(COLS+ROWS)*TILE_H/2+260};
  }
  function iso(x,y,elev=0){
    const L=layout||computeLayout();
    if(L.portrait){
      /* x mostly spreads left/right, y strongly advances upward/downward on the phone. */
      return {x:L.originX+(x-(COLS-1)/2)*L.stepX,
              y:L.originY+y*L.stepY+Math.abs(x-(COLS-1)/2)*TILE_H*.18-elev*ELEV_H};
    }
    return {x:L.originX+(x-y)*L.stepX,y:L.originY+(x+y)*L.stepY-elev*ELEV_H};
  }
  function diamond(g,cx,cy,w=TILE_W,h=TILE_H){
    g.beginPath();g.moveTo(cx,cy-h/2);g.lineTo(cx+w/2,cy);g.lineTo(cx,cy+h/2);g.lineTo(cx-w/2,cy);g.closePath();
  }
  function sideFaces(scene,cx,baseY,elev,depth){
    if(elev<=0)return;
    const h=elev*ELEV_H, topY=baseY-h;
    const g=scene.add.graphics().setDepth(depth);
    g.fillStyle(0x4d452e,.98);
    g.beginPath();g.moveTo(cx-TILE_W/2,topY);g.lineTo(cx,topY+TILE_H/2);g.lineTo(cx,baseY+TILE_H/2);g.lineTo(cx-TILE_W/2,baseY);g.closePath();g.fillPath();
    g.fillStyle(0x5c5133,.98);
    g.beginPath();g.moveTo(cx+TILE_W/2,topY);g.lineTo(cx,topY+TILE_H/2);g.lineTo(cx,baseY+TILE_H/2);g.lineTo(cx+TILE_W/2,baseY);g.closePath();g.fillPath();
    g.lineStyle(1,0x2d2a20,.7);
    for(let n=1;n<=elev;n++){const yy=baseY-n*ELEV_H;g.lineBetween(cx-TILE_W/2,yy,cx,yy+TILE_H/2);g.lineBetween(cx+TILE_W/2,yy,cx,yy+TILE_H/2);}
  }
  function outline(scene,cx,cy,color,width=4,scale=.90,depth=30){
    const g=scene.add.graphics().setDepth(depth);g.lineStyle(width,color,1);diamond(g,cx,cy,TILE_W*scale,TILE_H*scale);g.strokePath();
  }
  function labelFromUnit(unit){
    const raw=(unit?.textContent||"").trim().replace(/\s+/g," "),hp=(raw.match(/(\d+)\s*$/)||[])[1]||"";
    return {name:raw.replace(/\d+\s*$/,"").trim()||"?",hp};
  }
  function visibleBattle(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10;}

  function addDetail(scene,cell,cx,cy,depth){
    if(cell.classList.contains("forest"))scene.add.text(cx,cy-22,"🌲",{fontSize:"25px"}).setOrigin(.5,1).setDepth(depth+3);
    else if(cell.classList.contains("water"))scene.add.text(cx,cy,"≈",{fontSize:"22px",color:"#a9e5ff"}).setOrigin(.5).setDepth(depth+2);
    else if(cell.classList.contains("wall")){
      scene.add.rectangle(cx,cy-23,44,46,0x747b85).setStrokeStyle(2,0xaab0b8).setDepth(depth+4);
      scene.add.rectangle(cx,cy-47,44,7,0x9299a2).setDepth(depth+5);
    }
  }
  function addUnit(scene,cell,cx,cy,depth){
    const dom=cell.querySelector(".unit");if(!dom)return;
    const player=dom.classList.contains("player"),finished=dom.classList.contains("finished"),d=labelFromUnit(dom);
    const group=scene.add.container(cx,cy-38).setDepth(depth+10);
    group.add(scene.add.ellipse(0,38,54,16,0x000000,.4));
    group.add(scene.add.rectangle(0,0,58,76,player?0x285f9f:0x9b3d3d,.98).setStrokeStyle(3,cell.classList.contains("selected")?0xffffff:0xd6dce5).setAlpha(finished?.48:1));
    group.add(scene.add.text(0,-10,d.name,{fontFamily:"system-ui,sans-serif",fontSize:"12px",fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:52}}).setOrigin(.5));
    group.add(scene.add.text(0,19,"HP "+d.hp,{fontFamily:"system-ui,sans-serif",fontSize:"10px",color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5));
  }

  function draw(scene,resetCamera=false){
    if(!visibleBattle())return;
    layout=computeLayout();scene.children.removeAll();
    const list=cells(),cam=scene.cameras.main;
    cam.setBounds(0,0,layout.worldW,layout.worldH);

    list.forEach((cell,i)=>{
      const x=i%COLS,y=Math.floor(i/COLS),e=terrainElevation(x,y,cell);
      const base=iso(x,y,0),p=iso(x,y,e),depth=10+y*20+x;
      sideFaces(scene,base.x,base.y,e,depth-2);
      const g=scene.add.graphics().setDepth(depth);
      g.fillStyle(colorFor(cell),1);diamond(g,p.x,p.y);g.fillPath();
      g.lineStyle(2,0x89959f,.78);diamond(g,p.x,p.y);g.strokePath();
      if(e>0)scene.add.text(p.x+TILE_W*.30,p.y-TILE_H*.16,"+"+e,{fontSize:"11px",fontStyle:"bold",color:"#fff4bd",stroke:"#201d14",strokeThickness:3}).setOrigin(.5).setDepth(depth+2);
      if(cell.classList.contains("reachable"))outline(scene,p.x,p.y,0x4da6ff,5,.9,depth+5);
      if(cell.classList.contains("attackable"))outline(scene,p.x,p.y,0xff5e5e,5,.9,depth+5);
      if(cell.classList.contains("deployable"))outline(scene,p.x,p.y,0x70e38b,5,.9,depth+5);
      if(cell.classList.contains("tile-inspected"))outline(scene,p.x,p.y,0xffd166,4,.76,depth+6);
      addDetail(scene,cell,p.x,p.y,depth);
      const flag=cell.querySelector(".capture-flag")?.textContent?.trim();
      if(flag)scene.add.text(p.x,p.y-31,flag,{fontSize:"18px",color:"#f2d27a",stroke:"#000",strokeThickness:3}).setOrigin(.5).setDepth(depth+7);
      addUnit(scene,cell,p.x,p.y,depth);
    });

    if(resetCamera||!cam.__ctInitial){
      if(layout.portrait){
        /* Show the player's lower side first; vertical swipe explores enemy depth. */
        cam.setZoom(1.0);
        const start=iso((COLS-1)/2,ROWS-2,0);
        cam.centerOn(layout.worldW/2,Math.max(host.clientHeight/(2*cam.zoom),start.y-80));
      }else{
        const fit=Math.min(host.clientWidth/layout.worldW,host.clientHeight/layout.worldH);
        cam.setZoom(Phaser.Math.Clamp(Math.max(.72,fit*1.2),.65,1.3));
        const center=iso((COLS-1)/2,(ROWS-1)/2,0);cam.centerOn(center.x,center.y);
      }
      cam.__ctInitial=true;
    }
  }

  function nearestCell(wx,wy){
    let best=null,dist=Infinity;
    cells().forEach((cell,i)=>{
      const x=i%COLS,y=Math.floor(i/COLS),e=terrainElevation(x,y,cell),p=iso(x,y,e);
      const dx=(wx-p.x)/(TILE_W/2),dy=(wy-p.y)/(TILE_H/2),d=Math.abs(dx)+Math.abs(dy);
      if(d<dist){dist=d;best={cell,d};}
    });
    return best&&best.d<=1.15?best.cell:null;
  }
  function clickWorld(scene,pointer){const w=pointer.positionToCamera(scene.cameras.main);nearestCell(w.x,w.y)?.click();}

  function queueDraw(){
    if(redrawQueued)return;redrawQueued=true;
    requestAnimationFrame(()=>{redrawQueued=false;ensureStarted();if(sceneRef&&visibleBattle()){game.scale.resize(host.clientWidth,host.clientHeight);draw(sceneRef);}});
  }
  function ensureStarted(){
    if(game||!visibleBattle())return;
    if(!window.Phaser){host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。</div>';return;}
    game=new Phaser.Game({type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,backgroundColor:"#111820",
      render:{antialias:true,pixelArt:false,roundPixels:true},scale:{mode:Phaser.Scale.NONE},scene:{create:createScene}});
  }
  function createScene(){
    sceneRef=this;this.input.addPointer(2);draw(this,true);
    this.input.on("pointerdown",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        pinchStart={distance:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),zoom:this.cameras.main.zoom};dragStart=null;return;
      }
      dragStart={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};
    });
    this.input.on("pointermove",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);
        if(pinchStart?.distance)this.cameras.main.setZoom(Phaser.Math.Clamp(pinchStart.zoom*d/pinchStart.distance,.68,1.65));return;
      }
      if(!p.isDown||!dragStart)return;
      const dx=p.x-dragStart.x,dy=p.y-dragStart.y;if(Math.abs(dx)+Math.abs(dy)>8)dragStart.moved=true;
      /* Portrait: vertical travel is intentionally dominant; horizontal movement is damped. */
      const xFactor=layout?.portrait?.35:1;
      this.cameras.main.scrollX=dragStart.scrollX-dx/this.cameras.main.zoom*xFactor;
      this.cameras.main.scrollY=dragStart.scrollY-dy/this.cameras.main.zoom;
    });
    this.input.on("pointerup",p=>{if(dragStart&&!dragStart.moved)clickWorld(this,p);dragStart=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinchStart=null;});
    this.input.on("wheel",(_p,_go,_dx,dy)=>{const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*(dy>0?.9:1.1),.68,1.65));});
  }

  let lastPortrait=null;
  new MutationObserver(queueDraw).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  new MutationObserver(queueDraw).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
  if(window.ResizeObserver)new ResizeObserver(()=>{
    const now=isPortrait();if(sceneRef&&lastPortrait!==null&&now!==lastPortrait){lastPortrait=now;game.scale.resize(host.clientWidth,host.clientHeight);draw(sceneRef,true);}else queueDraw();
  }).observe(host);
  lastPortrait=isPortrait();
  window.addEventListener("cardtactics:state",queueDraw);window.addEventListener("resize",queueDraw);queueDraw();
})();