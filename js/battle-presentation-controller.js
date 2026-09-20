(()=>{
"use strict";

const TILE_EFFECT_INFO=Object.freeze({
  TORNADO:{name:"龍捲風",interaction:"持續風場；地面單位進入時觸發共用強制位移與墜落判定。"},
  BURNING:{name:"燃燒",interaction:"小火可被水／豪雨熄滅；風可使燃燒區形成火龍捲。"},
  STEAM:{name:"蒸氣",interaction:"遮蔽視線；持續時間結束後消散。"},
  FRAGMENTS:{name:"岩石破片",interaction:"爆炸擊中石質環境時產生的物理破片效果。"},
  FIRE_TORNADO:{name:"火龍捲",interaction:"燃燒區受到風力作用形成；造成高額火焰環境傷害。"},
  ELECTRIFIED:{name:"帶電",interaction:"雷元素在水域或雨天可發生傳導。"}
});
const TILE_ENVIRONMENT_NAME=Object.freeze({NONE:"一般",GRASS:"草木",WATER:"水",STONE:"石質"});
const WEATHER_NAME=Object.freeze({CLEAR:"晴朗",FOG:"迷霧",RAIN:"雨",HEAVY_RAIN:"豪大雨",THUNDERSTORM:"雷雨"});

function create(ctx){
  if(!ctx?.state)throw new Error("BattlePresentationController requires state().");

  function tileInteractions(tile,effects){
    const s=ctx.state(),environment=EnvironmentEngine.environmentAt(s.map,tile.x,tile.y),notes=[];
    if(environment==="GRASS"){
      if(EnvironmentEngine.isRain(s.environmentState))notes.push("草木受雨勢影響，小火無法形成持續燃燒。");
      else notes.push("草木可被 FIRE／HEAVY_FIRE 點燃。");
    }
    if(environment==="WATER"){
      notes.push("小火會被熄滅；HEAVY_FIRE 會產生蒸氣並蒸乾水域，地形轉為陸地。");
      notes.push("水域可傳導雷元素。");
    }
    if(environment==="STONE")notes.push("EXPLOSION 可產生岩石破片；可破壞的石質物件可能被炸開。");
    if(tile.terrain==="MUD")notes.push("泥濘提高一般移動成本；雨勢結束後恢復為平地。");
    if(EnvironmentEngine.isRain(s.environmentState))notes.push("雨天環境具導電性。");
    for(const effect of effects||[]){
      const note=TILE_EFFECT_INFO[effect.type]?.interaction;
      if(note&&!notes.includes(note))notes.push(note);
    }
    return notes;
  }

  function tileAnnotation(tile){
    if(!tile)return "";
    const s=ctx.state(),terrain=TERRAINS[tile.terrain]||{};
    const environment=EnvironmentEngine.environmentAt(s.map,tile.x,tile.y);
    const effects=s.environmentState?EnvironmentEngine.effectAt(s.environmentState,tile.x,tile.y):[];
    const object=(s.map.objects||[]).find(o=>!o.destroyed&&o.x===tile.x&&o.y===tile.y);
    const lines=[
      `地圖格 (${tile.x},${tile.y})｜${terrain.name||tile.terrain}｜H${Number(tile.elevation||0)}`,
      `移動成本：${terrain.passable===false?"不可通行":terrain.moveCost??"-"}｜迴避修正：${Number(terrain.evasion||0)>=0?"+":""}${Number(terrain.evasion||0)}${terrain.rangedAccuracy?`｜遠程命中 +${terrain.rangedAccuracy}`:""}`,
      `環境材質：${TILE_ENVIRONMENT_NAME[environment]||environment}｜天候：${WEATHER_NAME[s.environmentState?.weather]||s.environmentState?.weather||"晴朗"}`
    ];
    if(object)lines.push(`地圖物件：${object.name||object.id}${object.destructible?"｜可破壞":""}`);
    if(effects.length)lines.push("目前效果："+effects.map(effect=>{
      const info=TILE_EFFECT_INFO[effect.type],duration=effect.duration==null?"":`（剩 ${effect.duration} 回合）`,damage=effect.damage?`／傷害 ${effect.damage}`:"";
      return `${info?.name||effect.type}${duration}${damage}`;
    }).join("、"));
    else lines.push("目前效果：無");
    const interactions=tileInteractions(tile,effects);
    lines.push(`環境互動：${interactions.length?interactions.join(" "):"目前沒有特殊互動。"}`);
    return lines.join("\n");
  }

  function combatPreview(attacker,target,skill){
    if(!attacker?.alive||!target?.alive||!skill||target.kind==="CORE")return null;
    const s=ctx.state(),resolved=ctx.effectiveSkill(attacker,skill);
    const at=TacticalEngine.tile(s.map,attacker.x,attacker.y),dt=TacticalEngine.tile(s.map,target.x,target.y);
    const weapon=attacker.character.weapons?.[resolved.weapon];
    const type=resolved.attackType==="INHERIT"?weapon?.attackType:resolved.attackType;
    const terrainAcc=at?.terrain==="HIGH_GROUND"&&(type==="SHOT"||type==="MAGIC")&&at.elevation>dt?.elevation?Number(TERRAINS[at.terrain]?.rangedAccuracy||0):0;
    const terrainEva=Number(TERRAINS[dt?.terrain]?.evasion||0);
    const ac={...attacker.character,modifiers:{...(attacker.character.modifiers||{}),accuracy:Number(attacker.character.modifiers?.accuracy||0)+terrainAcc}};
    const dc={...target.character,modifiers:{...(target.character.modifiers||{}),evasion:Number(target.character.modifiers?.evasion||0)+terrainEva}};
    return {skillId:resolved.id,skillName:resolved.name,hit:BattleEngine.hitChance(ac,dc,resolved),crit:BattleEngine.critChance(ac,resolved),terrainAcc,terrainEva};
  }

  function unitPresentation(unit){
    const s=ctx.state();
    if(!unit?.alive)return null;
    const tile=TacticalEngine.tile(s.map,unit.x,unit.y),maxHp=Number(unit.character.combat.hp||unit.hp||1),combat=unit.character.combat||{};
    const baseHit=Math.max(BATTLE_RULES.combatParams.minHit,Math.min(BATTLE_RULES.combatParams.maxHit,BATTLE_RULES.combatParams.baseHit+BattleEngine.accuracy(unit.character,{})));
    const actionState=unit.team===ctx.TEAM.ENEMY?"敵方單位":unit.acted?(unit.waited?"已待機":"已完成主動行動 / 可支援"):unit.moved?"已移動 / 可攻擊":"可移動 / 可行動";
    const preview=s.selected&&s.selected!==unit&&s.selectedSkill&&s.mode==="attack"?combatPreview(s.selected,unit,s.selectedSkill):null;
    return {
      id:unit.id,team:unit.team,name:unit.character.name,visualId:unit.character.visualId||null,
      hp:unit.hp,maxHp,move:Number(combat.move||0),x:unit.x,y:unit.y,z:Number(unit.z??(tile?.elevation||0)),
      terrain:tile?TERRAINS[tile.terrain]?.name||tile.terrain:"",elevation:Number(tile?.elevation||0),actionState,
      stats:{atk:Number(combat.atk||0),def:Number(combat.def||0),matk:Number(combat.matk||0),mdef:Number(combat.mdef||0),
        hit:baseHit,eva:BattleEngine.evasion(unit.character),crit:BattleEngine.critChance(unit.character,{}),spd:BattleEngine.actionSpeed(unit.character,{})},
      preview
    };
  }

  function battleSnapshot(){
    const s=ctx.state();
    const reachable=s.selected&&s.phase===ctx.PHASE.PLAYER&&!s.selected.acted&&!s.selected.moved&&s.mode==="command"?TacticalEngine.reachable(s.map,s.units,s.selected):new Map();
    const targets=s.selected&&s.phase===ctx.PHASE.PLAYER&&!s.selected.acted&&s.mode==="attack"&&s.selectedSkill&&ctx.targetType(s.selectedSkill)==="SINGLE"?ctx.targetableEntities(s.selected,s.selectedSkill):[];
    const mapTargets=s.selected&&s.phase===ctx.PHASE.PLAYER&&!s.selected.acted&&s.mode==="map-target"&&s.selectedSkill?ctx.mapTargetTiles(s.selected,s.selectedSkill):[];
    const points=DeploymentEngine.points(s.stage);
    const tiles=s.map.tiles.map(tile=>{
      const unit=ctx.unitAt(tile.x,tile.y),core=ctx.coreAt(tile.x,tile.y);
      const capturePoint=points.find(point=>(point.captureTiles||[]).some(t=>t.x===tile.x&&t.y===tile.y))||null;
      const effects=s.environmentState?EnvironmentEngine.effectAt(s.environmentState,tile.x,tile.y):[];
      const deployable=!!(s.pendingCard&&s.phase===ctx.PHASE.CARD&&CardDatabase.isCharacter(s.pendingCard)&&DeploymentEngine.canDeploy({stage:s.stage,map:s.map,units:s.units,owner:"PLAYER",x:tile.x,y:tile.y}));
      const attackable=!!((s.pendingCard&&s.phase===ctx.PHASE.CARD&&CardDatabase.isSpell(s.pendingCard))||(unit&&targets.includes(unit))||(core&&targets.some(target=>target.kind==="CORE"&&target.core===core))||mapTargets.includes(tile));
      return {x:tile.x,y:tile.y,terrain:tile.terrain,elevation:Number(tile.elevation||0),reachable:reachable.has(tile.x+","+tile.y),attackable,deployable,
        inspected:!!(s.inspectedTile&&s.inspectedTile.x===tile.x&&s.inspectedTile.y===tile.y),effects:effects.map(effect=>effect.type),
        deploymentAreaOwner:points.find(point=>(point.area||[]).some(t=>t.x===tile.x&&t.y===tile.y))?.owner||null,
        capturePoint:capturePoint?{id:capturePoint.id,name:capturePoint.name,owner:capturePoint.owner}:null,
        core:core?{id:core.id,owner:core.owner,name:core.name,hp:core.hp,maxHp:core.maxHp}:null};
    });
    return {revision:s.renderRevision,phase:s.phase,round:s.round,mode:s.mode,
      map:{id:s.map.id,width:s.map.width,height:s.map.height,tiles,objects:(s.map.objects||[]).map(o=>({...o}))},
      cores:s.cores.map(core=>({...core})),
      presentation:{deploymentPoints:points.map(point=>({id:point.id,name:point.name,owner:point.owner,capturable:point.capturable!==false,area:(point.area||[]).map(t=>({...t})),captureTiles:(point.captureTiles||[]).map(t=>({...t}))})),
        enemyHandCount:s.enemyCardState?.zones?.hand?.length||0,enemyDeckCount:s.enemyCardState?.zones?.deck?.length||0},
      units:s.units.filter(u=>u.alive).map(u=>({id:u.id,x:u.x,y:u.y,z:Number(u.z??(TacticalEngine.elevation(TacticalEngine.tile(s.map,u.x,u.y))||0)),
        team:u.team==="P"?"PLAYER":"ENEMY",name:u.character.name,visualId:u.character.visualId||null,hp:u.hp,maxHp:Number(u.character.combat.hp||u.hp||1),
        selected:u===s.selected,finished:!!u.acted,moved:!!u.moved,acted:!!u.acted}))};
  }

  return Object.freeze({battleSnapshot,unitPresentation,combatPreview,tileAnnotation});
}

window.BattlePresentationController=Object.freeze({create});
})();
