(()=> {
  const host=document.getElementById("cardPhasePanel");
  if(!host||!window.CardTacticsRuntime)return;

  function render(){
    const state=CardTacticsRuntime.getCardState();
    if(!state)return;
    const phase=CardTacticsRuntime.getPhase();
    const pending=CardTacticsRuntime.getPendingCard();
    const cards=CardDatabase.list(state.zones.hand);
    host.innerHTML=
      `<div class="card-phase-head"><strong>${phase==="CARD_PHASE"?"卡牌階段":"卡牌資訊"}</strong><span>💎 ${state.crystals}/${state.crystalsPerTurn}</span></div>`+
      `<div class="card-zone-summary">牌庫 ${state.zones.deck.length}｜手牌 ${state.zones.hand.length}｜墓地 ${state.zones.graveyard.length}｜棄牌 ${state.zones.discard.length}</div>`+
      `<div class="hand">${cards.map(c=>`<button class="hand-card ${pending?.id===c.id?"active":""}" data-card="${c.id}" ${phase==="CARD_PHASE"&&CardPhaseEngine.canPlay(state,c)?"":"disabled"}><b>${c.name}</b><small>${c.type==="CHARACTER"?(c.unitType==="HERO"?"英雄角色卡":"角色卡"):"卡牌魔法"}｜Cost ${c.cost}</small></button>`).join("")||"<div class='empty-hand'>目前沒有手牌</div>"}</div>`+
      `<div class="card-phase-actions"><button id="endCardPhase" ${phase==="CARD_PHASE"?"":"disabled"}>結束卡牌階段</button><button id="cancelCardDeploy" ${pending?"":"disabled"}>取消部署</button></div>`;
    host.querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>CardTacticsRuntime.playCard(btn.dataset.card));
    host.querySelector("#endCardPhase").onclick=()=>CardTacticsRuntime.endCardPhase();
    host.querySelector("#cancelCardDeploy").onclick=()=>CardTacticsRuntime.cancelCard();
  }
  window.addEventListener("cardtactics:state",render);
  render();
})();
