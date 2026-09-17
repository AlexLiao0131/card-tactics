(()=> {
  const host=document.getElementById("cardPhasePanel");
  if(!host||!window.CardTacticsRuntime)return;
  host.closest(".card")?.classList.add("battle-hand-shell");
  let previewId=null;

  function kind(card){
    return card.type==="CHARACTER"?(card.unitType==="HERO"?"英雄角色卡":"角色卡"):"卡牌魔法";
  }
  function render(){
    const state=CardTacticsRuntime.getCardState();
    if(!state)return;
    const phase=CardTacticsRuntime.getPhase();
    const pending=CardTacticsRuntime.getPendingCard();
    const enemyState=CardTacticsRuntime.getEnemyCardState?.();
    const enemyView=CardTacticsRuntime.getEnemyPresentation?.();
    const cards=CardDatabase.list(state.zones.hand);
    if(previewId&&!cards.some(c=>c.id===previewId))previewId=null;
    const preview=previewId?CardDatabase.get(previewId):null;
    const targeting=!!pending;
    host.classList.toggle("targeting-mode",targeting);

    host.innerHTML=
      (phase==="ENEMY_TURN"?`<div class="enemy-turn-panel"><div class="enemy-turn-title">敵方回合　💎 ${enemyState?.crystals||0}/${enemyState?.crystalCapacity||0}</div><div class="enemy-card-backs">${Array.from({length:enemyState?.zones?.hand?.length||0},()=>"<i></i>").join("")}</div><div class="enemy-turn-message">${enemyView?.message||"敵方思考中…"}</div>${enemyView?.cardId?`<div class="enemy-played-card">${CardDatabase.get(enemyView.cardId)?.name||""}</div>`:""}</div>`:"")+
      `<div class="battle-resource">💎 ${state.crystals}/${state.crystalCapacity||state.startingCrystals||4}</div>`+
      `<div class="battle-deck-count">牌庫 ${state.zones.deck.length}</div>`+
      `<div class="fan-hand">${cards.map((c,i)=>{
        const mid=(cards.length-1)/2;
        const offset=i-mid;
        return `<button class="fan-card ${previewId===c.id?"previewing":""} ${pending?.id===c.id?"pending":""}" data-card="${c.id}" style="--fan:${offset};--i:${i}" ${phase==="CARD_PHASE"&&CardPhaseEngine.canPlay(state,c)?"":"disabled"}>
          <span class="fan-cost">${c.cost}</span><span class="fan-name">${c.name}</span><small>${kind(c)}</small>
        </button>`;
      }).join("")||`<div class="empty-hand">目前沒有手牌</div>`}</div>`+
      (preview?`<div class="card-preview">
        <div class="preview-card-face"><span class="preview-cost">${preview.cost}</span><strong>${preview.name}</strong><small>${kind(preview)}</small></div>
        <div class="preview-question">要使用這張卡嗎？</div>
        <div class="preview-actions"><button id="confirmCardUse">使用</button><button id="cancelCardPreview">取消</button></div>
      </div>`:"")+
      (targeting?`<div class="card-targeting-bar"><button id="cancelCardDeploy">← 取消</button><strong>${pending.name}</strong><span>${pending.type==="CHARACTER"?"請選擇部署位置":"請在戰場選擇目標"}</span></div>`:"")+
      `<div class="card-phase-compact-actions"><button id="endCardPhase" ${phase==="CARD_PHASE"&&!targeting?"":"disabled"}>結束卡牌階段</button></div>`;

    host.querySelectorAll("[data-card]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        previewId=btn.dataset.card;
        render();
      });
    });
    host.querySelector("#confirmCardUse")?.addEventListener("click",()=>{
      const id=previewId;
      previewId=null;
      if(id)CardTacticsRuntime.playCard(id);
    });
    host.querySelector("#cancelCardPreview")?.addEventListener("click",()=>{previewId=null;render();});
    host.querySelector("#endCardPhase")?.addEventListener("click",()=>CardTacticsRuntime.endCardPhase());
    host.querySelector("#cancelCardDeploy")?.addEventListener("click",()=>CardTacticsRuntime.cancelCard());
  }

  window.addEventListener("cardtactics:state",render);
  render();
})();