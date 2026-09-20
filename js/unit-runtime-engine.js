window.UnitRuntimeEngine=(()=>{
  function createSkillResources(character){
    const resources={};
    SkillDatabase.list(character?.skills||[]).forEach(skill=>{
      const resource=skill.resource||{type:"UNLIMITED"};
      if(resource.type==="USES")resources[skill.id]={type:"USES",remaining:Number(resource.max||0),max:Number(resource.max||0)};
      else resources[skill.id]={type:resource.type||"UNLIMITED"};
    });
    return resources;
  }
  function create({id,team,characterId,x,y,map}){
    const sourceCharacter=CHARACTERS[characterId];
    if(!sourceCharacter)return null;
    const character=JSON.parse(JSON.stringify(sourceCharacter));
    return {id,team,character,x,y,z:Number(TacticalEngine.elevation(TacticalEngine.tile(map,x,y))||0),
      hp:character.combat.hp,alive:true,moved:false,acted:false,waited:false,
      skillResources:createSkillResources(character),effects:[],grantedSkills:[]};
  }
  function living(units,team){return (units||[]).filter(u=>u.alive&&u.team===team)}
  function resetActions(units,team){living(units,team).forEach(u=>{u.moved=false;u.acted=false;u.waited=false;})}
  function allFinished(units,team){const alive=living(units,team);return alive.length>0&&alive.every(u=>u.acted)}
  function resourceFor(unit,skill){return unit?.skillResources?.[skill?.id]||{type:"UNLIMITED"}}
  function canUseSkill(unit,skill){if(skill?.approach&&unit?.moved)return false;const r=resourceFor(unit,skill);return r.type!=="USES"||r.remaining>0}
  function consumeSkill(unit,skill){const r=resourceFor(unit,skill);if(r.type==="USES"&&r.remaining>0)r.remaining--;return r}
  function resourceLabel(unit,skill){const r=resourceFor(unit,skill);return r.type==="USES"?`${r.remaining}/${r.max}`:"∞"}
  function targetType(skill){return skill?.targetType||"SINGLE"}
  return Object.freeze({createSkillResources,create,living,resetActions,allFinished,resourceFor,canUseSkill,consumeSkill,resourceLabel,targetType});
})();
