(()=>{
  const battle=document.getElementById("battleScreen");
  if(!battle)return;
  let hud=null;
  function ensure(){
    if(hud)return hud;
    hud=document.createElement("div");hud.id="versusCoreHud";hud.className="versus-core-hud";
    hud.innerHTML='<div class="core-side player"><strong>我方 CORE</strong><span></span><i></i></div><div class="capture-summary"></div><div class="core-side enemy"><strong>敵方 CORE</strong><span></span><i></i></div>';
    battle.querySelector("main")?.appendChild(hud);return hud;
  }
  function render(){
    const root=ensure(),cores=window.CardTacticsRuntime?.getCores?.()||[];
    const active=window.CardTacticsBattleSetup?.stageId==="versus_core_battle"&&cores.length>0;
    root.classList.toggle("active",active);if(!active)return;
    for(const owner of ["PLAYER","ENEMY"]){const core=cores.find(c=>c.owner===owner),side=root.querySelector(`.core-side.${owner==="PLAYER"?"player":"enemy"}`);if(!core||!side)continue;side.querySelector("span").textContent=`${core.hp}/${core.maxHp}`;side.querySelector("i").style.width=`${Math.max(0,Math.min(100,core.hp/core.maxHp*100))}%`;}
    const stage=window.CardTacticsRuntime?.getStage?.();
    const points=(stage?.deploymentPoints||[]).filter(p=>p.capturable!==false);
    root.querySelector(".capture-summary").textContent=points.map(p=>`${p.owner==="PLAYER"?"◆":p.owner==="ENEMY"?"◇":"○"}${p.name}`).join("  ");
  }
  window.addEventListener("cardtactics:state",render);new MutationObserver(render).observe(battle,{attributes:true,attributeFilter:["class"]});render();
})();
