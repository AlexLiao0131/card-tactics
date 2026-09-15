window.BattleResolution=(()=>{
  function createContext({map,initiator,target,skill,actions=[]}){
    const primary={
      id:"primary",
      role:"INITIATOR",
      actor:initiator,
      target,
      skill
    };

    const participants=[];
    const seen=new Set();
    [initiator,target,...actions.map(a=>a.actor)].forEach(unit=>{
      if(unit&&!seen.has(unit.id)){
        seen.add(unit.id);
        participants.push(unit);
      }
    });

    return {map,initiator,target,skill,participants,actions:[primary,...actions]};
  }

  function distance(a,b){
    return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  }

  function supportSkills({ally,target,canUseSkill}){
    return SkillDatabase.list(ally.character.skills).filter(skill=>{
      if(skill.support!==true||skill.target!=="ENEMY") return false;
      if((skill.targetType||"SINGLE")!=="SINGLE") return false;
      if(canUseSkill&&!canUseSkill(ally,skill)) return false;

      const r=skill.range||{min:1,max:1};
      const d=distance(ally,target);
      return d>=r.min&&d<=r.max;
    });
  }

  function supportCandidates({units,initiator,target,canUseSkill}){
    const candidates=[];

    for(const ally of units){
      if(!ally.alive||ally.id===initiator.id||ally.team!==initiator.team) continue;
      if(ally.waited===true) continue;

      const inArea=
        Math.abs(ally.x-initiator.x)<=1 &&
        Math.abs(ally.y-initiator.y)<=1;
      if(!inArea) continue;

      const skills=supportSkills({ally,target,canUseSkill});
      if(skills.length) candidates.push({ally,skills});
    }

    return candidates;
  }

  function createSupportAction(ally,target,skill,index=0){
    return {
      id:`support-${ally.id}-${index}`,
      role:"SUPPORT",
      actor:ally,
      target,
      skill
    };
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
    const context=createContext({
      ...options,
      actions:[...(options.actions||[])]
    });
    return execute(context,hooks);
  }

  return {
    createContext,
    buildQueue,
    execute,
    resolve,
    actionSpeed,
    supportSkills,
    supportCandidates,
    createSupportAction
  };
})();