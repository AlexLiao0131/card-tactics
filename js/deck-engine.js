window.DeckEngine=(()=>{
  function create(cardIds=[]){
    return{
      deck:[...cardIds],
      hand:[],
      graveyard:[],
      discard:[]
    };
  }
  function shuffle(state,rng=Math.random){
    for(let i=state.deck.length-1;i>0;i--){
      const j=Math.floor(rng()*(i+1));
      [state.deck[i],state.deck[j]]=[state.deck[j],state.deck[i]];
    }
    return state;
  }
  function draw(state,count=1){
    const drawn=[];
    while(count-->0&&state.deck.length){
      const id=state.deck.shift();
      state.hand.push(id);
      drawn.push(id);
    }
    return drawn;
  }
  function removeFromHand(state,cardId){
    const i=state.hand.indexOf(cardId);
    if(i<0)return false;
    state.hand.splice(i,1);
    return true;
  }
  function toDiscard(state,cardId){state.discard.push(cardId);}
  function toGraveyard(state,cardId){state.graveyard.push(cardId);}
  function reviveToHand(state,cardId){
    const i=state.graveyard.indexOf(cardId);
    if(i<0)return false;
    state.graveyard.splice(i,1);
    state.hand.push(cardId);
    return true;
  }
  return{create,shuffle,draw,removeFromHand,toDiscard,toGraveyard,reviveToHand};
})();
