window.TacticalEngine=(()=>{
  const K=(x,y)=>x+","+y,D=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const MAX_NORMAL_CLIMB=1,MAX_NORMAL_DROP=1;
  function tile(m,x,y){return m.tiles.find(t=>t.x===x&&t.y===y)}
  function objectAt(m,x,y){return (m?.objects||[]).find(o=>!o.destroyed&&o.x===x&&o.y===y)||null}
  function occupied(us,x,y,id){return us.some(u=>u.alive&&u.id!==id&&u.x===x&&u.y===y)}
  function elevation(t){return Number(t?.elevation||0)}
  function elevationDelta(fromTile,toTile){return elevation(toTile)-elevation(fromTile)}
  function terrainTraits(u){return u?.character?.terrainTraits||[]}
  function isMountainTile(t){return t?.terrain==="HIGH_GROUND"||Number(t?.elevation||0)>0}
  function isBlockedByObject(m,x,y){return objectAt(m,x,y)?.blocksMovement===true}
  function canTraverseElevation(fromTile,toTile,u=null){
    if(!fromTile||!toTile)return false;
    const traits=terrainTraits(u);
    if(traits.includes("MOUNTAIN_WALK")&&(isMountainTile(fromTile)||isMountainTile(toTile)))return true;
    const delta=elevationDelta(fromTile,toTile);
    return delta<=MAX_NORMAL_CLIMB&&delta>=-MAX_NORMAL_DROP;
  }
  function canActiveMove(m,us,u,x,y,{ignoreElevation=false}={}){
    const from=tile(m,u.x,u.y),to=tile(m,x,y);
    if(!to||!TERRAINS[to.terrain]?.passable||isBlockedByObject(m,x,y)||occupied(us,x,y,u.id))return false;
    return ignoreElevation||canTraverseElevation(from,to,u);
  }
  function cost(u,t){
    let tr=terrainTraits(u);
    if(tr.includes("IGNORE_GROUND_TERRAIN")||t.terrain==="FOREST"&&tr.includes("FOREST_WALK")||t.terrain==="WATER"&&tr.includes("WATER_WALK")||isMountainTile(t)&&tr.includes("MOUNTAIN_WALK"))return 1;
    return TERRAINS[t.terrain].moveCost
  }
  function reachable(m,us,u){
    let max=u.character.combat.move,b=new Map([[K(u.x,u.y),0]]),q=[{x:u.x,y:u.y,c:0}];
    while(q.length){
      q.sort((a,b)=>a.c-b.c);
      let n=q.shift(),from=tile(m,n.x,n.y);
      for(let [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        let x=n.x+dx,y=n.y+dy,t=tile(m,x,y);
        if(!t||!TERRAINS[t.terrain].passable||isBlockedByObject(m,x,y)||occupied(us,x,y,u.id)||!canTraverseElevation(from,t,u))continue;
        let c=n.c+cost(u,t),k=K(x,y);
        if(c<=max&&(!b.has(k)||c<b.get(k))){b.set(k,c);q.push({x,y,c})}
      }
    }
    b.delete(K(u.x,u.y));return b
  }
  function pathTo(m,us,u,endX,endY){
    const start=K(u.x,u.y),goal=K(endX,endY),max=u.character.combat.move;
    const best=new Map([[start,0]]),prev=new Map(),q=[{x:u.x,y:u.y,c:0}];
    while(q.length){
      q.sort((a,b)=>a.c-b.c);
      const n=q.shift(),nk=K(n.x,n.y);
      if(n.c!==best.get(nk))continue;
      if(nk===goal)break;
      const from=tile(m,n.x,n.y);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=n.x+dx,y=n.y+dy,t=tile(m,x,y),k=K(x,y);
        if(!t||!TERRAINS[t.terrain]?.passable||isBlockedByObject(m,x,y)||occupied(us,x,y,u.id)||!canTraverseElevation(from,t,u))continue;
        const c=n.c+cost(u,t);
        if(c<=max&&(!best.has(k)||c<best.get(k))){best.set(k,c);prev.set(k,nk);q.push({x,y,c})}
      }
    }
    if(!best.has(goal))return[];
    const path=[];let k=goal;
    while(k!==start){const [x,y]=k.split(",").map(Number);path.push(tile(m,x,y));k=prev.get(k);if(!k)return[]}
    return path.reverse()
  }
  function range(s){return s.range}
  function targets(us,u,s){
    let r=range(s);
    if(s.target==="SELF")return[u];
    if(s.target==="ALLY")return us.filter(v=>v.alive&&v.team===u.team&&D(u,v)>=r.min&&D(u,v)<=r.max);
    return us.filter(v=>v.alive&&v.team!==u.team&&D(u,v)>=r.min&&D(u,v)<=r.max)
  }
  function resolve(m,a,d,s,opt={}){
    let at=tile(m,a.x,a.y),dt=tile(m,d.x,d.y),w=a.character.weapons[s.weapon],
        type=s.attackType==="INHERIT"?w.attackType:s.attackType,acc=0,eva=TERRAINS[dt.terrain].evasion||0;
    if(at.terrain==="HIGH_GROUND"&&(type==="SHOT"||type==="MAGIC")&&at.elevation>dt.elevation)acc=TERRAINS[at.terrain].rangedAccuracy||0;
    let ac={...a.character,modifiers:{...(a.character.modifiers||{}),accuracy:Number(a.character.modifiers?.accuracy||0)+acc}},
        dc={...d.character,modifiers:{...(d.character.modifiers||{}),evasion:Number(d.character.modifiers?.evasion||0)+eva}};
    return{result:BattleEngine.calculate(ac,dc,s,opt),terrain:{acc,eva,at,dt}}
  }
  return{tile,objectAt,isBlockedByObject,elevation,elevationDelta,canTraverseElevation,canActiveMove,reachable,pathTo,range,targets,resolve}
})();
