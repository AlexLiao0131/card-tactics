(()=>{
  const battle=document.getElementById("battleScreen");
  if(!battle)return;
  let hud=null;

  function ensure(){
    if(hud)return hud;
    hud=document.createElement("div");
    hud.id="versusCoreHud";
    hud.className="versus-core-hud";
    hud.innerHTML=`
      <div class="versus-core-row">
        <div class="core-side player">
          <div class="core-line">
            <strong>我方 CORE</strong>
            <span class="core-values"></span>
          </div>
          <div class="core-hp-track"><i></i></div>
        </div>
        <div class="core-side enemy">
          <div class="core-line">
            <strong>敵方 CORE</strong>
            <span class="core-values"></span>
          </div>
          <div class="core-hp-track"><i></i></div>
        </div>
      </div>
      <div class="capture-summary"></div>`;
    battle.querySelector("main")?.appendChild(hud);
    return hud;
  }

  function render(){
    const root=ensure();
    const stage=window.CardTacticsRuntime?.getStage?.();
    const cores=window.CardTacticsRuntime?.getCores?.()||[];
    const active=stage?.mode==="VERSUS"&&cores.length>0;
    root.classList.toggle("active",active);
    if(!active)return;

    for(const owner of ["PLAYER","ENEMY"]){
      const core=cores.find(c=>c.owner===owner);
      const side=root.querySelector(`.core-side.${owner==="PLAYER"?"player":"enemy"}`);
      if(!core||!side)continue;

      const hp=Math.max(0,Number(core.hp||0));
      const maxHp=Math.max(1,Number(core.maxHp||1));
      const pct=Math.max(0,Math.min(100,hp/maxHp*100));

      side.querySelector(".core-values").textContent=`${hp}/${maxHp}`;
      side.querySelector(".core-hp-track i").style.width=`${pct}%`;
    }

    const points=(stage?.deploymentPoints||[]).filter(point=>point.capturable!==false);
    root.querySelector(".capture-summary").textContent=points
      .map(point=>`${point.owner==="PLAYER"?"◆":point.owner==="ENEMY"?"◇":"○"}${point.name}`)
      .join("  ");
  }

  window.addEventListener("cardtactics:state",render);
  window.addEventListener("cardtactics:battle-render",render);
  new MutationObserver(render).observe(battle,{attributes:true,attributeFilter:["class"]});
  render();
})();
