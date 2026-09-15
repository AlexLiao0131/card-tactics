(()=>{
  const W=8,H=6;
  const ICON={PLAIN:"",FOREST:"🌲",HIGH_GROUND:"▲",WATER:"≈",WALL:"■"};
  const TEAM={PLAYER:"P",ENEMY:"E"};
  const PHASE={PLAYER:"PLAYER_TURN",ENEMY:"ENEMY_TURN",ENDED:"MATCH_ENDED"};

  let map,units,selected,mode,selectedSkill,logs,round,phase,matchResult;

  function createMap(){
    const tiles=[];
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++) tiles.push({x,y,terrain:"PLAIN",elevation:0});
    }
    const setTile=(x,y,terrain,elevation=0)=>{
      Object.assign(tiles.find(t=>t.x===x&&t.y===y),{terrain,elevation});
    };
    [[2,1],[2,2],[5,3]].forEach(p=>setTile(...p,"FOREST"));
    [[3,0],[4,0]].forEach(p=>setTile(...p,"HIGH_GROUND",1));
    [[3,3],[3,4],[4,4]].forEach(p=>setTile(...p,"WATER"));
    [[4,2],[5,2]].forEach(p=>setTile(...p,"WALL"));
    return {tiles};
  }

  function createSkillResources(character){
    const resources={};
    character.skills.forEach(skill=>{
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
      skillResources:createSkillResources(character)
    };
  }

  function resetBattle(){
    map=createMap();
    units=[];

    [
      ["livia",0,0],
      ["elf_guard_test",0,2],
      ["imperial_swordsman",0,4],
      ["imperial_spearman_test",1,1],
      ["imperial_mage_test",1,3]
    ].forEach((u,i)=>units.push(createUnit("p"+i,TEAM.PLAYER,u[0],u[1],u[2])));

    [
      ["imperial_heavy_guard",7,0],
      ["forest_beast",7,2],
      ["water_guard_test",7,4],
      ["imperial_hammer_test",6,1],
      ["imperial_swordsman",6,3]
    ].forEach((u,i)=>units.push(createUnit("e"+i,TEAM.ENEMY,u[0],u[1],u[2])));

    selected=null;
    selectedSkill=null;
    mode="idle";
    logs=["Round 1｜我方回合開始。"];
    round=1;
    phase=PHASE.PLAYER;
    matchResult=null;
    render();
  }

  function unitAt(x,y){
    return units.find(u=>u.alive&&u.x===x&&u.y===y);
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

  function clearSelection(){
    selected=null;
    selectedSkill=null;
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

  function finishUnit(unit,reason){
    unit.moved=true;
    unit.acted=true;
    selectedSkill=null;
    mode="skill";
    logs.push(`${unit.character.name} ${reason}`);
    if(allFinished(TEAM.PLAYER)){
      logs.push("我方所有存活角色皆已完成行動，可結束回合。");
    }
  }

  function render(){
    battlefield.innerHTML="";

    const reachable=
      selected&&phase===PHASE.PLAYER&&!selected.acted&&mode==="move"
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
        `${unit?`<div class="unit ${unit.team===TEAM.PLAYER?"player":"enemy"}${finishedClass}">${shortName(unit.character.name)}<br>${unit.hp}</div>`:""}`;

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

    if(unit&&unit.team===TEAM.PLAYER){
      selected=unit;
      selectedSkill=null;
      mode=unit.acted?"inspect":(unit.moved?"skill":"move");
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="move"&&!unit&&reachable.has(tile.x+","+tile.y)){
      selected.x=tile.x;
      selected.y=tile.y;
      selected.moved=true;
      mode="skill";
      logs.push(`${selected.character.name} 移動完成。`);
      render();
      return;
    }

    if(selected&&!selected.acted&&mode==="attack"&&unit&&targets.includes(unit)){
      performAttack(selected,unit,selectedSkill);
    }
  }

  function performAttack(attacker,defender,skill){
    if(!canUseSkill(attacker,skill)) return;

    const resolved=TacticalEngine.resolve(map,attacker,defender,skill);
    const result=resolved.result;

    consumeSkill(attacker,skill);
    defender.hp=Math.max(0,defender.hp-result.damage);
    if(defender.hp===0) defender.alive=false;

    attacker.moved=true;
    attacker.acted=true;

    const resource=resourceFor(attacker,skill);
    const resourceText=resource.type==="USES"?`｜剩餘 ${resource.remaining}/${resource.max}`:"";

    logs.push(
      `${attacker.character.name} → ${defender.character.name}：`+
      `${result.hit?result.damage+"傷害":"MISS"}｜命中${result.hc}%`+
      `${resolved.terrain.eva?"｜森林EVA+"+resolved.terrain.eva:""}`+
      `${resolved.terrain.acc?"｜高地ACC+"+resolved.terrain.acc:""}`+
      resourceText
    );

    selectedSkill=null;
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
    const actionState=selected.acted?"已行動":(selected.moved?"已移動 / 可攻擊":"可移動 / 可行動");

    tacticalInfo.textContent=
      `${selected.character.name}｜HP ${selected.hp}/${selected.character.combat.hp}｜MOVE ${selected.character.combat.move}\n`+
      `(${selected.x},${selected.y}) ${TERRAINS[tile.terrain].name} 高度${tile.elevation}\n`+
      `狀態：${actionState}`;

    if(selected.acted) return;

    if(mode==="move"){
      addActionButton("原地行動",()=>{
        selected.moved=true;
        mode="skill";
        logs.push(`${selected.character.name} 選擇原地行動。`);
        render();
      });
      addActionButton("待機",()=>{
        finishUnit(selected,"待機，行動結束。");
        render();
      });
      return;
    }

    selected.character.skills.forEach(skill=>{
      const button=document.createElement("button");
      const range=TacticalEngine.range(skill);
      const usable=canUseSkill(selected,skill);
      button.textContent=`${skill.name}｜射程 ${range.min}-${range.max}｜${resourceLabel(selected,skill)}`;
      button.disabled=!usable;
      if(skill===selectedSkill) button.classList.add("active");
      button.onclick=()=>{
        if(!usable) return;
        selectedSkill=skill;
        mode="attack";
        render();
      };
      skillBar.appendChild(button);
    });

    addActionButton("待機",()=>{
      finishUnit(selected,"待機，行動結束。");
      render();
    });
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