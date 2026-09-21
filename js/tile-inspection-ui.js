(()=>{
"use strict";
const main=document.querySelector("#battleScreen main");if(!main)return;
let expanded=false,hidden=false;
const el=document.createElement("aside");el.className="tile-inspector";el.setAttribute("aria-live","polite");
el.innerHTML=`<button class="tile-inspector-main" type="button"><strong></strong><span></span><small></small></button><button class="tile-inspector-close" type="button" aria-label="關閉地圖格資訊">×</button><pre></pre>`;
main.appendChild(el);
function render(){
  const data=window.CardTacticsRuntime?.getInspectedTilePresentation?.();
  const unit=window.CardTacticsRuntime?.getInspectedUnitPresentation?.();
  const visible=!!data&&!hidden;
  el.classList.toggle("visible",visible);
  el.classList.toggle("with-unit",visible&&!!unit);
  el.classList.toggle("expanded",visible&&expanded);
  if(!visible)return;
  el.querySelector("strong").textContent=data.summary.title;
  el.querySelector("span").textContent=data.summary.meta;
  el.querySelector("small").textContent=data.summary.status||"點擊展開詳細資訊";
  el.querySelector("pre").textContent=data.details;
}
el.querySelector(".tile-inspector-main").onclick=()=>{expanded=!expanded;render()};
el.querySelector(".tile-inspector-close").onclick=e=>{e.stopPropagation();hidden=true;expanded=false;render()};
window.addEventListener("cardtactics:inspection",()=>{hidden=false;expanded=false;render()});
window.addEventListener("cardtactics:state",render);
window.addEventListener("cardtactics:battle-render",render);
render();
})();
