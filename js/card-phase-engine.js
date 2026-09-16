window.CardPhaseEngine=(()=>{
  const DEFAULT_CRYSTALS=10;
  const DEFAULT_HAND_SIZE=5;
  function create({deck=[],crystalsPerTurn=DEFAULT_CRYSTALS,handSize=DEFAULT_HAND_SIZE}={}){
    return{
      zones:DeckEngine.create(deck),
      crystals:0,
      crystalsPerTurn,
      handSize,
      active:false,
      played:[]
    };
  }
  function begin(state,{handSize=state.handSize||DEFAULT_HAND_SIZE}={}){
    state.active=true;
    state.crystals=state.crystalsPerTurn;
    state.played=[];
    const missing=Math.max(0,Number(handSize||0)-state.zones.hand.length);
    return DeckEngine.draw(state.zones,missing);
  }
  function canPlay(state,card){
    return !!state.active&&!!card&&state.zones.hand.includes(card.id)&&state.crystals>=Number(card.cost||0);
  }
  function commit(state,card){
    if(!canPlay(state,card))return false;
    if(!DeckEngine.removeFromHand(state.zones,card.id))return false;
    state.crystals-=Number(card.cost||0);
    state.played.push(card.id);
    if(CardDatabase.isSpell(card))DeckEngine.toDiscard(state.zones,card.id);
    return true;
  }
  function characterDefeated(state,cardId){
    if(cardId)DeckEngine.toGraveyard(state.zones,cardId);
  }
  function resolveTurnEndEffects(state,{units=[],team="P"}={}){
    const results=[];
    for(const unit of units){
      if(!unit?.alive||unit.team!==team)continue;
      for(const passive of SkillDatabase.passiveList(unit.character?.passives)){
        const effect=passive.turnEndEffect;
        if(effect?.type!=="DRAW")continue;
        const drawn=DeckEngine.draw(state.zones,Math.max(0,Number(effect.count||0)));
        results.push({sourceId:passive.id,sourceName:passive.name,unitId:unit.id,drawn});
      }
    }
    return results;
  }
  function end(state){state.active=false;}
  return{DEFAULT_CRYSTALS,DEFAULT_HAND_SIZE,create,begin,canPlay,commit,characterDefeated,resolveTurnEndEffects,end};
})();
