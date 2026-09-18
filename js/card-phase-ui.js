(()=> {
  const host=document.getElementById("cardPhasePanel");
  if(!host||!window.CardTacticsRuntime)return;
  host.closest(".card")?.classList.add("battle-hand-shell");
  let previewId=null;

  function kind(card){return card.type==="CHARACTER"?(card.unitType==="HERO"?"英雄角色卡":"角色卡"):"卡牌魔法";}
  function ensureStyle(){
    if(document.getElementById("ctBattleCompositionStyle"))return;
    const s=document.createElement("style");s.id="ctBattleCompositionStyle";s.textContent=`
      .opponent-hand{position:fixed;z-index:52;left:50%;top:-44px;transform:translateX(-50%);width:min(760px,86vw);height:150px;display:flex;justify-content:center;align-items:flex-start;pointer-events:none}
      .opponent-card-back{width:82px;height:118px;margin-left:-35px;border:2px solid #a77b70;border-radius:9px;background:linear-gradient(145deg,#5b3038,#171019 72%);box-shadow:0 5px 18px #0009;transform:rotate(calc(var(--fan)*-4deg));transform-origin:50% -20%;transition:.22s ease}
      .opponent-card-back:first-child{margin-left:0}.opponent-card-back.playing{transform:translateY(86px) rotate(0);border-color:#f0c18e}
      .opponent-meta{position:fixed;z-index:54;top:6px;right:8px;padding:5px 8px;border:1px solid #75565b;border-radius:8px;background:#120b0edd;color:#ffd0d0;font-size:11px}
      .opponent-message{position:fixed;z-index:54;top:8px;left:50%;transform:translateX(-50%);max-width:48vw;padding:4px 8px;border-radius:7px;background:#120b0ecc;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .enemy-play-reveal{position:fixed;z-index:90;left:50%;top:102px;transform:translateX(-50%);padding:8px 13px;border:2px solid #c69a74;border-radius:9px;background:#48252bf2;font-weight:900;box-shadow:0 12px 30px #000b}
      .battle-log-drawer{position:fixed;z-index:110;top:0;right:0;width:min(420px,88vw);height:100vh;padding:12px;background:#081018f5;box-shadow:-12px 0 35px #000a;transform:translateX(105%);transition:.18s ease;pointer-events:auto}
      .battle-log-drawer.open{transform:translateX(0)}.battle-log-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.battle-log-head button{width:34px;padding:5px}.battle-log-drawer pre{height:calc(100vh - 60px);overflow:auto;white-space:pre-wrap;font:12px/1.55 system-ui;color:#dce5ef}
      #phaserBattlefield{top:88px!important;bottom:118px!important;height:auto!important}
      @media(max-width:700px){.opponent-card-back{width:66px;height:96px;margin-left:-30px}.opponent-hand{top:-38px}.enemy-play-reveal{top:78px}.opponent-message{max-width:52vw;font-size:9px}#phaserBattlefield{top:72px!important;bottom:108px!important}}
    `;document.head.appendChild(s);
  }
  function enemyHand(enemyState,enemyView,phase){
    if(!enemyState)return "";
    const n=enemyState.zones?.hand?.length||0,mid=(n-1)/2;
    return `<div class="opponent-hand">${Array.from({length:n},(_,i)=>`<i class="opponent-card-back ${phase==="ENEMY_TURN"&&enemyView?.kind==="CARD_SELECT"&&i===n-1?"playing":""}" style="--fan:${i-mid}"></i>`).join("")}</div>
      <div class="opponent-meta">敵方　💎 ${enemyState.crystals||0}/${enemyState.crystalCapacity||0}　牌庫 ${enemyState.zones?.deck?.length||0}</div>
      ${phase==="ENEMY_TURN"?`<div class="opponent-message">${enemyView?.message||"敵方思考中…"}</div>`:""}
      ${phase==="ENEMY_TURN"&&enemyView?.cardId?`<div class="enemy-play-reveal">${CardDatabase.get(enemyView.cardId)?.name||""}</div>`:""}`;
  }
  function render(){
    ensureStyle();
    const state=CardTacticsRuntime.getCardState();if(!state)return;
    const phase=CardTacticsRuntime.getPhase(),pending=CardTacticsRuntime.getPendingCard();
    const enemyState=CardTacticsRuntime.getEnemyCardState?.(),enemyView=CardTacticsRuntime.getEnemyPresentation?.();
    const cards=CardDatabase.list(state.zones.hand);
    if(previewId&&!cards.some(c=>c.id===previewId))previewId=null;
    const preview=previewId?CardDatabase.get(previewId):null,targeting=!!pending;
    host.classList.toggle("targeting-mode",targeting);
    host.innerHTML=enemyHand(enemyState,enemyView,phase)+
      `<div class="battle-resource">💎 ${state.crystals}/${state.crystalCapacity||state.startingCrystals||4}</div>`+
      `<div class="battle-deck-count">牌庫 ${state.zones.deck.length}</div>`+
      `<div class="fan-hand">${cards.map((c,i)=>{const offset=i-(cards.length-1)/2;return `<button class="fan-card ${previewId===c.id?"previewing":""} ${pending?.id===c.id?"pending":""}" data-card="${c.id}" style="--fan:${offset};--i:${i}" ${phase==="CARD_PHASE"&&CardPhaseEngine.canPlay(state,c)?"":"disabled"}><span class="fan-cost">${c.cost}</span><span class="fan-name">${c.name}</span><small>${kind(c)}</small></button>`;}).join("")||`<div class="empty-hand">目前沒有手牌</div>`}</div>`+
      (preview?`<div class="card-preview"><div class="preview-card-face"><span class="preview-cost">${preview.cost}</span><strong>${preview.name}</strong><small>${kind(preview)}</small></div><div class="preview-question">要使用這張卡嗎？</div><div class="preview-actions"><button id="confirmCardUse">使用</button><button id="cancelCardPreview">取消</button></div></div>`:"")+
      (targeting?`<div class="card-targeting-bar"><button id="cancelCardDeploy">← 取消</button><strong>${pending.name}</strong><span>${pending.type==="CHARACTER"?"請選擇部署位置":"請在戰場選擇目標"}</span></div>`:"")+
      `<div class="card-phase-compact-actions"><button id="endCardPhase" ${phase==="CARD_PHASE"&&!targeting?"":"disabled"}>結束卡牌階段</button></div>`;
    host.querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>{previewId=btn.dataset.card;render();});
    host.querySelector("#confirmCardUse")?.addEventListener("click",()=>{const id=previewId;previewId=null;if(id)CardTacticsRuntime.playCard(id);});
    host.querySelector("#cancelCardPreview")?.addEventListener("click",()=>{previewId=null;render();});
    host.querySelector("#endCardPhase")?.addEventListener("click",()=>CardTacticsRuntime.endCardPhase());
    host.querySelector("#cancelCardDeploy")?.addEventListener("click",()=>CardTacticsRuntime.cancelCard());
  }
  window.addEventListener("cardtactics:state",render);render();
})();