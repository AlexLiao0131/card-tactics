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
  let battleContext=null,enemyController=null;

  // Engagement Step 4: enemy SINGLE attacks pause here until the player chooses a reaction.
  let pendingEnemyAttack=null;
  let pendingReactionType=null;
  let selectedGuardian=null;
  let selectedGuardInterception=null;
  let commandPanelCollapsed=false;

  function pushLog(text,type="SYSTEM"){
    logs.push(String(text));
    BattleLog.add(logState,type,String(text));
  }

  function renderLog(){
    if(!window.battleLog)return;
    battleLog.textContent=BattleLog.list(logState).map(e=>e.text).join("\n")||"（目前沒有紀錄）";
    document.querySelectorAll("[data-log-tab]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.logTab===logState.active);
    });
  }

  function logPostEffect(entry){
    const {source,target,effect,result}=entry;
    if(!result)return;
    if(!result.applied){
      pushLog(`${target.character.name}｜${effect.type} 未生效${result.reason?`（${result.reason}）`:""}。`,"DETAIL");
      return;
    }
    const moved=result.steps?.length||0;
    pushLog(`${source.character.name} → ${target.character.name}：${effect.type==="PULL"?"拉近":"擊退"} ${moved} 格。`,"BATTLE");
    if(result.falls?.length){
      const drops=result.falls.map(f=>`H${f.from}→H${f.to}`).join("、");
      pushLog(`${target.character.name} 墜落 ${drops}｜墜落傷害 ${result.fallDamage}｜HP ${target.hp}。`,"BATTLE");
    }else{
      pushLog(`${target.character.name} 強制位移完成｜無墜落傷害。`,"DETAIL");
    }
  }

  function handleDefeated(unit,source,skillOrEffect){
    stageEvent({type:"UNIT_DEFEATED",unitId:unit.id,characterId:unit.character.id,team:unit.team});
    const ownerCardState=unit.team===TEAM.PLAYER?cardState:enemyCardState;
    if(unit.cardId&&ownerCardState){
      CardPhaseEngine.characterDefeated(ownerCardState,unit.cardId);
      pushLog(`${unit.character.name} 戰敗，角色卡進入墓地。`,"SYSTEM");
    }
  }

  function beginCardPhase({initial=false}={}){
    if(cardState.zones.deck.length===0&&cardState.zones.hand.length===0){
      cardState.crystals=Math.min(cardState.maxCrystals||10,cardState.startingCrystals||4);
      pendingCard=null;
      CardPhaseEngine.end(cardState);
      phase=PHASE.PLAYER;
      clearSelection();
      pushLog(`Round ${round}｜牌庫已抽完，跳過卡牌階段，直接進入戰棋階段。`,"SYSTEM");
      render();
      window.dispatchEvent(new CustomEvent("cardtactics:state"));
      return;
    }

    phase=PHASE.CARD;
    clearSelection();
    const handSize=Number(stage.cardRules?.handSize||5);
    const drawn=CardPhaseEngine.begin(cardState,{handSize});
    pushLog(`Round ${round}｜卡牌階段開始｜💎 ${cardState.crystals}。`,"SYSTEM");
    if(drawn.length)pushLog(`抽牌 ${drawn.length} 張。`,"SYSTEM");
    pendingCard=null;
    render();
    window.dispatchEvent(new CustomEvent("cardtactics:state"));
  }

  function endCardPhase(){
    if(phase!==PHASE.CARD)return;
    pendingCard=null;
    CardPhaseEngine.end(cardState);
    phase=PHASE.PLAYER;
    pushLog(`Round ${round}｜進入戰棋階段。`,"SYSTEM");
    render();
    window.dispatchEvent(new CustomEvent("cardtactics:state"));
  }

  function selectCardForPlay(cardId){
    if(phase!==PHASE.CARD)return false;
    const card=CardDatabase.get(cardId);
    if(!CardPhaseEngine.canPlay(cardState,card))return false;
    if(CardDatabase.isCharacter(card)){
      pendingCard=card;
      pushLog(`選擇 ${card.name}，請在亮起的我方部署區手動選擇出生格。`,"SYSTEM");
      render();
      return true;
    }
    if(CardDatabase.isSpell(card)){
      if(card.effect?.type==="WEATHER"){
        if(!CardPhaseEngine.commit(cardState,card))return false;
        const weather=card.effect.weather==="RAIN"?"HEAVY_RAIN":card.effect.weather;
        const weatherEvents=environmentState?EnvironmentEngine.setWeather(environmentState,weather,map):[];
        pushLog(`施放卡牌魔法「${card.name}」｜消耗 ${card.cost} 水晶。`,"SYSTEM");
        weatherEvents.forEach(logEnvironmentEvent);
        pushLog(`天候變更：${weather==="THUNDERSTORM"?"雷雨":weather==="HEAVY_RAIN"?"豪大雨":weather==="FOG"?"迷霧":weather}。`,"SYSTEM");
        pendingCard=null;render();window.dispatchEvent(new CustomEvent("cardtactics:state"));return true;
      }
      if(["AREA_FIRE","AREA_PUSH","AREA_HEAL","AREA_DAMAGE","AREA_RELATION","AREA_BUFF","DISPEL"].includes(card.effect?.type)){
        pendingCard=card;
        pushLog(`選擇卡牌魔法「${card.name}」｜請點選戰場上的施放中心。`,"SYSTEM");
        render();return true;
      }
      return false;
    }
    return false;
  }

  function spellArea(center,radius){return aoeTiles(center,Number(radius||0));}
  function applyForcedMovement(source,target,distance,{name="強制位移"}={}){
    const result=PostEngagementEngine.forcedMove({map,units,source,target,effect:{type:"KNOCKBACK",distance}});
    if(result.applied){
      pushLog(`${target.character.name} 被${name}推離 ${result.steps.length} 格。`,"BATTLE");
      if(result.falls?.length)pushLog(`${target.character.name} 墜落｜墜落傷害 ${result.fallDamage}｜HP ${target.hp}。`,"BATTLE");
      result.steps.forEach(()=>enterTile(target));
    }
    if(result.defeated)handleDefeated(target,source,{type:"ENVIRONMENT_FORCE",name});
    return result;
  }
  function traverseUnitPath(unit,path,{kind="UNIT"}={}){
    for(const tile of path||[]){
      unit.x=tile.x;unit.y=tile.y;enterTile(unit);
      if(!unit.alive)return {completed:false,reason:"DEFEATED"};
      const interaction=EnvironmentEngine.pathInteraction({state:environmentState,x:tile.x,y:tile.y,kind});
      const forced=interaction.effects?.find(e=>e.type==="FORCED_MOVE");
      if(forced){
        applyForcedMovement({x:tile.x,y:tile.y},unit,forced.distance,{name:forced.effect?.type==="FIRE_TORNADO"?"火龍捲":"龍捲風"});
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
  function resolveSpellAt(card,center){
    if(!card||phase!==PHASE.CARD||pendingCard!==card)return false;
    const effect=card.effect||{},affected=spellArea(center,effect.radius||0);
    if(!CardPhaseEngine.commit(cardState,card))return false;
    pushLog(`施放卡牌魔法「${card.name}」｜中心 (${center.x},${center.y})｜消耗 ${card.cost} 水晶。`,"SYSTEM");
    if(effect.type==="AREA_FIRE"){
      affected.forEach(tile=>(EnvironmentEngine.apply({map,state:environmentState,x:tile.x,y:tile.y,forces:effect.forces||["FIRE"]})||[]).forEach(logEnvironmentEvent));
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(u)applyEnvironmentHazardToUnit(u,{reason:"遭野火波及"});});
    }else if(effect.type==="AREA_PUSH"){
      const tornadoEvents=affected.map(tile=>EnvironmentEngine.createTornado(environmentState,tile.x,tile.y,{
        duration:2,pushDistance:Number(effect.distance||2),damage:Number(effect.damage||20),fireDamage:Number(effect.fireTornadoDamage||45)
      }));
      tornadoEvents.forEach(logEnvironmentEvent);
      if(tornadoEvents.some(e=>e.type==="FIRE_TORNADO_CREATED"))pushLog(`🔥🌪 火焰與龍捲風結合，形成火龍捲！`,"SYSTEM");
      affected.forEach(tile=>{
        const u=unitAt(tile.x,tile.y);if(!u)return;
        const active=EnvironmentEngine.effectAt(environmentState,tile.x,tile.y);
        const wind=active.find(e=>e.type===EnvironmentEngine.EFFECT.FIRE_TORNADO)||active.find(e=>e.type===EnvironmentEngine.EFFECT.TORNADO);
        damageUnitFlat(u,Number(wind?.damage||effect.damage||20),wind?.type===EnvironmentEngine.EFFECT.FIRE_TORNADO?"火龍捲":card.name);
        if(u.alive)applyForcedMovement(center,u,Number(wind?.pushDistance||effect.distance||2),{name:wind?.type===EnvironmentEngine.EFFECT.FIRE_TORNADO?"火龍捲":"龍捲風"});
      });
    }else if(effect.type==="AREA_HEAL"){
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(!u?.alive||u.team!==TEAM.PLAYER)return;const before=u.hp;u.hp=Math.min(u.character.combat.hp,u.hp+Number(effect.heal||0));pushLog(`${card.name} → ${u.character.name}｜回復 ${u.hp-before} HP｜HP ${u.hp}。`,"BATTLE");});
    }else if(effect.type==="AREA_DAMAGE"){
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(u)damageUnitFlat(u,effect.damage||0,card.name);(EnvironmentEngine.apply({map,state:environmentState,x:tile.x,y:tile.y,forces:effect.forces||[]})||[]).forEach(logEnvironmentEvent);});
    }else if(effect.type==="AREA_RELATION"){
      const source={id:"CARD_SOURCE",team:TEAM.PLAYER};
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(!u?.alive)return;for(const e of effect.effects||[]){if(e.relation!==EffectEngine.relation(source,u))continue;const r=EffectEngine.apply({source,target:u,effect:e});if(e.type==="HEAL")pushLog(`${card.name} → ${u.character.name}｜回復 ${r.amount||0} HP｜HP ${u.hp}。`,"BATTLE");else if(e.type==="MAGIC_DAMAGE"){pushLog(`${card.name} → ${u.character.name}｜${r.amount||0} 神聖傷害｜HP ${u.hp}。`,"BATTLE");if(!u.alive)handleDefeated(u,null,card);}}});
    }else if(effect.type==="AREA_BUFF"){
      const source={id:"CARD_SOURCE",team:TEAM.PLAYER};
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(!u?.alive||!EffectEngine.targetMatches(source,u,effect.targetFilter||{}))return;EffectEngine.apply({source,target:u,effect:{type:"BUFF",duration:effect.duration,...(effect.buff||{})}});pushLog(`${card.name} → ${u.character.name}｜獲得陣地強化。`,"BATTLE");});
    }else if(effect.type==="DISPEL"){
      const u=unitAt(center.x,center.y);if(u?.alive&&u.team===TEAM.PLAYER){const r=EffectEngine.apply({source:{id:"CARD_SOURCE",team:TEAM.PLAYER},target:u,effect:{type:"DISPEL",classification:effect.classification||"NEGATIVE"}});pushLog(`${card.name} → ${u.character.name}｜移除 ${r.removed||0} 個負面效果。`,"BATTLE");}
    }
    pendingCard=null;checkMatchEnd();render();window.dispatchEvent(new CustomEvent("cardtactics:state"));return true;
  }

  function deployPendingCard(tile){
    const card=pendingCard;
    if(!card||phase!==PHASE.CARD)return false;
    if(!DeploymentEngine.canDeploy({stage,map,units,owner:"PLAYER",x:tile.x,y:tile.y}))return false;
    const unit=createUnit(`pc${unitSerial++}`,TEAM.PLAYER,card.characterId,tile.x,tile.y);
    unit.cardId=card.id;
    unit.deployedRound=round;
    unit.moved=true;unit.acted=true;unit.waited=true;
    if(!CardPhaseEngine.commit(cardState,card))return false;
    units.push(unit);
    pushLog(`${card.name} 部署至 (${tile.x},${tile.y})｜消耗 ${card.cost} 水晶。`,"SYSTEM");
    pendingCard=null;
    render();
    window.dispatchEvent(new CustomEvent("cardtactics:state"));
    return true;
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
      id,team,character,x,y,
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
    beginCardPhase({initial:true});
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

  function hasDeployableCharacterCard(state){
    if(!state)return false;
    return [...state.zones.hand,...state.zones.deck].some(cardId=>CardDatabase.isCharacter(CardDatabase.get(cardId)));
  }

  function sideCanStillField(team){
    if(living(team).length>0)return true;
    return hasDeployableCharacterCard(team===TEAM.PLAYER?cardState:enemyCardState);
  }

  function checkMatchEnd(){
    if(stage?.ruleset==="CORE_CAPTURE"){
      const playerCore=coreForOwner("PLAYER"),enemyCore=coreForOwner("ENEMY");
      if(enemyCore&&enemyCore.hp<=0){phase=PHASE.ENDED;matchResult="VICTORY";clearSelection();clearEnemyReaction();pushLog(`Round ${round}｜VICTORY！敵方 Core 已被摧毀。`,"SYSTEM");return true;}
      if(playerCore&&playerCore.hp<=0){phase=PHASE.ENDED;matchResult="DEFEAT";clearSelection();clearEnemyReaction();pushLog(`Round ${round}｜DEFEAT！我方 Core 已被摧毀。`,"SYSTEM");return true;}
      return false;
    }
    if(!sideCanStillField(TEAM.ENEMY)){
      phase=PHASE.ENDED;
      matchResult="VICTORY";
      clearSelection();
      clearEnemyReaction();
      pushLog(`Round ${round}｜VICTORY！敵方已無存活單位或可部署角色卡。`);
      return true;
    }
    if(!sideCanStillField(TEAM.PLAYER)){
      phase=PHASE.ENDED;
      matchResult="DEFEAT";
      clearSelection();
      clearEnemyReaction();
      pushLog(`Round ${round}｜DEFEAT！我方已無存活單位或可部署角色卡。`);
      return true;
    }
    return false;
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
    beginCardPhase();
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
    let outcome=result.hit?(result.graze?`擦傷 ${result.damage}傷害`:`${result.damage}傷害`):"MISS";

    if(result.evadeOutcome){
      outcome=`主動迴避 ${result.evadeOutcome}｜${outcome}`;
    }
    if(resolved.defense?.method){
      const d=resolved.defense;
      const defenseText=d.bypassed
        ?`${d.method.name}被突破`
        :d.triggered
          ?`${d.method.name}${d.success===false?"失敗":"成功"}`
          :d.method.name;
      outcome+=`｜${defenseText}`;
    }

    pushLog(`${roleText}${actor.character.name} → ${target.character.name}：${outcome}`,"BATTLE");
    pushLog(
      `[SPD ${spd}] ${actor.character.name} → ${target.character.name}｜命中${result.hc}%`+
      `${resolved.terrain.eva?"｜森林EVA+"+resolved.terrain.eva:""}`+
      `${resolved.terrain.acc?"｜高地ACC+"+resolved.terrain.acc:""}`+
      resourceText,
      "DETAIL"
    );
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

  function render(){
    battlefield.innerHTML="";

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

    map.tiles.forEach(tile=>{
      const cell=document.createElement("div");
      const unit=unitAt(tile.x,tile.y);
      const core=coreAt(tile.x,tile.y);

      cell.className="tile "+tile.terrain.toLowerCase();
      const capturePoint=DeploymentEngine.points(stage).find(point=>
        (point.captureTiles||[]).some(t=>t.x===tile.x&&t.y===tile.y)
      );
      if(core){cell.classList.add("core-tile");cell.dataset.coreOwner=core.owner;}
      if(capturePoint){
        cell.classList.add("capture-point");
        cell.dataset.captureOwner=capturePoint.owner;
        cell.title=`${capturePoint.name}｜${capturePoint.owner}`;
      }
      if(reachable.has(tile.x+","+tile.y)) cell.classList.add("reachable");
      if(pendingCard&&phase===PHASE.CARD&&CardDatabase.isCharacter(pendingCard)&&DeploymentEngine.canDeploy({stage,map,units,owner:"PLAYER",x:tile.x,y:tile.y})) cell.classList.add("deployable");
      if(pendingCard&&phase===PHASE.CARD&&CardDatabase.isSpell(pendingCard)) cell.classList.add("attackable");
      if((unit&&targets.includes(unit))||(core&&targets.some(target=>target.kind==="CORE"&&target.core===core))) cell.classList.add("attackable");
      if(mapTargets.includes(tile)) cell.classList.add("attackable");
      if(unit===selected) cell.classList.add("selected");
      if(inspectedTile===tile) cell.classList.add("tile-inspected");
      cell.title=tileAnnotation(tile);

      const finishedClass=unit&&unit.team===TEAM.PLAYER&&unit.acted?" finished":"";
      cell.innerHTML=
        `<span class="icon">${ICON[tile.terrain]}${environmentState&&EnvironmentEngine.effectAt(environmentState,tile.x,tile.y).some(e=>e.type==="BURNING")?"🔥":""}${environmentState&&EnvironmentEngine.effectAt(environmentState,tile.x,tile.y).some(e=>e.type==="STEAM")?"♨":""}</span>`+
        `${capturePoint?`<span class="capture-flag">${capturePoint.owner==="NEUTRAL"?"◇":"◆"}</span>`:""}`+
        `${tile.elevation?`<span class="elev">H${tile.elevation}</span>`:""}`+
        `${unit?(()=>{
          const visual=unit.character.visualId?VisualDatabase.get("characters",unit.character.visualId):null;
          const art=visual?.tactical?`<img src="${visual.tactical}" alt="" onerror="this.style.display='none'">`:"";
          return `<div class="unit ${unit.team===TEAM.PLAYER?"player":"enemy"}${finishedClass}">${art}${shortName(unit.character.name)}<br>${unit.hp}</div>`;
        })():""}`+
        `${core?`<div class="battle-core ${core.owner==="PLAYER"?"player":"enemy"}">CORE<br>${core.hp}/${core.maxHp}</div>`:""}`;

      cell.onclick=()=>handleTileClick(tile,unit,core,reachable,targets);
      battlefield.appendChild(cell);
    });

    renderTurnStatus();
    renderPanel();
    if(inspectedTile){
      tacticalInfo.textContent+=(tacticalInfo.textContent?"\n\n":"")+`【格子資訊】\n${tileAnnotation(inspectedTile)}`;
    }
    renderLog();

    endTurn.disabled=phase!==PHASE.PLAYER||!!matchResult;
    cancelSelect.disabled=(!selected&&!pendingCard)||!!matchResult;
  }

  function handleTileClick(tile,unit,core,reachable,targets){
    inspectedTile=tile;
    if(matchResult){render();return;}
    if(phase===PHASE.CARD){
      if(pendingCard&&CardDatabase.isSpell(pendingCard)){resolveSpellAt(pendingCard,tile);return;}
      if(pendingCard&&CardDatabase.isCharacter(pendingCard)&&!unit)deployPendingCard(tile);
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

  function appendEngagementUnit(unit,side){
    const max=Math.max(1,Number(unit?.character?.combat?.hp||unit?.hp||1));
    const hp=Math.max(0,Number(unit?.hp||0));
    const pct=Math.max(0,Math.min(100,hp/max*100));
    const card=document.createElement("div");
    card.className=`engagement-unit engagement-${side}`;
    card.innerHTML=
      `<div class="engagement-figure"><span>${shortName(unit.character.name)}</span></div>`+
      `<strong>${unit.character.name}</strong>`+
      `<div class="engagement-hp"><i style="width:${pct}%"></i></div>`+
      `<small>HP ${hp} / ${max}</small>`;
    return card;
  }

  function appendEngagementHeader(attacker,defender,skill){
    skillBar.classList.add("engagement-overlay");
    const stage=document.createElement("div");
    stage.className="engagement-stage";
    const player=attacker.team===TEAM.PLAYER?attacker:defender;
    const enemy=attacker.team===TEAM.ENEMY?attacker:defender;
    stage.appendChild(appendEngagementUnit(player,"player"));
    const center=document.createElement("div");
    center.className="engagement-versus";
    center.innerHTML=`<b>VS</b><span>${skill?.name||"交戰"}</span>`;
    stage.appendChild(center);
    stage.appendChild(appendEngagementUnit(enemy,"enemy"));
    skillBar.appendChild(stage);
  }

  function renderSupportSelection(){
    const {attacker,defender,skill,candidates}=pendingEngagement;
    appendEngagementHeader(attacker,defender,skill);

    tacticalInfo.textContent=
      `交戰準備｜${attacker.character.name} → ${defender.character.name}\n`+
      `${skill.name}\n`+
      `選擇要參戰的支援角色與技能；不選就不消耗資源。`;

    candidates.forEach(({ally,skills})=>{
      const row=document.createElement("div");
      row.className="support-choice";

      const title=document.createElement("div");
      title.textContent=`${ally.character.name}${ally.acted?"｜已完成主動行動":""}`;
      row.appendChild(title);

      const none=document.createElement("button");
      none.textContent="不支援";
      none.className="action-button";
      none.onclick=()=>{
        supportSelection.delete(ally.id);
        render();
      };
      row.appendChild(none);

      skills.forEach(skill=>{
        const button=document.createElement("button");
        const chosen=supportSelection.get(ally.id)===skill;
        button.textContent=`${chosen?"✓ ":""}${skill.name}｜${resourceLabel(ally,skill)}`;
        button.className="action-button";
        button.onclick=()=>{
          supportSelection.set(ally.id,skill);
          render();
        };
        row.appendChild(button);
      });

      skillBar.appendChild(row);
    });

    addActionButton("開始交戰",confirmEngagement);
    addActionButton("返回",()=>{
      clearEngagement();
      mode="attack";
      render();
    });
  }

  function renderEnemyReaction(){
    const {attacker,defender,skill}=pendingEnemyAttack;
    appendEngagementHeader(attacker,defender,skill);
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });
    prep.counterSkills=prep.counterSkills.filter(counterSkill=>TacticalEngine.canTarget(map,defender,attacker,counterSkill));

    tacticalInfo.textContent=
      `敵方攻擊｜${attacker.character.name} → ${defender.character.name}\n`+
      `${skill.name}｜請選擇反應。`;

    const guards=guardCandidates();
    addActionButton("反擊",()=>chooseEnemyReaction("COUNTER"),prep.counterSkills.length===0);
    addActionButton("防禦",()=>chooseEnemyReaction("DEFENSE"),prep.defenseMethods.length===0);
    addActionButton("迴避",()=>chooseEnemyReaction("EVADE"));
    addActionButton("援護防禦",()=>{
      mode="enemy-guard-select";
      render();
    },guards.length===0);
  }

  function renderCounterSelection(){
    const {attacker,defender,skill}=pendingEnemyAttack;
    appendEngagementHeader(attacker,defender,skill);
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });
    prep.counterSkills=prep.counterSkills.filter(counterSkill=>TacticalEngine.canTarget(map,defender,attacker,counterSkill));

    tacticalInfo.textContent=
      `反擊選擇｜${defender.character.name}\n`+
      `敵方：${attacker.character.name}｜${skill.name}`;

    prep.counterSkills.forEach(counterSkill=>{
      addActionButton(
        `${counterSkill.name}｜射程 ${counterSkill.range.min}-${counterSkill.range.max}｜${resourceLabel(defender,counterSkill)}`,
        ()=>executeEnemyAttack(BattleResolution.createReaction("COUNTER",{skill:counterSkill}))
      );
    });

    addActionButton("返回",()=>{
      pendingReactionType=null;
      mode="enemy-reaction";
      render();
    });
  }

  function renderDefenseSelection(){
    const {attacker,defender,skill}=pendingEnemyAttack;
    appendEngagementHeader(attacker,defender,skill);
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });
    prep.counterSkills=prep.counterSkills.filter(counterSkill=>TacticalEngine.canTarget(map,defender,attacker,counterSkill));

    tacticalInfo.textContent=
      `防禦方式｜${defender.character.name}\n`+
      `敵方：${attacker.character.name}｜${skill.name}`;

    prep.defenseMethods.forEach(method=>{
      addActionButton(
        `${method.name}｜${method.sourceName||method.method}`,
        ()=>executeEnemyAttack(BattleResolution.createReaction("DEFENSE",{methodId:method.id}))
      );
    });

    addActionButton("返回",()=>{
      pendingReactionType=null;
      mode="enemy-reaction";
      render();
    });
  }

  function renderGuardSelection(){
    const {attacker,defender,skill}=pendingEnemyAttack;
    appendEngagementHeader(attacker,defender,skill);
    const guards=guardCandidates();

    tacticalInfo.textContent=
      `援護防禦｜${attacker.character.name} → ${defender.character.name}\n`+
      `${skill.name}\n`+
      `僅顯示目標上下左右、且具有 canGuardAlly 能力的友軍。`;

    guards.forEach(({guardian,profiles})=>{
      addActionButton(
        `${guardian.character.name}｜${profiles.map(p=>p.name).join("／")}`,
        ()=>chooseGuardian(guardian)
      );
    });

    addActionButton("返回",()=>{
      selectedGuardian=null;
      selectedGuardInterception=null;
      mode="enemy-reaction";
      render();
    });
  }

  function renderGuardReaction(){
    const {attacker,defender,skill}=pendingEnemyAttack;
    appendEngagementHeader(attacker,defender,skill);
    const guardian=selectedGuardian;
    if(!guardian?.alive){
      selectedGuardian=null;
      selectedGuardInterception=null;
      mode="enemy-reaction";
      render();
      return;
    }

    const guardianMethods=BattleResolution.guardProfiles(guardian);
    const counterSkills=BattleResolution.counterSkills({defender,attacker,canUseSkill})
      .filter(counterSkill=>TacticalEngine.canTarget(map,defender,attacker,counterSkill));

    if(!selectedGuardInterception){
      tacticalInfo.textContent=
        `援護防禦｜${guardian.character.name} 保護 ${defender.character.name}\n`+
        `${attacker.character.name}｜${skill.name}\n`+
        `請選擇援護者的防禦方式。`;

      guardianMethods.forEach(method=>{
        addActionButton(
          `${method.name}｜${method.sourceName||method.method}`,
          ()=>{
            selectedGuardInterception=BattleResolution.createGuardInterception(guardian,method.id);
            render();
          }
        );
      });

      addActionButton("返回",()=>{
        selectedGuardian=null;
        selectedGuardInterception=null;
        mode="enemy-guard-select";
        render();
      });
      return;
    }

    tacticalInfo.textContent=
      `援護成立｜${guardian.character.name} 保護 ${defender.character.name}\n`+
      `${attacker.character.name}｜${skill.name}\n`+
      `攻擊完整轉向援護者；原目標仍可選擇是否反擊。`;

    addActionButton("援護承受｜原目標不反擊",()=>executeEnemyAttack(null,selectedGuardInterception));
    counterSkills.forEach(counterSkill=>{
      addActionButton(
        `原目標反擊｜${counterSkill.name}｜${resourceLabel(defender,counterSkill)}`,
        ()=>executeEnemyAttack(BattleResolution.createReaction("COUNTER",{skill:counterSkill}),selectedGuardInterception)
      );
    });
    addActionButton("返回防禦方式",()=>{selectedGuardInterception=null;render();});
  }

  function renderPanel(){
    skillBar.innerHTML="";
    skillBar.classList.remove("enemy-reaction-panel","command-panel-collapsed","engagement-overlay");

    if(matchResult){
      tacticalInfo.textContent=matchResult==="VICTORY"
        ?"戰鬥勝利。按「重置戰場」可重新開始。"
        :"戰鬥失敗。按「重置戰場」可重新開始。";
      return;
    }

    if(phase===PHASE.CARD){
      tacticalInfo.textContent=pendingCard
        ?`部署角色卡｜${pendingCard.name}\n請點選戰場上亮起的部署區格子；可手動選擇出生位置。`
        :`卡牌階段｜💎 ${cardState?.crystals||0}\n請從上方手牌選擇角色卡或卡牌魔法；角色卡需再手動選部署格。`;
      return;
    }

    if(phase===PHASE.ENEMY){
      if(pendingEnemyAttack&&targetType(pendingEnemyAttack.skill)==="SINGLE"){
        commandPanelCollapsed=false;
        skillBar.classList.add("enemy-reaction-panel");
        if(mode==="enemy-counter-select"){
          renderCounterSelection();
        }else if(mode==="enemy-defense-select"){
          renderDefenseSelection();
        }else if(mode==="enemy-guard-select"){
          renderGuardSelection();
        }else if(mode==="enemy-guard-reaction"){
          renderGuardReaction();
        }else{
          renderEnemyReaction();
        }
      }else{
        tacticalInfo.textContent="敵方回合處理中。";
      }
      return;
    }

    if(phase!==PHASE.PLAYER){
      tacticalInfo.textContent="戰鬥處理中。";
      return;
    }

    if(!selected){
      tacticalInfo.textContent=
        allFinished(TEAM.PLAYER)
          ?"我方所有角色已完成行動，請按「結束我方回合」。"
          :"點選尚未行動的我方角色開始。";
      return;
    }

    const tile=TacticalEngine.tile(map,selected.x,selected.y);
    const actionState=selected.acted
      ?(selected.waited?"已待機":"已完成主動行動 / 可支援")
      :(selected.moved?"已移動 / 可攻擊":"可移動 / 可行動");

    tacticalInfo.textContent=
      `${selected.character.name}｜HP ${selected.hp}/${selected.character.combat.hp}｜MOVE ${selected.character.combat.move}\n`+
      `(${selected.x},${selected.y}) ${TERRAINS[tile.terrain].name} 高度${tile.elevation}\n`+
      `狀態：${actionState}`;

    if(mode==="support-select"&&pendingEngagement){
      renderSupportSelection();
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
        tacticalInfo.textContent+="\n可直接點亮起的格子移動，或直接選擇下方指令。";
      }else if(actionController.pendingMove()?.unitId===selected.id){
        tacticalInfo.textContent+="\n移動尚未確定；執行其他行動前可取消。";
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
      tacticalInfo.textContent+=`\n${selectedSkill.name}｜選擇使用方式。`;
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
      tacticalInfo.textContent+=`\n吸血完成｜選擇要複製 ${pendingCopySkill.target.character.name} 的一項能力。`;
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
        tacticalInfo.textContent+=`\n${menuName}：目前沒有可用技能。`;
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
      tacticalInfo.textContent+=`\n${selectedSkill.name}｜射程 ${range.min}-${range.max}｜AOE ${selectedSkill.radius||0}｜請點選亮起的地圖格。`;
      return;
    }

    if(mode==="attack"&&selectedSkill){
      const range=TacticalEngine.range(selectedSkill);
      tacticalInfo.textContent+=`\n${selectedSkill.name}｜射程 ${range.min}-${range.max}｜請選擇目標。`;

    }
  }

  resetMap.onclick=resetBattle;
  cancelSelect.onclick=()=>{
    if(matchResult)return;
    if(phase===PHASE.CARD&&pendingCard){
      pendingCard=null;
      pushLog("取消角色卡部署；未消耗水晶。","SYSTEM");
      render();
      window.dispatchEvent(new CustomEvent("cardtactics:state"));
      return;
    }
    if(phase!==PHASE.PLAYER)return;
    if(mode==="attack"||mode==="map-target"){backFromTargeting();return;}
    if(cancelPendingMove())return;
    clearSelection();
    render();
  };
  endTurn.onclick=endPlayerTurn;
  document.querySelectorAll("[data-log-tab]").forEach(btn=>{
    btn.onclick=()=>{BattleLog.setActive(logState,btn.dataset.logTab);renderLog();};
  });

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

  window.CardTacticsRuntime={
    getCardState:()=>cardState,
    getEnemyCardState:()=>enemyCardState,
    getEnemyPresentation:()=>({...enemyView}),
    getBattleMap:()=>map,
    getStage:()=>stage,
    getCores:()=>cores.map(core=>({...core})),
    getPhase:()=>phase,
    getPendingCard:()=>pendingCard,
    getActionMenuAnchor:()=>phase===PHASE.PLAYER&&selected&&!commandPanelCollapsed&&mode!=="support-select"
      ?{x:selected.x,y:selected.y}:null,
    playCard:selectCardForPlay,
    endCardPhase,
    cancelCard:()=>{pendingCard=null;render();},
    refresh:render,
    resetBattle
  };

  resetBattle();
})();