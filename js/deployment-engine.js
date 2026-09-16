window.DeploymentEngine=(()=>{
  function points(stage){return stage?.deploymentPoints||[];}
  function controlled(stage,owner){
    return points(stage).filter(p=>p.owner===owner);
  }
  function area(stage,owner){
    const seen=new Set(),out=[];
    for(const point of controlled(stage,owner)){
      for(const tile of point.area||[]){
        const key=tile.x+","+tile.y;
        if(!seen.has(key)){seen.add(key);out.push(tile);}
      }
    }
    return out;
  }
  function canDeploy({stage,map,units,owner,x,y}){
    const legal=area(stage,owner).some(t=>t.x===x&&t.y===y);
    if(!legal)return false;
    const tile=map?.tiles?.find(t=>t.x===x&&t.y===y);
    if(!tile||!TERRAINS[tile.terrain]?.passable)return false;
    return !(units||[]).some(u=>u.alive&&u.x===x&&u.y===y);
  }
  function capture(stage,pointId,owner){
    const point=points(stage).find(p=>p.id===pointId);
    if(!point)return false;
    point.owner=owner;
    return true;
  }
  return{points,controlled,area,canDeploy,capture};
})();
