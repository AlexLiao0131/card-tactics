(()=>{
"use strict";
function create(ctx){
 if(!ctx?.state||!ctx?.setMatchResult)throw new Error("BattleObjectiveController requires state/setMatchResult.");
 function hasPendingReinforcement(team){const s=ctx.state(),script=window.STAGE_SCRIPTS?.[s.stageState?.scriptId];if(!script)return false;return(script.events||[]).some(item=>{if(item.once&&s.stageState?.fired?.has(item.id))return false;return(item.actions||[]).some(action=>action.type==="SPAWN"&&action.team===team);});}
 function objectiveContext(){const s=ctx.state(),areas={};for(const point of DeploymentEngine.points(s.stage))areas[point.id]=point.area||point.captureTiles||[];for(const[id,area]of Object.entries(s.stage.objectiveAreas||{}))areas[id]=area;return{round:s.round,units:s.units,cores:s.cores,cardState:s.cardState,enemyCardState:s.enemyCardState,areas,deploymentPoints:DeploymentEngine.points(s.stage),isCharacterCard:id=>CardDatabase.isCharacter(CardDatabase.get(id)),hasPendingReinforcement};}
 function checkMatchEnd(){const s=ctx.state();if(s.matchResult)return true;const result=ObjectiveEngine.evaluateMatch(s.stage,objectiveContext());if(!result.ended)return false;ctx.setMatchResult(result.result);ctx.onMatchEnd?.(result.result);return true;}
 return Object.freeze({hasPendingReinforcement,objectiveContext,checkMatchEnd});
}
window.BattleObjectiveController=Object.freeze({create});
})();
