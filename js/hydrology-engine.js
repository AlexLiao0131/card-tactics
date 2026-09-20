window.HydrologyEngine=(()=>{
  const WATERLINE=0,RAIN_FILL_PER_EVENT=1,HEAVY_RAIN_FILL_PER_EVENT=2,NATURAL_WATER_DEPTH=1;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]],key=(x,y)=>`${x},${y}`;
  const elevation=t=>Number(t?.elevation||0);
  const waterDepth=t=>Math.max(0,Number(t?.waterDepth||0));
  const waterSurfaceZ=t=>waterDepth(t)>0?elevation(t)+waterDepth(t):null;
  const isWater=t=>!!t&&(t.terrain==="WATER"||waterDepth(t)>0);
  function tileAt(map,x,y){return map?.tiles?.find(t=>t.x===x&&t.y===y)||null}
  function initializeMap(map){
    for(const tile of map?.tiles||[]){
      if(tile.terrain!=="WATER")continue;
      if(!Number.isFinite(Number(tile.waterDepth))||Number(tile.waterDepth)<=0){
        tile.waterDepth=NATURAL_WATER_DEPTH;
        tile.elevation=Number(tile.elevation||0)-NATURAL_WATER_DEPTH;
      }
      tile.waterSurfaceZ=elevation(tile)+waterDepth(tile);
      tile.dryTerrain??="PLAIN";
    }
    return map;
  }
  function connectedWaterBody(map,x,y){
    const start=tileAt(map,x,y);if(!isWater(start))return[];
    const by=new Map((map.tiles||[]).map(t=>[key(t.x,t.y),t])),seen=new Set(),q=[start],out=[];
    while(q.length){const t=q.shift(),k=key(t.x,t.y);if(seen.has(k))continue;seen.add(k);if(!isWater(t))continue;out.push(t);
      for(const[dX,dY]of DIRS){const n=by.get(key(t.x+dX,t.y+dY));if(n&&!seen.has(key(n.x,n.y))&&isWater(n))q.push(n)}
    }return out;
  }
  function fillCapacity(tile){return Math.max(0,WATERLINE-elevation(tile))}
  function sync(tile,events=[]){
    if(!tile)return;
    const d=waterDepth(tile);tile.waterSurfaceZ=d>0?elevation(tile)+d:null;
    if(d>0&&tile.terrain!=="WATER"){tile.dryTerrain=tile.terrain==="MUD"?"PLAIN":tile.terrain;tile.terrain="WATER";events.push({type:"BASIN_FILLED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:d,waterSurfaceZ:tile.waterSurfaceZ})}
    else if(d<=0&&tile.terrain==="WATER"&&tile.dryTerrain){tile.terrain=tile.dryTerrain;delete tile.dryTerrain;events.push({type:"BASIN_DRAINED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:0})}
  }
  function addWater(tile,amount,events=[]){
    if(!tile)return 0;const before=waterDepth(tile),capacity=Math.max(fillCapacity(tile),before),next=Math.min(capacity,before+Math.max(0,Number(amount||0)));
    tile.waterDepth=next;if(next!==before)events.push({type:"WATER_ACCUMULATED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:next,waterSurfaceZ:elevation(tile)+next,capacity});sync(tile,events);return next-before;
  }
  function removeWater(tile,amount,events=[]){
    if(!tile)return 0;const before=waterDepth(tile),next=Math.max(0,before-Math.max(0,Number(amount||0)));tile.waterDepth=next;
    if(next!==before)events.push({type:"WATER_REDUCED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:next});sync(tile,events);return before-next;
  }
  function deformTerrain(map,x,y,{deltaElevation=0,setElevation=null,source="TERRAIN_DEFORMATION"}={}){
    const tile=tileAt(map,x,y);if(!tile)return[];const before=elevation(tile),after=setElevation==null?before+Number(deltaElevation||0):Number(setElevation);
    if(!Number.isFinite(after)||after===before)return[];const surface=waterSurfaceZ(tile);tile.elevation=after;
    if(surface!=null)tile.waterDepth=Math.max(0,surface-after);
    const events=[{type:"ELEVATION_CHANGED",x,y,from:before,to:after,source}];sync(tile,events);return events;
  }
  function applyRain(map,{heavy=false}={}){
    const events=[],amount=heavy?HEAVY_RAIN_FILL_PER_EVENT:RAIN_FILL_PER_EVENT;
    for(const tile of map?.tiles||[]){if(elevation(tile)<WATERLINE||waterDepth(tile)>0)addWater(tile,amount,events)}
    return events;
  }
  return Object.freeze({WATERLINE,RAIN_FILL_PER_EVENT,HEAVY_RAIN_FILL_PER_EVENT,NATURAL_WATER_DEPTH,initializeMap,tileAt,elevation,waterDepth,waterSurfaceZ,isWater,connectedWaterBody,fillCapacity,addWater,removeWater,deformTerrain,applyRain});
})();
