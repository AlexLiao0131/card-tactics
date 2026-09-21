window.MapGenerator=(()=>{
  "use strict";

  const SIZE_PRESETS=Object.freeze({
    SMALL:Object.freeze({id:"SMALL",label:"小型",width:14,height:10,minElevation:-2,maxElevation:4,forestClusters:3,rocks:4}),
    MEDIUM:Object.freeze({id:"MEDIUM",label:"中型",width:20,height:14,minElevation:-3,maxElevation:5,forestClusters:5,rocks:6}),
    LARGE:Object.freeze({id:"LARGE",label:"大型",width:26,height:18,minElevation:-4,maxElevation:6,forestClusters:7,rocks:8}),
    XLARGE:Object.freeze({id:"XLARGE",label:"超大型",width:32,height:22,minElevation:-4,maxElevation:7,forestClusters:9,rocks:11})
  });

  const key=(x,y)=>`${x},${y}`;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const inBounds=(w,h,x,y)=>x>=0&&y>=0&&x<w&&y<h;

  function hashSeed(seed){
    const text=String(seed??"CARD_TACTICS");
    let h=2166136261>>>0;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619)>>>0;
    }
    return h||0x6d2b79f5;
  }

  function createRandom(seed){
    let a=hashSeed(seed)>>>0;
    return()=>{
      a=(a+0x6D2B79F5)>>>0;
      let t=a;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function randomSeed(){
    if(globalThis.crypto?.getRandomValues){
      const buffer=new Uint32Array(1);globalThis.crypto.getRandomValues(buffer);return buffer[0]>>>0;
    }
    return ((Date.now()>>>0)^Math.floor(Math.random()*0xffffffff))>>>0;
  }

  function preset(size){return SIZE_PRESETS[String(size||"MEDIUM").toUpperCase()]||SIZE_PRESETS.MEDIUM}
  function tileAt(map,x,y){return map.tiles.find(tile=>tile.x===x&&tile.y===y)||null}

  function smoothField(field,width,height,passes=4){
    let current=field;
    for(let pass=0;pass<passes;pass++){
      const next=Array.from({length:height},()=>Array(width).fill(0));
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        let total=current[y][x]*2,weight=2;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const nx=x+dx,ny=y+dy;if(!inBounds(width,height,nx,ny))continue;
          const w=dx===0||dy===0?1:.55;total+=current[ny][nx]*w;weight+=w;
        }
        next[y][x]=total/weight;
      }
      current=next;
    }
    return current;
  }

  function createElevationField(width,height,config,rand){
    const half=Math.ceil(width/2);
    let field=Array.from({length:height},()=>Array(width).fill(0));
    for(let y=0;y<height;y++)for(let x=0;x<half;x++){
      const value=rand()*2-1,mirror=width-1-x;
      field[y][x]=value;field[y][mirror]=value;
    }
    field=smoothField(field,width,height,4);

    const featureCount=Math.max(4,Math.round((width*height)/90));
    for(let n=0;n<featureCount;n++){
      const cx=2+rand()*Math.max(1,half-4),cy=1+rand()*Math.max(1,height-2),mirror=width-1-cx;
      const radius=2.4+rand()*Math.max(2,Math.min(width,height)*.24);
      const amplitude=(rand()<.43?-1:1)*(1.4+rand()*2.7);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const d1=Math.hypot(x-cx,y-cy),d2=Math.hypot(x-mirror,y-cy),d=Math.min(d1,d2);
        if(d>radius)continue;
        const t=1-d/radius,s=t*t*(3-2*t);
        field[y][x]+=amplitude*s;
      }
    }

    const elevations=Array.from({length:height},()=>Array(width).fill(0));
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const centerBias=.75;
      const value=field[y][x]*2.25+centerBias;
      elevations[y][x]=clamp(Math.round(value),config.minElevation,config.maxElevation);
    }
    return elevations;
  }

  function setDry(tile,{elevation=0,terrain="PLAIN"}={}){
    tile.elevation=elevation;tile.terrain=terrain;tile.waterDepth=0;tile.waterSurfaceZ=null;
    delete tile.dryTerrain;delete tile.soilMoisture;
  }

  function applyTerrain(map,elevations){
    for(const tile of map.tiles){
      const e=elevations[tile.y][tile.x];tile.elevation=e;
      if(e<0){
        tile.terrain="WATER";tile.waterDepth=Math.abs(e);tile.waterSurfaceZ=0;tile.dryTerrain="PLAIN";tile.soilMoisture=1;
      }else{
        tile.terrain=e>=2?"HIGH_GROUND":"PLAIN";tile.waterDepth=0;tile.waterSurfaceZ=null;
      }
    }
  }

  function carveTile(map,x,y,protectedKeys,{elevation=0}={}){
    const tile=tileAt(map,x,y);if(!tile)return;
    setDry(tile,{elevation,terrain:elevation>=2?"HIGH_GROUND":"PLAIN"});protectedKeys.add(key(x,y));
  }

  function carveBaseZones(map,protectedKeys){
    const mid=Math.floor(map.height/2),half=Math.max(2,Math.floor(map.height*.18)),depth=map.width>=26?3:2;
    const playerCore={x:0,y:mid},enemyCore={x:map.width-1,y:mid};
    for(let y=mid-half;y<=mid+half;y++)for(let x=0;x<depth;x++){
      if(inBounds(map.width,map.height,x,y))carveTile(map,x,y,protectedKeys,{elevation:0});
      const mx=map.width-1-x;if(inBounds(map.width,map.height,mx,y))carveTile(map,mx,y,protectedKeys,{elevation:0});
    }
    carveTile(map,playerCore.x,playerCore.y,protectedKeys,{elevation:0});
    carveTile(map,enemyCore.x,enemyCore.y,protectedKeys,{elevation:0});
    return{mid,half,depth,playerCore,enemyCore};
  }

  function carvePath(map,start,end,protectedKeys,rand){
    let x=start.x,y=start.y;carveTile(map,x,y,protectedKeys,{elevation:0});
    let guard=map.width*map.height*2;
    while((x!==end.x||y!==end.y)&&guard-->0){
      const dx=Math.sign(end.x-x),dy=Math.sign(end.y-y);
      const preferX=x!==end.x&&(y===end.y||rand()<.68);
      if(preferX)x+=dx;else if(y!==end.y)y+=dy;else x+=dx;
      if(!inBounds(map.width,map.height,x,y))break;
      carveTile(map,x,y,protectedKeys,{elevation:0});
    }
  }

  function zoneTiles(map,x0,y0,w=2,h=2){
    const out=[];for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const tile=tileAt(map,x,y);if(tile)out.push(tile);}return out;
  }

  function captureCandidate(map,targetY){
    const baseX=Math.floor(map.width/2)-1,candidates=[];
    for(let oy=-3;oy<=3;oy++)for(let ox=-2;ox<=2;ox++){
      const x0=clamp(baseX+ox,2,map.width-4),y0=clamp(targetY+oy,1,map.height-3),tiles=zoneTiles(map,x0,y0,2,2);
      if(tiles.length<4)continue;
      const deep=tiles.filter(t=>Number(t.waterDepth||0)>.75).length;
      const avg=tiles.reduce((n,t)=>n+Number(t.elevation||0),0)/tiles.length;
      const variance=tiles.reduce((n,t)=>n+Math.abs(Number(t.elevation||0)-avg),0);
      const forests=tiles.filter(t=>t.terrain==="FOREST").length;
      const distance=Math.abs(y0-targetY)+Math.abs(x0-baseX)*.6;
      candidates.push({x0,y0,tiles,score:deep*20+variance*2+distance-forests*.35});
    }
    candidates.sort((a,b)=>a.score-b.score||a.y0-b.y0||a.x0-b.x0);
    return candidates[0]||null;
  }

  function areaAround(map,tiles,radius=1){
    const seen=new Set(),out=[];
    for(const tile of tiles)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const x=tile.x+dx,y=tile.y+dy,k=key(x,y);if(seen.has(k)||!inBounds(map.width,map.height,x,y))continue;
      seen.add(k);out.push({x,y});
    }
    return out;
  }

  function pointName(prefix,map,tiles){
    const avg=tiles.reduce((n,t)=>n+Number(t.elevation||0),0)/Math.max(1,tiles.length);
    const forest=tiles.filter(t=>t.terrain==="FOREST").length;
    let waterAdj=0;
    for(const tile of tiles)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(Number(tileAt(map,tile.x+dx,tile.y+dy)?.waterDepth||0)>0)waterAdj++;
    const type=avg>=2?"高地":forest>=2?"林地":waterAdj>=3?"渡口":"據點";
    return `${prefix}${type}`;
  }

  function createCapturePoints(map,protectedKeys,rand,baseInfo){
    const targets=[Math.round(map.height*.24),Math.round(map.height*.5)-1,Math.round(map.height*.74)-1];
    const labels=["北側","中央","南側"],ids=["north_outpost","center_outpost","south_outpost"],points=[];
    for(let i=0;i<targets.length;i++){
      let candidate=captureCandidate(map,targets[i]);
      if(!candidate){candidate={x0:Math.floor(map.width/2)-1,y0:clamp(targets[i],1,map.height-3),tiles:[]};candidate.tiles=zoneTiles(map,candidate.x0,candidate.y0,2,2);}
      if(candidate.tiles.some(t=>Number(t.waterDepth||0)>.75))candidate.tiles.forEach(tile=>setDry(tile,{elevation:0,terrain:"PLAIN"}));
      candidate.tiles.forEach(tile=>protectedKeys.add(key(tile.x,tile.y)));
      const center={x:candidate.x0,y:candidate.y0};
      carvePath(map,{x:baseInfo.depth-1,y:baseInfo.mid},center,protectedKeys,rand);
      carvePath(map,{x:map.width-baseInfo.depth,y:baseInfo.mid},{x:candidate.x0+1,y:candidate.y0+1},protectedKeys,rand);
      const captureTiles=candidate.tiles.map(tile=>({x:tile.x,y:tile.y}));
      points.push({
        id:ids[i],name:pointName(labels[i],map,candidate.tiles),owner:"NEUTRAL",capturable:true,
        captureTiles,area:areaAround(map,candidate.tiles,1)
      });
    }
    return points;
  }

  function paintForestCluster(map,cx,cy,radius,rand,protectedKeys){
    for(let y=Math.floor(cy-radius);y<=Math.ceil(cy+radius);y++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
      if(!inBounds(map.width,map.height,x,y)||protectedKeys.has(key(x,y)))continue;
      const tile=tileAt(map,x,y);if(!tile||Number(tile.waterDepth||0)>0||tile.elevation<0)continue;
      const dx=(x-cx)/radius,dy=(y-cy)/(radius*.8),d=Math.hypot(dx,dy);
      if(d>1||d>0.62+rand()*.5)continue;
      tile.terrain="FOREST";
    }
  }


  function ensureTerrainVariety(map,config,rand,protectedKeys){
    const total=map.tiles.length,minWater=Math.max(6,Math.round(total*.07)),minHigh=Math.max(6,Math.round(total*.07));
    const paintLake=(cx,cy)=>{
      const radius=2.2+rand()*Math.max(1.2,Math.min(map.width,map.height)*.08),maxDepth=Math.max(2,Math.min(Math.abs(config.minElevation),4));
      for(let y=Math.floor(cy-radius);y<=Math.ceil(cy+radius);y++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
        if(!inBounds(map.width,map.height,x,y)||protectedKeys.has(key(x,y)))continue;
        const tile=tileAt(map,x,y),d=Math.hypot((x-cx)/radius,(y-cy)/(radius*.8));if(!tile||d>1)continue;
        const depth=clamp(Math.max(1,Math.round((1-d)*maxDepth)),1,maxDepth);
        tile.elevation=-depth;tile.terrain="WATER";tile.waterDepth=depth;tile.waterSurfaceZ=0;tile.dryTerrain="PLAIN";tile.soilMoisture=1;
      }
    };
    const paintHill=(cx,cy)=>{
      const radius=2.2+rand()*Math.max(1.2,Math.min(map.width,map.height)*.08),peak=Math.max(3,Math.min(config.maxElevation,6));
      for(let y=Math.floor(cy-radius);y<=Math.ceil(cy+radius);y++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
        if(!inBounds(map.width,map.height,x,y)||protectedKeys.has(key(x,y)))continue;
        const tile=tileAt(map,x,y),d=Math.hypot((x-cx)/radius,(y-cy)/(radius*.85));if(!tile||d>1)continue;
        const height=clamp(Math.max(1,Math.round((1-d)*peak)),1,peak);
        setDry(tile,{elevation:height,terrain:height>=2?"HIGH_GROUND":"PLAIN"});
      }
    };
    let water=map.tiles.filter(t=>Number(t.waterDepth||0)>0).length;
    if(water<minWater){
      const cx=clamp(Math.round(map.width*.28),3,Math.floor(map.width/2)-2),cy=clamp(Math.round(map.height*(.25+rand()*.5)),2,map.height-3);
      paintLake(cx,cy);paintLake(map.width-1-cx,cy);
    }
    let high=map.tiles.filter(t=>t.terrain==="HIGH_GROUND").length;
    if(high<minHigh){
      const cx=clamp(Math.round(map.width*.34),3,Math.floor(map.width/2)-2),cy=clamp(Math.round(map.height*(.2+rand()*.6)),2,map.height-3);
      paintHill(cx,cy);paintHill(map.width-1-cx,cy);
    }
  }

  function addForests(map,config,rand,protectedKeys){
    const half=Math.floor(map.width/2);
    for(let i=0;i<config.forestClusters;i++){
      const cx=2+rand()*Math.max(2,half-4),cy=1+rand()*Math.max(2,map.height-2),radius=2.1+rand()*Math.max(1.7,map.height*.13);
      paintForestCluster(map,cx,cy,radius,rand,protectedKeys);
      paintForestCluster(map,map.width-1-cx,cy,radius,rand,protectedKeys);
    }
  }


  function ensureForestCoverage(map,config,rand,protectedKeys){
    const target=Math.max(8,Math.round(map.tiles.length*.12));
    let count=map.tiles.filter(t=>t.terrain==="FOREST").length;if(count>=target)return;
    const half=Math.ceil(map.width/2);
    const candidates=map.tiles.filter(t=>t.x<half&&!protectedKeys.has(key(t.x,t.y))&&Number(t.waterDepth||0)<=0&&t.elevation>=0);
    candidates.sort((a,b)=>{
      const da=Math.abs(a.x-map.width*.28)+Math.abs(a.y-map.height*.5),db=Math.abs(b.x-map.width*.28)+Math.abs(b.y-map.height*.5);return da-db;
    });
    for(const tile of candidates){
      if(count>=target)break;
      if(rand()>=.72&&count>=target*.55)continue;
      for(const x of new Set([tile.x,map.width-1-tile.x])){
        const mirror=tileAt(map,x,tile.y);if(!mirror||protectedKeys.has(key(x,tile.y))||Number(mirror.waterDepth||0)>0||mirror.elevation<0||mirror.terrain==="FOREST")continue;
        mirror.terrain="FOREST";count++;
      }
    }
  }

  function addRocks(map,config,rand,protectedKeys){
    const candidates=map.tiles.filter(tile=>!protectedKeys.has(key(tile.x,tile.y))&&tile.terrain==="HIGH_GROUND"&&Number(tile.waterDepth||0)<=0);
    const objects=[];
    for(let i=0;i<config.rocks&&candidates.length;i++){
      const index=Math.floor(rand()*candidates.length),tile=candidates.splice(index,1)[0];
      objects.push({id:`generated_rock_${i}`,x:tile.x,y:tile.y,type:"ROCK",environment:"STONE",destructible:true,blocksMovement:true,breaksIntoTerrain:"PLAIN"});
    }
    return objects;
  }

  function buildBaseArea(map,owner,baseInfo){
    const out=[];
    const left=owner==="PLAYER",core=left?baseInfo.playerCore:baseInfo.enemyCore;
    for(let y=baseInfo.mid-baseInfo.half;y<=baseInfo.mid+baseInfo.half;y++)for(let i=0;i<baseInfo.depth;i++){
      const x=left?i:map.width-1-i;if(!inBounds(map.width,map.height,x,y)||(x===core.x&&y===core.y))continue;
      out.push({x,y});
    }
    return out;
  }

  function stats(map){
    const elevations=map.tiles.map(t=>Number(t.elevation||0));
    return{
      minElevation:Math.min(...elevations),maxElevation:Math.max(...elevations),
      waterTiles:map.tiles.filter(t=>Number(t.waterDepth||0)>0).length,
      forestTiles:map.tiles.filter(t=>t.terrain==="FOREST").length,
      highGroundTiles:map.tiles.filter(t=>t.terrain==="HIGH_GROUND").length
    };
  }

  function generateVersus({size="MEDIUM",seed=randomSeed(),coreRules={}}={}){
    const config=preset(size),resolvedSeed=Number(seed)>>>0,rand=createRandom(resolvedSeed),width=config.width,height=config.height;
    const map={id:`generated_versus_${config.id.toLowerCase()}_${resolvedSeed}`,name:`Generated ${config.label}`,width,height,tiles:[],objects:[],generated:true,seed:resolvedSeed,size:config.id};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)map.tiles.push({x,y,terrain:"PLAIN",elevation:0});

    applyTerrain(map,createElevationField(width,height,config,rand));
    const protectedKeys=new Set(),baseInfo=carveBaseZones(map,protectedKeys);
    carvePath(map,{x:baseInfo.depth-1,y:baseInfo.mid},{x:width-baseInfo.depth,y:baseInfo.mid},protectedKeys,rand);
    const capturePoints=createCapturePoints(map,protectedKeys,rand,baseInfo);
    ensureTerrainVariety(map,config,rand,protectedKeys);
    addForests(map,config,rand,protectedKeys);
    ensureForestCoverage(map,config,rand,protectedKeys);
    const rocks=addRocks(map,config,rand,protectedKeys);

    const hp=Math.max(1,Number(coreRules.hp||600)),shield=Math.max(0,Number(coreRules.shield||360)),defense=Math.max(0,Number(coreRules.defense||30));
    const cores=[
      {id:"player_core",name:"我方 Core",owner:"PLAYER",x:baseInfo.playerCore.x,y:baseInfo.playerCore.y,hp,maxHp:hp,shield,maxShield:shield,defense},
      {id:"enemy_core",name:"敵方 Core",owner:"ENEMY",x:baseInfo.enemyCore.x,y:baseInfo.enemyCore.y,hp,maxHp:hp,shield,maxShield:shield,defense}
    ];
    map.objects=[
      {id:"player_core_object",x:baseInfo.playerCore.x,y:baseInfo.playerCore.y,type:"CORE",environment:"STONE",destructible:false,blocksMovement:true},
      {id:"enemy_core_object",x:baseInfo.enemyCore.x,y:baseInfo.enemyCore.y,type:"CORE",environment:"STONE",destructible:false,blocksMovement:true},
      ...rocks
    ];

    const deploymentPoints=[
      {id:"player_base",name:"我方本陣",owner:"PLAYER",capturable:false,captureTiles:[],area:buildBaseArea(map,"PLAYER",baseInfo)},
      ...capturePoints,
      {id:"enemy_base",name:"敵方本陣",owner:"ENEMY",capturable:false,captureTiles:[],area:buildBaseArea(map,"ENEMY",baseInfo)}
    ];
    const summary=stats(map);
    return{
      map,cores,deploymentPoints,
      meta:{generated:true,seed:resolvedSeed,size:config.id,label:config.label,width,height,...summary}
    };
  }

  return Object.freeze({SIZE_PRESETS,preset,randomSeed,generateVersus});
})();
