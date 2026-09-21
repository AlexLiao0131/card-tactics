(()=>{
  const battle=document.getElementById("battleScreen");
  if(!battle)return;
  let hud=null;
  function ensure(){
    if(hud)return hud;
    hud=document.createElement("div");hud.id="versusCoreHud";hud.className="versus-core-hud";
    hud.innerHTML=`
      <div class="core-side player"><strong>我方 CORE</strong><span class="core-values"></span><div class="core-bar hp"><i></i></div></div>
      <div class="capture-summary"></div>
      <div class="core-side enemy"><strong>敵方 CORE</strong><span class="core-values"></span><div class="core-bar hp"><i></i></div></div>`;
    battle.querySelector("main")?.appendChild(hud);return hud;
  }
  function render(){
    const root=ensure(),stage=window.CardTacticsRuntime?.getStage?.(),cores=window.CardTacticsRuntime?.getCores?.()||[];
    const active=stage?.mode==="VERSUS"&&cores.length>0;root.classList.toggle("active",active);if(!active)return;
    for(const owner of ["PLAYER","ENEMY"]){
      const core=cores.find(c=>c.owner===owner),side=root.querySelector(`.core-side.${owner==="PLAYER"?"player":"enemy"}`);if(!core||!side)continue;
      side.querySelector(".core-values").textContent=`${core.hp}/${core.maxHp}`;
      side.querySelector(".core-bar.hp i").style.width=`${Math.max(0,Math.min(100,Number(core.hp||0)/Math.max(1,Number(core.maxHp||1))*100))}%`;
    }
    const points=(stage?.deploymentPoints||[]).filter(p=>p.capturable!==false);
    root.querySelector(".capture-summary").textContent=points.map(p=>`${p.owner==="PLAYER"?"◆":p.owner==="ENEMY"?"◇":"○"}${p.name}`).join("  ");
  }
  window.addEventListener("cardtactics:state",render);
  window.addEventListener("cardtactics:battle-render",render);
  new MutationObserver(render).observe(battle,{attributes:true,attributeFilter:["class"]});
  render();
})();
