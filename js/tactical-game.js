(()=>{
  const ICON={PLAIN:"",FOREST:"🌲",HIGH_GROUND:"▲",WATER:"≈",WALL:"■"};
  const TEAM={PLAYER:"P",ENEMY:"E"};
  const PHASE={PLAYER:"PLAYER_TURN",ENEMY:"ENEMY_TURN",ENDED:"MATCH_ENDED"};

  let map,units,selected,mode,selectedSkill,logs,round,phase,matchResult,stage,stageState;
  let pendingEngagement=null;
  let supportSelection=new Map();

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
    units=[];

    stage.playerSpawns.forEach((u,i)=>units.push(createUnit("p"+i,TEAM.PLAYER,u.characterId,u.x,u.y)));
    stage.enemySpawns.forEach((u,i)=>units.push(createUnit("e"+i,TEAM.ENEMY,u.characterId,u.x,u.y)));

    selected=null;
    selectedSkill=null;
    pendingEngagement=null;
    supportSelection=new Map();
    mode="idle";
    logs=["Round 1｜我方回合開始。"];
    round=1;
    phase=PHASE.PLAYER;
    matchResult=null;
    stageEvent({type:"ROUND_START",round,team:"PLAYER"});
    render();
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
    logs.push(`${character.name} 出現在 (${action.x},${action.y})。`);
    return unit;
  }

  function stageEvent(event){
    if(!stageState)return;
    StageEngine.run(stageState,event,{
      units,
      log:text=>logs.push(text),
      spawn:spawnFromScript,
      setObjective:action=>logs.push(`勝敗條件變更：${action.objective||action.type}`)
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

  function clearSelection(){
    selected=null;
    selectedSkill=null;
    clearEngagement();
    mode="idle";
  }

  function checkMatchEnd(){
    if(living(TEAM.ENEMY).length===0){
      phase=PHASE.ENDED;
      matchResult="VICTORY";
      clearSelection();
      logs.push(`Round ${round}｜VICTORY！敵方全滅。`);
      return true;
    }
    if(living(TEAM.PLAYER).length===0){
      phase=PHASE.ENDED;
      matchResult="DEFEAT";
      clearSelection();
      logs.push(`Round ${round}｜DEFEAT！我方全滅。`);
      return true;
    }
    return false;
  }

  function beginPlayerTurn(){
    round++;
    phase=PHASE.PLAYER;
    resetActions(TEAM.PLAYER);
    clearSelection();
    logs.push(`Round ${round}｜我方回合開始。`);
    stageEvent({type:"ROUND_START",round,team:"PLAYER"});
    render();
  }

  function runEnemyPhase(){
    phase=PHASE.ENEMY;
    clearSelection();
    resetActions(TEAM.ENEMY);
    logs.push(`Round ${round}｜敵方回合開始。`);
    logs.push("Enemy Phase Skeleton：正式 AI 尚未接入，本回合暫時跳過。");
    living(TEAM.ENEMY).forEach(u=>{
      u.moved=true;
      u.acted=true;
    });
    if(!checkMatchEnd()) beginPlayerTurn();
    else render();
  }

  function endPlayerTurn(){
    if(phase!==PHASE.PLAYER||matchResult) return;
    logs.push(`Round ${round}｜我方回合結束。`);
    runEnemyPhase();
  }

  function finishUnit(unit,reason,{waited=false}={}){
    unit.moved=true;
    unit.acted=true;
    unit.waited=waited;
    selectedSkill=null;
    clearEngagement();
    mode="inspect";
    logs.push(`${unit.character.name} ${reason}`);
    if(allFinished(TEAM.PLAYER)){
      logs.push("我方所有存活角色皆已完成行動，可結束回合。");
    }
  }

  function render(){
    battlefield.innerHTML="";

    const reachable=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&!selected.moved&&mode==="command"
        ?TacticalEngine.reachable(map,units,selected)
        :new Map();

    const targets=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="attack"&&selectedSkill
        ?TacticalEngine.targets(units,selected,selectedSkill)
        :[];

    map.tiles.forEach(tile=>{
      const cell=document.createElement("div");
      const unit=unitAt(tile.x,tile.y);

      cell.className="tile "+tile.terrain.toLowerCase();
      if(reachable.has(tile.x+","+tile.y)) cell.classList.add("reachable");
      if(unit&&targets.includes(unit)) cell.classList.add("attackable");
      if(unit===selected) cell.classList.add("selected");

      const finishedClass=unit&&unit.team===TEAM.PLAYER&&unit.acted?" finished":"";
      cell.innerHTML=
        `<span class="icon">${ICON[tile.terrain]}</span>`+
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
    battleLog.textContent=logs.slice(-12).join("\n");

    endTurn.disabled=phase!==PHASE.PLAYER||!!matchResult;
    cancelSelect.disabled=!selected||phase!==PHASE.PLAYER||!!matchResult;
  }

  function handleTileClick(tile,unit,reachable,targets){
    if(phase!==PHASE.PLAYER||matchResult) return;

    if(mode==="support-select") return;

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
      logs.push(`${selected.character.name} 移動完成。`);
      stageEvent({type:"ENTER_TILE",unitId:selected.id,characterId:selected.character.id,x:selected.x,y:selected.y,team:"PLAYER"});
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="attack"&&unit&&targets.includes(unit)){
      prepareAttack(selected,unit,selectedSkill);
    }
  }

  function prepareAttack(attacker,defender,skill){
    if(!canUseSkill(attacker,skill)) return;

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
    logs.push(`可選支援：${candidates.map(x=>x.ally.character.name).join("、")}`);
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
        onDefeated:unit=>{
          stageEvent({type:"UNIT_DEFEATED",unitId:unit.id,characterId:unit.character.id,team:unit.team});
        },
        onAction:entry=>{
          const {actor,target,skill,result,resolved,spd}=entry;
          const resource=resourceFor(actor,skill);
          const resourceText=resource.type==="USES"?`｜剩餘 ${resource.remaining}/${resource.max}`:"";
          logs.push(
            `[SPD ${spd}] ${entry.role==="SUPPORT"?"支援｜":""}${actor.character.name} → ${target.character.name}：`+
            `${result.hit?result.damage+"傷害":"MISS"}｜命中${result.hc}%`+
            `${resolved.terrain.eva?"｜森林EVA+"+resolved.terrain.eva:""}`+
            `${resolved.terrain.acc?"｜高地ACC+"+resolved.terrain.acc:""}`+
            resourceText
          );
        }
      }
    );

    if(!engagement.results.length){
      clearEngagement();
      mode="command";
      render();
      return;
    }

    attacker.moved=true;
    attacker.acted=true;
    attacker.waited=false;

    selectedSkill=null;
    clearEngagement();
    mode="inspect";

    if(checkMatchEnd()){
      render();
      return;
    }

    if(allFinished(TEAM.PLAYER)){
      logs.push("我方所有存活角色皆已完成行動，可結束回合。");
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

    const phaseName=phase===PHASE.PLAYER?"我方回合":"敵方回合";
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

  function renderPanel(){
    skillBar.innerHTML="";

    if(matchResult){
      tacticalInfo.textContent=matchResult==="VICTORY"
        ?"戰鬥勝利。按「重置戰場」可重新開始。"
        :"戰鬥失敗。按「重置戰場」可重新開始。";
      return;
    }

    if(phase!==PHASE.PLAYER){
      tacticalInfo.textContent="敵方回合處理中。";
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
        logs.push(`${selected.character.name}｜道具系統尚未接入。`);
        render();
      });

      addActionButton("對話",()=>{
        logs.push(`${selected.character.name}｜目前沒有可對話目標。`);
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
          if(!usable) return;
          selectedSkill=skill;
          mode="attack";
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

    if(mode==="attack"&&selectedSkill){
      const range=TacticalEngine.range(selectedSkill);
      tacticalInfo.textContent+=`\n${selectedSkill.name}｜射程 ${range.min}-${range.max}｜請選擇目標。`;
      addActionButton("返回",()=>{
        const previousSkill=selectedSkill;
        selectedSkill=null;
        mode=isSpecial(previousSkill)?"special-menu":"attack-menu";
        render();
      });
    }
  }

  resetMap.onclick=resetBattle;
  cancelSelect.onclick=()=>{
    if(phase!==PHASE.PLAYER||matchResult) return;
    clearSelection();
    render();
  };
  endTurn.onclick=endPlayerTurn;

  resetBattle();
})();