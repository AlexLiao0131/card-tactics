(()=>{
  "use strict";
  const host=document.getElementById("phaserBattlefield");
  const source=document.getElementById("battlefield");
  const battleScreen=document.getElementById("battleScreen");
  if(!host||!source||!battleScreen){
    console.warn("Card Tactics Phaser Battle View: battlefield host missing.");
    return;
  }

  const COLS=8;
  const TILE_W=128;
  const TILE_H=64;
  const ORIGIN_X=COLS*TILE_W/2+80;
  const ORIGIN_Y=110;
  const TERRAIN={
    plain:0x415844,mud:0x71563c,forest:0x25643b,
    high_ground:0x786a3d,water:0x236785,wall:0x5d626b
  };
  let game=null,sceneRef=null,redrawQueued=false,dragStart=null,pinchStart=null;

  function cells(){return [...source.children].filter(el=>el.classList.contains("tile"));}
  function rows(){return Math.max(1,Math.ceil(cells().length/COLS));}
  function colorFor(cell){
    for(const key of Object.keys(TERRAIN))if(cell.classList.contains(key))return TERRAIN[key];
    return TERRAIN.plain;
  }
  function iso(x,y){
    return {x:ORIGIN_X+(x-y)*TILE_W/2,y:ORIGIN_Y+(x+y)*TILE_H/2};
  }
  function gridFromWorld(wx,wy){
    const dx=wx-ORIGIN_X,dy=wy-ORIGIN_Y;
    return {
      x:Math.floor((dx/(TILE_W/2)+dy/(TILE_H/2))/2+.5),
      y:Math.floor((dy/(TILE_H/2)-dx/(TILE_W/2))/2+.5)
    };
  }
  function diamond(g,cx,cy,w=TILE_W,h=TILE_H){
    g.beginPath();
    g.moveTo(cx,cy-h/2);g.lineTo(cx+w/2,cy);g.lineTo(cx,cy+h/2);g.lineTo(cx-w/2,cy);
    g.closePath();
  }
  function outline(scene,cx,cy,color,width=4,alpha=1,scale=.92){
    const g=scene.add.graphics().setDepth(4);
    g.lineStyle(width,color,alpha);diamond(g,cx,cy,TILE_W*scale,TILE_H*scale);g.strokePath();
  }
  function labelFromUnit(unit){
    const raw=(unit?.textContent||"").trim().replace(/\s+/g," ");
    const hp=(raw.match(/(\d+)\s*$/)||[])[1]||"";
    return {name:raw.replace(/\d+\s*$/,"").trim()||"?",hp};
  }
  function visibleBattle(){return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10;}
  function worldSize(){
    const r=rows();
    return {w:(COLS+r)*TILE_W/2+180,h:(COLS+r)*TILE_H/2+240};
  }

  function queueDraw(){
    if(redrawQueued)return;
    redrawQueued=true;
    requestAnimationFrame(()=>{
      redrawQueued=false;ensureStarted();
      if(sceneRef&&visibleBattle()){game.scale.resize(host.clientWidth,host.clientHeight);draw(sceneRef);}
    });
  }
  function ensureStarted(){
    if(game||!visibleBattle())return;
    if(!window.Phaser){
      host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。請重新整理頁面。</div>';
      return;
    }
    game=new Phaser.Game({
      type:Phaser.AUTO,parent:"phaserBattlefield",width:host.clientWidth,height:host.clientHeight,
      backgroundColor:"#111820",render:{antialias:true,pixelArt:false,roundPixels:true},
      scale:{mode:Phaser.Scale.NONE},scene:{create:createScene}
    });
  }

  function addTerrainDetail(scene,cell,cx,cy){
    if(cell.classList.contains("forest")){
      scene.add.text(cx,cy-26,"🌲",{fontSize:"24px"}).setOrigin(.5,1).setDepth(9);
    }else if(cell.classList.contains("water")){
      scene.add.text(cx,cy-5,"≈",{fontSize:"22px",color:"#a9e5ff"}).setOrigin(.5).setDepth(8);
    }else if(cell.classList.contains("wall")){
      const b=scene.add.rectangle(cx,cy-20,46,42,0x747b85,1).setStrokeStyle(2,0xaab0b8,1).setDepth(10);
      scene.add.rectangle(cx,cy-42,46,8,0x9299a2,1).setDepth(11);
    }else if(cell.classList.contains("high_ground")){
      scene.add.text(cx,cy-10,"▲",{fontSize:"17px",color:"#f2e6b4"}).setOrigin(.5).setDepth(8);
    }
  }

  function addUnit(scene,cell,cx,cy,row){
    const domUnit=cell.querySelector(".unit");if(!domUnit)return;
    const player=domUnit.classList.contains("player"),finished=domUnit.classList.contains("finished");
    const data=labelFromUnit(domUnit);
    const depth=50+row*10;
    const group=scene.add.container(cx,cy-35).setDepth(depth);
    group.add(scene.add.ellipse(0,35,58,18,0x000000,.38));
    const body=scene.add.rectangle(0,0,62,78,player?0x285f9f:0x9b3d3d,.98)
      .setStrokeStyle(3,cell.classList.contains("selected")?0xffffff:0xd6dce5,.95).setAlpha(finished?.48:1);
    group.add(body);
    group.add(scene.add.text(0,-10,data.name,{fontFamily:"system-ui, sans-serif",fontSize:"13px",fontStyle:"bold",color:"#fff",stroke:"#071018",strokeThickness:3,align:"center",wordWrap:{width:56}}).setOrigin(.5));
    group.add(scene.add.text(0,19,"HP "+data.hp,{fontFamily:"system-ui, sans-serif",fontSize:"11px",color:"#fff",stroke:"#071018",strokeThickness:3}).setOrigin(.5));
  }

  function draw(scene){
    if(!visibleBattle())return;
    scene.children.removeAll();
    const list=cells(),size=worldSize(),cam=scene.cameras.main;
    cam.setBounds(0,0,size.w,size.h);

    list.forEach((cell,i)=>{
      const x=i%COLS,y=Math.floor(i/COLS),p=iso(x,y);
      const g=scene.add.graphics().setDepth(1+y);
      g.fillStyle(colorFor(cell),1);diamond(g,p.x,p.y);g.fillPath();
      g.lineStyle(2,0x83909a,.72);diamond(g,p.x,p.y);g.strokePath();

      if(cell.classList.contains("high_ground")){
        const side=scene.add.graphics().setDepth(.5+y);
        side.fillStyle(0x4c442c,.9);
        side.beginPath();side.moveTo(p.x-TILE_W/2,p.y);side.lineTo(p.x,p.y+TILE_H/2);side.lineTo(p.x,p.y+TILE_H/2+15);side.lineTo(p.x-TILE_W/2,p.y+15);side.closePath();side.fillPath();
      }
      if(cell.classList.contains("reachable"))outline(scene,p.x,p.y,0x4da6ff,5);
      if(cell.classList.contains("attackable"))outline(scene,p.x,p.y,0xff5e5e,5);
      if(cell.classList.contains("deployable"))outline(scene,p.x,p.y,0x70e38b,5);
      if(cell.classList.contains("tile-inspected"))outline(scene,p.x,p.y,0xffd166,4,1,.78);

      addTerrainDetail(scene,cell,p.x,p.y);
      const flag=cell.querySelector(".capture-flag")?.textContent?.trim();
      if(flag)scene.add.text(p.x,p.y-30,flag,{fontSize:"19px",color:"#f2d27a",stroke:"#000",strokeThickness:3}).setOrigin(.5).setDepth(20+y);
      addUnit(scene,cell,p.x,p.y,y);
    });

    if(!cam.__ctInitial){
      const fit=Math.min(host.clientWidth/size.w,host.clientHeight/size.h);
      cam.setZoom(Phaser.Math.Clamp(Math.max(.72,fit*1.22),.65,1.3));
      const center=iso((COLS-1)/2,(rows()-1)/2);
      cam.centerOn(center.x,center.y+30);cam.__ctInitial=true;
    }
  }

  function clickWorld(scene,pointer){
    const w=pointer.positionToCamera(scene.cameras.main),g=gridFromWorld(w.x,w.y);
    if(g.x<0||g.x>=COLS||g.y<0||g.y>=rows())return;
    cells()[g.y*COLS+g.x]?.click();
  }

  function createScene(){
    sceneRef=this;this.input.addPointer(2);draw(this);
    this.input.on("pointerdown",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        pinchStart={distance:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),zoom:this.cameras.main.zoom};
        dragStart=null;return;
      }
      dragStart={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};
    });
    this.input.on("pointermove",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);
        if(pinchStart?.distance)this.cameras.main.setZoom(Phaser.Math.Clamp(pinchStart.zoom*d/pinchStart.distance,.62,1.85));
        return;
      }
      if(!p.isDown||!dragStart)return;
      const dx=p.x-dragStart.x,dy=p.y-dragStart.y;if(Math.abs(dx)+Math.abs(dy)>8)dragStart.moved=true;
      this.cameras.main.scrollX=dragStart.scrollX-dx/this.cameras.main.zoom;this.cameras.main.scrollY=dragStart.scrollY-dy/this.cameras.main.zoom;
    });
    this.input.on("pointerup",p=>{if(dragStart&&!dragStart.moved)clickWorld(this,p);dragStart=null;if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinchStart=null;});
    this.input.on("wheel",(_p,_go,_dx,dy)=>{const cam=this.cameras.main;cam.setZoom(Phaser.Math.Clamp(cam.zoom*(dy>0?.9:1.1),.62,1.85));});
  }

  new MutationObserver(queueDraw).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  new MutationObserver(queueDraw).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
  if(window.ResizeObserver)new ResizeObserver(queueDraw).observe(host);
  window.addEventListener("cardtactics:state",queueDraw);window.addEventListener("resize",queueDraw);queueDraw();
})();