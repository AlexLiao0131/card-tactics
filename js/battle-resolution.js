window.BattleResolution=(()=>{
  const ACTIVE_EVADE_PENALTY=20;
  const GRAZE_DAMAGE_MULTIPLIER=.5;

  function createContext({map,initiator,target,skill,actions=[],reaction=null,guardian=null}){
    const originalTarget=target;
    const effectiveTarget=guardian?.alive?guardian:target;
    const primary={
      id:"primary",
      role:"INITIATOR",
      actor:initiator,
      target:effectiveTarget,
      skill
    };

    const participants=[];
    const seen=new Set();
    [initiator,originalTarget,effectiveTarget,...actions.map(a=>a.actor)].forEach(unit=>{
      if(unit&&!seen.has(unit.id)){
        seen.add(unit.id);
        participants.push(unit);
      }
    });

    return {
      map,
      initiator,
      target:effectiveTarget,
      originalTarget,
      guardian:guardian?.alive?guardian:null,
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
      const inArea=Math.abs(ally.x-initiator.x)<=1&&Math.abs(ally.y-initiator.y)<=1;
      if(!inArea) continue;
      const skills=supportSkills({ally,target,canUseSkill});
      if(skills.length) candidates.push({ally,skills});
    }
    return candidates;
  }

  function createSupportAction(ally,target,skill,index=0){
    return {id:`support-${ally.id}-${index}`,role:"SUPPORT",actor:ally,target,skill};
  }

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
    return {id:`counter-${defender.id}`,role:"COUNTER",actor:defender,target:attacker,skill};
  }

  function createReaction(type,options={}){
    if(!["COUNTER","DEFENSE","EVADE"].includes(type)){
      throw new Error(`Unknown reaction type: ${type}`);
    }
    return {type,...options};
  }

  function defenseMethods(defender){
    return EquipmentDatabase.defenseProfiles(defender?.character);
  }

  function guardProfiles(unit){
    return defenseMethods(unit).filter(profile=>profile.canGuardAlly===true);
  }

  function guardCandidates({units,target}){
    if(!target?.alive) return [];
    const candidates=[];
    for(const guardian of units||[]){
      if(!guardian.alive||guardian.id===target.id||guardian.team!==target.team) continue;
      const orthogonal=distance(guardian,target)===1;
      if(!orthogonal) continue;
      const profiles=guardProfiles(guardian);
      if(profiles.length) candidates.push({guardian,profiles});
    }
    return candidates;
  }

  function prepareSingleTargetReaction({defender,attacker,canUseSkill}){
    return {
      defender,attacker,
      counterSkills:counterSkills({defender,attacker,canUseSkill}),
      defenseMethods:defenseMethods(defender),
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

  function attackType(actor,skill){
    const weapon=actor?.character?.weapons?.[skill?.weapon];
    return skill?.attackType==="INHERIT"?weapon?.attackType:skill?.attackType;
  }

  function attackWeapon(actor,skill){
    return actor?.character?.weapons?.[skill?.weapon]||null;
  }

  function hasAffix(item,id){
    return item?.affixes?.includes(id)===true;
  }

  function defenseProfileById(defender,id){
    if(!id) return null;
    return defenseMethods(defender).find(profile=>profile.id===id)||null;
  }

  function isPrimaryIncomingAction(context,action){
    return action.role==="INITIATOR"&&
      action.actor?.id===context.initiator?.id&&
      action.target?.id===context.target?.id;
  }

  function resolveEvade(map,actor,target,skill){
    const resolved=TacticalEngine.resolve(map,actor,target,skill,{forceHit:true});
    const base=resolved.result;
    const originalHit=base.hc;
    const focusedHit=Math.max(0,originalHit-ACTIVE_EVADE_PENALTY);
    const roll=Math.random()*100;
    let outcome="MISS",multiplier=0;
    if(roll<focusedHit){outcome="HIT";multiplier=1;}
    else if(roll<originalHit){outcome="GRAZE";multiplier=GRAZE_DAMAGE_MULTIPLIER;}
    const damage=Math.round(base.damage*multiplier);
    return {...resolved,result:{...base,hit:outcome!=="MISS",graze:outcome==="GRAZE",
      evadeOutcome:outcome,evadeRoll:roll,originalHitChance:originalHit,
      activeHitChance:focusedHit,damage}};
  }

  function resolveDefense(map,actor,target,skill,reaction){
    const profile=defenseProfileById(target,reaction?.methodId);
    if(!profile){
      return {...TacticalEngine.resolve(map,actor,target,skill),
        defense:{method:null,valid:false,reason:"DEFENSE_METHOD_NOT_FOUND"}};
    }
    const type=attackType(actor,skill);
    const rule=profile.vs?.[type];
    if(!rule){
      return {...TacticalEngine.resolve(map,actor,target,skill),
        defense:{method:profile,valid:false,reason:"ATTACK_TYPE_NOT_SUPPORTED",attackType:type}};
    }
    const resolved=TacticalEngine.resolve(map,actor,target,skill);
    const base=resolved.result;
    if(!base.hit){
      return {...resolved,defense:{method:profile,valid:true,attackType:type,triggered:false,reason:"ATTACK_MISSED"}};
    }
    const weapon=attackWeapon(actor,skill);
    const ordinaryGuardBypassed=profile.method==="GUARD"&&hasAffix(weapon,"PHYSICAL_DEFENSE_IGNORE")&&profile.artifact!==true;
    if(ordinaryGuardBypassed){
      return {...resolved,defense:{method:profile,valid:true,attackType:type,triggered:false,bypassed:true,reason:"PHYSICAL_DEFENSE_IGNORE"}};
    }
    let success=true,roll=null;
    if(Number.isFinite(Number(rule.chance))){
      roll=Math.random()*100;
      success=roll<Number(rule.chance);
    }
    let multiplier=1;
    if(success){
      multiplier=profile.method==="PARRY"?0:
        (Number.isFinite(Number(rule.damageMultiplier))?Number(rule.damageMultiplier):1);
    }
    const damage=Math.round(base.damage*multiplier);
    return {...resolved,result:{...base,damage},defense:{
      method:profile,valid:true,attackType:type,triggered:true,success,roll,
      chance:Number.isFinite(Number(rule.chance))?Number(rule.chance):null,
      damageMultiplier:multiplier
    }};
  }

  function resolveAction(context,action){
    const {actor,target,skill}=action;
    const reaction=context.reaction;
    if(!isPrimaryIncomingAction(context,action)||!reaction){
      return TacticalEngine.resolve(context.map,actor,target,skill);
    }
    if(reaction.type==="EVADE"&&!context.guardian){
      return resolveEvade(context.map,actor,target,skill);
    }
    if(reaction.type==="DEFENSE"){
      return resolveDefense(context.map,actor,target,skill,reaction);
    }
    return TacticalEngine.resolve(context.map,actor,target,skill);
  }

  function execute(context,hooks={}){
    const queue=buildQueue(context),results=[];
    for(const action of queue){
      const {actor,target,skill}=action;
      if(!actor.alive||!target.alive) continue;
      if(hooks.canUseSkill&&!hooks.canUseSkill(actor,skill)) continue;
      const resolved=resolveAction(context,action);
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
    if(options.reaction?.type==="COUNTER"&&options.reaction.skill){
      // Guard Ally redirects the incoming action only. The original target still owns Counter.
      actions.push(createCounterAction(options.target,options.initiator,options.reaction.skill));
    }
    const context=createContext({...options,actions});
    return execute(context,hooks);
  }

  return {
    createContext,buildQueue,execute,resolve,actionSpeed,isSingleTarget,
    supportSkills,supportCandidates,createSupportAction,counterSkills,
    createCounterAction,createReaction,defenseMethods,guardProfiles,
    guardCandidates,prepareSingleTargetReaction
  };
})();