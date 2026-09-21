window.WaterInteractionEngine=(()=>{
"use strict";
const STATE=Object.freeze({
  DRY:"DRY",
  WATER_WALK:"WATER_WALK",
  AQUATIC:"AQUATIC",
  WADING:"WADING",
  SWIMMING:"SWIMMING",
  SINKING:"SINKING"
});
const SINK_DEPTH=Object.freeze({LIGHT:3,MEDIUM:2,HEAVY:1,IMMOVABLE:1});
const ENTRY_DAMAGE=Object.freeze({LIGHT:10,MEDIUM:15,HEAVY:20,IMMOVABLE:30});
const TICK_DAMAGE=Object.freeze({LIGHT:20,MEDIUM:25,HEAVY:30,IMMOVABLE:40});

function traits(unit){return new Set(unit?.character?.terrainTraits||[])}
function weightClass(unit){return window.DisplacementEngine?.weightClass?.(unit)||"LIGHT"}
function assess(unit,tile){
  const depth=Math.max(0,Number(window.HydrologyEngine?.waterDepth?.(tile)||0)),set=traits(unit),weight=weightClass(unit);
  if(depth<=0)return{state:STATE.DRY,depth,weight,safe:true};
  if(set.has("AQUATIC"))return{state:STATE.AQUATIC,depth,weight,safe:true};
  if(set.has("WATER_WALK"))return{state:STATE.WATER_WALK,depth,weight,safe:true};
  const threshold=Number(SINK_DEPTH[weight]??SINK_DEPTH.LIGHT);
  if(depth>=threshold)return{state:STATE.SINKING,depth,weight,threshold,safe:false};
  if(depth>=2)return{state:STATE.SWIMMING,depth,weight,threshold,safe:true};
  return{state:STATE.WADING,depth,weight,threshold,safe:true};
}
function resolve(unit,tile,{trigger="CHECK"}={}){
  const previous=unit?.waterInteraction||{state:STATE.DRY,depth:0,weight:weightClass(unit)};
  const next=assess(unit,tile);
  const changed=previous.state!==next.state||Number(previous.depth||0)!==Number(next.depth||0)||previous.weight!==next.weight;
  let damage=0;
  if(next.state===STATE.SINKING){
    if(trigger==="TICK"){
      damage=Number(TICK_DAMAGE[next.weight]??TICK_DAMAGE.LIGHT)+Math.max(0,next.depth-next.threshold)*5;
    }else if(trigger==="ENTER"||trigger==="CHANGE"){
      const newlySinking=previous.state!==STATE.SINKING;
      const becameDeeper=Number(next.depth||0)>Number(previous.depth||0);
      if(newlySinking||becameDeeper)damage=Number(ENTRY_DAMAGE[next.weight]??ENTRY_DAMAGE.LIGHT)+Math.max(0,next.depth-next.threshold)*5;
    }
  }
  if(unit)unit.waterInteraction={...next};
  return{...next,previousState:previous.state,previousDepth:Number(previous.depth||0),changed,damage,trigger};
}
return Object.freeze({STATE,SINK_DEPTH,ENTRY_DAMAGE,TICK_DAMAGE,assess,resolve});
})();

