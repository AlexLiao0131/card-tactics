(()=>{
  "use strict";

  const battleScreen=document.getElementById("battleScreen");
  const main=battleScreen?.querySelector("main");
  const toolbar=battleScreen?.querySelector(".toolbar");
  if(!battleScreen||!main||!toolbar)return;

  const TAB_LABELS=Object.freeze({BATTLE:"戰鬥",SYSTEM:"系統",DETAIL:"詳細"});
  let open=false;

  const toggle=document.createElement("button");
  toggle.id="battleLogToggle";
  toggle.type="button";
  toggle.className="battle-log-toggle";
  toggle.textContent="LOG";
  toggle.setAttribute("aria-expanded","false");
  toggle.setAttribute("aria-controls","battleLogDrawer");

  const drawer=document.createElement("aside");
  drawer.id="battleLogDrawer";
  drawer.className="battle-log-drawer";
  drawer.setAttribute("aria-hidden","true");
  drawer.innerHTML=`
    <div class="battle-log-head">
      <strong>戰鬥紀錄</strong>
      <button class="battle-log-close" type="button" aria-label="收合戰鬥紀錄">×</button>
    </div>
    <div class="battle-log-tabs" role="tablist"></div>
    <div class="battle-log-content" role="log" aria-live="polite"></div>`;

  toolbar.prepend(toggle);
  main.appendChild(drawer);

  const unitHud=document.createElement("div");
  unitHud.id="tacticalUnitHud";
  unitHud.className="tactical-unit-hud";
  unitHud.innerHTML=`<div class="tactical-unit-portrait"><span>?</span><img alt=""></div><div class="tactical-unit-summary"><div class="tactical-unit-name"></div><div class="tactical-unit-hp"><i></i></div><div class="tactical-unit-hp-text"></div><div class="tactical-unit-stats"></div><div class="tactical-unit-preview"></div><div class="tactical-unit-status"></div><div class="tactical-unit-position"></div></div><button class="tactical-unit-close" type="button" aria-label="關閉角色資訊">×</button>`;
  main.appendChild(unitHud);
  let unitHudManuallyHidden=false;

  const tabs=drawer.querySelector(".battle-log-tabs");
  const content=drawer.querySelector(".battle-log-content");
  const close=drawer.querySelector(".battle-log-close");

  Object.entries(TAB_LABELS).forEach(([type,label])=>{
    const button=document.createElement("button");
    button.type="button";
    button.dataset.logType=type;
    button.textContent=label;
    button.onclick=()=>window.CardTacticsRuntime?.setBattleLogTab?.(type);
    tabs.appendChild(button);
  });

  function setOpen(value){
    open=!!value;
    drawer.classList.toggle("open",open);
    drawer.setAttribute("aria-hidden",String(!open));
    toggle.setAttribute("aria-expanded",String(open));
  }

  function renderUnitHud(){
    const data=window.CardTacticsRuntime?.getInspectedUnitPresentation?.();
    unitHud.classList.toggle("visible",!!data&&!unitHudManuallyHidden);
    if(!data)return;
    unitHud.querySelector(".tactical-unit-name").textContent=data.name;
    unitHud.querySelector(".tactical-unit-hp-text").textContent=`HP ${data.hp}/${data.maxHp}｜MOVE ${data.move}`;
    unitHud.querySelector(".tactical-unit-hp i").style.width=`${Math.max(0,Math.min(100,data.hp/data.maxHp*100))}%`;
    const s=data.stats||{};
    unitHud.querySelector(".tactical-unit-stats").textContent=
      `ATK ${s.atk??"-"}  DEF ${s.def??"-"}  MATK ${s.matk??"-"}  MDEF ${s.mdef??"-"}｜HIT ${s.hit??"-"}%  EVA ${s.eva??"-"}  CRIT ${s.crit??"-"}%  SPD ${s.spd??"-"}`;
    unitHud.querySelector(".tactical-unit-preview").textContent=data.preview
      ?`${data.preview.skillName} → 命中 ${data.preview.hit}%｜暴擊 ${data.preview.crit}%`
      :"";
    unitHud.querySelector(".tactical-unit-status").textContent=`狀態：${data.actionState}`;
    unitHud.querySelector(".tactical-unit-position").textContent=`(${data.x},${data.y}) ${data.terrain} 高度${data.elevation}`;
    const img=unitHud.querySelector("img"),fallback=unitHud.querySelector("span");
    const src=data.visualId?window.VisualDatabase?.asset?.("characters",data.visualId,"portrait")||null:null;
    if(src){img.src=src;img.style.display="block";fallback.style.display="none";img.onerror=()=>{img.style.display="none";fallback.style.display="grid";};}
    else{img.removeAttribute("src");img.style.display="none";fallback.style.display="grid";fallback.textContent=(data.name||"?").slice(0,1);}
  }

  function render(){
    renderUnitHud();
    const log=window.CardTacticsRuntime?.getBattleLog?.();
    if(!log)return;
    tabs.querySelectorAll("[data-log-type]").forEach(button=>{
      const active=button.dataset.logType===log.active;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });
    content.textContent=log.entries.length
      ?log.entries.map(entry=>entry.text).join("\n")
      :"（目前沒有紀錄）";
    if(open)content.scrollTop=content.scrollHeight;
  }

  toggle.onclick=()=>{setOpen(!open);render();};
  close.onclick=()=>setOpen(false);
  unitHud.querySelector(".tactical-unit-close").onclick=()=>{unitHudManuallyHidden=true;unitHud.classList.remove("visible");};

  window.addEventListener("cardtactics:inspection",()=>{unitHudManuallyHidden=false;renderUnitHud();});
  window.addEventListener("cardtactics:log",render);
  window.addEventListener("cardtactics:state",render);
  setOpen(false);
  render();
})();
