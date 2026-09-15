window.BattleResolution=(()=>{
  function createContext({map,initiator,target,skill,actions=[],reaction=null}){
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

    return {
      map,
      initiator,
      target,
      skill,
      reaction,
      participants,
      actions:[primary,...actions]
    };
  }

  function distance(a,b){
    return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  }

  function isSingleTarget(skill){
    return (skill?.targetType||"SINGLE")==="SINGLE";
  }

  function supportSkills({ally,target,canUseSkill}){
    return SkillDatabase.list(ally.character.skills).filter(skill=>{
      if(skill.support!==true||skill.target!=="ENEMY") return false;
      if(!isSingleTarget(skill)) return false;
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

  // Counter is a normal queued attack action. It is deliberately not a
  // special damage formula: SPD + Skill Speed decides its place in queue.
  function counterSkills({defender,attacker,canUseSkill}){
    if(!defender?.alive||!attacker?.alive) return [];

    return SkillDatabase.list(defender.character.skills).filter(skill=>{
      if(skill.target!=="ENEMY") return false;
      if(!isSingleTarget(skill)) return false;
      if(canUseSkill&&!canUseSkill(defender,skill)) return false;

      const r=skill.range||{min:1,max:1};
      const d=distance(defender,attacker);
      return d>=r.min&&d<=r.max;
    });
  }

  function createCounterAction(defender,attacker,skill){
    return {
      id:`counter-${defender.id}`,
      role:"COUNTER",
      actor:defender,
      target:attacker,
      skill
    };
  }

  // Formal reaction descriptor. DEFENSE and EVADE are recorded here now,
  // but their numeric outcome is intentionally not invented in this step.
  // They will be resolved by the defense-method layer once its data is set.
  function createReaction(type,options={}){
    if(!["COUNTER","DEFENSE","EVADE"].includes(type)){
      throw new Error(`Unknown reaction type: ${type}`);
    }
    return {type,...options};
  }

  function prepareSingleTargetReaction({
    defender,
    attacker,
    canUseSkill
  }){
    return {
      defender,
      attacker,
      counterSkills:counterSkills({defender,attacker,canUseSkill}),
      choices:["COUNTER","DEFENSE","EVADE"]
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

      // A faster action may have killed either side already.
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
    const actions=[...(options.actions||[])];

    // Counter joins the same queue as initiator/support actions.
    if(options.reaction?.type==="COUNTER"&&options.reaction.skill){
      actions.push(createCounterAction(
        options.target,
        options.initiator,
        options.reaction.skill
      ));
    }

    const context=createContext({
      ...options,
      actions
    });

    return execute(context,hooks);
  }

  return {
    createContext,
    buildQueue,
    execute,
    resolve,
    actionSpeed,
    isSingleTarget,
    supportSkills,
    supportCandidates,
    createSupportAction,
    counterSkills,
    createCounterAction,
    createReaction,
    prepareSingleTargetReaction
  };
})();