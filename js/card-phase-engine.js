window.CardPhaseEngine=(()=>{
  const DEFAULT_CRYSTALS=10;
  function create({deck=[],crystalsPerTurn=DEFAULT_CRYSTALS}={}){
    return{
      zones:DeckEngine.create(deck),
      crystals:0,
      crystalsPerTurn,
      active:false,
      played:[]
    };
  }
  function begin(state,{draw=1}={}){
    state.active=true;
    state.crystals=state.crystalsPerTurn;
    state.played=[];
    return DeckEngine.draw(state.zones,draw);
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
  function end(state){state.active=false;}
  return{DEFAULT_CRYSTALS,create,begin,canPlay,commit,characterDefeated,end};
})();
