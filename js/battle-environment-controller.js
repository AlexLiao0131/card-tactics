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
 function applyEnvironmentHazardToUnit(unit,{reason="環境"}={}){
  const s=state();if(!s.environmentState||!unit?.alive)return 0;
  const burning=EnvironmentEngine.effectAt(s.environmentState,unit.x,unit.y).find(effect=>effect.type===EnvironmentEngine.EFFECT.BURNING);if(!burning)return 0;
  const damage=Math.max(0,Number(burning.damage||EnvironmentEngine.HAZARD?.BURNING_DAMAGE||0));if(damage<=0)return 0;
  unit.hp=Math.max(0,unit.hp-damage);ctx.pushLog(`${unit.character.name} ${reason}｜燃燒傷害 ${damage}｜HP ${unit.hp}。`,"BATTLE");
  if(unit.hp<=0&&unit.alive){unit.alive=false;ctx.pushLog(`${unit.character.name} 被環境火焰擊倒。`,"BATTLE");ctx.handleDefeated(unit,null,{type:"BURNING",source:"ENVIRONMENT"});}return damage;
 }
 function enterTile(unit){
  const s=state();if(!unit?.alive)return;
  ctx.stageEvent({type:"ENTER_TILE",unitId:unit.id,characterId:unit.character.id,x:unit.x,y:unit.y,z:Number(unit.z??(TacticalEngine.elevation(TacticalEngine.tile(s.map,unit.x,unit.y))||0)),team:unit.team===ctx.TEAM.PLAYER?"PLAYER":"ENEMY"});
  applyEnvironmentHazardToUnit(unit,{reason:"踏入燃燒區"});
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
 function applyEnvironmentHazards({reason="持續燃燒"}={}){const s=state();if(!s.environmentState)return;[...ctx.living(ctx.TEAM.PLAYER),...ctx.living(ctx.TEAM.ENEMY)].forEach(unit=>applyEnvironmentHazardToUnit(unit,{reason}));}
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
 return Object.freeze({resolveCollisionRuntime,applyForcedMovement,traverseUnitPath,applyEnvironmentHazardToUnit,applyEnvironmentHazards,enterTile,resolveWeatherEvents,logEnvironmentEvent});
}
window.BattleEnvironmentController=Object.freeze({create});
})();
