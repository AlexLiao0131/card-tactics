(()=> {
  const host=document.getElementById("cardPhasePanel");
  if(!host||!window.CardPhaseEngine)return;

  const demoDeck=[
    "livia_card","imperial_swordsman_card","imperial_swordsman_card",
    "imperial_spearman_card","imperial_mage_card","fog_card","rain_card","resurrection_card"
  ];
  const state=CardPhaseEngine.create({deck:demoDeck,crystalsPerTurn:10});
  DeckEngine.shuffle(state.zones);

  function render(){
    const cards=CardDatabase.list(state.zones.hand);
    host.innerHTML=
      `<div class="card-phase-head"><strong>卡牌階段骨架</strong><span>💎 ${state.crystals}/10</span></div>`+
      `<div class="card-zone-summary">牌庫 ${state.zones.deck.length}｜手牌 ${state.zones.hand.length}｜墓地 ${state.zones.graveyard.length}｜棄牌 ${state.zones.discard.length}</div>`+
      `<div class="hand">${cards.map(c=>`<button class="hand-card" data-card="${c.id}" ${CardPhaseEngine.canPlay(state,c)?"":"disabled"}><b>${c.name}</b><small>${c.type==="CHARACTER"?(c.unitType==="HERO"?"英雄角色卡":"角色卡"):"卡牌魔法"}｜Cost ${c.cost}</small></button>`).join("")}</div>`+
      `<div class="card-phase-actions"><button id="demoBeginCardPhase">${state.active?"重新開始卡牌階段":"開始卡牌階段"}</button><button id="demoEndCardPhase" ${state.active?"":"disabled"}>結束卡牌階段</button></div>`;
    host.querySelector("#demoBeginCardPhase").onclick=()=>{CardPhaseEngine.begin(state,{draw:3});render();};
    host.querySelector("#demoEndCardPhase").onclick=()=>{CardPhaseEngine.end(state);render();};
    host.querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>{
      const card=CardDatabase.get(btn.dataset.card);
      if(!CardPhaseEngine.commit(state,card))return;
      render();
    });
  }
  render();
})();
