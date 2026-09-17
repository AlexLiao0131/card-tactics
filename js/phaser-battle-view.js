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
  const TILE=112;
  const TERRAIN={
    plain:0x344537,mud:0x604a34,forest:0x1d5531,
    high_ground:0x665a35,water:0x1b5270,wall:0x50555d
  };
  let game=null,sceneRef=null,redrawQueued=false,dragStart=null,pinchStart=null;

  function cells(){return [...source.children].filter(el=>el.classList.contains("tile"));}
  function rows(){return Math.max(1,Math.ceil(cells().length/COLS));}
  function colorFor(cell){
    for(const key of Object.keys(TERRAIN))if(cell.classList.contains(key))return TERRAIN[key];
    return TERRAIN.plain;
  }
  function labelFromUnit(unit){
    const raw=(unit?.textContent||"").trim().replace(/\s+/g," ");
    const hp=(raw.match(/(\d+)\s*$/)||[])[1]||"";
    return {name:raw.replace(/\d+\s*$/,"").trim()||"?",hp};
  }
  function visibleBattle(){
    return battleScreen.classList.contains("active")&&host.clientWidth>10&&host.clientHeight>10;
  }

  function queueDraw(){
    if(redrawQueued)return;
    redrawQueued=true;
    requestAnimationFrame(()=>{
      redrawQueued=false;
      ensureStarted();
      if(sceneRef&&visibleBattle()){
        game.scale.resize(host.clientWidth,host.clientHeight);
        draw(sceneRef);
      }
    });
  }

  function ensureStarted(){
    if(game||!visibleBattle())return;
    if(!window.Phaser){
      host.innerHTML='<div class="phaser-error">戰場載入失敗：Phaser 未載入。請重新整理頁面。</div>';
      return;
    }
    game=new Phaser.Game({
      type:Phaser.AUTO,
      parent:"phaserBattlefield",
      width:host.clientWidth,
      height:host.clientHeight,
      backgroundColor:"#111820",
      render:{antialias:true,pixelArt:false,roundPixels:true},
      scale:{mode:Phaser.Scale.NONE},
      scene:{create:createScene}
    });
  }

  function addUnit(scene,cell,cx,cy){
    const domUnit=cell.querySelector(".unit");
    if(!domUnit)return;
    const player=domUnit.classList.contains("player");
    const finished=domUnit.classList.contains("finished");
    const data=labelFromUnit(domUnit);
    const group=scene.add.container(cx,cy).setDepth(20);
    group.add(scene.add.ellipse(0,TILE*.31,TILE*.62,TILE*.18,0x000000,.35));
    const body=scene.add.rectangle(0,0,TILE*.70,TILE*.78,player?0x285f9f:0x9b3d3d,.98)
      .setStrokeStyle(3,cell.classList.contains("selected")?0xffffff:0xd6dce5,.95)
      .setAlpha(finished?.48:1);
    group.add(body);
    const name=scene.add.text(0,-TILE*.13,data.name,{
      fontFamily:"system-ui, sans-serif",fontSize:"16px",fontStyle:"bold",
      color:"#ffffff",stroke:"#071018",strokeThickness:4,align:"center",
      wordWrap:{width:TILE*.66}
    }).setOrigin(.5);
    const hp=scene.add.text(0,TILE*.19,"HP "+data.hp,{
      fontFamily:"system-ui, sans-serif",fontSize:"13px",
      color:"#ffffff",stroke:"#071018",strokeThickness:3
    }).setOrigin(.5);
    group.add([name,hp]);
  }

  function draw(scene){
    if(!visibleBattle())return;
    scene.children.removeAll();
    const list=cells(),r=rows(),worldW=COLS*TILE,worldH=r*TILE;
    const cam=scene.cameras.main;
    cam.setBounds(0,0,worldW,worldH);

    list.forEach((cell,i)=>{
      const x=i%COLS,y=Math.floor(i/COLS),cx=x*TILE+TILE/2,cy=y*TILE+TILE/2;
      const g=scene.add.graphics().setDepth(1);
      g.fillStyle(colorFor(cell),1).fillRect(x*TILE+2,y*TILE+2,TILE-4,TILE-4);
      g.lineStyle(1,0x75808c,.6).strokeRect(x*TILE+2,y*TILE+2,TILE-4,TILE-4);
      if(cell.classList.contains("reachable"))g.lineStyle(5,0x4da6ff,1).strokeRect(x*TILE+5,y*TILE+5,TILE-10,TILE-10);
      if(cell.classList.contains("attackable"))g.lineStyle(5,0xff5e5e,1).strokeRect(x*TILE+5,y*TILE+5,TILE-10,TILE-10);
      if(cell.classList.contains("deployable"))g.lineStyle(5,0x70e38b,1).strokeRect(x*TILE+5,y*TILE+5,TILE-10,TILE-10);
      if(cell.classList.contains("tile-inspected"))g.lineStyle(4,0xffd166,1).strokeRect(x*TILE+8,y*TILE+8,TILE-16,TILE-16);
      const icon=cell.querySelector(".icon")?.textContent?.trim();
      if(icon)scene.add.text(x*TILE+8,y*TILE+7,icon,{fontSize:"20px"}).setDepth(5);
      const elev=cell.querySelector(".elev")?.textContent?.trim();
      if(elev)scene.add.text((x+1)*TILE-8,y*TILE+8,elev,{fontSize:"13px",color:"#fff",stroke:"#000",strokeThickness:3}).setOrigin(1,0).setDepth(5);
      const flag=cell.querySelector(".capture-flag")?.textContent?.trim();
      if(flag)scene.add.text(cx,y*TILE+8,flag,{fontSize:"20px",color:"#f2d27a",stroke:"#000",strokeThickness:3}).setOrigin(.5,0).setDepth(6);
      addUnit(scene,cell,cx,cy);
    });

    if(!cam.__ctInitial){
      const fit=Math.min(host.clientWidth/worldW,host.clientHeight/worldH);
      cam.setZoom(Phaser.Math.Clamp(Math.max(.82,fit*1.15),.65,1.35));
      cam.centerOn(worldW/2,worldH/2);
      cam.__ctInitial=true;
    }
  }

  function clickWorld(scene,pointer){
    const world=pointer.positionToCamera(scene.cameras.main);
    const x=Math.floor(world.x/TILE),y=Math.floor(world.y/TILE);
    if(x<0||x>=COLS||y<0||y>=rows())return;
    cells()[y*COLS+x]?.click();
  }

  function createScene(){
    sceneRef=this;
    this.input.addPointer(2);
    draw(this);

    this.input.on("pointerdown",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        pinchStart={
          distance:Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y),
          zoom:this.cameras.main.zoom
        };
        dragStart=null;return;
      }
      dragStart={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};
    });
    this.input.on("pointermove",p=>{
      if(this.input.pointer1.isDown&&this.input.pointer2.isDown){
        const d=Phaser.Math.Distance.Between(this.input.pointer1.x,this.input.pointer1.y,this.input.pointer2.x,this.input.pointer2.y);
        if(pinchStart?.distance)this.cameras.main.setZoom(Phaser.Math.Clamp(pinchStart.zoom*d/pinchStart.distance,.65,1.8));
        return;
      }
      if(!p.isDown||!dragStart)return;
      const dx=p.x-dragStart.x,dy=p.y-dragStart.y;
      if(Math.abs(dx)+Math.abs(dy)>8)dragStart.moved=true;
      this.cameras.main.scrollX=dragStart.scrollX-dx/this.cameras.main.zoom;
      this.cameras.main.scrollY=dragStart.scrollY-dy/this.cameras.main.zoom;
    });
    this.input.on("pointerup",p=>{
      if(dragStart&&!dragStart.moved)clickWorld(this,p);
      dragStart=null;
      if(!(this.input.pointer1.isDown&&this.input.pointer2.isDown))pinchStart=null;
    });
    this.input.on("wheel",(_p,_go,_dx,dy)=>{
      const cam=this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom*(dy>0?.9:1.1),.65,1.8));
    });
  }

  new MutationObserver(queueDraw).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  new MutationObserver(queueDraw).observe(battleScreen,{attributes:true,attributeFilter:["class"]});
  if(window.ResizeObserver)new ResizeObserver(queueDraw).observe(host);
  window.addEventListener("cardtactics:state",queueDraw);
  window.addEventListener("resize",queueDraw);
  queueDraw();
})();