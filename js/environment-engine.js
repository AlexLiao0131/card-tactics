window.EnvironmentEngine=(()=>{
  const ELEMENT={NONE:"NONE",GRASS:"GRASS",WATER:"WATER",STONE:"STONE"};
  const FORCE={FIRE:"FIRE",HEAVY_FIRE:"HEAVY_FIRE",EXPLOSION:"EXPLOSION"};
  const EFFECT={BURNING:"BURNING",STEAM:"STEAM",FRAGMENTS:"FRAGMENTS"};

  function key(x,y){ return `${x},${y}`; }
  function tileAt(map,x,y){ return map?.tiles?.find(t=>t.x===x&&t.y===y)||null; }
  function objectAt(map,x,y){ return (map?.objects||[]).find(o=>!o.destroyed&&o.x===x&&o.y===y)||null; }

  function environmentAt(map,x,y){
    const object=objectAt(map,x,y);
    if(object?.environment) return object.environment;
    const tile=tileAt(map,x,y);
    return TERRAINS[tile?.terrain]?.environment||ELEMENT.NONE;
  }

  function create({timeOfDay="DAY"}={}){
    return {
      timeOfDay,
      effects:new Map(),
      destroyedObjects:new Set()
    };
  }

  function setTimeOfDay(state,timeOfDay){
    state.timeOfDay=timeOfDay==="NIGHT"?"NIGHT":"DAY";
  }

  function effectAt(state,x,y){
    return state.effects.get(key(x,y))||[];
  }

  function addEffect(state,x,y,effect){
    const k=key(x,y);
    const list=state.effects.get(k)||[];
    const same=list.find(e=>e.type===effect.type);
    if(same) Object.assign(same,effect);
    else list.push({...effect,x,y});
    state.effects.set(k,list);
    return effect;
  }

  function removeEffect(state,x,y,type){
    const k=key(x,y);
    const next=(state.effects.get(k)||[]).filter(e=>e.type!==type);
    if(next.length) state.effects.set(k,next);
    else state.effects.delete(k);
  }

  function destroyStoneObject(map,state,object){
    if(!object?.destructible) return false;
    object.destroyed=true;
    state.destroyedObjects.add(object.id);
    const tile=tileAt(map,object.x,object.y);
    if(tile&&object.breaksIntoTerrain){
      tile.terrain=object.breaksIntoTerrain;
    }
    return true;
  }

  function apply({map,state,x,y,forces=[]}){
    const forceSet=new Set(forces);
    const environment=environmentAt(map,x,y);
    const events=[];

    if(environment===ELEMENT.GRASS&&(forceSet.has(FORCE.FIRE)||forceSet.has(FORCE.HEAVY_FIRE))){
      addEffect(state,x,y,{type:EFFECT.BURNING,duration:3,lightRadius:2,fireIntensity:forceSet.has(FORCE.HEAVY_FIRE)?"HEAVY":"NORMAL"});
      events.push({type:"IGNITE",x,y,effect:EFFECT.BURNING});
    }

    if(environment===ELEMENT.WATER){
      if(forceSet.has(FORCE.HEAVY_FIRE)){
        removeEffect(state,x,y,EFFECT.BURNING);
        addEffect(state,x,y,{type:EFFECT.STEAM,duration:2,visionBlock:true});
        events.push({type:"STEAM_CREATED",x,y,effect:EFFECT.STEAM});
      }else if(forceSet.has(FORCE.FIRE)){
        removeEffect(state,x,y,EFFECT.BURNING);
        events.push({type:"FIRE_EXTINGUISHED",x,y});
      }
    }

    if(environment===ELEMENT.STONE&&forceSet.has(FORCE.EXPLOSION)){
      addEffect(state,x,y,{type:EFFECT.FRAGMENTS,duration:1,damageType:"PHYSICAL",radius:1});
      const object=objectAt(map,x,y);
      const destroyed=destroyStoneObject(map,state,object);
      events.push({type:"STONE_FRAGMENT",x,y,effect:EFFECT.FRAGMENTS,destroyed,objectId:object?.id||null});
    }

    return events;
  }

  function tick(state){
    for(const [k,list] of [...state.effects.entries()]){
      const next=[];
      for(const effect of list){
        if(effect.duration==null){ next.push(effect); continue; }
        const updated={...effect,duration:effect.duration-1};
        if(updated.duration>0) next.push(updated);
      }
      if(next.length) state.effects.set(k,next);
      else state.effects.delete(k);
    }
  }

  function lightSources(state){
    const out=[];
    for(const list of state.effects.values()){
      for(const effect of list){
        if(effect.lightRadius>0) out.push({x:effect.x,y:effect.y,radius:effect.lightRadius,source:effect.type});
      }
    }
    return out;
  }

  function isLit(state,x,y){
    if(state.timeOfDay!=="NIGHT") return true;
    return lightSources(state).some(light=>Math.abs(light.x-x)+Math.abs(light.y-y)<=light.radius);
  }

  function visionModifier(state,x,y){
    const effects=effectAt(state,x,y);
    if(effects.some(e=>e.type===EFFECT.STEAM)) return {blocked:true,reason:"STEAM"};
    if(state.timeOfDay==="NIGHT"&&!isLit(state,x,y)) return {blocked:false,dark:true,reason:"NIGHT"};
    return {blocked:false,dark:false,reason:null};
  }

  return {
    ELEMENT,FORCE,EFFECT,
    create,setTimeOfDay,
    environmentAt,effectAt,
    apply,tick,
    lightSources,isLit,visionModifier
  };
})();
