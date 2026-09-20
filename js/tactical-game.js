(()=>{
  const ICON={PLAIN:"",MUD:"≋",FOREST:"🌲",HIGH_GROUND:"▲",WATER:"≈",WALL:"■"};
  const TEAM={PLAYER:"P",ENEMY:"E"};
  const PHASE={CARD:"CARD_PHASE",PLAYER:"PLAYER_TURN",ENEMY:"ENEMY_TURN",ENDED:"MATCH_ENDED"};

  let map,units,selected,mode,selectedSkill,selectedSkillVariant,logs,round,phase,matchResult,stage,stageState,environmentState,inspectedTile,cores=[];
  let logState=BattleLog.create(),cardState=null,enemyCardState=null,pendingCard=null,unitSerial=0;
  let enemyView={active:false,kind:null,message:"",cardId:null,unitId:null};
  let pendingEngagement=null;
  let supportSelection=new Map();
  let pendingCopySkill=null;
  let battleContext=null,enemyController=null,cardPhaseController=null;
  let renderRevision=0;

  // Engagement Step 4: enemy SINGLE attacks pause here until the player chooses a reaction.
  let pendingEnemyAttack=null;
  let pendingReactionType=null;
  let selectedGuardian=null;
  let selectedGuardInterception=null;
  let commandPanelCollapsed=false;

  function pushLog(text,type="SYSTEM"){
    logs.push(String(text));
    if(logs.length>240)logs.splice(0,logs.length-240);
    BattleLog.add(logState,type,String(text));
    window.dispatchEvent(new CustomEvent("cardtactics:log"));
  }

  function logPostEffect(entry){
    const {source,target,effect,result}=entry;
    if(!result)return;
    if(!result.applied){
      pushLog(`${target.character.name}｜${effect.type} 未生效${result.reason?`（${result.reason}）`:""}。`,"DETAIL");
      return;
    }
    const moved=result.steps?.length||0;
    const visitCollisions=(r,mover=target)=>{for(const collision of r?.collisions||[]){resolveCollisionRuntime(collision,{mover,source});if(collision.chain&&collision.surface?.unit)visitCollisions(collision.chain,collision.surface.unit);}};
    visitCollisions(result);
    pushLog(`${source.character.name} → ${target.character.name}：${effect.type==="PULL"?"拉近":"擊退"} ${moved} 格。`,"BATTLE");
    if(result.falls?.length){
      const drops=result.falls.map(f=>`Z${f.from}→H${f.to}`).join("、");
      pushLog(`${target.character.name} 墜落 ${drops}｜墜落傷害 ${result.fallDamage}｜HP ${target.hp}。`,"BATTLE");
    }else{
      pushLog(`${target.character.name} 強制位移完成｜無墜落傷害。`,"DETAIL");
    }
    if(result.applied&&target.alive)enterTile(target);
  }

  function handleDefeated(unit,source,skillOrEffect){
    stageEvent({type:"UNIT_DEFEATED",unitId:unit.id,characterId:unit.character.id,team:unit.team});
    const ownerCardState=unit.team===TEAM.PLAYER?cardState:enemyCardState;
    if(unit.cardId&&ownerCardState){
      CardPhaseEngine.characterDefeated(ownerCardState,unit.cardId);
      pushLog(`${unit.character.name} 戰敗，角色卡進入墓地。`,"SYSTEM");
    }
  }



  function resolveCollisionRuntime(collision,{mover,source}={}){
    if(!collision)return;
    const surface=collision.surface||{},moverName=mover?.character?.name||"單位";
    if(surface.kind==="SHIELD"){
      pushLog(`${moverName} 撞上 ${surface.unit?.character?.name||"防禦者"} 的防禦面｜撞擊傷害 ${collision.damage||0}｜HP ${mover?.hp??"-"}。`,"BATTLE");
    }else if(surface.kind==="UNIT"){
      pushLog(`${moverName} 撞上 ${surface.unit?.character?.name||"單位"}｜撞擊傷害 ${collision.damage||0}${collision.transferred?"｜力量傳遞，觸發連鎖擊飛":"｜位移被阻擋"}。`,"BATTLE");
    }else if(surface.kind==="OBJECT"){
      const object=surface.object;
      pushLog(`${moverName} 撞上 ${object?.name||object?.id||"物件"}｜撞擊傷害 ${collision.damage||0}${collision.objectDamage?`｜物件耐久 -${collision.objectDamage}`:""}${collision.objectDestroyed?"｜物件破壞":""}。`,"BATTLE");
      if(collision.objectDestroyed&&environmentState){
        environmentState.destroyedObjects?.add?.(object.id);
        const tile=TacticalEngine.tile(map,object.x,object.y);
        if(tile&&object.breaksIntoTerrain)tile.terrain=object.breaksIntoTerrain;
      }
    }else pushLog(`${moverName} 撞上地形／邊界｜撞擊傷害 ${collision.damage||0}｜HP ${mover?.hp??"-"}。`,"BATTLE");
    if(mover&&!mover.alive)handleDefeated(mover,source,{type:"COLLISION",surface:surface.kind});
  }

  function applyForcedMovement(source,target,distance,{name="強制位移",lift=0,damage=0,damageType="PHYSICAL",resistAxes=null}={}){
    if(damage>0&&target?.alive)damageUnitFlat(target,damage,name);
    if(!target?.alive)return {applied:false,defeated:true,steps:[],falls:[],fallDamage:0};
    const result=PostEngagementEngine.forcedMove({map,units,source,target,effect:{type:"KNOCKBACK",distance,lift,force:{horizontal:distance,vertical:lift},...(resistAxes?{resistAxes}:{})},onCollision:resolveCollisionRuntime});
    if(result.applied){
      if(result.airborne){
        const d=result.displacement;
        pushLog(`${target.character.name} 被${name}捲起至 Z${result.travelZ}，位移 ${result.steps.length} 格${d?`｜重量 ${d.weightClass}｜力 ${d.baseLift}→有效升空 ${d.lift}`:""}。`,"BATTLE");
      }
      else pushLog(`${target.character.name} 被${name}推離 ${result.steps.length} 格。`,"BATTLE");
      if(result.landing)pushLog(`${target.character.name} 落地 Z${result.landing.fromZ}→H${result.landing.toZ}${result.fallDamage?`｜墜落傷害 ${result.fallDamage}｜HP ${target.hp}`:"｜無墜落傷害"}。`,result.fallDamage?"BATTLE":"DETAIL");
      if(target.alive)enterTile(target);
    }
    if(result.defeated)handleDefeated(target,source,{type:"ENVIRONMENT_FORCE",name,damageType});
    return result;
  }

  function traverseUnitPath(unit,path,{kind="UNIT"}={}){
    for(const tile of path||[]){
      unit.x=tile.x;unit.y=tile.y;unit.z=Number(tile.elevation||0);enterTile(unit);
      if(!unit.alive)return {completed:false,reason:"DEFEATED"};
      const interaction=EnvironmentEngine.pathInteraction({state:environmentState,x:tile.x,y:tile.y,kind});
      const forced=interaction.effects?.find(e=>e.type==="FORCED_MOVE");
      if(forced){
        applyForcedMovement({x:tile.x,y:tile.y},unit,forced.distance,{name:forced.effect?.type==="FIRE_TORNADO"?"火龍捲":"龍捲風",lift:Number(forced.lift||forced.effect?.lift||0),damage:Number(forced.damage||forced.effect?.damage||0),damageType:forced.effect?.damageType||"PHYSICAL",resistAxes:forced.resistAxes||forced.effect?.resistAxes});
        return {completed:false,reason:"ENVIRONMENT_FORCE"};
      }
    }
    return {completed:true};
  }

  function damageUnitFlat(unit,damage,sourceName){
    if(!unit?.alive)return;
    unit.hp=Math.max(0,unit.hp-Math.max(0,Number(damage||0)));
    pushLog(`${sourceName} → ${unit.character.name}｜${damage} 傷害｜HP ${unit.hp}。`,"BATTLE");
    if(unit.hp<=0&&unit.alive){unit.alive=false;handleDefeated(unit,null,{type:"CARD_SPELL",name:sourceName});}
  }

  function createMap(){
    return MapDatabase.createMap(stage.mapId);
  }

  function createSkillResources(character){
    const resources={};
    SkillDatabase.list(character.skills).forEach(skill=>{
      const resource=skill.resource||{type:"UNLIMITED"};
      if(resource.type==="USES"){
        resources[skill.id]={type:"USES",remaining:Number(resource.max||0),max:Number(resource.max||0)};
      }else{
        resources[skill.id]={type:resource.type||"UNLIMITED"};
      }
    });
    return resources;
  }

  function createUnit(id,team,characterId,x,y){
    const sourceCharacter=CHARACTERS[characterId];
    const character=JSON.parse(JSON.stringify(sourceCharacter));
    return {
      id,team,character,x,y,z:Number(TacticalEngine.elevation(TacticalEngine.tile(map,x,y))||0),
      hp:character.combat.hp,
      alive:true,
      moved:false,
      acted:false,
      waited:false,
      skillResources:createSkillResources(character),
      effects:[],
      grantedSkills:[]
    };
  }

  function resetBattle(){
    enemyController?.reset?.();
    actionController?.reset?.();
    const requestedStageId=window.CardTacticsBattleSetup?.stageId||"prototype_battle";
    stage=StageDatabase.get(requestedStageId);
    if(!stage) throw new Error(`Unknown stage: ${requestedStageId}`);
    stageState=StageEngine.create(stage.scriptId);
    map=createMap();
    cores=(stage.cores||[]).map(core=>({...core,hp:Number(core.hp??core.maxHp??0),maxHp:Number(core.maxHp??core.hp??0)}));
    environmentState=window.EnvironmentEngine?EnvironmentEngine.create(stage.environment||{}):null;
    units=[];
    unitSerial=0;
    logState=BattleLog.create();
    const forcedHeroIds=new Set(
      (stage.playerSpawns||[])
        .filter(spawn=>spawn.source==="STAGE")
        .map(spawn=>spawn.characterId)
    );
    const requestedDeck=Array.isArray(window.CardTacticsBattleSetup?.deck)&&window.CardTacticsBattleSetup.deck.length?window.CardTacticsBattleSetup.deck:stage.battleDeck||[];
    const battleDeck=requestedDeck.filter(cardId=>{
      const card=CardDatabase.get(cardId);
      return !(CardDatabase.isCharacter(card)&&card.unitType==="HERO"&&forcedHeroIds.has(card.characterId));
    });
    cardState=CardPhaseEngine.create({
      deck:battleDeck,
      startingCrystals:Number(stage.cardRules?.startingCrystals||4),
      maxCrystals:Number(stage.cardRules?.maxCrystals||10),
      crystalGrowth:Number(stage.cardRules?.crystalGrowth||1),
      handSize:Number(stage.cardRules?.handSize||5)
    });
    enemyCardState=CardPhaseEngine.create({
      deck:stage.enemyDeck||[],
      startingCrystals:Number(stage.enemyCardRules?.startingCrystals||stage.cardRules?.startingCrystals||4),
      maxCrystals:Number(stage.enemyCardRules?.maxCrystals||stage.cardRules?.maxCrystals||10),
      crystalGrowth:Number(stage.enemyCardRules?.crystalGrowth||stage.cardRules?.crystalGrowth||1),
      handSize:Number(stage.enemyCardRules?.handSize||stage.cardRules?.handSize||5)
    });
    DeckEngine.shuffle(cardState.zones);
    DeckEngine.shuffle(enemyCardState.zones);
    // Prepare the opponent opening hand without starting its turn or granting crystals.
    // Enemy Card Phase later calls begin(); because the hand is already full it only advances turn resources.
    DeckEngine.draw(enemyCardState.zones,Number(stage.enemyCardRules?.handSize||stage.cardRules?.handSize||5));

    (stage.playerSpawns||[]).forEach((u,i)=>units.push(createUnit("p"+i,TEAM.PLAYER,u.characterId,u.x,u.y)));
    (stage.enemySpawns||[]).forEach((u,i)=>units.push(createUnit("e"+i,TEAM.ENEMY,u.characterId,u.x,u.y)));

    selected=null;
    inspectedTile=null;
    selectedSkill=null;
    selectedSkillVariant=null;
    pendingEngagement=null;
    supportSelection=new Map();
    pendingEnemyAttack=null;
    pendingReactionType=null;
    selectedGuardian=null;
    selectedGuardInterception=null;
    mode="idle";
    logs=[];
    round=1;
    phase=PHASE.CARD;
    matchResult=null;
    stageEvent({type:"ROUND_START",round,team:"PLAYER"});
    cardPhaseController.begin({initial:true});
  }

  function unitAt(x,y){
    return units.find(u=>u.alive&&u.x===x&&u.y===y);
  }

  function spawnFromScript(action){
    const team=action.team==="PLAYER"?TEAM.PLAYER:TEAM.ENEMY;
    if(unitAt(action.x,action.y)) return null;
    const character=CHARACTERS[action.characterId];
    if(!character) return null;
    const prefix=team===TEAM.PLAYER?"p":"e";
    let n=0,id;
    do{id=`${prefix}s${n++}`;}while(units.some(u=>u.id===id));
    const unit=createUnit(id,team,action.characterId,action.x,action.y);
    units.push(unit);
    pushLog(`${character.name} 出現在 (${action.x},${action.y})。`);
    return unit;
  }

  function captureOwnerForTeam(team){
    return team===TEAM.PLAYER?"PLAYER":team===TEAM.ENEMY?"ENEMY":null;
  }

  function coreForOwner(owner){return cores.find(core=>core.owner===owner)||null;}
  function enemyOwner(owner){return owner==="PLAYER"?"ENEMY":"PLAYER";}
  function coreAt(x,y){return cores.find(core=>core.hp>0&&core.x===x&&core.y===y)||null;}
  function capturePointForUnit(unit){return DeploymentEngine.pointAt(stage,unit?.x,unit?.y);}
  function canUnitCapture(unit){
    const point=capturePointForUnit(unit);
    return !!point&&DeploymentEngine.canCapture({stage,units,unit,point});
  }
  function damageCore(owner,damage,source){
    const core=coreForOwner(owner);if(!core||core.hp<=0)return 0;
    const dealt=Math.min(core.hp,Math.max(0,Math.round(Number(damage||0))));
    core.hp=Math.max(0,core.hp-dealt);
    pushLog(`${source} → ${core.name}｜${dealt} 傷害｜CORE HP ${core.hp}/${core.maxHp}。`,"BATTLE");
    checkMatchEnd();return dealt;
  }
  function executeCapture(unit){
    if(!unit?.alive||unit.acted)return false;
    commitPendingMove(unit);
    const point=capturePointForUnit(unit);
    if(!point||!DeploymentEngine.canCapture({stage,units,unit,point}))return false;
    const owner=captureOwnerForTeam(unit.team),previousOwner=point.owner;
    if(!DeploymentEngine.capture(stage,point.id,owner))return false;
    const sideName=owner==="PLAYER"?"我方":"敵方";
    pushLog(`${unit.character.name} 佔領「${point.name}」｜${previousOwner} → ${owner}。`,"SYSTEM");
    const damage=Number(stage.captureDamage||0);
    if(damage>0)damageCore(enemyOwner(owner),damage,`${point.name} Core 砲擊`);
    stageEvent({type:"DEPLOYMENT_POINT_CAPTURED",pointId:point.id,owner,previousOwner,unitId:unit.id,characterId:unit.character.id,x:unit.x,y:unit.y});
    unit.moved=true;unit.acted=true;unit.waited=true;mode="inspect";
    window.dispatchEvent(new CustomEvent("cardtactics:state"));render();return true;
  }
  function coreCombatTarget(core,attackerTeam){
    if(!core||core.hp<=0)return null;
    return {kind:"CORE",id:`CORE:${core.owner}`,x:core.x,y:core.y,team:attackerTeam===TEAM.PLAYER?TEAM.ENEMY:TEAM.PLAYER,alive:true,core};
  }
  function combatTargetEntities(unit){
    const entities=[...units];
    if(stage?.ruleset==="CORE_CAPTURE"){
      const owner=unit.team===TEAM.PLAYER?"ENEMY":"PLAYER",core=coreForOwner(owner),target=coreCombatTarget(core,unit.team);
      if(target)entities.push(target);
    }
    return entities;
  }
  function applyEnvironmentHazardToUnit(unit,{reason="環境"}={}){
    if(!environmentState||!unit?.alive)return 0;
    const burning=EnvironmentEngine.effectAt(environmentState,unit.x,unit.y).find(effect=>effect.type===EnvironmentEngine.EFFECT.BURNING);
    if(!burning)return 0;
    const damage=Math.max(0,Number(burning.damage||EnvironmentEngine.HAZARD?.BURNING_DAMAGE||0));
    if(damage<=0)return 0;
    unit.hp=Math.max(0,unit.hp-damage);
    pushLog(`${unit.character.name} ${reason}｜燃燒傷害 ${damage}｜HP ${unit.hp}。`,"BATTLE");
    if(unit.hp<=0&&unit.alive){
      unit.alive=false;
      pushLog(`${unit.character.name} 被環境火焰擊倒。`,"BATTLE");
      handleDefeated(unit,null,{type:"BURNING",source:"ENVIRONMENT"});
    }
    return damage;
  }

  function applyEnvironmentHazards({reason="持續燃燒"}={}){
    if(!environmentState)return;
    [...living(TEAM.PLAYER),...living(TEAM.ENEMY)].forEach(unit=>applyEnvironmentHazardToUnit(unit,{reason}));
  }

  function enterTile(unit){
    if(!unit?.alive)return;
    stageEvent({
      type:"ENTER_TILE",
      unitId:unit.id,
      characterId:unit.character.id,
      x:unit.x,
      y:unit.y,
      z:Number(unit.z??(TacticalEngine.elevation(TacticalEngine.tile(map,unit.x,unit.y))||0)),
      team:unit.team===TEAM.PLAYER?"PLAYER":"ENEMY"
    });
    applyEnvironmentHazardToUnit(unit,{reason:"踏入燃燒區"});
  }

  function stageEvent(event){
    if(!stageState)return;
    StageEngine.run(stageState,event,{
      units,
      log:text=>pushLog(text),
      spawn:spawnFromScript,
      setObjective:action=>pushLog(`勝敗條件變更：${action.objective||action.type}`)
    });
  }

  function shortName(name){
    return name.replace(/（.*?）/g,"").slice(0,4);
  }

  function living(team){
    return units.filter(u=>u.alive&&u.team===team);
  }

  function resetActions(team){
    living(team).forEach(u=>{
      u.moved=false;
      u.acted=false;
      u.waited=false;
    });
  }

  function allFinished(team){
    const alive=living(team);
    return alive.length>0&&alive.every(u=>u.acted);
  }

  function resourceFor(unit,skill){
    return unit.skillResources[skill.id]||{type:"UNLIMITED"};
  }

  function canUseSkill(unit,skill){
    if(skill?.approach&&unit?.moved)return false;
    const r=resourceFor(unit,skill);
    if(r.type==="USES") return r.remaining>0;
    return true;
  }

  function consumeSkill(unit,skill){
    const r=resourceFor(unit,skill);
    if(r.type==="USES"&&r.remaining>0) r.remaining--;
  }

  function resourceLabel(unit,skill){
    const r=resourceFor(unit,skill);
    if(r.type==="USES") return `${r.remaining}/${r.max}`;
    return "∞";
  }

  function targetType(skill){
    return skill?.targetType||"SINGLE";
  }

  function clearEngagement(){
    pendingEngagement=null;
    supportSelection=new Map();
  }

  function clearEnemyReaction(){
    pendingEnemyAttack=null;
    pendingReactionType=null;
    selectedGuardian=null;
    selectedGuardInterception=null;
  }

  function clearSelection(){
    commandPanelCollapsed=false;
    selected=null;
    selectedSkill=null;
    selectedSkillVariant=null;
    clearEngagement();
    mode="idle";
  }

  function hasPendingReinforcement(team){
    const script=window.STAGE_SCRIPTS?.[stageState?.scriptId];
    if(!script)return false;
    return (script.events||[]).some(item=>{
      if(item.once&&stageState.fired?.has(item.id))return false;
      return (item.actions||[]).some(action=>action.type==="SPAWN"&&action.team===team);
    });
  }

  function objectiveContext(){
    const areas={};
    for(const point of DeploymentEngine.points(stage))areas[point.id]=point.area||point.captureTiles||[];
    for(const [id,area] of Object.entries(stage.objectiveAreas||{}))areas[id]=area;
    return {round,units,cores,cardState,enemyCardState,areas,deploymentPoints:DeploymentEngine.points(stage),
      isCharacterCard:id=>CardDatabase.isCharacter(CardDatabase.get(id)),hasPendingReinforcement};
  }

  function checkMatchEnd(){
    if(matchResult)return true;
    const result=ObjectiveEngine.evaluateMatch(stage,objectiveContext());
    if(!result.ended)return false;
    phase=PHASE.ENDED;matchResult=result.result;clearSelection();clearEnemyReaction();
    pushLog(`Round ${round}｜${matchResult}｜關卡目標已${matchResult==="VICTORY"?"達成":"失敗"}。`,"SYSTEM");
    return true;
  }

  function resolveWeatherEvents(){
    if(!environmentState)return;
    for(const event of EnvironmentEngine.rollWeatherEvent({map,state:environmentState,units})){
      if(event.type!=="LIGHTNING_STRIKE")continue;
      const unit=event.unit;if(!unit?.alive)continue;
      const names=(event.riskReasons||[]).map(r=>r==="METAL"?"金屬裝備":r==="WATER"?"水域":"樹木／森林");
      unit.hp=Math.max(0,unit.hp-Number(event.damage||0));
      pushLog(`⚡ 落雷擊中 ${unit.character.name}｜${event.damage} 傷害｜HP ${unit.hp}${names.length?`｜高風險：${names.join("＋")}`:""}。`,"BATTLE");
      if(unit.hp<=0&&unit.alive){unit.alive=false;handleDefeated(unit,null,{type:"LIGHTNING"});}
    }
  }

  function beginPlayerTurn(){
    round++;
    phase=PHASE.PLAYER;
    resetActions(TEAM.PLAYER);
    clearSelection();
    clearEnemyReaction();
    pushLog(`Round ${round}｜我方回合開始。`,"SYSTEM");
    if(window.EffectEngine)units.filter(u=>u.alive).forEach(u=>EffectEngine.tick(u));
    stageEvent({type:"ROUND_START",round,team:"PLAYER"});
    if(environmentState){
      applyEnvironmentHazards({reason:"回合開始仍處於燃燒區"});
      if(checkMatchEnd()){render();return;}
      EnvironmentEngine.tick(environmentState);
      resolveWeatherEvents();
      if(checkMatchEnd()){render();return;}
    }
    cardPhaseController.begin();
  }

  function createBattleContext(){
    return {
      TEAM,PHASE,
      state:()=>({map,units,stage,round,phase,matchResult,enemyCardState}),
      map:()=>map,
      living,resetActions,canUseSkill,targetType,combatTargets:combatTargetEntities,coreForOwner,
      canUnitCapture,executeCapture,enterTile,checkMatchEnd,beginPlayerTurn,pushLog,render,
      clearSelection,clearEnemyReaction,
      skillList:unit=>SkillDatabase.list(window.EffectEngine?EffectEngine.skillIds(unit):unit.character.skills),
      setPhase:value=>{phase=value;},
      setEnemyView:value=>{enemyView=value;},
      emitState:()=>window.dispatchEvent(new CustomEvent("cardtactics:state")),
      pendingEnemyAttack:()=>pendingEnemyAttack,
      setPendingEnemyAttack:attack=>{pendingEnemyAttack=attack;pendingReactionType=null;},
      resolveDirectTargetAttack:(...args)=>actionController.resolveDirectTargetAttack(...args),
      actionState:()=>({map,units,stage,selected,mode,selectedSkill,selectedSkillVariant,environmentState}),
      setMode:value=>{mode=value;},
      setSelectedSkill:value=>{selectedSkill=value;},
      setSelectedSkillVariant:value=>{selectedSkillVariant=value;},
      setCommandPanelCollapsed:value=>{commandPanelCollapsed=value;},
      getPendingEngagement:()=>pendingEngagement,
      setPendingEngagement:value=>{pendingEngagement=value;},
      getSupportSelection:()=>supportSelection,
      setSupportSelection:value=>{supportSelection=value;},
      getPendingCopySkill:()=>pendingCopySkill,
      setPendingCopySkill:value=>{pendingCopySkill=value;},
      unitAt,traverseUnitPath,consumeSkill,effectiveSkill,damageCore,handleDefeated,damageUnitFlat,
      canUseSkill,targetType,logBattleAction,logPostEffect,
      logEnvironmentEvent,applyEnvironmentHazardToUnit,enterTile,clearEngagement,allFinished,
      lineTiles,aoeTiles,canTraverseMoveLine,
      createEnemyCardUnit:(card,tile)=>{
        const unit=createUnit(`ec${unitSerial++}`,TEAM.ENEMY,card.characterId,tile.x,tile.y);
        unit.cardId=card.id;unit.deployedRound=round;unit.moved=true;unit.acted=true;unit.waited=true;
        return unit;
      }
    };
  }

  function runEnemyPhase(){
    enemyController?.runPhase();
  }

  function endPlayerTurn(){
    if(phase!==PHASE.PLAYER||matchResult) return;
    pushLog(`Round ${round}｜我方回合結束。`);
    const endTurnDraws=CardPhaseEngine.resolveTurnEndEffects(cardState,{units,team:TEAM.PLAYER});
    endTurnDraws.forEach(result=>{
      const sourceUnit=units.find(unit=>unit.id===result.unitId);
      const sourceLabel=sourceUnit?.character?.name?`${sourceUnit.character.name}【${result.sourceName}】`:`【${result.sourceName}】`;
      if(result.drawn.length){
        const drawnNames=result.drawn.map(cardId=>CardDatabase.get(cardId)?.name||cardId);
        pushLog(`${sourceLabel}發動｜額外抽牌：${drawnNames.join("、")}｜目前手牌 ${cardState.zones.hand.length} 張。`,"SYSTEM");
      }else{
        pushLog(`${sourceLabel}發動｜牌庫已無可抽取卡牌。`,"SYSTEM");
      }
    });
    runEnemyPhase();
  }

  function finishUnit(unit,reason,{waited=false}={}){
    unit.moved=true;
    unit.acted=true;
    unit.waited=waited;
    selectedSkill=null;
    clearEngagement();
    mode="inspect";
    pushLog(`${unit.character.name} ${reason}`);
    if(allFinished(TEAM.PLAYER)){
      pushLog("我方所有存活角色皆已完成行動，可結束回合。");
    }
  }

  function logBattleAction(entry){
    const {actor,target,skill,result,resolved,spd}=entry;
    const resource=resourceFor(actor,skill);
    const resourceText=resource.type==="USES"?`｜剩餘 ${resource.remaining}/${resource.max}`:"";
    const roleText=entry.role==="SUPPORT"?"支援｜":entry.role==="COUNTER"?"反擊｜":"";
    const hpAfter=Math.max(0,Number(entry.hpAfter||0));
    const hpBefore=hpAfter+Math.max(0,Number(result.damage||0));
    const hitLabel=result.hit?(result.graze?"GRAZE":"HIT"):"MISS";
    const critLabel=result.crit?"｜CRIT":"";
    pushLog(
      `${roleText}${actor.character.name}｜${skill.name} → ${target.character.name}｜${hitLabel}${critLabel}`+
      `｜${result.damage||0} 傷害｜HP ${hpBefore} → ${hpAfter}`,
      "BATTLE"
    );

    const normalRoll=Number.isFinite(result.hitRoll)?result.hitRoll:null;
    const evadeRoll=Number.isFinite(result.evadeRoll)?result.evadeRoll:null;
    const hitRollText=evadeRoll!==null
      ?`迴避骰 ${evadeRoll.toFixed(1)}｜原命中 ${result.originalHitChance}%｜全中門檻 ${result.activeHitChance}%`
      :normalRoll!==null
        ?`命中骰 ${normalRoll.toFixed(1)} / ${result.hc}% → ${result.hit?"HIT":"MISS"}`
        :`命中判定 ${result.guaranteedHit?"必中":result.hit?"強制命中":"強制未命中"}`;
    const critRollText=Number.isFinite(result.critRoll)
      ?`｜暴擊骰 ${result.critRoll.toFixed(1)} / ${result.cc}% → ${result.crit?"CRIT":"NO CRIT"}`
      :(result.hit?`｜暴擊率 ${result.cc}%${result.crit?" → CRIT":""}`:"");
    const terrainText=
      `${resolved.terrain.eva?`｜地形EVA +${resolved.terrain.eva}`:""}`+
      `${resolved.terrain.acc?`｜高地ACC +${resolved.terrain.acc}`:""}`;

    pushLog(
      `[${skill.name}] ${actor.character.name} → ${target.character.name}｜${hitRollText}${critRollText}`+
      `｜ACC修正 ${result.accuracy>=0?"+":""}${result.accuracy}｜EVA修正 ${result.evasion>=0?"+":""}${result.evasion}`+
      `${terrainText}｜SPD ${spd}${resourceText}`,
      "DETAIL"
    );

    if(resolved.defense?.method){
      const d=resolved.defense;
      pushLog(
        `防禦判定｜${d.method.name}`+
        `${Number.isFinite(d.roll)?`｜骰 ${d.roll.toFixed(1)} / ${d.chance}%`:""}`+
        `${d.bypassed?"｜被突破":d.triggered?`｜${d.success===false?"失敗":"成功"}`:"｜未觸發"}`,
        "DETAIL"
      );
    }
  }

  function executeEnemyAttack(reaction=null,interception=null){
    if(!pendingEnemyAttack) return;
    const {attacker,defender,skill}=pendingEnemyAttack;
    const guardian=interception?.type==="GUARD_ALLY"?interception.guardian:null;

    if(guardian){
      pushLog(`${guardian.character.name} 援護 ${defender.character.name}，承接 ${attacker.character.name} 的攻擊。`,"BATTLE");
    }

    BattleResolution.resolve(
      {map,units,initiator:attacker,target:defender,skill,actions:[],reaction,interception},
      {
        canUseSkill,
        consumeSkill,
        onDefeated:handleDefeated,
        onAction:logBattleAction,
        onPostEffect:logPostEffect
      }
    );

    attacker.moved=true;
    attacker.acted=true;
    attacker.waited=true;

    clearEnemyReaction();
    mode="idle";

    if(checkMatchEnd()){
      render();
      return;
    }

    render();
    enemyController?.continuePhase();
  }

  function guardCandidates(){
    if(!pendingEnemyAttack) return [];
    const {defender}=pendingEnemyAttack;
    return BattleResolution.guardCandidates({map,units,target:defender});
  }

  function chooseGuardian(guardian){
    selectedGuardian=guardian;
    selectedGuardInterception=null;
    pendingReactionType=null;
    mode="enemy-guard-reaction";
    render();
  }

  function chooseEnemyReaction(type){
    if(!pendingEnemyAttack) return;
    pendingReactionType=type;

    if(type==="EVADE"){
      executeEnemyAttack(BattleResolution.createReaction("EVADE"));
      return;
    }

    mode=type==="COUNTER"?"enemy-counter-select":"enemy-defense-select";
    render();
  }

  function resolvedSkill(skill,variant){
    return variant?{...skill,...variant,id:skill.id,name:variant.name||skill.name,baseSkillId:skill.id,variantId:variant.id,variants:undefined}:skill;
  }
  function skillVariants(skill){return Array.isArray(skill?.variants)?skill.variants:[];}
  function effectiveSkill(attacker,skill){
    let out=skill;
    const passives=SkillDatabase.passiveList(attacker?.character?.passives);
    const tile=TacticalEngine.tile(map,attacker.x,attacker.y);
    const weapon=attacker?.character?.weapons?.[skill?.weapon];
    const ambush=passives.find(p=>p.id==="AMBUSH");
    if(ambush&&tile?.terrain===ambush.terrain&&weapon?.weaponKind===ambush.weaponKind){
      out={...out,power:Number(out.power||0)*Number(ambush.powerMultiplier||1),speed:Number(out.speed||0)+Number(ambush.speedBonus||0),modifiers:{...(out.modifiers||{})}};
      out.ambushActive=true;
    }
    return out;
  }
  function lineTiles(attacker,end){
    const dx=Math.sign(end.x-attacker.x),dy=Math.sign(end.y-attacker.y);
    if(dx&&dy)return [];
    const out=[];
    let x=attacker.x+dx,y=attacker.y+dy;
    while(x!==end.x||y!==end.y){out.push(map.tiles.find(t=>t.x===x&&t.y===y));x+=dx;y+=dy;}
    out.push(map.tiles.find(t=>t.x===end.x&&t.y===end.y));
    return out.filter(Boolean);
  }
  function canTraverseMoveLine(attacker,end){
    const path=lineTiles(attacker,end);
    if(!path.length)return false;
    let previous=TacticalEngine.tile(map,attacker.x,attacker.y);
    for(const tile of path){
      if(!tile||TERRAINS[tile.terrain]?.passable===false)return false;
      if(typeof TacticalEngine.canTraverseElevation==="function"&&!TacticalEngine.canTraverseElevation(previous,tile))return false;
      previous=tile;
    }
    return true;
  }
  function aoeTiles(center,radius){
    const r=Number(radius||0);
    return map.tiles.filter(tile=>Math.abs(tile.x-center.x)+Math.abs(tile.y-center.y)<=r);
  }
  function logEnvironmentEvent(event){
    if(event.type==="IGNITE")pushLog(`(${event.x},${event.y}) 燃燒起來，成為火光來源。`,"SYSTEM");
    else if(event.type==="FIRE_EXTINGUISHED")pushLog(`(${event.x},${event.y}) 的火焰被水熄滅。`,"SYSTEM");
    else if(event.type==="RAIN_EXTINGUISHED_FIRE")pushLog(`豪雨熄滅 (${event.x},${event.y}) 的普通火焰。`,"SYSTEM");
    else if(event.type==="RAIN_SUPPRESSED_FIRE")pushLog(`豪雨壓制 (${event.x},${event.y}) 的小火，無法形成燃燒地形。`,"SYSTEM");
    else if(event.type==="MUD_CREATED")pushLog(`豪雨使 (${event.x},${event.y}) 的平地化為泥濘。`,"DETAIL");
    else if(event.type==="MUD_DRY")pushLog(`(${event.x},${event.y}) 的泥濘乾燥，恢復為平地。`,"DETAIL");
    else if(event.type==="WATER_EVAPORATED")pushLog(`高熱蒸乾 (${event.x},${event.y}) 的水域，地形轉為陸地。`,"SYSTEM");
    else if(event.type==="STEAM_CREATED")pushLog(`高熱與水分作用，(${event.x},${event.y}) 產生蒸氣迷霧。`,"SYSTEM");
    else if(event.type==="STONE_FRAGMENT")pushLog(`爆炸擊中石質物件，(${event.x},${event.y}) 產生破片${event.destroyed?"並炸開道路":""}。`,"SYSTEM");
    else if(event.type==="TORNADO_CREATED")pushLog(`(${event.x},${event.y}) 形成龍捲風場。`,"DETAIL");
    else if(event.type==="FIRE_TORNADO_CREATED")pushLog(`(${event.x},${event.y}) 的燃燒區被風捲起，形成火龍捲。`,"SYSTEM");
    else if(event.type==="ELECTRIC_CONDUCTION")pushLog(`⚡ (${event.x},${event.y}) 發生雷元素傳導。`,"SYSTEM");
  }
  const TILE_EFFECT_INFO={
    TORNADO:{name:"龍捲風",interaction:"持續風場；地面單位進入時觸發共用強制位移與墜落判定。"},
    BURNING:{name:"燃燒",interaction:"小火可被水／豪雨熄滅；風可使燃燒區形成火龍捲。"},
    STEAM:{name:"蒸氣",interaction:"遮蔽視線；持續時間結束後消散。"},
    FRAGMENTS:{name:"岩石破片",interaction:"爆炸擊中石質環境時產生的物理破片效果。"},
    FIRE_TORNADO:{name:"火龍捲",interaction:"燃燒區受到風力作用形成；造成高額火焰環境傷害。"},
    ELECTRIFIED:{name:"帶電",interaction:"雷元素在水域或雨天可發生傳導。"}
  };
  const TILE_ENVIRONMENT_NAME={NONE:"一般",GRASS:"草木",WATER:"水",STONE:"石質"};
  const WEATHER_NAME={CLEAR:"晴朗",FOG:"迷霧",RAIN:"雨",HEAVY_RAIN:"豪大雨",THUNDERSTORM:"雷雨"};

  function tileInteractions(tile,effects){
    const environment=EnvironmentEngine.environmentAt(map,tile.x,tile.y);
    const notes=[];
    if(environment==="GRASS"){
      if(EnvironmentEngine.isRain(environmentState))notes.push("草木受雨勢影響，小火無法形成持續燃燒。");
      else notes.push("草木可被 FIRE／HEAVY_FIRE 點燃。");
    }
    if(environment==="WATER"){
      notes.push("小火會被熄滅；HEAVY_FIRE 會產生蒸氣並蒸乾水域，地形轉為陸地。");
      notes.push("水域可傳導雷元素。");
    }
    if(environment==="STONE")notes.push("EXPLOSION 可產生岩石破片；可破壞的石質物件可能被炸開。");
    if(tile.terrain==="MUD")notes.push("泥濘提高一般移動成本；雨勢結束後恢復為平地。");
    if(EnvironmentEngine.isRain(environmentState))notes.push("雨天環境具導電性。");
    for(const effect of effects){
      const note=TILE_EFFECT_INFO[effect.type]?.interaction;
      if(note&&!notes.includes(note))notes.push(note);
    }
    return notes;
  }

  function tileAnnotation(tile){
    if(!tile)return "";
    const terrain=TERRAINS[tile.terrain]||{};
    const environment=EnvironmentEngine.environmentAt(map,tile.x,tile.y);
    const effects=environmentState?EnvironmentEngine.effectAt(environmentState,tile.x,tile.y):[];
    const object=(map.objects||[]).find(o=>!o.destroyed&&o.x===tile.x&&o.y===tile.y);
    const lines=[
      `地圖格 (${tile.x},${tile.y})｜${terrain.name||tile.terrain}｜H${Number(tile.elevation||0)}`,
      `移動成本：${terrain.passable===false?"不可通行":terrain.moveCost??"-"}｜迴避修正：${Number(terrain.evasion||0)>=0?"+":""}${Number(terrain.evasion||0)}${terrain.rangedAccuracy?`｜遠程命中 +${terrain.rangedAccuracy}`:""}`,
      `環境材質：${TILE_ENVIRONMENT_NAME[environment]||environment}｜天候：${WEATHER_NAME[environmentState?.weather]||environmentState?.weather||"晴朗"}`
    ];
    if(object)lines.push(`地圖物件：${object.name||object.id}${object.destructible?"｜可破壞":""}`);
    if(effects.length){
      lines.push("目前效果："+effects.map(effect=>{
        const info=TILE_EFFECT_INFO[effect.type];
        const duration=effect.duration==null?"":`（剩 ${effect.duration} 回合）`;
        const damage=effect.damage?`／傷害 ${effect.damage}`:"";
        return `${info?.name||effect.type}${duration}${damage}`;
      }).join("、"));
    }else{
      lines.push("目前效果：無");
    }
    const interactions=tileInteractions(tile,effects);
    lines.push(`環境互動：${interactions.length?interactions.join(" "):"目前沒有特殊互動。"}`);
    return lines.join("\n");
  }

  function battleSnapshot(){
    const reachable=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&!selected.moved&&mode==="command"
        ?TacticalEngine.reachable(map,units,selected)
        :new Map();
    const targets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="attack"&&selectedSkill&&targetType(selectedSkill)==="SINGLE"
        ?targetableEntities(selected,selectedSkill)
        :[];
    const mapTargets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="map-target"&&selectedSkill
        ?mapTargetTiles(selected,selectedSkill)
        :[];
    const points=DeploymentEngine.points(stage);
    const tiles=map.tiles.map(tile=>{
      const unit=unitAt(tile.x,tile.y),core=coreAt(tile.x,tile.y);
      const capturePoint=points.find(point=>(point.captureTiles||[]).some(t=>t.x===tile.x&&t.y===tile.y))||null;
      const effects=environmentState?EnvironmentEngine.effectAt(environmentState,tile.x,tile.y):[];
      const deployable=!!(pendingCard&&phase===PHASE.CARD&&CardDatabase.isCharacter(pendingCard)&&
        DeploymentEngine.canDeploy({stage,map,units,owner:"PLAYER",x:tile.x,y:tile.y}));
      const attackable=!!(
        (pendingCard&&phase===PHASE.CARD&&CardDatabase.isSpell(pendingCard))||
        (unit&&targets.includes(unit))||
        (core&&targets.some(target=>target.kind==="CORE"&&target.core===core))||
        mapTargets.includes(tile)
      );
      return {
        x:tile.x,y:tile.y,terrain:tile.terrain,elevation:Number(tile.elevation||0),
        reachable:reachable.has(tile.x+","+tile.y),attackable,deployable,
        inspected:!!(inspectedTile&&inspectedTile.x===tile.x&&inspectedTile.y===tile.y),
        effects:effects.map(effect=>effect.type),
        deploymentAreaOwner:points.find(point=>(point.area||[]).some(t=>t.x===tile.x&&t.y===tile.y))?.owner||null,
        capturePoint:capturePoint?{id:capturePoint.id,name:capturePoint.name,owner:capturePoint.owner}:null,
        core:core?{id:core.id,owner:core.owner,name:core.name,hp:core.hp,maxHp:core.maxHp}:null
      };
    });
    return {
      revision:renderRevision,
      phase,round,mode,
      map:{id:map.id,width:map.width,height:map.height,tiles,objects:(map.objects||[]).map(o=>({...o}))},
      cores:cores.map(core=>({...core})),
      presentation:{
        deploymentPoints:points.map(point=>({id:point.id,name:point.name,owner:point.owner,capturable:point.capturable!==false,
          area:(point.area||[]).map(t=>({...t})),captureTiles:(point.captureTiles||[]).map(t=>({...t}))})),
        enemyHandCount:enemyCardState?.zones?.hand?.length||0,
        enemyDeckCount:enemyCardState?.zones?.deck?.length||0
      },
      units:units.filter(u=>u.alive).map(u=>({
        id:u.id,x:u.x,y:u.y,z:Number(u.z??(TacticalEngine.elevation(TacticalEngine.tile(map,u.x,u.y))||0)),team:u.team==="P"?"PLAYER":"ENEMY",
        name:u.character.name,visualId:u.character.visualId||null,
        hp:u.hp,maxHp:Number(u.character.combat.hp||u.hp||1),
        selected:u===selected,finished:!!u.acted,moved:!!u.moved,acted:!!u.acted
      }))
    };
  }

  function clickBattleTile(x,y){
    const tile=TacticalEngine.tile(map,Number(x),Number(y));
    if(!tile)return false;
    const reachable=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&!selected.moved&&mode==="command"
        ?TacticalEngine.reachable(map,units,selected)
        :new Map();
    const targets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="attack"&&selectedSkill&&targetType(selectedSkill)==="SINGLE"
        ?targetableEntities(selected,selectedSkill)
        :[];
    handleTileClick(tile,unitAt(tile.x,tile.y),coreAt(tile.x,tile.y),reachable,targets);
    return true;
  }

  function render(){
    renderRevision++;
    renderTurnStatus();
    renderPanel();
    window.dispatchEvent(new CustomEvent("cardtactics:battle-render",{detail:{revision:renderRevision}}));
  }

  function combatPreview(attacker,target,skill){
    if(!attacker?.alive||!target?.alive||!skill||target.kind==="CORE")return null;
    const resolved=effectiveSkill(attacker,skill);
    const at=TacticalEngine.tile(map,attacker.x,attacker.y),dt=TacticalEngine.tile(map,target.x,target.y);
    const weapon=attacker.character.weapons?.[resolved.weapon];
    const type=resolved.attackType==="INHERIT"?weapon?.attackType:resolved.attackType;
    const terrainAcc=at?.terrain==="HIGH_GROUND"&&(type==="SHOT"||type==="MAGIC")&&at.elevation>dt?.elevation
      ?Number(TERRAINS[at.terrain]?.rangedAccuracy||0):0;
    const terrainEva=Number(TERRAINS[dt?.terrain]?.evasion||0);
    const ac={...attacker.character,modifiers:{...(attacker.character.modifiers||{}),
      accuracy:Number(attacker.character.modifiers?.accuracy||0)+terrainAcc}};
    const dc={...target.character,modifiers:{...(target.character.modifiers||{}),
      evasion:Number(target.character.modifiers?.evasion||0)+terrainEva}};
    return {
      skillId:resolved.id,skillName:resolved.name,
      hit:BattleEngine.hitChance(ac,dc,resolved),
      crit:BattleEngine.critChance(ac,resolved),
      terrainAcc,terrainEva
    };
  }

  function unitPresentation(unit){
    if(!unit?.alive)return null;
    const tile=TacticalEngine.tile(map,unit.x,unit.y);
    const maxHp=Number(unit.character.combat.hp||unit.hp||1);
    const combat=unit.character.combat||{};
    const baseHit=Math.max(BATTLE_RULES.combatParams.minHit,Math.min(BATTLE_RULES.combatParams.maxHit,
      BATTLE_RULES.combatParams.baseHit+BattleEngine.accuracy(unit.character,{})));
    let actionState=unit.team===TEAM.ENEMY?"敵方單位":
      unit.acted?(unit.waited?"已待機":"已完成主動行動 / 可支援"):
      unit.moved?"已移動 / 可攻擊":"可移動 / 可行動";
    const preview=selected&&selected!==unit&&selectedSkill&&mode==="attack"
      ?combatPreview(selected,unit,selectedSkill):null;
    return {
      id:unit.id,team:unit.team,name:unit.character.name,visualId:unit.character.visualId||null,
      hp:unit.hp,maxHp,move:Number(combat.move||0),x:unit.x,y:unit.y,z:Number(unit.z??(tile?.elevation||0)),
      terrain:tile?TERRAINS[tile.terrain]?.name||tile.terrain:"",elevation:Number(tile?.elevation||0),
      actionState,
      stats:{
        atk:Number(combat.atk||0),def:Number(combat.def||0),matk:Number(combat.matk||0),mdef:Number(combat.mdef||0),
        hit:baseHit,eva:BattleEngine.evasion(unit.character),
        crit:BattleEngine.critChance(unit.character,{}),spd:BattleEngine.actionSpeed(unit.character,{})
      },
      preview
    };
  }

  function handleTileClick(tile,unit,core,reachable,targets){
    inspectedTile=tile;
    window.dispatchEvent(new CustomEvent("cardtactics:inspection"));
    if(matchResult){render();return;}
    if(phase===PHASE.CARD){
      if(pendingCard&&CardDatabase.isSpell(pendingCard)){cardPhaseController.resolveAt(pendingCard,tile);return;}
      if(pendingCard&&CardDatabase.isCharacter(pendingCard)&&!unit)cardPhaseController.deployAt(tile);
      return;
    }
    if(phase!==PHASE.PLAYER) return;
    if(mode==="support-select") return;
    if(selected&&!selected.acted&&mode==="map-target"&&selectedSkill){
      if(mapTargetTiles(selected,selectedSkill).includes(tile))executeMapSkill(selected,tile,selectedSkill);
      return;
    }

    if(selected&&!selected.acted&&mode==="attack"){
      const target=unit&&targets.includes(unit)?unit:(core?targets.find(candidate=>candidate.kind==="CORE"&&candidate.core===core):null);
      if(target){
        if(!approachTargetForAttack(selected,target,selectedSkill)){pushLog(`${selectedSkill.name} 無可到達的合法攻擊位置。`,"SYSTEM");render();return;}
        if(target.kind==="CORE")resolveDirectTargetAttack(selected,target,selectedSkill);else prepareAttack(selected,target,selectedSkill);
        return;
      }
    }

    if(unit&&unit.team===TEAM.PLAYER){
      if(selected&&selected!==unit)commitPendingMove(selected);
      commandPanelCollapsed=false;
      selected=unit;
      selectedSkill=null;
      clearEngagement();
      mode=unit.acted?"inspect":"command";
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="command"&&!selected.moved&&!unit&&reachable.has(tile.x+","+tile.y)){
      commandPanelCollapsed=true;
      const path=TacticalEngine.pathTo(map,units,selected,tile.x,tile.y);
      beginPendingMove(selected);
      const moveResult=traverseUnitPath(selected,path,{kind:"UNIT"});
      selected.moved=true;
      if(!moveResult.completed)commitPendingMove(selected);
      pushLog(`${selected.character.name} ${moveResult.completed?"移動完成，可在其他行動前取消移動":"移動途中受到環境影響而中斷"}。`);
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="command"&&!unit)commandPanelCollapsed=true;
    render();
  }

  function renderTurnStatus(){
    if(matchResult){
      turnStatus.textContent=matchResult==="VICTORY"
        ?`戰鬥結束｜VICTORY｜Round ${round}`
        :`戰鬥結束｜DEFEAT｜Round ${round}`;
      return;
    }

    const phaseName=phase===PHASE.CARD?"卡牌階段":phase===PHASE.PLAYER?"我方戰棋階段":"敵方回合";
    const ready=living(TEAM.PLAYER).filter(u=>!u.acted).length;
    turnStatus.textContent=`Round ${round}｜${phaseName}｜我方可行動 ${ready}/${living(TEAM.PLAYER).length}`;
  }

  function addActionButton(text,onClick,disabled=false){
    const button=document.createElement("button");
    button.textContent=text;
    button.className="action-button";
    button.disabled=disabled;
    button.onclick=onClick;
    skillBar.appendChild(button);
  }

  function addCommandPanelClose(){
    const button=document.createElement("button");
    button.type="button";
    button.className="battle-command-close";
    button.textContent="×";
    button.setAttribute("aria-label","關閉作戰選單");
    button.onclick=()=>{
      commandPanelCollapsed=true;
      render();
    };
    skillBar.appendChild(button);
  }

  function renderCollapsedCommandButton(){skillBar.classList.add("command-panel-collapsed");}

  function engagementOdds(attacker,defender,skill){
    if(!attacker?.character||!defender?.character||!skill)return null;
    const resolved=effectiveSkill(attacker,skill);
    const hit=Math.max(0,Math.min(100,Math.round(BattleEngine.hitChance(attacker.character,defender.character,resolved))));
    return {hit,evade:100-hit};
  }

  function engagementUnitPresentation(unit,attacker,defender,odds){
    const max=Math.max(1,Number(unit?.character?.combat?.hp||unit?.hp||1));
    const hp=Math.max(0,Number(unit?.hp||0));
    return {
      id:unit.id,name:unit.character.name,shortName:shortName(unit.character.name),
      team:unit.team,hp,maxHp:max,hpPct:Math.max(0,Math.min(100,hp/max*100)),
      oddsLabel:!odds?"":unit===attacker?`命中率 ${odds.hit}%`:unit===defender?`迴避率 ${odds.evade}%`:""
    };
  }

  function engagementPresentation(){
    const attack=pendingEngagement||pendingEnemyAttack;
    if(!attack)return null;
    const {attacker,defender,skill}=attack,odds=engagementOdds(attacker,defender,skill);
    const player=attacker.team===TEAM.PLAYER?attacker:defender;
    const enemy=attacker.team===TEAM.ENEMY?attacker:defender;
    const model={
      mode,skillName:skill?.name||"交戰",
      player:engagementUnitPresentation(player,attacker,defender,odds),
      enemy:engagementUnitPresentation(enemy,attacker,defender,odds),
      groups:[],actions:[]
    };
    const action=(id,label,disabled=false,payload=null)=>model.actions.push({id,label,disabled,payload});

    if(mode==="support-select"&&pendingEngagement){
      for(const {ally,skills} of pendingEngagement.candidates){
        model.groups.push({
          id:ally.id,title:`${ally.character.name}${ally.acted?"｜已完成主動行動":""}`,
          actions:[
            {id:"SUPPORT_NONE",label:"不支援",payload:{allyId:ally.id}},
            ...skills.map(s=>({id:"SUPPORT_SKILL",label:`${supportSelection.get(ally.id)===s?"✓ ":""}${s.name}｜${resourceLabel(ally,s)}`,payload:{allyId:ally.id,skillId:s.id}}))
          ]
        });
      }
      action("CONFIRM_ENGAGEMENT","開始交戰");
      action("BACK_SUPPORT","返回");
      return model;
    }

    if(!pendingEnemyAttack)return model;
    const prep=BattleResolution.prepareSingleTargetReaction({defender,attacker,canUseSkill});
    prep.counterSkills=prep.counterSkills.filter(s=>TacticalEngine.canTarget(map,defender,attacker,s));

    if(mode==="enemy-counter-select"){
      prep.counterSkills.forEach(s=>action("COUNTER_SKILL",`${s.name}｜射程 ${s.range.min}-${s.range.max}｜${resourceLabel(defender,s)}`,false,{skillId:s.id}));
      action("BACK_REACTION","返回");
    }else if(mode==="enemy-defense-select"){
      prep.defenseMethods.forEach(m=>action("DEFENSE_METHOD",`${m.name}｜${m.sourceName||m.method}`,false,{methodId:m.id}));
      action("BACK_REACTION","返回");
    }else if(mode==="enemy-guard-select"){
      guardCandidates().forEach(({guardian,profiles})=>action("GUARDIAN",`${guardian.character.name}｜${profiles.map(p=>p.name).join("／")}`,false,{guardianId:guardian.id}));
      action("BACK_GUARD","返回");
    }else if(mode==="enemy-guard-reaction"){
      const guardian=selectedGuardian;
      if(!guardian?.alive)return {...model,invalidGuardian:true};
      const guardianMethods=BattleResolution.guardProfiles(guardian);
      const counterSkills=BattleResolution.counterSkills({defender,attacker,canUseSkill}).filter(s=>TacticalEngine.canTarget(map,defender,attacker,s));
      if(!selectedGuardInterception){
        guardianMethods.forEach(m=>action("GUARD_METHOD",`${m.name}｜${m.sourceName||m.method}`,false,{methodId:m.id}));
        action("BACK_GUARD_METHOD","返回");
      }else{
        action("GUARD_ACCEPT","援護承受｜原目標不反擊");
        counterSkills.forEach(s=>action("GUARD_COUNTER",`原目標反擊｜${s.name}｜${resourceLabel(defender,s)}`,false,{skillId:s.id}));
        action("BACK_GUARD_INTERCEPTION","返回防禦方式");
      }
    }else{
      const guards=guardCandidates();
      action("REACTION_COUNTER","反擊",prep.counterSkills.length===0);
      action("REACTION_DEFENSE","防禦",prep.defenseMethods.length===0);
      action("REACTION_EVADE","迴避");
      action("REACTION_GUARD","援護防禦",guards.length===0);
    }
    return model;
  }

  function handleEngagementUIAction(id,payload={}){
    if(id==="SUPPORT_NONE"){
      supportSelection.delete(payload.allyId);render();return;
    }
    if(id==="SUPPORT_SKILL"){
      const entry=pendingEngagement?.candidates?.find(c=>c.ally.id===payload.allyId);
      const skill=entry?.skills?.find(s=>s.id===payload.skillId);
      if(skill)supportSelection.set(payload.allyId,skill);
      render();return;
    }
    if(id==="CONFIRM_ENGAGEMENT"){confirmEngagement();return;}
    if(id==="BACK_SUPPORT"){clearEngagement();mode="attack";render();return;}
    if(id==="REACTION_COUNTER"){chooseEnemyReaction("COUNTER");return;}
    if(id==="REACTION_DEFENSE"){chooseEnemyReaction("DEFENSE");return;}
    if(id==="REACTION_EVADE"){chooseEnemyReaction("EVADE");return;}
    if(id==="REACTION_GUARD"){mode="enemy-guard-select";render();return;}
    if(id==="BACK_REACTION"){pendingReactionType=null;mode="enemy-reaction";render();return;}
    if(id==="COUNTER_SKILL"){
      const skill=BattleResolution.counterSkills({defender:pendingEnemyAttack?.defender,attacker:pendingEnemyAttack?.attacker,canUseSkill}).find(s=>s.id===payload.skillId);
      if(skill)executeEnemyAttack(BattleResolution.createReaction("COUNTER",{skill}));
      return;
    }
    if(id==="DEFENSE_METHOD"){executeEnemyAttack(BattleResolution.createReaction("DEFENSE",{methodId:payload.methodId}));return;}
    if(id==="GUARDIAN"){
      const guardian=units.find(u=>u.id===payload.guardianId&&u.alive);
      if(guardian)chooseGuardian(guardian);
      return;
    }
    if(id==="BACK_GUARD"){selectedGuardian=null;selectedGuardInterception=null;mode="enemy-reaction";render();return;}
    if(id==="GUARD_METHOD"){
      if(selectedGuardian){selectedGuardInterception=BattleResolution.createGuardInterception(selectedGuardian,payload.methodId);render();}
      return;
    }
    if(id==="BACK_GUARD_METHOD"){selectedGuardian=null;selectedGuardInterception=null;mode="enemy-guard-select";render();return;}
    if(id==="GUARD_ACCEPT"){executeEnemyAttack(null,selectedGuardInterception);return;}
    if(id==="GUARD_COUNTER"){
      const {attacker,defender}=pendingEnemyAttack||{};
      const skill=BattleResolution.counterSkills({defender,attacker,canUseSkill}).find(s=>s.id===payload.skillId);
      if(skill)executeEnemyAttack(BattleResolution.createReaction("COUNTER",{skill}),selectedGuardInterception);
      return;
    }
    if(id==="BACK_GUARD_INTERCEPTION"){selectedGuardInterception=null;render();}
  }

  function renderPanel(){
    skillBar.innerHTML="";
    skillBar.classList.remove("enemy-reaction-panel","command-panel-collapsed","engagement-overlay");

    if(matchResult){
      return;
    }

    if(phase===PHASE.CARD){
      return;
    }

    if(phase===PHASE.ENEMY){
      if(pendingEnemyAttack&&targetType(pendingEnemyAttack.skill)==="SINGLE"){
        commandPanelCollapsed=false;
        skillBar.classList.add("enemy-reaction-panel");
        const model=engagementPresentation();
        if(model?.invalidGuardian){
          selectedGuardian=null;selectedGuardInterception=null;mode="enemy-reaction";render();return;
        }
        window.TacticalUIController?.renderEngagement?.();
      }else{
      }
      return;
    }

    if(phase!==PHASE.PLAYER){
      return;
    }

    if(!selected){
      return;
    }

    const tile=TacticalEngine.tile(map,selected.x,selected.y);
    const actionState=selected.acted
      ?(selected.waited?"已待機":"已完成主動行動 / 可支援")
      :(selected.moved?"已移動 / 可攻擊":"可移動 / 可行動");

    if(mode==="support-select"&&pendingEngagement){
      window.TacticalUIController?.renderEngagement?.();
      return;
    }

    if(selected.acted) return;

    if(mode==="command"){
      if(commandPanelCollapsed){
        renderCollapsedCommandButton();
        return;
      }
      addCommandPanelClose();
      if(!selected.moved){
      }else if(actionController.pendingMove()?.unitId===selected.id){
        addActionButton("取消移動",cancelPendingMove);
      }

      if(stage?.ruleset==="CORE_CAPTURE"&&canUnitCapture(selected)){
        const point=capturePointForUnit(selected);
        addActionButton(`佔領｜${point.name}`,()=>executeCapture(selected));
      }
      addActionButton("攻擊",()=>{
        selectedSkill=null;
        mode="attack-menu";
        render();
      });

      addActionButton("道具",()=>{
        pushLog(`${selected.character.name}｜道具系統尚未接入。`);
        render();
      });

      addActionButton("對話",()=>{
        pushLog(`${selected.character.name}｜目前沒有可對話目標。`);
        render();
      });

      addActionButton("魔法／特殊技能",()=>{
        selectedSkill=null;
        mode="special-menu";
        render();
      });

      addActionButton("待機",()=>{
        commitPendingMove(selected);
        finishUnit(selected,"待機，行動結束。",{waited:true});
        render();
      });
      return;
    }


    const allSkills=SkillDatabase.list(window.EffectEngine?EffectEngine.skillIds(selected):selected.character.skills);
    const isSpecial=skill=>skill.category!=="ATTACK";
    const shownSkills=
      mode==="special-menu"
        ?allSkills.filter(isSpecial)
        :mode==="attack-menu"
          ?allSkills.filter(skill=>!isSpecial(skill))
          :[];

    if(mode==="variant-menu"&&selectedSkill){
      if(commandPanelCollapsed){renderCollapsedCommandButton();return;}
      addCommandPanelClose();
      skillVariants(selectedSkill).forEach(variant=>{
        addActionButton(variant.name||variant.id,()=>{
          selectedSkillVariant=variant;
          selectedSkill=resolvedSkill(selectedSkill,variant);
          mode=targetType(selectedSkill)==="SINGLE"?"attack":"map-target";
          render();
        });
      });
      addActionButton("返回",()=>{const special=selectedSkill?.category!=="ATTACK";selectedSkill=null;selectedSkillVariant=null;mode=special?"special-menu":"attack-menu";render();});
      return;
    }

    if(mode==="copy-skill-select"&&pendingCopySkill){
      addCommandPanelClose();
      pendingCopySkill.options.forEach(skill=>addActionButton(skill.name,()=>{
        EffectEngine.grantSkill(pendingCopySkill.attacker,skill.id,{source:pendingCopySkill.target,duration:pendingCopySkill.duration,replaceGroup:"BLOOD_COPY"});
        pushLog(`${pendingCopySkill.attacker.character.name} 從血液中複製了「${skill.name}」。`,"BATTLE");
        const actor=pendingCopySkill.attacker;pendingCopySkill=null;finishActiveSkill(actor);
      }));
      return;
    }

    if(mode==="attack-menu"||mode==="special-menu"){
      if(commandPanelCollapsed){renderCollapsedCommandButton();return;}
      addCommandPanelClose();
      const menuName=mode==="special-menu"?"魔法／特殊技能":"攻擊";
      if(!shownSkills.length){
      }

      shownSkills.forEach(skill=>{
        const button=document.createElement("button");
        const range=TacticalEngine.range(skill);
        const usable=canUseSkill(selected,skill);
        button.textContent=`${skill.name}｜射程 ${range.min}-${range.max}｜${resourceLabel(selected,skill)}`;
        button.disabled=!usable;
        button.onclick=()=>{
          if(!usable)return;
          selectedSkill=skill;
          selectedSkillVariant=null;
          mode=skillVariants(skill).length?"variant-menu":(targetType(skill)==="SINGLE"?"attack":"map-target");
          render();
        };
        skillBar.appendChild(button);
      });

      addActionButton("返回",()=>{
        selectedSkill=null;
        mode="command";
        render();
      });
      return;
    }

    if(mode==="map-target"&&selectedSkill){
      const range=TacticalEngine.range(selectedSkill);
      return;
    }

    if(mode==="attack"&&selectedSkill){
      const range=TacticalEngine.range(selectedSkill);

    }
  }

  resetMap.onclick=resetBattle;

  battleContext=createBattleContext();
  if(!window.TacticalActionController?.create)throw new Error("TacticalActionController is not loaded.");
  const actionController=window.TacticalActionController.create(battleContext);
  const {
    attackPlanForTarget,targetableEntities,approachTargetForAttack,resolveDirectTargetAttack,
    mapTargetTiles,executeMapSkill,beginPendingMove,commitPendingMove,cancelPendingMove,
    backFromTargeting,finishActiveSkill,executeEffectSkill,approachForSkill,prepareAttack,
    confirmEngagement,executeEngagement
  }=actionController;
  if(!window.TacticalEnemyController?.create)throw new Error("TacticalEnemyController is not loaded.");
  enemyController=window.TacticalEnemyController.create(battleContext);
  if(!window.CardPhaseController?.create)throw new Error("CardPhaseController is not loaded.");
  cardPhaseController=window.CardPhaseController.create({
    TEAM,PHASE,
    state:()=>({map,units,stage,round,phase,matchResult,cardState,pendingCard,environmentState}),
    setPhase:value=>{phase=value;},
    getPendingCard:()=>pendingCard,
    setPendingCard:value=>{pendingCard=value;},
    clearSelection,pushLog,render,emitState:()=>window.dispatchEvent(new CustomEvent("cardtactics:state")),
    unitAt,createUnit:(id,team,characterId,x,y)=>createUnit(id,team,characterId,x,y),
    nextUnitId:()=>`pc${unitSerial++}`,
    aoeTiles,applyForcedMovement,damageUnitFlat,applyEnvironmentHazardToUnit,
    logEnvironmentEvent,checkMatchEnd,handleDefeated
  });

  window.CardTacticsRuntime={
    getCardState:()=>cardState,
    getEnemyCardState:()=>enemyCardState,
    getEnemyPresentation:()=>({...enemyView}),
    getBattleMap:()=>map,
    getBattleSnapshot:()=>battleSnapshot(),
    clickBattleTile,
    getStage:()=>stage,
    getCores:()=>cores.map(core=>({...core})),
    getPhase:()=>phase,
    getPendingCard:()=>pendingCard,
    getBattleLog:()=>({active:logState.active,entries:BattleLog.list(logState).map(entry=>({...entry}))}),
    getEngagementPresentation:engagementPresentation,
    handleEngagementUIAction,
    setBattleLogTab:type=>{BattleLog.setActive(logState,type);window.dispatchEvent(new CustomEvent("cardtactics:log"));},
    getActionMenuAnchor:()=>phase===PHASE.PLAYER&&selected&&!commandPanelCollapsed&&mode!=="support-select"
      ?{x:selected.x,y:selected.y}:null,
    getInspectedUnitPresentation:()=>{
      const unit=inspectedTile?unitAt(inspectedTile.x,inspectedTile.y):selected;
      return unitPresentation(unit||selected);
    },
    playCard:cardId=>cardPhaseController.select(cardId),
    endCardPhase:()=>cardPhaseController.end(),
    cancelCard:()=>cardPhaseController.cancel(),
    endPlayerTurn,
    refresh:render,
    resetBattle
  };

  resetBattle();
})();