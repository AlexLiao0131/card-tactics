(()=> {
  const host=document.getElementById("cardPhasePanel");if(!host||!window.CardTacticsRuntime)return;
  host.closest(".card")?.classList.add("battle-hand-shell");
  let previewId=null,mulliganSelected=new Set();

  function kind(card){return card.type==="CHARACTER"?(card.unitType==="HERO"?"英雄角色卡":"角色卡"):"卡牌魔法";}
  function ensureStyle(){
    if(document.getElementById("ctMulliganStyle"))return;
    const s=document.createElement("style");s.id="ctMulliganStyle";s.textContent=`
      .mulligan-guide{position:absolute;z-index:78;left:50%;bottom:128px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:7px 10px;border:1px solid #8a7958;border-radius:9px;background:#081018ed;font-size:11px;white-space:nowrap;pointer-events:auto}
      .mulligan-guide span{color:#cbd4df}.mulligan-actions{position:absolute;z-index:79;left:50%;bottom:92px;transform:translateX(-50%);display:flex;gap:7px;pointer-events:auto}.mulligan-actions button{width:auto;padding:7px 10px}
      .fan-card.mulligan-selected{outline:3px solid #e2b45d;transform:translateY(-28px) rotate(0);z-index:12}
      #cardPhasePanel.targeting-mode{height:52px!important}
      #cardPhasePanel.targeting-mode .fan-hand,#cardPhasePanel.targeting-mode .battle-resource,#cardPhasePanel.targeting-mode .battle-deck-count,#cardPhasePanel.targeting-mode .card-phase-compact-actions,#cardPhasePanel.targeting-mode .mulligan-guide,#cardPhasePanel.targeting-mode .mulligan-actions{display:none!important}
      #cardPhasePanel.targeting-mode .card-targeting-bar{bottom:4px}
      @media(max-width:700px){.mulligan-guide{bottom:112px;max-width:90vw;font-size:9px}.mulligan-actions{bottom:78px}.mulligan-actions button{font-size:10px;padding:6px 8px}}
    `;document.head.appendChild(s);
  }
  function render(){
    ensureStyle();
    const state=CardTacticsRuntime.getCardState();if(!state)return;
    const phase=CardTacticsRuntime.getPhase(),pending=CardTacticsRuntime.getPendingCard();
    const enemyState=CardTacticsRuntime.getEnemyCardState?.(),enemyView=CardTacticsRuntime.getEnemyPresentation?.();
    const cards=CardDatabase.list(state.zones.hand);
    const opening=phase==="CARD_PHASE"&&state.mulliganAvailable&&!state.mulliganDone;
    if(previewId&&!cards.some(c=>c.id===previewId))previewId=null;
    if(pending)previewId=null;
    const preview=previewId?CardDatabase.get(previewId):null,targeting=!!pending;
    host.classList.toggle("targeting-mode",targeting);host.classList.toggle("mulligan-mode",opening);
    const enemyHtml=enemyState?`<div class="opponent-hand">${Array.from({length:enemyState.zones?.hand?.length||0},(_,i)=>`<i class="opponent-card-back" style="--fan:${i-((enemyState.zones?.hand?.length||1)-1)/2}"></i>`).join("")}</div><div class="opponent-meta">敵方　💎 ${enemyState.crystals||0}/${enemyState.crystalCapacity||0}　牌庫 ${enemyState.zones?.deck?.length||0}</div>${phase==="ENEMY_TURN"?`<div class="opponent-message">${enemyView?.message||"敵方思考中…"}</div>`:""}${phase==="ENEMY_TURN"&&enemyView?.cardId?`<div class="enemy-play-reveal">${CardDatabase.get(enemyView.cardId)?.name||""}</div>`:""}`:"";
    host.innerHTML=enemyHtml+
      `<div class="battle-resource">💎 ${state.crystals}/${state.crystalCapacity||state.startingCrystals||4}</div><div class="battle-deck-count">牌庫 ${state.zones.deck.length}</div>`+
      (opening?`<div class="mulligan-guide"><strong>起手換牌</strong><span>選擇不要的牌；整場僅一次。</span></div>`:"")+
      `<div class="fan-hand">${cards.map((c,i)=>{const sel=mulliganSelected.has(c.id),offset=i-(cards.length-1)/2;return `<button class="fan-card ${sel?"mulligan-selected":""} ${pending?.id===c.id?"pending":""}" data-card="${c.id}" style="--fan:${offset};--i:${i}" ${!opening&&!(phase==="CARD_PHASE"&&CardPhaseEngine.canPlay(state,c))?"disabled":""}><span class="fan-cost">${c.cost}</span><span class="fan-name">${c.name}</span><small>${opening?(sel?"將換掉":"保留"):kind(c)}</small></button>`;}).join("")||`<div class="empty-hand">目前沒有手牌</div>`}</div>`+
      (opening?`<div class="mulligan-actions"><button id="confirmMulligan" ${mulliganSelected.size?"":"disabled"}>換掉 ${mulliganSelected.size} 張</button><button id="keepOpeningHand">全部保留</button></div>`:"")+
      (!opening&&!targeting&&preview?`<div class="card-preview"><div class="preview-card-face"><span class="preview-cost">${preview.cost}</span><strong>${preview.name}</strong><small>${kind(preview)}</small></div><div class="preview-question">要使用這張卡嗎？</div><div class="preview-actions"><button id="confirmCardUse">使用</button><button id="cancelCardPreview">取消</button></div></div>`:"")+
      (targeting?`<div class="card-targeting-bar"><button id="cancelCardDeploy">← 取消</button><strong>${pending.name}</strong><span>${pending.type==="CHARACTER"?"請選擇部署位置":"請在戰場選擇目標"}</span></div>`:"")+
      (!opening?`<div class="card-phase-compact-actions"><button id="endCardPhase" ${phase==="CARD_PHASE"&&!targeting?"":"disabled"}>結束卡牌階段</button></div>`:"");
    host.querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>{
      const id=btn.dataset.card;
      if(opening){mulliganSelected.has(id)?mulliganSelected.delete(id):mulliganSelected.add(id);render();return;}
      previewId=id;render();
    });
    host.querySelector("#confirmMulligan")?.addEventListener("click",()=>{
      CardPhaseEngine.mulligan(state,[...mulliganSelected]);mulliganSelected.clear();
      window.dispatchEvent(new CustomEvent("cardtactics:state"));
    });
    host.querySelector("#keepOpeningHand")?.addEventListener("click",()=>{
      CardPhaseEngine.keepOpeningHand(state);mulliganSelected.clear();
      window.dispatchEvent(new CustomEvent("cardtactics:state"));
    });
    host.querySelector("#confirmCardUse")?.addEventListener("click",()=>{
      const id=previewId;
      previewId=null;
      if(id)CardTacticsRuntime.playCard(id);
      render();
    });
    host.querySelector("#cancelCardPreview")?.addEventListener("click",()=>{previewId=null;render();});
    host.querySelector("#endCardPhase")?.addEventListener("click",()=>CardTacticsRuntime.endCardPhase());
    host.querySelector("#cancelCardDeploy")?.addEventListener("click",()=>{
      previewId=null;
      CardTacticsRuntime.cancelCard();
      render();
    });
  }
  window.addEventListener("cardtactics:state",render);render();
})();