(()=>{
"use strict";
function create(ctx){
 if(!ctx?.state||!ctx?.pushLog||!ctx?.handleDefeated||!ctx?.stageEvent)throw new Error("BattleEnvironmentController requires state/log/lifecycle callbacks.");
 const state=()=>ctx.state();

 function resolveCollisionRuntime(collision,{mover,source}={}){
  if(!collision)return;const s=state(),surface=collision.surface||{},moverName=mover?.character?.name||"單位";
  if(surface.kind==="SHIELD")ctx.pushLog(`${moverName} 撞上 ${surface.unit?.character?.name||"防禦者"} 的防禦面｜撞擊傷害 ${collision.damage||0}｜HP ${mover?.hp??"-"}。`,"BATTLE");
  else if(surface.kind==="UNIT")ctx.pushLog(`${moverName} 撞上 ${surface.unit?.character?.name||"單位"}｜撞擊傷害 ${collision.damage||0}${collision.transferred?"｜力量傳遞，觸發連鎖擊飛":"｜位移被阻擋"}。`,"BATTLE");
  else if(surface.kind==="OBJECT"){const object=surface.object;ctx.pushLog(`${moverName} 撞上 ${object?.name||object?.id||"物件"}｜撞擊傷害 ${collision.damage||0}${collision.objectDamage?`｜物件耐久 -${collision.objectDamage}`:""}${collision.objectDestroyed?"｜物件破壞":""}。`,"BATTLE");if(collision.objectDestroyed&&s.environmentState){s.environmentState.destroyedObjects?.add?.(object.id);const tile=TacticalEngine.tile(s.map,object.x,object.y);if(tile&&object.breaksIntoTerrain)tile.terrain=object.breaksIntoTerrain;}}
  else ctx.pushLog(`${moverName} 撞上地形／邊界｜撞擊傷害 ${collision.damage||0}｜HP ${mover?.hp??"-"}。`,"BATTLE");
  if(mover&&!mover.alive)ctx.handleDefeated(mover,source,{type:"COLLISION",surface:surface.kind});
 }

 function teamLabel(team){
  if(team===ctx.TEAM?.PLAYER||team==="P")return"PLAYER";
  if(team===ctx.TEAM?.ENEMY||team==="E")return"ENEMY";
  return"NEUTRAL";
 }

 function applyWaterInteraction(unit,{trigger="CHECK",reason="水域"}={}){
  const s=state();if(!unit?.alive||!window.WaterInteractionEngine)return{damage:0,state:null};
  const tile=TacticalEngine.tile(s.map,unit.x,unit.y),result=WaterInteractionEngine.resolve(unit,tile,{trigger});
  if(result.changed){
    if(result.state===WaterInteractionEngine.STATE.SINKING){
      ctx.pushLog(`${unit.character.name} ${reason}｜水深 ${result.depth}｜重量 ${result.weight}｜失去浮力，開始沉沒。`,"BATTLE");
    }else if(result.previousState===WaterInteractionEngine.STATE.SINKING){
      ctx.pushLog(`${unit.character.name} ${reason}｜脫離沉沒狀態。`,"DETAIL");
    }
  }
  if(result.damage>0&&unit.alive){
    unit.hp=Math.max(0,unit.hp-result.damage);
    const label=trigger==="TICK"?"溺水／沉沒持續傷害":"沉沒衝擊傷害";
    ctx.pushLog(`${unit.character.name}｜${label} ${result.damage}｜HP ${unit.hp}。`,"BATTLE");
    if(unit.hp<=0){
      unit.alive=false;
      ctx.pushLog(`${unit.character.name} 因沉沒／溺水戰敗。`,"BATTLE");
      ctx.handleDefeated(unit,null,{type:"WATER_HAZARD",state:result.state,depth:result.depth,weight:result.weight,trigger});
    }
  }
  return result;
 }

 function applyEnvironmentHazardToUnit(unit,{reason="環境",waterTrigger="CHANGE",includeFire=true}={}){
  const s=state();if(!unit?.alive)return 0;
  let total=0;
  const water=applyWaterInteraction(unit,{trigger:waterTrigger,reason});
  total+=Number(water?.damage||0);
  if(!unit.alive||!includeFire||!s.environmentState)return total;
  const burning=EnvironmentEngine.effectAt(s.environmentState,unit.x,unit.y).find(effect=>effect.type===EnvironmentEngine.EFFECT.BURNING);if(!burning)return total;
  const damage=Math.max(0,Number(burning.damage||EnvironmentEngine.HAZARD?.BURNING_DAMAGE||0));if(damage<=0)return total;
  unit.hp=Math.max(0,unit.hp-damage);total+=damage;ctx.pushLog(`${unit.character.name} ${reason}｜燃燒傷害 ${damage}｜HP ${unit.hp}。`,"BATTLE");
  if(unit.hp<=0&&unit.alive){unit.alive=false;ctx.pushLog(`${unit.character.name} 被環境火焰擊倒。`,"BATTLE");ctx.handleDefeated(unit,null,{type:"BURNING",source:"ENVIRONMENT"});}return total;
 }

 function enterTile(unit){
  const s=state();if(!unit?.alive)return;
  ctx.stageEvent({type:"ENTER_TILE",unitId:unit.id,characterId:unit.character.id,x:unit.x,y:unit.y,z:Number(unit.z??(TacticalEngine.elevation(TacticalEngine.tile(s.map,unit.x,unit.y))||0)),team:teamLabel(unit.team)});
  applyEnvironmentHazardToUnit(unit,{reason:"踏入環境區",waterTrigger:"ENTER"});
 }

 function applyForcedMovement(source,target,distance,{name="強制位移",lift=0,damage=0,damageType="PHYSICAL",resistAxes=null}={}){
  const s=state();if(damage>0&&target?.alive)ctx.damageUnitFlat(target,damage,name);if(!target?.alive)return{applied:false,defeated:true,steps:[],falls:[],fallDamage:0};
  const result=PostEngagementEngine.forcedMove({map:s.map,units:s.units,source,target,effect:{type:"KNOCKBACK",distance,lift,force:{horizontal:distance,vertical:lift},...(resistAxes?{resistAxes}:{})},onCollision:resolveCollisionRuntime});
  if(result.applied){if(result.airborne){const d=result.displacement;ctx.pushLog(`${target.character.name} 被${name}捲起至 Z${result.travelZ}，位移 ${result.steps.length} 格${d?`｜重量 ${d.weightClass}｜力 ${d.baseLift}→有效升空 ${d.lift}`:""}。`,"BATTLE");}else ctx.pushLog(`${target.character.name} 被${name}推離 ${result.steps.length} 格。`,"BATTLE");if(result.landing)ctx.pushLog(`${target.character.name} 落地 Z${result.landing.fromZ}→H${result.landing.toZ}${result.fallDamage?`｜墜落傷害 ${result.fallDamage}｜HP ${target.hp}`:"｜無墜落傷害"}。`,result.fallDamage?"BATTLE":"DETAIL");if(target.alive)enterTile(target);}
  if(result.defeated)ctx.handleDefeated(target,source,{type:"ENVIRONMENT_FORCE",name,damageType});return result;
 }

 function traverseUnitPath(unit,path,{kind="UNIT"}={}){
  const s=state();for(const tile of path||[]){unit.x=tile.x;unit.y=tile.y;unit.z=Number(tile.elevation||0);enterTile(unit);if(!unit.alive)return{completed:false,reason:"DEFEATED"};const interaction=EnvironmentEngine.pathInteraction({state:s.environmentState,x:tile.x,y:tile.y,kind});const forced=interaction.effects?.find(e=>e.type==="FORCED_MOVE");if(forced){applyForcedMovement({x:tile.x,y:tile.y},unit,forced.distance,{name:forced.effect?.type==="FIRE_TORNADO"?"火龍捲":"龍捲風",lift:Number(forced.lift??forced.effect?.lift??0),damage:Number(forced.damage??forced.effect?.damage??0),damageType:forced.effect?.damageType||"PHYSICAL",resistAxes:forced.resistAxes||forced.effect?.resistAxes});return{completed:false,reason:"ENVIRONMENT_FORCE"};}}return{completed:true};
 }

 function applyEnvironmentHazards({reason="持續環境傷害"}={}){
  const s=state();
  for(const unit of (s.units||[]).filter(unit=>unit?.alive))applyEnvironmentHazardToUnit(unit,{reason,waterTrigger:"TICK"});
 }

 function resolveWeatherEvents(){const s=state();if(!s.environmentState)return;for(const event of EnvironmentEngine.rollWeatherEvent({map:s.map,state:s.environmentState,units:s.units})){if(event.type!=="LIGHTNING_STRIKE")continue;const unit=event.unit;if(!unit?.alive)continue;const names=(event.riskReasons||[]).map(r=>r==="METAL"?"金屬裝備":r==="WATER"?"水域":"樹木／森林");unit.hp=Math.max(0,unit.hp-Number(event.damage||0));ctx.pushLog(`⚡ 落雷擊中 ${unit.character.name}｜${event.damage} 傷害｜HP ${unit.hp}${names.length?`｜高風險：${names.join("＋")}`:""}。`,"BATTLE");if(unit.hp<=0&&unit.alive){unit.alive=false;ctx.handleDefeated(unit,null,{type:"LIGHTNING"});}}}

 function logEnvironmentEvent(event){
  if(event.type==="IGNITE")ctx.pushLog(`(${event.x},${event.y}) 燃燒起來，成為火光來源。`,"SYSTEM");
  else if(event.type==="FIRE_EXTINGUISHED")ctx.pushLog(`(${event.x},${event.y}) 的火焰被水熄滅。`,"SYSTEM");
  else if(event.type==="RAIN_EXTINGUISHED_FIRE")ctx.pushLog(`豪雨熄滅 (${event.x},${event.y}) 的普通火焰。`,"SYSTEM");
  else if(event.type==="RAIN_SUPPRESSED_FIRE")ctx.pushLog(`豪雨壓制 (${event.x},${event.y}) 的小火，無法形成燃燒地形。`,"SYSTEM");
  else if(event.type==="MUD_CREATED")ctx.pushLog(`豪雨使 (${event.x},${event.y}) 的平地化為泥濘。`,"DETAIL");
  else if(event.type==="MUD_DRY")ctx.pushLog(`(${event.x},${event.y}) 的泥濘乾燥，恢復為平地。`,"DETAIL");
  else if(event.type==="WATER_EVAPORATED")ctx.pushLog(`高熱蒸乾 (${event.x},${event.y}) 的水域，地形轉為陸地。`,"SYSTEM");
  else if(event.type==="STEAM_CREATED")ctx.pushLog(`高熱與水分作用，(${event.x},${event.y}) 產生蒸氣迷霧。`,"SYSTEM");
  else if(event.type==="STONE_FRAGMENT")ctx.pushLog(`爆炸擊中石質物件，(${event.x},${event.y}) 產生破片${event.destroyed?"並炸開道路":""}。`,"SYSTEM");
  else if(event.type==="TORNADO_CREATED")ctx.pushLog(`(${event.x},${event.y}) 形成龍捲風場。`,"DETAIL");
  else if(event.type==="FIRE_TORNADO_CREATED")ctx.pushLog(`(${event.x},${event.y}) 的燃燒區被風捲起，形成火龍捲。`,"SYSTEM");
  else if(event.type==="ELECTRIC_CONDUCTION")ctx.pushLog(`⚡ (${event.x},${event.y}) 發生雷元素傳導。`,"SYSTEM");
 }
 return Object.freeze({resolveCollisionRuntime,applyForcedMovement,traverseUnitPath,applyWaterInteraction,applyEnvironmentHazardToUnit,applyEnvironmentHazards,enterTile,resolveWeatherEvents,logEnvironmentEvent});
}
window.BattleEnvironmentController=Object.freeze({create});
})();
