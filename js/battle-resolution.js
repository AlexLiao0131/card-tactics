window.BattleResolution=(()=>{
  function createContext({map,initiator,target,skill,actions=[]}){
    const primary={
      id:"primary",
      role:"INITIATOR",
      actor:initiator,
      target,
      skill
    };
    return {map,initiator,target,skill,participants:[initiator,target],actions:[primary,...actions]};
  }


  function distance(a,b){
    return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  }

  function supportCandidates({units,initiator,target,canUseSkill}){
    const candidates=[];
    for(const ally of units){
      if(!ally.alive||ally.id===initiator.id||ally.team!==initiator.team) continue;
      const inArea=Math.abs(ally.x-initiator.x)<=1&&Math.abs(ally.y-initiator.y)<=1;
      if(!inArea) continue;

      const skill=SkillDatabase.list(ally.character.skills).find(s=>{
        if(s.support!==true||s.target!=="ENEMY") return false;
        if(canUseSkill&&!canUseSkill(ally,s)) return false;
        const r=s.range||{min:1,max:1};
        const d=distance(ally,target);
        return d>=r.min&&d<=r.max;
      });
      if(skill) candidates.push({ally,skill});
    }
    return candidates;
  }

  function createSupportActions(options,hooks={}){
    return supportCandidates({
      units:options.units||[],
      initiator:options.initiator,
      target:options.target,
      canUseSkill:hooks.canUseSkill
    }).map(({ally,skill},index)=>({
      id:`support-${index}`,
      role:"SUPPORT",
      actor:ally,
      target:options.target,
      skill
    }));
  }

  function actionSpeed(action){
    return BattleEngine.actionSpeed(action.actor.character,action.skill);
  }

  function buildQueue(context){
    return context.actions
      .filter(a=>a.actor?.alive&&a.target?.alive&&a.skill)
      .map((action,index)=>({...action,index,spd:actionSpeed(action)}))
      .sort((a,b)=>b.spd-a.spd||a.index-b.index);
  }

  function execute(context,hooks={}){
    const queue=buildQueue(context);
    const results=[];
    for(const action of queue){
      const {actor,target,skill}=action;
      if(!actor.alive||!target.alive) continue;
      if(hooks.canUseSkill&&!hooks.canUseSkill(actor,skill)) continue;

      const resolved=TacticalEngine.resolve(context.map,actor,target,skill);
      const result=resolved.result;

      hooks.consumeSkill?.(actor,skill);
      target.hp=Math.max(0,target.hp-result.damage);
      if(target.hp===0){
        target.alive=false;
        hooks.onDefeated?.(target,actor,skill);
      }

      const entry={...action,resolved,result,hpAfter:target.hp};
      results.push(entry);
      hooks.onAction?.(entry);
    }
    return {context,queue,results};
  }

  function resolve(options,hooks={}){
    const supportActions=options.includeSupport===false?[]:createSupportActions(options,hooks);
    const context=createContext({...options,actions:[...(options.actions||[]),...supportActions]});
    return execute(context,hooks);
  }

  return {createContext,buildQueue,execute,resolve,actionSpeed,supportCandidates,createSupportActions};
})();
