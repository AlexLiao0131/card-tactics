window.TileInspectionPresentation=(()=>{
  const ENV={NONE:"一般",GRASS:"草木",WATER:"水",STONE:"石質"},WEATHER={CLEAR:"晴朗",FOG:"迷霧",RAIN:"雨",HEAVY_RAIN:"豪大雨",THUNDERSTORM:"雷雨"};
  const EFFECT={TORNADO:"龍捲風",BURNING:"燃燒",STEAM:"蒸氣",FRAGMENTS:"岩石破片",FIRE_TORNADO:"火龍捲",ELECTRIFIED:"帶電"};
  function create({map,environmentState,tile}){
    if(!map||!tile)return null;const terrain=TERRAINS[tile.terrain]||{},material=EnvironmentEngine.environmentAt(map,tile.x,tile.y);
    const effects=environmentState?EnvironmentEngine.effectAt(environmentState,tile.x,tile.y):[],depth=HydrologyEngine.waterDepth(tile),surface=HydrologyEngine.waterSurfaceZ(tile);
    const object=(map.objects||[]).find(o=>!o.destroyed&&o.x===tile.x&&o.y===tile.y);
    const summary={title:`${terrain.name||tile.terrain}｜H${Number(tile.elevation||0)}`,meta:`MOVE ${terrain.passable===false?"×":terrain.moveCost??"-"}｜EVA ${Number(terrain.evasion||0)>=0?"+":""}${Number(terrain.evasion||0)}`,status:effects.map(e=>EFFECT[e.type]||e.type).join("・")};
    const details=[`地圖格 (${tile.x},${tile.y})`,`地形：${terrain.name||tile.terrain}｜地面 H${Number(tile.elevation||0)}`,`環境材質：${ENV[material]||material}｜天候：${WEATHER[environmentState?.weather]||environmentState?.weather||"晴朗"}`];
    if(depth>0)details.push(`水深：${depth}｜水面 Z${surface}`);
    if(object)details.push(`物件：${object.name||object.id}${object.destructible?"｜可破壞":""}`);
    details.push(`效果：${effects.length?effects.map(e=>`${EFFECT[e.type]||e.type}${e.duration==null?"":` ${e.duration}回合`}`).join("、"):"無"}`);
    if(material==="WATER")details.push("互動：相連水體可傳導雷元素；火焰受水抑制。");
    else if(material==="GRASS")details.push(EnvironmentEngine.isRain(environmentState)?"互動：雨勢抑制草木持續燃燒。":"互動：草木可被火焰點燃。");
    else if(material==="STONE")details.push("互動：爆炸可與石質物件／破片作用。");
    if(tile.terrain==="MUD")details.push("互動：泥濘提高一般移動成本；泥地本身不是水體導體。");
    return{summary,details:details.join("\n")};
  }
  return Object.freeze({create});
})();
