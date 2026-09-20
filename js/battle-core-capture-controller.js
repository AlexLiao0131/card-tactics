(()=>{
"use strict";
function create(ctx){
 if(!ctx?.state||!ctx?.pushLog||!ctx?.checkMatchEnd)throw new Error("BattleCoreCaptureController requires state/log/checkMatchEnd.");
 const state=()=>ctx.state();
 const ownerForTeam=team=>team===ctx.TEAM.PLAYER?"PLAYER":"ENEMY";
 const enemyOwner=owner=>owner==="PLAYER"?"ENEMY":"PLAYER";
 function coreForOwner(owner){return state().cores.find(core=>core.owner===owner)||null}
 function coreAt(x,y){return state().cores.find(core=>core.hp>0&&core.x===x&&core.y===y)||null}
 function capturePointForUnit(unit){return DeploymentEngine.pointAt(state().stage,unit.x,unit.y)}
 function canUnitCapture(unit){const s=state(),point=capturePointForUnit(unit);return !!point&&DeploymentEngine.canCapture({stage:s.stage,units:s.units,unit,point})}
 function damageCore(owner,damage,source){const core=coreForOwner(owner);if(!core||core.hp<=0)return 0;const dealt=Math.min(core.hp,Math.max(0,Math.round(Number(damage||0))));core.hp=Math.max(0,core.hp-dealt);ctx.pushLog(`${source} → ${core.name}｜${dealt} 傷害｜CORE HP ${core.hp}/${core.maxHp}。`,"BATTLE");ctx.checkMatchEnd();return dealt}
 function executeCapture(unit){const s=state();if(!unit?.alive||unit.acted)return false;ctx.commitPendingMove(unit);const point=capturePointForUnit(unit);if(!point||!DeploymentEngine.canCapture({stage:s.stage,units:s.units,unit,point}))return false;const owner=ownerForTeam(unit.team),previousOwner=point.owner;if(!DeploymentEngine.capture(s.stage,point.id,owner))return false;ctx.pushLog(`${unit.character.name} 佔領「${point.name}」｜${previousOwner} → ${owner}。`,"SYSTEM");const damage=Number(s.stage.captureDamage||0);if(damage>0)damageCore(enemyOwner(owner),damage,`${point.name} Core 砲擊`);ctx.stageEvent({type:"DEPLOYMENT_POINT_CAPTURED",pointId:point.id,owner,previousOwner,unitId:unit.id,characterId:unit.character.id,x:unit.x,y:unit.y});unit.moved=true;unit.acted=true;unit.waited=true;ctx.onCaptureComplete?.(unit,point);return true}
 function coreCombatTarget(core,attackerTeam){if(!core||core.hp<=0)return null;return{kind:"CORE",id:`CORE:${core.owner}`,x:core.x,y:core.y,team:attackerTeam===ctx.TEAM.PLAYER?ctx.TEAM.ENEMY:ctx.TEAM.PLAYER,alive:true,core}}
 function combatTargetEntities(unit){const s=state(),entities=[...s.units];if(s.stage?.ruleset==="CORE_CAPTURE"){const owner=unit.team===ctx.TEAM.PLAYER?"ENEMY":"PLAYER",target=coreCombatTarget(coreForOwner(owner),unit.team);if(target)entities.push(target)}return entities}
 return Object.freeze({ownerForTeam,enemyOwner,coreForOwner,coreAt,capturePointForUnit,canUnitCapture,damageCore,executeCapture,coreCombatTarget,combatTargetEntities});
}
window.BattleCoreCaptureController=Object.freeze({create});
})();
