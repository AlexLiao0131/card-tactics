(()=>{
"use strict";
const key=(x,y)=>`${x},${y}`;
function build(map){
  const tiles=map?.tiles||[],byKey=new Map(tiles.map(t=>[key(t.x,t.y),t])),tops=[],sides=[];
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
  for(const tile of tiles){
    const elevation=Number(tile.elevation||0);
    tops.push({id:`top:${tile.x},${tile.y}`,tile,x:tile.x,y:tile.y,elevation});
    dirs.forEach(([dx,dy],edge)=>{
      const neighbor=byKey.get(key(tile.x+dx,tile.y+dy));
      if(!neighbor)return; // no artificial map-boundary wall
      const bottom=Number(neighbor.elevation||0);
      if(elevation<=bottom)return;
      sides.push({id:`side:${tile.x},${tile.y}:${edge}`,tile,x:tile.x,y:tile.y,edge,topElevation:elevation,bottomElevation:bottom,levels:elevation-bottom});
    });
  }
  return{tops,sides};
}
window.TerrainGeometry={build};
})();