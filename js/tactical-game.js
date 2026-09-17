(()=>{
  const ICON={PLAIN:"",FOREST:"🌲",HIGH_GROUND:"▲",WATER:"≈",WALL:"■"};
  const TEAM={PLAYER:"P",ENEMY:"E"};
  const PHASE={CARD:"CARD_PHASE",PLAYER:"PLAYER_TURN",ENEMY:"ENEMY_TURN",ENDED:"MATCH_ENDED"};

  let map,units,selected,mode,selectedSkill,selectedSkillVariant,logs,round,phase,matchResult,stage,stageState,environmentState;
  let logState=BattleLog.create(),cardState=null,pendingCard=null,unitSerial=0;
  let pendingEngagement=null;
  let supportSelection=new Map();

  // Engagement Step 4: enemy SINGLE attacks pause here until the player chooses a reaction.
  let enemyQueue=[];
  let pendingEnemyAttack=null;
  let pendingReactionType=null;
  let selectedGuardian=null;
  let selectedGuardInterception=null;

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
    if(unit.team===TEAM.PLAYER&&unit.cardId&&cardState){
      CardPhaseEngine.characterDefeated(cardState,unit.cardId);
      pushLog(`${unit.character.name} 戰敗，角色卡進入墓地。`,"SYSTEM");
    }
  }

  function beginCardPhase({initial=false}={}){
    if(cardState.zones.deck.length===0&&cardState.zones.hand.length===0){
      cardState.crystals=cardState.crystalsPerTurn;
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
        if(environmentState)EnvironmentEngine.setWeather(environmentState,weather);
        pushLog(`施放卡牌魔法「${card.name}」｜消耗 ${card.cost} 水晶。`,"SYSTEM");
        pushLog(`天候變更：${weather==="HEAVY_RAIN"?"雷雨／豪大雨":weather==="FOG"?"迷霧":weather}。`,"SYSTEM");
        pendingCard=null;render();window.dispatchEvent(new CustomEvent("cardtactics:state"));return true;
      }
      if(["AREA_FIRE","AREA_PUSH","AREA_HEAL","AREA_DAMAGE"].includes(card.effect?.type)){
        pendingCard=card;
        pushLog(`選擇卡牌魔法「${card.name}」｜請點選戰場上的施放中心。`,"SYSTEM");
        render();return true;
      }
      return false;
    }
    return false;
  }

  function spellArea(center,radius){return aoeTiles(center,Number(radius||0));}
  function canOccupyTile(tile,unit){return !!tile&&TERRAINS[tile.terrain]?.passable!==false&&!unitAt(tile.x,tile.y);}
  function pushUnitFrom(center,unit,distance){
    let moved=0;
    for(let i=0;i<Number(distance||0);i++){
      const dx=unit.x-center.x,dy=unit.y-center.y;
      let sx=0,sy=0;
      if(Math.abs(dx)>=Math.abs(dy)&&dx!==0)sx=Math.sign(dx);else if(dy!==0)sy=Math.sign(dy);else break;
      const next=map.tiles.find(t=>t.x===unit.x+sx&&t.y===unit.y+sy);
      if(!canOccupyTile(next,unit))break;
      unit.x=next.x;unit.y=next.y;moved++;enterTile(unit);
    }
    return moved;
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
      const centerWasBurning=EnvironmentEngine.isBurning(environmentState,center.x,center.y);
      const interactionEvents=EnvironmentEngine.apply({map,state:environmentState,x:center.x,y:center.y,forces:effect.forces||["WIND"]})||[];
      interactionEvents.forEach(logEnvironmentEvent);
      const fireTornado=centerWasBurning||interactionEvents.some(e=>e.type==="FIRE_TORNADO_CREATED");
      if(fireTornado){
        pushLog(`🔥🌪 火焰與龍捲風結合，形成火龍捲！`,"SYSTEM");
        affected.forEach(tile=>(EnvironmentEngine.apply({map,state:environmentState,x:tile.x,y:tile.y,forces:["HEAVY_FIRE"]})||[]).forEach(logEnvironmentEvent));
      }
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(!u)return;damageUnitFlat(u,fireTornado?Number(effect.fireTornadoDamage||45):Number(effect.damage||20),fireTornado?"火龍捲":card.name);if(u.alive){const moved=pushUnitFrom(center,u,effect.distance||2);if(moved)pushLog(`${u.character.name} 被吹離 ${moved} 格。`,"BATTLE");}});
    }else if(effect.type==="AREA_HEAL"){
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(!u?.alive||u.team!==TEAM.PLAYER)return;const before=u.hp;u.hp=Math.min(u.character.combat.hp,u.hp+Number(effect.heal||0));pushLog(`${card.name} → ${u.character.name}｜回復 ${u.hp-before} HP｜HP ${u.hp}。`,"BATTLE");});
    }else if(effect.type==="AREA_DAMAGE"){
      affected.forEach(tile=>{const u=unitAt(tile.x,tile.y);if(u)damageUnitFlat(u,effect.damage||0,card.name);(EnvironmentEngine.apply({map,state:environmentState,x:tile.x,y:tile.y,forces:effect.forces||[]})||[]).forEach(logEnvironmentEvent);});
    }
    pendingCard=null;checkMatchEnd();render();window.dispatchEvent(new CustomEvent("cardtactics:state"));return true;
  }

  function deployPendingCard(tile){
    const card=pendingCard;
    if(!card||phase!==PHASE.CARD)return false;
    if(!DeploymentEngine.canDeploy({stage,map,units,owner:"PLAYER",x:tile.x,y:tile.y}))return false;
    const unit=createUnit(`pc${unitSerial++}`,TEAM.PLAYER,card.characterId,tile.x,tile.y);
    unit.cardId=card.id;
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
    const character=CHARACTERS[characterId];
    return {
      id,team,character,x,y,
      hp:character.combat.hp,
      alive:true,
      moved:false,
      acted:false,
      waited:false,
      skillResources:createSkillResources(character)
    };
  }

  function resetBattle(){
    stage=StageDatabase.get("prototype_battle");
    if(!stage) throw new Error("Unknown stage: prototype_battle");
    stageState=StageEngine.create(stage.scriptId);
    map=createMap();
    environmentState=window.EnvironmentEngine?EnvironmentEngine.create(stage.environment||{}):null;
    units=[];
    unitSerial=0;
    logState=BattleLog.create();
    const forcedHeroIds=new Set(
      (stage.playerSpawns||[])
        .filter(spawn=>spawn.source==="STAGE")
        .map(spawn=>spawn.characterId)
    );
    const battleDeck=(stage.battleDeck||[]).filter(cardId=>{
      const card=CardDatabase.get(cardId);
      return !(CardDatabase.isCharacter(card)&&card.unitType==="HERO"&&forcedHeroIds.has(card.characterId));
    });
    cardState=CardPhaseEngine.create({
      deck:battleDeck,
      crystalsPerTurn:Number(stage.cardRules?.crystalsPerTurn||10),
      handSize:Number(stage.cardRules?.handSize||5)
    });
    DeckEngine.shuffle(cardState.zones);

    stage.playerSpawns.forEach((u,i)=>units.push(createUnit("p"+i,TEAM.PLAYER,u.characterId,u.x,u.y)));
    stage.enemySpawns.forEach((u,i)=>units.push(createUnit("e"+i,TEAM.ENEMY,u.characterId,u.x,u.y)));

    selected=null;
    selectedSkill=null;
    selectedSkillVariant=null;
    pendingEngagement=null;
    supportSelection=new Map();
    enemyQueue=[];
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

  function resolveDeploymentPointCapture(unit){
    if(!unit?.alive)return null;
    const owner=captureOwnerForTeam(unit.team);
    if(!owner)return null;

    const point=DeploymentEngine.points(stage).find(point=>
      (point.captureTiles||[]).some(tile=>tile.x===unit.x&&tile.y===unit.y)
    );
    if(!point||point.owner===owner)return null;

    const previousOwner=point.owner;
    if(!DeploymentEngine.capture(stage,point.id,owner))return null;

    const sideName=owner==="PLAYER"?"我方":"敵方";
    const previousName=previousOwner==="NEUTRAL"?"中立":previousOwner==="PLAYER"?"我方":"敵方";
    pushLog(`${sideName}佔領「${point.name}」｜${previousName} → ${sideName}。`,"SYSTEM");

    if(owner==="PLAYER"){
      pushLog(`「${point.name}」部署區已解鎖；下一次卡牌階段可由此部署角色。`,"SYSTEM");
    }else if(previousOwner==="PLAYER"){
      pushLog(`「${point.name}」已失去我方部署權。`,"SYSTEM");
    }

    stageEvent({
      type:"DEPLOYMENT_POINT_CAPTURED",
      pointId:point.id,
      owner,
      previousOwner,
      unitId:unit.id,
      characterId:unit.character.id,
      x:unit.x,
      y:unit.y
    });
    window.dispatchEvent(new CustomEvent("cardtactics:state"));
    return point;
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
    resolveDeploymentPointCapture(unit);
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
    selected=null;
    selectedSkill=null;
    selectedSkillVariant=null;
    clearEngagement();
    mode="idle";
  }

  function checkMatchEnd(){
    if(living(TEAM.ENEMY).length===0){
      phase=PHASE.ENDED;
      matchResult="VICTORY";
      clearSelection();
      clearEnemyReaction();
      pushLog(`Round ${round}｜VICTORY！敵方全滅。`);
      return true;
    }
    if(living(TEAM.PLAYER).length===0){
      phase=PHASE.ENDED;
      matchResult="DEFEAT";
      clearSelection();
      clearEnemyReaction();
      pushLog(`Round ${round}｜DEFEAT！我方全滅。`);
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
    enemyQueue=[];
    pushLog(`Round ${round}｜我方回合開始。`,"SYSTEM");
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

  function distance(a,b){
    return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  }

  function enemySingleSkills(enemy){
    return SkillDatabase.list(enemy.character.skills).filter(skill=>
      skill.target==="ENEMY" &&
      targetType(skill)==="SINGLE" &&
      canUseSkill(enemy,skill)
    );
  }

  function targetsForEnemySkill(enemy,skill){
    const r=skill.range||{min:1,max:1};
    return living(TEAM.PLAYER).filter(target=>{
      const d=distance(enemy,target);
      return d>=r.min&&d<=r.max;
    });
  }

  function chooseEnemyAttack(enemy){
    for(const skill of enemySingleSkills(enemy)){
      const targets=targetsForEnemySkill(enemy,skill);
      if(targets.length){
        targets.sort((a,b)=>a.hp-b.hp||distance(enemy,a)-distance(enemy,b));
        return {attacker:enemy,defender:targets[0],skill};
      }
    }
    return null;
  }

  function moveEnemyTowardTarget(enemy){
    if(enemy.moved||!enemy.alive) return;
    const players=living(TEAM.PLAYER);
    if(!players.length) return;

    const reachable=TacticalEngine.reachable(map,units,enemy);
    if(!reachable.size){
      enemy.moved=true;
      return;
    }

    let best=null;
    reachable.forEach((cost,key)=>{
      const [x,y]=key.split(",").map(Number);
      const nearest=Math.min(...players.map(p=>Math.abs(x-p.x)+Math.abs(y-p.y)));
      if(!best||nearest<best.nearest||(nearest===best.nearest&&cost<best.cost)){
        best={x,y,nearest,cost};
      }
    });

    if(best){
      enemy.x=best.x;
      enemy.y=best.y;
      pushLog(`${enemy.character.name} 移動至 (${best.x},${best.y})。`,"DETAIL");
      enterTile(enemy);
    }
    enemy.moved=true;
  }

  function finishEnemyPhase(){
    if(checkMatchEnd()){
      render();
      return;
    }
    pushLog(`Round ${round}｜敵方回合結束。`);
    beginPlayerTurn();
  }

  function continueEnemyPhase(){
    if(phase!==PHASE.ENEMY||matchResult||pendingEnemyAttack) return;

    while(enemyQueue.length){
      const enemy=enemyQueue.shift();
      if(!enemy?.alive||enemy.acted) continue;

      let attack=chooseEnemyAttack(enemy);
      if(!attack){
        moveEnemyTowardTarget(enemy);
        attack=chooseEnemyAttack(enemy);
      }

      if(attack){
        pendingEnemyAttack=attack;
        pendingReactionType=null;
        mode="enemy-reaction";
        pushLog(`${enemy.character.name} 對 ${attack.defender.character.name} 發動 ${attack.skill.name}。`);
        render();
        return;
      }

      enemy.moved=true;
      enemy.acted=true;
      enemy.waited=true;
      pushLog(`${enemy.character.name} 無可攻擊目標，待機。`);
    }

    finishEnemyPhase();
  }

  function runEnemyPhase(){
    phase=PHASE.ENEMY;
    clearSelection();
    clearEnemyReaction();
    resetActions(TEAM.ENEMY);
    pushLog(`Round ${round}｜敵方回合開始。`);
    enemyQueue=[...living(TEAM.ENEMY)];
    render();
    continueEnemyPhase();
  }

  function endPlayerTurn(){
    if(phase!==PHASE.PLAYER||matchResult) return;
    pushLog(`Round ${round}｜我方回合結束。`);
    const endTurnDraws=CardPhaseEngine.resolveTurnEndEffects(cardState,{units,team:TEAM.PLAYER});
    endTurnDraws.forEach(result=>{
      if(result.drawn.length)pushLog(`${result.sourceName}｜額外抽牌 ${result.drawn.length} 張。`,"SYSTEM");
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
    continueEnemyPhase();
  }

  function guardCandidates(){
    if(!pendingEnemyAttack) return [];
    const {defender}=pendingEnemyAttack;
    return BattleResolution.guardCandidates({units,target:defender});
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
  function mapTargetTiles(attacker,skill){
    const range=TacticalEngine.range(skill);
    return map.tiles.filter(tile=>{
      const d=Math.abs(attacker.x-tile.x)+Math.abs(attacker.y-tile.y);
      if(d<range.min||d>range.max)return false;
      if(skill.shape==="LINE"){
        if(attacker.x!==tile.x&&attacker.y!==tile.y)return false;
        if(skill.moveToTarget&&unitAt(tile.x,tile.y))return false;
      }
      if(skill.shape==="W_STEP"){
        if(unitAt(tile.x,tile.y)||TERRAINS[tile.terrain]?.passable===false)return false;
      }
      if(skill.environmentRequirement==="CONDUCTIVE"&&!EnvironmentEngine.isConductive(map,environmentState,tile.x,tile.y))return false;
      return true;
    });
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
  function aoeTiles(center,radius){
    const r=Number(radius||0);
    return map.tiles.filter(tile=>Math.abs(tile.x-center.x)+Math.abs(tile.y-center.y)<=r);
  }
  function logEnvironmentEvent(event){
    if(event.type==="IGNITE")pushLog(`(${event.x},${event.y}) 燃燒起來，成為火光來源。`,"SYSTEM");
    else if(event.type==="FIRE_EXTINGUISHED")pushLog(`(${event.x},${event.y}) 的火焰被水熄滅。`,"SYSTEM");
    else if(event.type==="STEAM_CREATED")pushLog(`大量火焰接觸水域，(${event.x},${event.y}) 產生蒸氣迷霧。`,"SYSTEM");
    else if(event.type==="STONE_FRAGMENT")pushLog(`爆炸擊中石質物件，(${event.x},${event.y}) 產生破片${event.destroyed?"並炸開道路":""}。`,"SYSTEM");
    else if(event.type==="FIRE_TORNADO_CREATED")pushLog(`(${event.x},${event.y}) 的燃燒區被風捲起，形成火龍捲。`,"SYSTEM");
    else if(event.type==="ELECTRIC_CONDUCTION")pushLog(`⚡ (${event.x},${event.y}) 發生雷元素傳導。`,"SYSTEM");
  }
  function executeMapSkill(attacker,center,skill){
    if(!canUseSkill(attacker,skill))return false;
    consumeSkill(attacker,skill);
    skill=effectiveSkill(attacker,skill);
    if(skill.ambushActive)pushLog(`${attacker.character.name}｜伏擊發動：弓擊威力與速度提升。`,"BATTLE");
    const affected=skill.shape==="LINE"?lineTiles(attacker,center):aoeTiles(center,skill.radius||0);
    if(skill.shape==="LINE"){
      affected.forEach(tile=>{
        const occupant=unitAt(tile.x,tile.y);
        if(!occupant||occupant.team===attacker.team)return;
        const result=BattleEngine.calculate(attacker.character,occupant.character,skill);
        if(!result.hit){pushLog(`${attacker.character.name} → ${occupant.character.name}｜${skill.name} MISS。`,"BATTLE");return;}
        occupant.hp=Math.max(0,occupant.hp-result.damage);
        pushLog(`${attacker.character.name} → ${occupant.character.name}｜${skill.name} ${result.damage} 傷害｜HP ${occupant.hp}。`,"BATTLE");
        if(occupant.hp<=0&&occupant.alive){occupant.alive=false;handleDefeated(occupant,attacker,skill);}
      });
    }
    if(skill.aoeDamage){
      affected.forEach(tile=>{const occupant=unitAt(tile.x,tile.y);if(occupant)damageUnitFlat(occupant,skill.aoeDamage,skill.name);});
    }
    affected.forEach(tile=>{
      const events=environmentState&&skill.environmentForces
        ?EnvironmentEngine.apply({map,state:environmentState,x:tile.x,y:tile.y,forces:skill.environmentForces})
        :[];
      events.forEach(logEnvironmentEvent);
    });
    affected.forEach(tile=>{
      if(!EnvironmentEngine.effectAt(environmentState,tile.x,tile.y).some(effect=>effect.type===EnvironmentEngine.EFFECT.BURNING))return;
      const occupant=unitAt(tile.x,tile.y);
      if(occupant)applyEnvironmentHazardToUnit(occupant,{reason:"遭燃燒地形波及"});
    });
    pushLog(`${attacker.character.name} 使用 ${skill.name}｜中心 (${center.x},${center.y})。`,"BATTLE");
    if(skill.moveToTarget&&!unitAt(center.x,center.y)){
      attacker.x=center.x;attacker.y=center.y;enterTile(attacker);
      pushLog(`${attacker.character.name} 隨 ${skill.name} 移動至 (${center.x},${center.y})。`,"BATTLE");
    }
    if(checkMatchEnd()){selectedSkill=null;selectedSkillVariant=null;render();return true;}
    attacker.moved=true;attacker.acted=true;attacker.waited=true;
    selectedSkill=null;selectedSkillVariant=null;mode="inspect";
    render();
    return true;
  }

  function render(){
    battlefield.innerHTML="";

    const reachable=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&!selected.moved&&mode==="command"
        ?TacticalEngine.reachable(map,units,selected)
        :new Map();

    const targets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="attack"&&selectedSkill&&targetType(selectedSkill)==="SINGLE"
        ?TacticalEngine.targets(units,selected,selectedSkill)
        :[];
    const mapTargets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="map-target"&&selectedSkill
        ?mapTargetTiles(selected,selectedSkill)
        :[];

    map.tiles.forEach(tile=>{
      const cell=document.createElement("div");
      const unit=unitAt(tile.x,tile.y);

      cell.className="tile "+tile.terrain.toLowerCase();
      const capturePoint=DeploymentEngine.points(stage).find(point=>
        (point.captureTiles||[]).some(t=>t.x===tile.x&&t.y===tile.y)
      );
      if(capturePoint){
        cell.classList.add("capture-point");
        cell.dataset.captureOwner=capturePoint.owner;
        cell.title=`${capturePoint.name}｜${capturePoint.owner}`;
      }
      if(reachable.has(tile.x+","+tile.y)) cell.classList.add("reachable");
      if(pendingCard&&phase===PHASE.CARD&&CardDatabase.isCharacter(pendingCard)&&DeploymentEngine.canDeploy({stage,map,units,owner:"PLAYER",x:tile.x,y:tile.y})) cell.classList.add("deployable");
      if(pendingCard&&phase===PHASE.CARD&&CardDatabase.isSpell(pendingCard)) cell.classList.add("attackable");
      if(unit&&targets.includes(unit)) cell.classList.add("attackable");
      if(mapTargets.includes(tile)) cell.classList.add("attackable");
      if(unit===selected) cell.classList.add("selected");

      const finishedClass=unit&&unit.team===TEAM.PLAYER&&unit.acted?" finished":"";
      cell.innerHTML=
        `<span class="icon">${ICON[tile.terrain]}${environmentState&&EnvironmentEngine.effectAt(environmentState,tile.x,tile.y).some(e=>e.type==="BURNING")?"🔥":""}${environmentState&&EnvironmentEngine.effectAt(environmentState,tile.x,tile.y).some(e=>e.type==="STEAM")?"♨":""}</span>`+
        `${capturePoint?`<span class="capture-flag">${capturePoint.owner==="NEUTRAL"?"◇":"◆"}</span>`:""}`+
        `${tile.elevation?`<span class="elev">H${tile.elevation}</span>`:""}`+
        `${unit?(()=>{
          const visual=unit.character.visualId?VisualDatabase.get("characters",unit.character.visualId):null;
          const art=visual?.tactical?`<img src="${visual.tactical}" alt="" onerror="this.style.display='none'">`:"";
          return `<div class="unit ${unit.team===TEAM.PLAYER?"player":"enemy"}${finishedClass}">${art}${shortName(unit.character.name)}<br>${unit.hp}</div>`;
        })():""}`;

      cell.onclick=()=>handleTileClick(tile,unit,reachable,targets);
      battlefield.appendChild(cell);
    });

    renderTurnStatus();
    renderPanel();
    renderLog();

    endTurn.disabled=phase!==PHASE.PLAYER||!!matchResult;
    cancelSelect.disabled=(!selected&&!pendingCard)||!!matchResult;
  }

  function handleTileClick(tile,unit,reachable,targets){
    if(matchResult)return;
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

    if(unit&&unit.team===TEAM.PLAYER){
      selected=unit;
      selectedSkill=null;
      clearEngagement();
      mode=unit.acted?"inspect":"command";
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="command"&&!selected.moved&&!unit&&reachable.has(tile.x+","+tile.y)){
      selected.x=tile.x;
      selected.y=tile.y;
      selected.moved=true;
      pushLog(`${selected.character.name} 移動完成。`);
      enterTile(selected);
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="attack"&&unit&&targets.includes(unit)){
      prepareAttack(selected,unit,selectedSkill);
    }
  }

  function prepareAttack(attacker,defender,skill){
    if(!canUseSkill(attacker,skill)) return;
    skill=effectiveSkill(attacker,skill);
    if(skill.ambushActive)pushLog(`${attacker.character.name}｜伏擊發動：弓擊威力與速度提升。`,"BATTLE");

    if(targetType(skill)!=="SINGLE"){
      executeEngagement(attacker,defender,skill,[]);
      return;
    }

    const candidates=BattleResolution.supportCandidates({
      units,
      initiator:attacker,
      target:defender,
      canUseSkill
    });

    if(!candidates.length){
      executeEngagement(attacker,defender,skill,[]);
      return;
    }

    pendingEngagement={attacker,defender,skill,candidates};
    supportSelection=new Map();
    mode="support-select";
    pushLog(`可選支援：${candidates.map(x=>x.ally.character.name).join("、")}`);
    render();
  }

  function selectedSupportActions(){
    if(!pendingEngagement) return [];
    const actions=[];

    pendingEngagement.candidates.forEach(({ally},index)=>{
      const skill=supportSelection.get(ally.id);
      if(skill){
        actions.push(BattleResolution.createSupportAction(
          ally,
          pendingEngagement.defender,
          skill,
          index
        ));
      }
    });

    return actions;
  }

  function confirmEngagement(){
    if(!pendingEngagement) return;
    const {attacker,defender,skill}=pendingEngagement;
    const actions=selectedSupportActions();
    executeEngagement(attacker,defender,skill,actions);
  }

  function executeEngagement(attacker,defender,skill,actions){
    const engagement=BattleResolution.resolve(
      {map,units,initiator:attacker,target:defender,skill,actions},
      {
        canUseSkill,
        consumeSkill,
        onDefeated:handleDefeated,
        onAction:logBattleAction,
        onPostEffect:logPostEffect
      }
    );

    if(!engagement.results.length){
      clearEngagement();
      mode="command";
      render();
      return;
    }

    // A completed active attack ends this unit's PLAYER TURN action.
    attacker.moved=true;
    attacker.acted=true;
    attacker.waited=true;

    selectedSkill=null;
    clearEngagement();
    mode="inspect";

    if(checkMatchEnd()){
      render();
      return;
    }

    if(allFinished(TEAM.PLAYER)){
      pushLog("我方所有存活角色皆已完成行動，可結束回合。");
    }
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

  function renderSupportSelection(){
    const {attacker,defender,skill,candidates}=pendingEngagement;

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
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });

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
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });

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
    const prep=BattleResolution.prepareSingleTargetReaction({
      defender,
      attacker,
      canUseSkill
    });

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
    const guardian=selectedGuardian;
    if(!guardian?.alive){
      selectedGuardian=null;
      selectedGuardInterception=null;
      mode="enemy-reaction";
      render();
      return;
    }

    const guardianMethods=BattleResolution.guardProfiles(guardian);
    const counterSkills=BattleResolution.counterSkills({defender,attacker,canUseSkill});

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
      if(!selected.moved){
        tacticalInfo.textContent+="\n可直接點亮起的格子移動，或直接選擇下方指令。";
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
        finishUnit(selected,"待機，行動結束。",{waited:true});
        render();
      });
      return;
    }

    const allSkills=SkillDatabase.list(selected.character.skills);
    const isSpecial=skill=>skill.category!=="ATTACK";
    const shownSkills=
      mode==="special-menu"
        ?allSkills.filter(isSpecial)
        :mode==="attack-menu"
          ?allSkills.filter(skill=>!isSpecial(skill))
          :[];

    if(mode==="variant-menu"&&selectedSkill){
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

    if(mode==="attack-menu"||mode==="special-menu"){
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
      addActionButton("返回",()=>{
        selectedSkill=SkillDatabase.get(selectedSkill.baseSkillId||selectedSkill.id);
        selectedSkillVariant=null;
        mode="variant-menu";
        render();
      });
      return;
    }

    if(mode==="attack"&&selectedSkill){
      const range=TacticalEngine.range(selectedSkill);
      tacticalInfo.textContent+=`\n${selectedSkill.name}｜射程 ${range.min}-${range.max}｜請選擇目標。`;
      addActionButton("返回",()=>{
        const previousSkill=selectedSkill;
        if(previousSkill?.baseSkillId){
          selectedSkill=SkillDatabase.get(previousSkill.baseSkillId);
          selectedSkillVariant=null;
          mode="variant-menu";
        }else{
          selectedSkill=null;
          selectedSkillVariant=null;
          mode=isSpecial(previousSkill)?"special-menu":"attack-menu";
        }
        render();
      });
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
    clearSelection();
    render();
  };
  endTurn.onclick=endPlayerTurn;
  document.querySelectorAll("[data-log-tab]").forEach(btn=>{
    btn.onclick=()=>{BattleLog.setActive(logState,btn.dataset.logTab);renderLog();};
  });

  window.CardTacticsRuntime={
    getCardState:()=>cardState,
    getPhase:()=>phase,
    getPendingCard:()=>pendingCard,
    playCard:selectCardForPlay,
    endCardPhase,
    cancelCard:()=>{pendingCard=null;render();},
    refresh:render
  };

  resetBattle();
})();