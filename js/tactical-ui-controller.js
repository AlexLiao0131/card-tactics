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

  function render(){
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

  window.addEventListener("cardtactics:log",render);
  window.addEventListener("cardtactics:state",render);
  setOpen(false);
  render();
})();
