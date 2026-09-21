window.MonsterDatabase=(()=>{
  const monsters=new Map();

  function normalize(def){
    if(!def?.id||!def?.characterId)throw new Error("MonsterDatabase.register requires id and characterId.");
    return Object.freeze({
      id:String(def.id),
      characterId:String(def.characterId),
      family:String(def.family||"MONSTER"),
      habitat:Object.freeze([...(def.habitat||[])]),
      traits:Object.freeze([...(def.traits||[])]),
      aiProfile:String(def.aiProfile||"WILD"),
      encounterRewards:Object.freeze([...(def.encounterRewards||[])].map(r=>Object.freeze({...r})))
    });
  }

  function register(def){
    const value=normalize(def);
    monsters.set(value.id,value);
    return value;
  }

  function get(id){return monsters.get(String(id))||null;}
  function forCharacter(characterId){return [...monsters.values()].find(m=>m.characterId===characterId)||null;}
  function list(){return [...monsters.values()];}

  return Object.freeze({register,get,forCharacter,list});
})();

window.EncounterEngine=(()=>{
  const TEAM_NEUTRAL="N";
  const TRIGGER=Object.freeze({BATTLE_START:"BATTLE_START",ROUND_START:"ROUND_START",TILE_ENTER:"TILE_ENTER",SCRIPT:"SCRIPT"});

  const key=(x,y)=>`${x},${y}`;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function create(definitions=[]){
    return {
      definitions:(definitions||[]).map((def,index)=>normalizeDefinition(def,index)),
      fired:new Set(),
      spawned:[]
    };
  }

  function normalizeDefinition(def,index=0){
    if(!def?.monsterId)throw new Error("Encounter definition requires monsterId.");
    return {
      id:String(def.id||`encounter_${index}`),
      monsterId:String(def.monsterId),
      trigger:{type:TRIGGER.BATTLE_START,...clone(def.trigger||{})},
      once:def.once!==false,
      conditions:clone(def.conditions||[]),
      spawn:{count:1,preferDeepest:false,...clone(def.spawn||{})}
    };
  }

  function triggerMatches(trigger,event){
    if(!trigger||!event||trigger.type!==event.type)return false;
    for(const [name,value] of Object.entries(trigger)){
      if(name==="type")continue;
      if(event[name]!==value)return false;
    }
    return true;
  }

  function conditionMatches(condition,{map,units,event}={}){
    if(!condition)return true;
    if(condition.type==="FLAG")return event?.flags?.[condition.key]===condition.value;
    if(condition.type==="ROUND_AT_LEAST")return Number(event?.round||0)>=Number(condition.round||0);
    if(condition.type==="TERRAIN_EXISTS")return (map?.tiles||[]).some(tile=>tile.terrain===condition.terrain);
    if(condition.type==="MONSTER_ABSENT")return !(units||[]).some(unit=>unit.alive&&unit.monsterId===condition.monsterId);
    return true;
  }

  function habitatMatches(tile,monster,spawn){
    if(!tile||!monster)return false;
    if(spawn?.terrain&&tile.terrain!==spawn.terrain)return false;
    const habitat=monster.habitat||[];
    if(habitat.length){
      const waterOk=habitat.includes("WATER")&&window.HydrologyEngine?.isWater?.(tile);
      if(!waterOk&&!habitat.includes(tile.terrain))return false;
    }
    if(Number(spawn?.minWaterDepth||0)>0&&Number(window.HydrologyEngine?.waterDepth?.(tile)||0)<Number(spawn.minWaterDepth))return false;
    return true;
  }

  function objectBlocks(map,tile){
    return (map?.objects||[]).some(object=>!object.destroyed&&object.blocksMovement&&object.x===tile.x&&object.y===tile.y);
  }

  function chooseSpawnTiles({map,units,monster,spawn}={}){
    const occupied=new Set((units||[]).filter(unit=>unit.alive).map(unit=>key(unit.x,unit.y)));
    const explicit=(spawn?.tiles||[])
      .map(pos=>window.HydrologyEngine?.tileAt?.(map,pos.x,pos.y)||map?.tiles?.find(tile=>tile.x===pos.x&&tile.y===pos.y))
      .filter(Boolean);
    let candidates=(explicit.length?explicit:(map?.tiles||[])).filter(tile=>
      !occupied.has(key(tile.x,tile.y))&&
      !objectBlocks(map,tile)&&
      habitatMatches(tile,monster,spawn)
    );
    candidates.sort((a,b)=>{
      if(spawn?.preferDeepest){
        const depthDiff=Number(window.HydrologyEngine?.waterDepth?.(b)||0)-Number(window.HydrologyEngine?.waterDepth?.(a)||0);
        if(depthDiff)return depthDiff;
      }
      const elevationDiff=Number(a.elevation||0)-Number(b.elevation||0);
      return elevationDiff||a.y-b.y||a.x-b.x;
    });
    return candidates;
  }

  function spawnDefinition(state,definition,{map,units,createUnit,pushLog,event}={}){
    const monster=MonsterDatabase.get(definition.monsterId);
    if(!monster)return[];
    if(definition.once&&state?.fired?.has(definition.id))return[];
    if(!triggerMatches(definition.trigger,event))return[];
    if(!(definition.conditions||[]).every(condition=>conditionMatches(condition,{map,units,event})))return[];

    const count=Math.max(1,Math.floor(Number(definition.spawn?.count||1)));
    const candidates=chooseSpawnTiles({map,units,monster,spawn:definition.spawn});
    const spawned=[];
    for(let i=0;i<count&&candidates.length;i++){
      const tile=candidates.shift();
      const id=`n_${definition.id}_${i}`;
      const unit=createUnit(id,TEAM_NEUTRAL,monster.characterId,tile.x,tile.y);
      if(!unit)continue;
      unit.faction="NEUTRAL";
      unit.monsterId=monster.id;
      unit.encounterId=definition.id;
      unit.encounterAI=monster.aiProfile;
      unit.encounterHabitat=[...(monster.habitat||[])];
      units.push(unit);
      state?.spawned?.push({encounterId:definition.id,unitId:unit.id,monsterId:monster.id,x:tile.x,y:tile.y});
      spawned.push(unit);
      pushLog?.(`遭遇事件｜${unit.character.name} 出現在 (${tile.x},${tile.y})。`,"SYSTEM");
    }
    if(spawned.length&&definition.once)state?.fired?.add(definition.id);
    return spawned;
  }

  function trigger(state,event,context){
    if(!state)return[];
    const spawned=[];
    for(const definition of state.definitions||[])spawned.push(...spawnDefinition(state,definition,{...context,event}));
    return spawned;
  }

  function spawnInitial(state,context){return trigger(state,{type:TRIGGER.BATTLE_START},context);}

  function habitatAllows(unit,tile){
    if(!unit||!tile)return false;
    const monster=MonsterDatabase.get(unit.monsterId)||MonsterDatabase.forCharacter(unit.character?.id);
    if(!monster||!(monster.habitat||[]).length)return true;
    return habitatMatches(tile,monster,{});
  }

  return Object.freeze({TEAM_NEUTRAL,TRIGGER,create,trigger,spawnInitial,habitatAllows});
})();
