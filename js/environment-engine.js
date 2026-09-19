window.EnvironmentEngine=(()=>{
  const ELEMENT={NONE:"NONE",GRASS:"GRASS",WATER:"WATER",STONE:"STONE"};
  const FORCE={FIRE:"FIRE",HEAVY_FIRE:"HEAVY_FIRE",EXPLOSION:"EXPLOSION",WIND:"WIND",THUNDER:"THUNDER",IMPACT:"IMPACT"};
  const EFFECT={BURNING:"BURNING",STEAM:"STEAM",FRAGMENTS:"FRAGMENTS",TORNADO:"TORNADO",FIRE_TORNADO:"FIRE_TORNADO",ELECTRIFIED:"ELECTRIFIED"};
  const WEATHER={CLEAR:"CLEAR",FOG:"FOG",RAIN:"RAIN",HEAVY_RAIN:"HEAVY_RAIN",THUNDERSTORM:"THUNDERSTORM"};
  const WEATHER_RULES={THUNDERSTORM:{lightningChance:0.35,lightningDamage:60,metalWeight:2,waterWeight:2,treeWeight:2}};
  const METAL_EQUIPMENT_IDS=new Set(["black_sword","imperial_sword","standard_sword","blessed_sword","imperial_spear","imperial_hammer","imperial_medium_armor","imperial_heavy_shield_armor","water_medium_armor","imperial_heavy_armor","imperial_heavy_plate","imperial_large_shield"]);
  const HAZARD={BURNING_DAMAGE:20,FIRE_TORNADO_DAMAGE:45,ELECTRIC_DAMAGE:35};
  const HYDROLOGY={WATERLINE:0,RAIN_FILL_PER_EVENT:1,HEAVY_RAIN_FILL_PER_EVENT:2};
  function key(x,y){return `${x},${y}`;}
  function tileAt(map,x,y){return map?.tiles?.find(t=>t.x===x&&t.y===y)||null;}
  function objectAt(map,x,y){return (map?.objects||[]).find(o=>!o.destroyed&&o.x===x&&o.y===y)||null;}
  function elevation(tile){return Number(tile?.elevation||0);}
  function waterDepth(tile){return Math.max(0,Number(tile?.waterDepth||0));}
  function environmentAt(map,x,y){const object=objectAt(map,x,y);if(object?.environment)return object.environment;const tile=tileAt(map,x,y);return TERRAINS[tile?.terrain]?.environment||ELEMENT.NONE;}
  function create({timeOfDay="DAY",weather="CLEAR"}={}){return{timeOfDay,weather:weather||WEATHER.CLEAR,effects:new Map(),destroyedObjects:new Set()};}
  function setTimeOfDay(state,timeOfDay){state.timeOfDay=timeOfDay==="NIGHT"?"NIGHT":"DAY";}
  function fillCapacity(tile){return Math.max(0,HYDROLOGY.WATERLINE-elevation(tile));}
  function syncWaterTerrain(tile,events=[]){
    if(!tile)return;
    const depth=waterDepth(tile),capacity=fillCapacity(tile);
    if(capacity>0&&depth>=capacity&&tile.terrain!=="WATER"){
      tile.dryTerrain=tile.terrain==="MUD"?"PLAIN":tile.terrain;
      tile.terrain="WATER";
      events.push({type:"BASIN_FILLED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:depth});
    }else if(tile.terrain==="WATER"&&tile.dryTerrain&&depth<capacity){
      tile.terrain=tile.dryTerrain;delete tile.dryTerrain;
      events.push({type:"BASIN_DRAINED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:depth});
    }
  }
  function addWater(tile,amount,events=[]){
    if(!tile||fillCapacity(tile)<=0)return 0;
    const before=waterDepth(tile),next=Math.min(fillCapacity(tile),before+Math.max(0,Number(amount||0)));
    tile.waterDepth=next;
    if(next!==before)events.push({type:"WATER_ACCUMULATED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:next,capacity:fillCapacity(tile)});
    syncWaterTerrain(tile,events);
    return next-before;
  }
  function removeWater(tile,amount,events=[]){
    if(!tile)return 0;
    const before=waterDepth(tile),next=Math.max(0,before-Math.max(0,Number(amount||0)));
    tile.waterDepth=next;
    if(next!==before)events.push({type:"WATER_REDUCED",x:tile.x,y:tile.y,elevation:elevation(tile),waterDepth:next});
    syncWaterTerrain(tile,events);
    return before-next;
  }
  function deformTerrain(map,x,y,{deltaElevation=0,setElevation=null,source="TERRAIN_DEFORMATION"}={}){
    const tile=tileAt(map,x,y);if(!tile)return[];
    const before=elevation(tile),after=setElevation==null?before+Number(deltaElevation||0):Number(setElevation);
    if(!Number.isFinite(after)||after===before)return[];
    tile.elevation=after;
    const events=[{type:"ELEVATION_CHANGED",x,y,from:before,to:after,source}];
    if(after>=HYDROLOGY.WATERLINE&&tile.dryTerrain){
      tile.terrain=tile.dryTerrain;delete tile.dryTerrain;tile.waterDepth=0;
    }else syncWaterTerrain(tile,events);
    return events;
  }
  function applyRainToTerrain(map,state){
    const events=[],amount=state?.weather===WEATHER.RAIN?HYDROLOGY.RAIN_FILL_PER_EVENT:HYDROLOGY.HEAVY_RAIN_FILL_PER_EVENT;
    for(const tile of map?.tiles||[]){
      if(fillCapacity(tile)>0){addWater(tile,amount,events);continue;}
      if(tile.terrain==="PLAIN"){tile.terrain="MUD";events.push({type:"MUD_CREATED",x:tile.x,y:tile.y});}
    }
    return events;
  }
  function dryTerrain(map){
    const events=[];
    for(const tile of map?.tiles||[]){
      if(tile.terrain==="MUD"){tile.terrain="PLAIN";events.push({type:"MUD_DRY",x:tile.x,y:tile.y});}
    }
    return events;
  }
  function setWeather(state,weather,map=null){
    if(!state)return[];
    state.weather=WEATHER[weather]?weather:WEATHER.CLEAR;
    const events=[];
    if(isRain(state)){
      for(const [k,list] of [...state.effects.entries()]){
        if(!list.some(e=>e.type===EFFECT.BURNING))continue;
        const [x,y]=k.split(",").map(Number);
        removeEffect(state,x,y,EFFECT.BURNING);events.push({type:"RAIN_EXTINGUISHED_FIRE",x,y});
      }
      events.push(...applyRainToTerrain(map,state));
    }else events.push(...dryTerrain(map));
    return events;
  }
  function isRain(state){return state?.weather===WEATHER.RAIN||state?.weather===WEATHER.HEAVY_RAIN||state?.weather===WEATHER.THUNDERSTORM;}
  function hasMetalEquipment(unit){return EquipmentDatabase.equippedItems(unit?.character).some(item=>item?.material==="METAL"||item?.conductive===true||METAL_EQUIPMENT_IDS.has(item?.id));}
  function lightningRisk(map,unit){if(!unit?.alive)return{weight:0,reasons:[]};const rules=WEATHER_RULES.THUNDERSTORM;let weight=1;const reasons=[];if(hasMetalEquipment(unit)){weight*=rules.metalWeight;reasons.push("METAL");}const material=environmentAt(map,unit.x,unit.y);if(material===ELEMENT.WATER){weight*=rules.waterWeight;reasons.push("WATER");}if(material===ELEMENT.GRASS){weight*=rules.treeWeight;reasons.push("TREE");}return{weight,reasons};}
  function rollWeatherEvent({map,state,units=[],random=Math.random}){if(!state||state.weather!==WEATHER.THUNDERSTORM)return[];const rules=WEATHER_RULES.THUNDERSTORM;if(random()>=rules.lightningChance)return[];const candidates=units.filter(u=>u?.alive).map(unit=>({unit,...lightningRisk(map,unit)})).filter(x=>x.weight>0);if(!candidates.length)return[];let roll=random()*candidates.reduce((n,x)=>n+x.weight,0),chosen=candidates[candidates.length-1];for(const candidate of candidates){roll-=candidate.weight;if(roll<=0){chosen=candidate;break;}}return[{type:"LIGHTNING_STRIKE",unit:chosen.unit,x:chosen.unit.x,y:chosen.unit.y,damage:rules.lightningDamage,riskReasons:chosen.reasons,weight:chosen.weight}];}
  function effectAt(state,x,y){return state?.effects?.get(key(x,y))||[];}
  function addEffect(state,x,y,effect){const k=key(x,y),list=state.effects.get(k)||[],same=list.find(e=>e.type===effect.type);if(same)Object.assign(same,effect);else list.push({...effect,x,y});state.effects.set(k,list);return effect;}
  function removeEffect(state,x,y,type){const k=key(x,y),next=(state.effects.get(k)||[]).filter(e=>e.type!==type);if(next.length)state.effects.set(k,next);else state.effects.delete(k);}
  function destroyStoneObject(map,state,object){if(!object?.destructible)return false;object.destroyed=true;state.destroyedObjects.add(object.id);const tile=tileAt(map,object.x,object.y);if(tile&&object.breaksIntoTerrain)tile.terrain=object.breaksIntoTerrain;return true;}
  function isBurning(state,x,y){return effectAt(state,x,y).some(e=>e.type===EFFECT.BURNING||e.type===EFFECT.FIRE_TORNADO);}
  function isConductive(map,state,x,y){return isRain(state)||environmentAt(map,x,y)===ELEMENT.WATER;}
  function apply({map,state,x,y,forces=[]}){
    const forceSet=new Set(forces),environment=environmentAt(map,x,y),events=[];
    const raining=isRain(state),burningBefore=isBurning(state,x,y);
    if(forceSet.has(FORCE.IMPACT))events.push(...deformTerrain(map,x,y,{deltaElevation:-1,source:"IMPACT"}));
    if(forceSet.has(FORCE.WIND)&&burningBefore){addEffect(state,x,y,{type:EFFECT.FIRE_TORNADO,duration:2,lightRadius:3,damage:HAZARD.FIRE_TORNADO_DAMAGE,damageType:"FIRE",visionBlock:false});events.push({type:"FIRE_TORNADO_CREATED",x,y,effect:EFFECT.FIRE_TORNADO});}
    if(raining&&forceSet.has(FORCE.FIRE)){
      if(effectAt(state,x,y).some(e=>e.type===EFFECT.BURNING)){removeEffect(state,x,y,EFFECT.BURNING);events.push({type:"FIRE_EXTINGUISHED",x,y});}
      events.push({type:"RAIN_SUPPRESSED_FIRE",x,y});
    }else if(!raining&&environment===ELEMENT.GRASS&&forceSet.has(FORCE.FIRE)){
      addEffect(state,x,y,{type:EFFECT.BURNING,duration:3,lightRadius:2,damage:HAZARD.BURNING_DAMAGE,damageType:"FIRE",fireIntensity:"NORMAL"});events.push({type:"IGNITE",x,y,effect:EFFECT.BURNING});
    }
    if(raining&&(forceSet.has(FORCE.HEAVY_FIRE)||forceSet.has(FORCE.EXPLOSION))){
      removeEffect(state,x,y,EFFECT.BURNING);addEffect(state,x,y,{type:EFFECT.STEAM,duration:2,visionBlock:true});
      events.push({type:"STEAM_CREATED",x,y,effect:EFFECT.STEAM,reason:forceSet.has(FORCE.HEAVY_FIRE)?"HEAVY_FIRE_IN_RAIN":"EXPLOSION_IN_RAIN"});
    }else if(!raining&&environment===ELEMENT.GRASS&&forceSet.has(FORCE.HEAVY_FIRE)){
      addEffect(state,x,y,{type:EFFECT.BURNING,duration:3,lightRadius:2,damage:HAZARD.BURNING_DAMAGE,damageType:"FIRE",fireIntensity:"HEAVY"});events.push({type:"IGNITE",x,y,effect:EFFECT.BURNING});
    }
    if(environment===ELEMENT.WATER){
      if(forceSet.has(FORCE.HEAVY_FIRE)){
        removeEffect(state,x,y,EFFECT.BURNING);addEffect(state,x,y,{type:EFFECT.STEAM,duration:2,visionBlock:true});events.push({type:"STEAM_CREATED",x,y,effect:EFFECT.STEAM});
        const tile=tileAt(map,x,y);
        if(tile?.terrain==="WATER"){
          if(tile.dryTerrain){removeWater(tile,1,events);}
          else{tile.terrain="PLAIN";events.push({type:"WATER_EVAPORATED",x,y,terrain:"PLAIN"});}
        }
      }else if(forceSet.has(FORCE.FIRE)){removeEffect(state,x,y,EFFECT.BURNING);events.push({type:"FIRE_EXTINGUISHED",x,y});}
    }
    if(forceSet.has(FORCE.THUNDER)&&isConductive(map,state,x,y)){addEffect(state,x,y,{type:EFFECT.ELECTRIFIED,duration:1,damage:HAZARD.ELECTRIC_DAMAGE,damageType:"THUNDER"});events.push({type:"ELECTRIC_CONDUCTION",x,y,effect:EFFECT.ELECTRIFIED});}
    if(environment===ELEMENT.STONE&&forceSet.has(FORCE.EXPLOSION)){addEffect(state,x,y,{type:EFFECT.FRAGMENTS,duration:1,damageType:"PHYSICAL",radius:1});const object=objectAt(map,x,y),destroyed=destroyStoneObject(map,state,object);events.push({type:"STONE_FRAGMENT",x,y,effect:EFFECT.FRAGMENTS,destroyed,objectId:object?.id||null});}
    return events;
  }
  function createTornado(state,x,y,{duration=2,pushDistance=2,damage=20,fireDamage=45}={}){
    const burning=isBurning(state,x,y);
    if(burning){addEffect(state,x,y,{type:EFFECT.FIRE_TORNADO,duration,pushDistance,lightRadius:3,damage:fireDamage,damageType:"FIRE",visionBlock:false});return {type:"FIRE_TORNADO_CREATED",x,y,effect:EFFECT.FIRE_TORNADO};}
    addEffect(state,x,y,{type:EFFECT.TORNADO,duration,pushDistance,damage,damageType:"PHYSICAL",visionBlock:false});return {type:"TORNADO_CREATED",x,y,effect:EFFECT.TORNADO};
  }
  function pathInteraction({state,x,y,kind="UNIT"}={}){
    const effects=effectAt(state,x,y),tornado=effects.find(e=>e.type===EFFECT.FIRE_TORNADO)||effects.find(e=>e.type===EFFECT.TORNADO);
    if(!tornado||kind==="SPACE")return {interrupted:false,effects:[]};
    if(kind==="PROJECTILE")return {interrupted:false,effects:[{type:"WIND_FIELD",effect:tornado}]};
    return {interrupted:true,effects:[{type:"FORCED_MOVE",effect:tornado,distance:Number(tornado.pushDistance||2)}]};
  }
  function tick(state){for(const [k,list] of [...state.effects.entries()]){const next=[];for(const effect of list){if(effect.duration==null){next.push(effect);continue;}const updated={...effect,duration:effect.duration-1};if(updated.duration>0)next.push(updated);}if(next.length)state.effects.set(k,next);else state.effects.delete(k);}}
  function lightSources(state){const out=[];for(const list of state.effects.values())for(const effect of list)if(effect.lightRadius>0)out.push({x:effect.x,y:effect.y,radius:effect.lightRadius,source:effect.type});return out;}
  function isLit(state,x,y){if(state.timeOfDay!=="NIGHT")return true;return lightSources(state).some(light=>Math.abs(light.x-x)+Math.abs(light.y-y)<=light.radius);}
  function visionModifier(state,x,y){const effects=effectAt(state,x,y);if(effects.some(e=>e.type===EFFECT.STEAM))return{blocked:true,reason:"STEAM"};if(state.timeOfDay==="NIGHT"&&!isLit(state,x,y))return{blocked:false,dark:true,reason:"NIGHT"};return{blocked:false,dark:false,reason:null};}
  return{ELEMENT,FORCE,EFFECT,HAZARD,WEATHER,WEATHER_RULES,HYDROLOGY,create,setTimeOfDay,setWeather,isRain,lightningRisk,rollWeatherEvent,environmentAt,effectAt,isBurning,isConductive,elevation,waterDepth,fillCapacity,addWater,removeWater,deformTerrain,apply,createTornado,pathInteraction,tick,lightSources,isLit,visionModifier};
})();
