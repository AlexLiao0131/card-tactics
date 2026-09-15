window.STAGE_SCRIPTS={
  prototype_script:{
    id:"prototype_script",
    events:[
      {
        id:"round3_reinforcement_demo",
        trigger:{type:"ROUND_START",round:3,team:"PLAYER"},
        once:true,
        actions:[
          {type:"LOG",text:"【事件框架測試】遠方傳來增援的腳步聲。"}
        ]
      }
    ]
  }
};

window.StageEngine=(()=>{
  function create(scriptId){
    return {scriptId,fired:new Set(),flags:{}};
  }
  function matches(trigger,event){
    if(!trigger||trigger.type!==event.type)return false;
    for(const [key,value] of Object.entries(trigger)){
      if(key==="type")continue;
      if(event[key]!==value)return false;
    }
    return true;
  }
  function run(state,event,context){
    const script=STAGE_SCRIPTS[state.scriptId];
    if(!script)return [];
    const executed=[];
    for(const item of script.events||[]){
      if(item.once&&state.fired.has(item.id))continue;
      if(!matches(item.trigger,event))continue;
      let ok=true;
      for(const condition of item.conditions||[]){
        if(condition.type==="UNIT_HP_BELOW"){
          const unit=context.units.find(u=>u.id===condition.unitId||u.character.id===condition.characterId);
          if(!unit||unit.hp/unit.character.combat.hp*100>=condition.percent)ok=false;
        }else if(condition.type==="FLAG"){
          if(state.flags[condition.key]!==condition.value)ok=false;
        }
      }
      if(!ok)continue;
      for(const action of item.actions||[]){
        if(action.type==="LOG"||action.type==="DIALOGUE"){
          context.log(action.type==="DIALOGUE"?`${action.speaker||""}：${action.text}`:action.text);
        }else if(action.type==="SPAWN"){
          context.spawn(action);
        }else if(action.type==="SET_FLAG"){
          state.flags[action.key]=action.value;
        }else if(action.type==="SET_OBJECTIVE"){
          context.setObjective?.(action);
        }
      }
      if(item.once)state.fired.add(item.id);
      executed.push(item.id);
    }
    return executed;
  }
  return {create,run};
})();
