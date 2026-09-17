(()=>{
  "use strict";
  const host=document.getElementById("phaserBattlefield");
  const source=document.getElementById("battlefield");
  if(!host||!source||!window.Phaser){
    console.warn("Card Tactics Phaser Battle View: Phaser or battlefield host missing.");
    return;
  }

  const COLS=8;
  const TERRAIN={
    plain:0x344537,mud:0x604a34,forest:0x1d5531,
    high_ground:0x665a35,water:0x1b5270,wall:0x50555d
  };
  let sceneRef=null, redrawQueued=false, dragStart=null, pinchStart=null;

  function cells(){ return [...source.children].filter(el=>el.classList.contains("tile")); }
  function rows(){ return Math.max(1,Math.ceil(cells().length/COLS)); }
  function tileSize(){ return 112; }

  function queueDraw(){
    if(redrawQueued)return;
    redrawQueued=true;
    requestAnimationFrame(()=>{redrawQueued=false;if(sceneRef)draw(sceneRef);});
  }

  function colorFor(cell){
    for(const key of Object.keys(TERRAIN))if(cell.classList.contains(key))return TERRAIN[key];
    return TERRAIN.plain;
  }

  function labelFromUnit(unit){
    if(!unit)return null;
    const raw=unit.textContent.trim().replace(/\s+/g," ");
    const hp=(raw.match(/(\d+)\s*$/)||[])[1]||"";
    const name=raw.replace(/\d+\s*$/,"").trim()||"?";
    return {name,hp};
  }

  function addUnit(scene,cell,cx,cy,size){
    const domUnit=cell.querySelector(".unit");
    if(!domUnit)return;
    const player=domUnit.classList.contains("player");
    const finished=domUnit.classList.contains("finished");
    const data=labelFromUnit(domUnit);
    const group=scene.add.container(cx,cy).setDepth(20);

    const shadow=scene.add.ellipse(0,size*.31,size*.62,size*.18,0x000000,.35);
    const body=scene.add.rectangle(0,0,size*.70,size*.78,player?0x285f9f:0x9b3d3d,.98)
      .setStrokeStyle(Math.max(2,size*.025),cell.classList.contains("selected")?0xffffff:0xd6dce5,.95);
    body.setAlpha(finished?.48:1);
    group.add([shadow,body]);

    const img=domUnit.querySelector("img");
    if(img?.getAttribute("src")){
      const key="ct-unit-"+img.getAttribute("src");
      if(scene.textures.exists(key)){
        const sprite=scene.add.image(0,-size*.03,key);
        const scale=Math.min(size*.64/sprite.width,size*.58/sprite.height);
        sprite.setScale(scale).setAlpha(finished?.48:1);
        group.add(sprite);
      }
    }

    const name=scene.add.text(0,-size*.17,data.name,{
      fontFamily:"system-ui, sans-serif",fontSize:Math.max(12,size*.14)+"px",
      fontStyle:"bold",color:"#ffffff",stroke:"#071018",strokeThickness:3,
      align:"center",wordWrap:{width:size*.64}
    }).setOrigin(.5);
    const hp=scene.add.text(0,size*.19,"HP "+data.hp,{
      fontFamily:"system-ui, sans-serif",fontSize:Math.max(11,size*.12)+"px",
      color:"#ffffff",stroke:"#071018",strokeThickness:3
    }).setOrigin(.5);
    group.add([name,hp]);
  }

  function draw(scene){
    scene.children.removeAll();
    const list=cells(), size=tileSize(), r=rows();
    scene.cameras.main.setBounds(0,0,COLS*size,r*size);

    list.forEach((cell,i)=>{
      const x=i%COLS,y=Math.floor(i/COLS),cx=x*size+size/2,cy=y*size+size/2;
      const g=scene.add.graphics().setDepth(1);
      g.fillStyle(colorFor(cell),1).fillRect(x*size+2,y*size+2,size-4,size-4);
      g.lineStyle(1,0x75808c,.6).strokeRect(x*size+2,y*size+2,size-4,size-4);

      if(cell.classList.contains("reachable"))g.lineStyle(5,0x4da6ff,1).strokeRect(x*size+5,y*size+5,size-10,size-10);
      if(cell.classList.contains("attackable"))g.lineStyle(5,0xff5e5e,1).strokeRect(x*size+5,y*size+5,size-10,size-10);
      if(cell.classList.contains("deployable"))g.lineStyle(5,0x70e38b,1).strokeRect(x*size+5,y*size+5,size-10,size-10);
      if(cell.classList.contains("tile-inspected"))g.lineStyle(4,0xffd166,1).strokeRect(x*size+8,y*size+8,size-16,size-16);

      const icon=cell.querySelector(".icon")?.textContent?.trim();
      if(icon)scene.add.text(x*size+8,y*size+7,icon,{fontSize:"20px"}).setDepth(5);
      const elev=cell.querySelector(".elev")?.textContent?.trim();
      if(elev)scene.add.text((x+1)*size-8,y*size+8,elev,{fontSize:"13px",color:"#ffffff",stroke:"#000",strokeThickness:3}).setOrigin(1,0).setDepth(5);
      const flag=cell.querySelector(".capture-flag")?.textContent?.trim();
      if(flag)scene.add.text(cx,y*size+8,flag,{fontSize:"20px",color:"#f2d27a",stroke:"#000",strokeThickness:3}).setOrigin(.5,0).setDepth(6);

      addUnit(scene,cell,cx,cy,size);
    });

    const worldW=COLS*size,worldH=r*size,cam=scene.cameras.main;
    if(!cam.__ctInitial){
      const fit=Math.min(host.clientWidth/worldW,host.clientHeight/worldH);
      cam.setZoom(Math.max(.72,Math.min(1.15,fit*1.15)));
      cam.centerOn(worldW/2,worldH/2);
      cam.__ctInitial=true;
    }
  }

  function clickWorld(scene,pointer){
    const size=tileSize(),world=pointer.positionToCamera(scene.cameras.main);
    const x=Math.floor(world.x/size),y=Math.floor(world.y/size);
    if(x<0||x>=COLS||y<0||y>=rows())return;
    const cell=cells()[y*COLS+x];
    if(cell)cell.click();
  }

  class BattleScene extends Phaser.Scene{
    constructor(){super("CardTacticsBattle");}
    preload(){
      const seen=new Set();
      cells().forEach(cell=>{
        const src=cell.querySelector(".unit img")?.getAttribute("src");
        if(src&&!seen.has(src)){seen.add(src);this.load.image("ct-unit-"+src,src);}
      });
    }
    create(){
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
          if(pinchStart?.distance){
            this.cameras.main.setZoom(Phaser.Math.Clamp(pinchStart.zoom*(d/pinchStart.distance),.65,1.8));
          }
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
      this.input.on("wheel",(pointer,_go,_dx,dy)=>{
        const cam=this.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom*(dy>0?.9:1.1),.65,1.8));
      });
    }
  }

  new Phaser.Game({
    type:Phaser.AUTO,
    parent:"phaserBattlefield",
    backgroundColor:"#111820",
    transparent:false,
    scale:{mode:Phaser.Scale.RESIZE,width:"100%",height:"100%"},
    render:{antialias:true,pixelArt:false,roundPixels:true},
    scene:[BattleScene]
  });

  new MutationObserver(queueDraw).observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  window.addEventListener("cardtactics:state",queueDraw);
  window.addEventListener("resize",queueDraw);
})();