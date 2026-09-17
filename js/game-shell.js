(()=>{
  const $=id=>document.getElementById(id);
  const screens=[...document.querySelectorAll(".game-screen")];
  const deck=[];
  let activePack="LIVIA_SUPPLEMENT";
  function show(id){
    screens.forEach(s=>s.classList.toggle("active",s.id===id));
  }
  function cardLabel(card){
    const type=card.type==="CHARACTER"?(card.unitType==="HERO"?"HERO":"UNIT"):(card.spellType||"SPELL");
    return `<strong>${card.name}</strong><span>${type}　💎 ${card.cost}</span>`;
  }
  function renderDeck(){
    $("deckCount").textContent=`目前牌組 ${deck.length} 張`;
    $("deckList").innerHTML=deck.length?deck.map((id,i)=>{
      const c=CardDatabase.get(id);return `<button class="deck-row" data-remove="${i}">${c?.name||id}<span>移除</span></button>`;
    }).join(""):`<div class="deck-empty">尚未加入卡牌</div>`;
    document.querySelectorAll("[data-remove]").forEach(btn=>btn.onclick=()=>{deck.splice(Number(btn.dataset.remove),1);renderDeck();renderPack();});
    $("deployDeck").disabled=deck.length===0;
  }
  function renderPackTabs(){
    $("packTabs").innerHTML=PackDatabase.list().map(p=>`<button class="pack-tab ${p.id===activePack?"active":""}" data-pack="${p.id}">${p.name}</button>`).join("");
    document.querySelectorAll("[data-pack]").forEach(btn=>btn.onclick=()=>{activePack=btn.dataset.pack;renderPackTabs();renderPack();});
  }
  function renderPack(){
    const cards=PackDatabase.cards(activePack);
    $("packCards").innerHTML=cards.map(card=>{
      const chosen=deck.includes(card.id);
      return `<button class="collection-card ${chosen?"chosen":""}" data-card="${card.id}">${cardLabel(card)}<em>${chosen?"已加入":"加入牌組"}</em></button>`;
    }).join("");
    document.querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>{
      const id=btn.dataset.card,index=deck.indexOf(id);
      if(index>=0)deck.splice(index,1);else deck.push(id);
      renderDeck();renderPack();
    });
  }
  function openDeckBuilder(){renderPackTabs();renderPack();renderDeck();show("deckScreen")}
  $("pressStart").onclick=()=>{
    AudioManager.playBgm("assets/audio/title-theme.mp3");
    show("menuScreen");
  };
  $("menuCampaign").onclick=()=>show("campaignScreen");
  $("campaignPrototype").onclick=openDeckBuilder;
  $("menuVersus").onclick=()=>show("versusScreen");
  $("menuSave").onclick=()=>show("saveScreen");
  $("menuSettings").onclick=()=>show("settingsScreen");
  document.querySelectorAll("[data-back]").forEach(btn=>btn.onclick=()=>show(btn.dataset.back));
  $("deployDeck").onclick=()=>{
    window.CardTacticsBattleSetup={stageId:"prototype_battle",deck:[...deck]};
    window.CardTacticsRuntime?.resetBattle?.();
    show("battleScreen");
  };
  $("battleBack").onclick=()=>show("menuScreen");
  $("bgmToggle").onchange=e=>AudioManager.setBgmEnabled(e.target.checked);
  $("bgmVolume").oninput=e=>AudioManager.setBgmVolume(e.target.value/100);
  $("seToggle").onchange=e=>AudioManager.setSeEnabled(e.target.checked);
  $("seVolume").oninput=e=>AudioManager.setSeVolume(e.target.value/100);
  show("titleScreen");
})();
