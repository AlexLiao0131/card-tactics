window.TileInspectionPresentation=(()=>{
  const ENV={NONE:"一般",GRASS:"草木",WATER:"水",STONE:"石質"},WEATHER={CLEAR:"晴朗",FOG:"迷霧",RAIN:"雨",HEAVY_RAIN:"豪大雨",THUNDERSTORM:"雷雨"};
  const EFFECT={TORNADO:"龍捲風",BURNING:"燃燒",BOILING:"沸騰",STEAM:"蒸氣",FRAGMENTS:"岩石破片",FIRE_TORNADO:"火龍捲",ELECTRIFIED:"帶電"};
  const fmt=n=>Math.round(Number(n||0)*100)/100;
  function create({map,environmentState,tile}){
    if(!map||!tile)return null;
    const terrain=TERRAINS[tile.terrain]||{},material=EnvironmentEngine.environmentAt(map,tile.x,tile.y);
    const effects=environmentState?EnvironmentEngine.effectAt(environmentState,tile.x,tile.y):[],depth=HydrologyEngine.waterDepth(tile),surface=HydrologyEngine.waterSurfaceZ(tile),moisture=HydrologyEngine.soilMoisture?.(tile)||0;
    const object=(map.objects||[]).find(o=>!o.destroyed&&o.x===tile.x&&o.y===tile.y);
    const ground=Number(tile.elevation||0),move=terrain.passable===false?"×":terrain.moveCost??"-",eva=`${Number(terrain.evasion||0)>=0?"+":""}${Number(terrain.evasion||0)}`;
    const title=depth>0?`${terrain.name||tile.terrain}｜地面 H${fmt(ground)}｜水面 H${fmt(surface)}`:`${terrain.name||tile.terrain}｜H${fmt(ground)}`;
    const meta=depth>0?`水深 ${fmt(depth)}｜MOVE ${move}｜EVA ${eva}`:`MOVE ${move}｜EVA ${eva}`;
    const summary={title,meta,status:effects.map(e=>EFFECT[e.type]||e.type).join("・")};
    const details=[`地圖格 (${tile.x},${tile.y})`,`地形：${terrain.name||tile.terrain}｜地面 H${fmt(ground)}`,`環境材質：${ENV[material]||material}｜天候：${WEATHER[environmentState?.weather]||environmentState?.weather||"晴朗"}`];
    if(depth>0)details.push(`水深：${fmt(depth)}｜水面 H${fmt(surface)}｜Surface Water ${fmt(depth)}`);
    if(tile.terrain==="MUD")details.push(`土壤含水：${fmt(moisture)}/${fmt(HydrologyEngine.SOIL_SATURATION_CAPACITY||1)}｜泥濘飽和後才會形成地表積水。`);
    if(object)details.push(`物件：${object.name||object.id}${object.destructible?"｜可破壞":""}`);
    details.push(`效果：${effects.length?effects.map(e=>`${EFFECT[e.type]||e.type}${e.duration==null?"":` ${e.duration}回合`}${e.type==="BOILING"?`｜Heat ${e.heat||1}`:""}`).join("、"):"無"}`);
    if(material==="WATER")details.push("互動：相連水體會依地勢重新分配；新坑可吸入附近水量；雷元素沿水體傳導；第一次高熱使水沸騰並產生蒸氣，持續高熱才逐步蒸發。");
    else if(material==="GRASS")details.push(EnvironmentEngine.isRain(environmentState)?"互動：雨勢抑制草木持續燃燒。":"互動：草木可被火焰點燃。");
    else if(material==="STONE")details.push("互動：爆炸可與石質物件／破片作用。");
    if(tile.terrain==="MUD")details.push("互動：泥濘提高一般移動成本；泥地本身不是水體導體。");
    return{summary,details:details.join("\n")};
  }
  return Object.freeze({create});
})();
