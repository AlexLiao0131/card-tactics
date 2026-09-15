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
    const context=createContext(options);
    return execute(context,hooks);
  }

  return {createContext,buildQueue,execute,resolve,actionSpeed};
})();
