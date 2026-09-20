window.BattleSetupEngine=(()=>{
  function create({stageId,battleSetup,TEAM}){
    const stage=StageDatabase.get(stageId);
    if(!stage)throw new Error(`Unknown stage: ${stageId}`);
    const map=MapDatabase.createMap(stage.mapId);
    const stageState=StageEngine.create(stage.scriptId,{victory:stage.victory,defeat:stage.defeat});
    const cores=(stage.cores||[]).map(core=>({...core,hp:Number(core.hp??core.maxHp??0),maxHp:Number(core.maxHp??core.hp??0)}));
    const environmentState=window.EnvironmentEngine?EnvironmentEngine.create(stage.environment||{}):null;
    const units=[];
    const createUnit=(id,team,characterId,x,y)=>UnitRuntimeEngine.create({id,team,characterId,x,y,map});

    const forcedHeroIds=new Set((stage.playerSpawns||[]).filter(spawn=>spawn.source==="STAGE").map(spawn=>spawn.characterId));
    const requestedDeck=Array.isArray(battleSetup?.deck)&&battleSetup.deck.length?battleSetup.deck:stage.battleDeck||[];
    const battleDeck=requestedDeck.filter(cardId=>{
      const card=CardDatabase.get(cardId);
      return !(CardDatabase.isCharacter(card)&&card.unitType==="HERO"&&forcedHeroIds.has(card.characterId));
    });
    const cardState=CardPhaseEngine.create({
      deck:battleDeck,
      startingCrystals:Number(stage.cardRules?.startingCrystals||4),
      maxCrystals:Number(stage.cardRules?.maxCrystals||10),
      crystalGrowth:Number(stage.cardRules?.crystalGrowth||1),
      handSize:Number(stage.cardRules?.handSize||5)
    });
    const enemyCardState=CardPhaseEngine.create({
      deck:stage.enemyDeck||[],
      startingCrystals:Number(stage.enemyCardRules?.startingCrystals||stage.cardRules?.startingCrystals||4),
      maxCrystals:Number(stage.enemyCardRules?.maxCrystals||stage.cardRules?.maxCrystals||10),
      crystalGrowth:Number(stage.enemyCardRules?.crystalGrowth||stage.cardRules?.crystalGrowth||1),
      handSize:Number(stage.enemyCardRules?.handSize||stage.cardRules?.handSize||5)
    });
    DeckEngine.shuffle(cardState.zones);
    DeckEngine.shuffle(enemyCardState.zones);
    DeckEngine.draw(enemyCardState.zones,Number(stage.enemyCardRules?.handSize||stage.cardRules?.handSize||5));

    (stage.playerSpawns||[]).forEach((u,i)=>units.push(createUnit(`p${i}`,TEAM.PLAYER,u.characterId,u.x,u.y)));
    (stage.enemySpawns||[]).forEach((u,i)=>units.push(createUnit(`e${i}`,TEAM.ENEMY,u.characterId,u.x,u.y)));

    return {stage,map,stageState,cores,environmentState,units,cardState,enemyCardState,unitSerial:0};
  }
  return Object.freeze({create});
})();
