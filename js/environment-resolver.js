window.EnvironmentResolver=(()=>{
"use strict";
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const CFG=Object.freeze({
  FREEZE_POINT:0,
  FROZEN_SOIL_MOISTURE:.18,
  SLOPE_FAILURE_MOISTURE_RATIO:.82,
  SLOPE_FAILURE_MIN_DROP:1,
  SLOPE_FAILURE_MIN_MASS:.30,
  SNOW_FAILURE_DEPTH:1.15,
  SNOW_FAILURE_MIN_DROP:1,
  SNOW_FAILURE_BASE_STABILITY:.62,
  VEGETATION_STABILITY:.24,
  FROZEN_STABILITY:.35,
  DISTURBANCE_DECAY:.45,
  MAX_MASS_FLOW_STEPS:12
});
const key=(x,y)=>`${x},${y}`;
const clean=n=>Math.max(0,Math.round(Number(n||0)*1000)/1000);
const tileAt=(map,x,y)=>map?.tiles?.find(t=>t.x===x&&t.y===y)||null;
const neighbors=(map,tile)=>DIRS.map(([dx,dy])=>tileAt(map,tile.x+dx,tile.y+dy)).filter(Boolean);
const elevation=t=>Number(t?.elevation||0);
const water=t=>Math.max(0,Number(t?.waterDepth||0));
const snow=t=>Math.max(0,Number(t?.snowDepth||0));
const ice=t=>Math.max(0,Number(t?.iceThickness||0));
const moisture=t=>Math.max(0,Number(window.HydrologyEngine?.soilMoisture?.(t)||0));
const moistureRatio=t=>Math.min(1,moisture(t)/Math.max(.001,Number(window.HydrologyEngine?.SOIL_SATURATION_CAPACITY||.45)));
const temperature=(state,tile)=>Number(window.ClimateEngine?.temperatureAt?.(state,tile)??state?.temperature??7);
const material=t=>String(t?.material||t?.dryTerrain||t?.terrain||"PLAIN");
const vegetation=t=>material(t)==="FOREST"||Number(t?.vegetation||0)>0;
const frozenSoil=(state,t)=>temperature(state,t)<=CFG.FREEZE_POINT&&moisture(t)>=CFG.FROZEN_SOIL_MOISTURE&&water(t)<=.001;
const slopeTo=(a,b)=>elevation(a)-elevation(b);
function downhill(map,tile,visited=new Set()){
  return neighbors(map,tile).filter(n=>!visited.has(key(n.x,n.y))).map(n=>({tile:n,drop:slopeTo(tile,n)})).filter(x=>x.drop>0).sort((a,b)=>b.drop-a.drop||elevation(a.tile)-elevation(b.tile))[0]||null;
}
function surfaceFriction(state,tile){
  if(window.ClimateEngine?.isSolidIce?.(tile))return .08;
  if(frozenSoil(state,tile))return .72;
  if(material(tile)==="MUD")return .82;
  if(snow(tile)>=.5)return .55;
  if(water(tile)>0)return .65;
  return 1;
}
function stability(state,tile){
  const wet=moistureRatio(tile),veg=vegetation(tile)?CFG.VEGETATION_STABILITY:0,frozen=frozenSoil(state,tile)?CFG.FROZEN_STABILITY:0;
  return Math.max(0,Math.min(1,1-wet*.72+veg+frozen));
}
function ensureTileState(map,state){
  for(const tile of map?.tiles||[]){
    tile.temperature=temperature(state,tile);
    tile.surfaceFriction=surfaceFriction(state,tile);
    tile.frozenSoil=frozenSoil(state,tile);
    tile.slopeStability=stability(state,tile);
    tile.disturbance=clean(Number(tile.disturbance||0)*CFG.DISTURBANCE_DECAY);
  }
}
function massFlowPath(map,start,kind,mass){
  const visited=new Set([key(start.x,start.y)]),path=[{x:start.x,y:start.y,elevation:elevation(start)}];
  let current=start,carried=Math.max(0,Number(mass||0));
  for(let i=0;i<CFG.MAX_MASS_FLOW_STEPS;i++){
    const next=downhill(map,current,visited);if(!next)break;
    current=next.tile;visited.add(key(current.x,current.y));path.push({x:current.x,y:current.y,elevation:elevation(current)});
    if(kind==="SNOW")carried+=Math.min(.45,snow(current)*.3);
    else carried+=Math.min(.35,moisture(current)*.35);
  }
  return{path,mass:clean(carried),end:current};
}
function resolveSnowFailure(map,state,tile,events){
  const next=downhill(map,tile);if(!next||next.drop<CFG.SNOW_FAILURE_MIN_DROP)return;
  const depth=snow(tile),disturbance=Number(tile.disturbance||0);
  const snowStability=Math.max(0,Math.min(1,CFG.SNOW_FAILURE_BASE_STABILITY+(vegetation(tile)?.16:0)-Math.max(0,depth-CFG.SNOW_FAILURE_DEPTH)*.18-disturbance*.3));
  tile.snowStability=snowStability;
  if(depth<CFG.SNOW_FAILURE_DEPTH||snowStability>.45)return;
  const released=Math.min(depth,Math.max(.55,depth*(.5+disturbance*.15))),flow=massFlowPath(map,tile,"SNOW",released);
  if(flow.path.length<2)return;
  tile.snowDepth=clean(depth-released);
  flow.end.snowDepth=clean(snow(flow.end)+flow.mass*.72);
  events.push({type:"MASS_FLOW",material:"SNOW",x:tile.x,y:tile.y,path:flow.path,mass:flow.mass,damage:Math.round(16+flow.mass*18),forceDistance:Math.max(1,Math.min(3,Math.ceil(flow.mass/1.4))),source:"STABILITY_FAILURE"});
}
function resolveSoilFailure(map,state,tile,events){
  const next=downhill(map,tile);if(!next||next.drop<CFG.SLOPE_FAILURE_MIN_DROP)return;
  const ratio=moistureRatio(tile),stab=stability(state,tile),disturbance=Number(tile.disturbance||0);
  if(ratio<CFG.SLOPE_FAILURE_MOISTURE_RATIO||frozenSoil(state,tile)||stab-disturbance*.2>.36)return;
  const mass=Math.max(CFG.SLOPE_FAILURE_MIN_MASS,ratio*(1-stab)+disturbance*.15),flow=massFlowPath(map,tile,"SOIL",mass);
  if(flow.path.length<2)return;
  const erosion=Math.min(.35,flow.mass*.12),deposit=Math.min(.35,flow.mass*.10);
  tile.elevation=Number((elevation(tile)-erosion).toFixed(3));
  flow.end.elevation=Number((elevation(flow.end)+deposit).toFixed(3));
  tile.soilMoisture=clean(Math.max(0,moisture(tile)-erosion));
  flow.end.soilMoisture=clean(Math.min(Number(window.HydrologyEngine?.SOIL_SATURATION_CAPACITY||.45),moisture(flow.end)+deposit));
  if(flow.end.terrain==="PLAIN")flow.end.terrain="MUD";
  events.push({type:"MASS_FLOW",material:"SOIL",x:tile.x,y:tile.y,path:flow.path,mass:flow.mass,erosion,deposit,damage:Math.round(12+flow.mass*20),forceDistance:Math.max(1,Math.min(3,Math.ceil(flow.mass/1.2))),source:"SLOPE_FAILURE"});
}
function resolve(map,state,{source="ENVIRONMENT_TICK"}={}){
  const events=[];if(!map||!state)return events;ensureTileState(map,state);
  for(const tile of map.tiles||[]){
    if(tile.frozenSoil&&!tile._frozenSoil){events.push({type:"SOIL_FROZEN",x:tile.x,y:tile.y,temperature:tile.temperature,soilMoisture:moisture(tile)});}
    if(!tile.frozenSoil&&tile._frozenSoil){events.push({type:"SOIL_THAWED",x:tile.x,y:tile.y,temperature:tile.temperature,soilMoisture:moisture(tile)});}
    tile._frozenSoil=tile.frozenSoil;
  }
  for(const tile of [...(map.tiles||[])].sort((a,b)=>elevation(b)-elevation(a))){
    resolveSnowFailure(map,state,tile,events);
    resolveSoilFailure(map,state,tile,events);
  }
  if(events.some(e=>e.type==="MASS_FLOW"&&e.material==="SOIL"))window.HydrologyEngine?.redistribute?.(map,{source:"MASS_FLOW",events});
  ensureTileState(map,state);
  events.push({type:"ENVIRONMENT_RESOLVED",source,tiles:map.tiles?.length||0,massFlows:events.filter(e=>e.type==="MASS_FLOW").length});
  return events;
}
function disturb(map,x,y,amount=1,{source="DISTURBANCE"}={}){
  const tile=tileAt(map,x,y);if(!tile)return[];tile.disturbance=clean(Number(tile.disturbance||0)+Math.max(0,Number(amount||0)));
  return[{type:"ENVIRONMENT_DISTURBANCE",x,y,amount:Number(amount||0),source}];
}
return Object.freeze({CFG,resolve,disturb,tileAt,temperature,frozenSoil,surfaceFriction,stability,downhill});
})();
