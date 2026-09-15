const A=document.querySelector("#attacker"),D=document.querySelector("#defender"),S=document.querySelector("#skill");
const NAMES={[-2]:"雙重劣勢",[-1]:"劣勢",0:"中性",1:"優勢",2:"雙重優勢"};
function armorLabel(c){const types=Array.isArray(c.armor.types)&&c.armor.types.length?c.armor.types:[c.armor.type];return `${types.join("+")}/${c.armor.element}`}
function info(c){return `<div><span class="tag">${c.archetype}</span><span class="tag">${armorLabel(c)}</span></div><div class="stats">${Object.entries(c.combat).map(([k,v])=>`<div class="stat">${k.toUpperCase()}<b>${["hit","eva","crit"].includes(k)?v+"%":v}</b></div>`).join("")}</div><p>六維（測試顯示）：STR ${c.attributes.str} / AGI ${c.attributes.agi} / INT ${c.attributes.int} / WIL ${c.attributes.wil} / VIT ${c.attributes.vit} / LUK ${c.attributes.luk}</p>${c.guard?`<p>特殊防禦：${c.guard.name}［${c.guard.affixes.join(", ")}］</p>`:""}`}
function refreshA(){let c=CHARACTERS[A.value];S.innerHTML="";c.skills.forEach(s=>S.add(new Option(s.name,s.id)));document.querySelector("#attackerInfo").innerHTML=info(c)}
function refreshD(){document.querySelector("#defenderInfo").innerHTML=info(CHARACTERS[D.value])}
Object.values(CHARACTERS).forEach(c=>{A.add(new Option(c.name,c.id));D.add(new Option(c.name,c.id))});A.value="livia";D.value="imperial_swordsman";refreshA();refreshD();A.onchange=refreshA;D.onchange=refreshD;
function resultText(a,d,s,x){const capped=x.tierRaw!==x.tier?` → ${x.tier}（上/下限）`:"";return `${a.name} 使用「${s.name}」
武器：${x.weapon.name}
類型/元素：${x.type}/${x.el}

物理相性（原始）：${x.basePt}${x.armorDisadvIgnored&&x.basePt<0?" → 0（無視護甲劣勢）":""}
元素相性：${x.et}
相性合計：${x.tierRaw}${capped}
最終相性：${NAMES[x.tier]} ×${x.m}
${x.ignore?"神器效果：無視一般物理 DEF。\n":""}${x.artifactParry?"特殊防禦：ARTIFACT_PARRY 生效，取消此次物理 DEF 無視與護甲劣勢無視。\n":""}
攻擊：${x.off}
有效防禦：${x.def}
命中率：${x.hc}% → ${x.hit?"命中":"MISS"}
暴擊：${x.crit?"YES":"NO"}
最終傷害：${x.damage}
${d.name} HP：${d.combat.hp} → ${x.hpAfter}`}
document.querySelector("#testBtn").onclick=()=>{let a=CHARACTERS[A.value],d=CHARACTERS[D.value],s=BattleEngine.getSkill(a,S.value),x=BattleEngine.calculate(a,d,s,{forceCrit:document.querySelector("#forceCrit").checked});document.querySelector("#result").textContent=resultText(a,d,s,x)};

const testCases=[
["普通箭 vs 重甲盾牌","livia","bow_shot","imperial_heavy_guard",x=>x.basePt===-3&&x.tier===-2&&x.def===95&&x.damage===33],
["黑劍 vs 重甲盾牌","livia","black_slash","imperial_heavy_guard",x=>x.basePt===-2&&x.pt===0&&x.ignore&&x.def===0&&x.damage===94],
["火焰箭 vs 自然外皮","livia","fire_arrow","forest_beast",x=>x.basePt===1&&x.et===1&&x.tier===2],
["火焰箭 vs 水屬性甲","livia","fire_arrow","water_guard_test",x=>x.basePt===0&&x.et===-1&&x.tier===-1],
["精靈神器招架黑劍","livia","black_slash","elf_guard_test",x=>x.artifactParry&&!x.ignore&&!x.armorDisadvIgnored&&x.def===72&&x.basePt===1],
["普通劍 vs 重甲盾牌","imperial_swordsman","slash","imperial_heavy_guard",x=>x.basePt===-2&&x.tier===-2&&x.def===95],
["突刺 vs 重甲盾牌","imperial_spearman_test","thrust","imperial_heavy_guard",x=>x.basePt===0&&x.tier===0],
["打擊 vs 重甲盾牌","imperial_hammer_test","smash","imperial_heavy_guard",x=>x.basePt===2&&x.tier===2],
["魔法 vs 重甲盾牌","imperial_mage_test","magic_bolt","imperial_heavy_guard",x=>x.basePt===0&&x.def===52],
["斬擊 vs 無甲","imperial_swordsman","slash","unarmored_dummy",x=>x.basePt===1&&x.tier===1]
];
function ensureSuiteUI(){const panel=document.querySelector("#result")?.parentElement;if(!panel||document.querySelector("#runSuiteBtn"))return;const box=document.createElement("div");box.style.marginTop="18px";box.innerHTML=`<button id="runSuiteBtn" type="button" style="width:100%;padding:14px 16px;border-radius:12px;border:1px solid #41516a;background:#213149;color:#fff;font-weight:700;font-size:16px">執行完整規則自動測試</button><pre id="suiteResult" style="white-space:pre-wrap;margin-top:12px;padding:14px;border-radius:12px;background:#0b1017;line-height:1.55;overflow:auto"></pre>`;panel.appendChild(box);document.querySelector("#runSuiteBtn").onclick=runSuite}
function runSuite(){let pass=0,lines=[];for(const [name,aid,sid,did,check] of testCases){const a=CHARACTERS[aid],d=CHARACTERS[did],s=BattleEngine.getSkill(a,sid),x=BattleEngine.calculate(a,d,s,{forceHit:true,disableCrit:true});let ok=false;try{ok=!!check(x)}catch(e){ok=false}if(ok)pass++;lines.push(`${ok?"✅ PASS":"❌ FAIL"}  ${name}｜傷害 ${x.damage}｜相性 ${x.tierRaw}→${x.tier}｜DEF ${x.def}${x.artifactParry?"｜神器招架":""}`)}lines.unshift(`完整規則測試：${pass}/${testCases.length} PASS`,"");document.querySelector("#suiteResult").textContent=lines.join("\n")}
ensureSuiteUI();