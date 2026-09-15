window.TacticalEngine=(()=>{
  const K=(x,y)=>x+","+y,D=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const MAX_NORMAL_CLIMB=1;
  const MAX_NORMAL_DROP=1;

  function tile(m,x,y){return m.tiles.find(t=>t.x===x&&t.y===y)}
  function occupied(us,x,y,id){return us.some(u=>u.alive&&u.id!==id&&u.x===x&&u.y===y)}
  function elevation(t){return Number(t?.elevation||0)}
  function canTraverseElevation(fromTile,toTile){
    if(!fromTile||!toTile)return false;
    const delta=elevation(toTile)-elevation(fromTile);
    return delta<=MAX_NORMAL_CLIMB&&delta>=-MAX_NORMAL_DROP;
  }
  function cost(u,t){
    let tr=u.character.terrainTraits||[];
    if(tr.includes("IGNORE_GROUND_TERRAIN")||t.terrain==="FOREST"&&tr.includes("FOREST_WALK")||t.terrain==="WATER"&&tr.includes("WATER_WALK"))return 1;
    return TERRAINS[t.terrain].moveCost
  }
  function reachable(m,us,u){
    let max=u.character.combat.move,b=new Map([[K(u.x,u.y),0]]),q=[{x:u.x,y:u.y,c:0}];
    while(q.length){
      q.sort((a,b)=>a.c-b.c);
      let n=q.shift(),from=tile(m,n.x,n.y);
      for(let [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        let x=n.x+dx,y=n.y+dy,t=tile(m,x,y);
        if(!t||!TERRAINS[t.terrain].passable||occupied(us,x,y,u.id)||!canTraverseElevation(from,t))continue;
        let c=n.c+cost(u,t),k=K(x,y);
        if(c<=max&&(!b.has(k)||c<b.get(k))){b.set(k,c);q.push({x,y,c})}
      }
    }
    b.delete(K(u.x,u.y));
    return b
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

    if(at.terrain==="HIGH_GROUND"&&(type==="SHOT"||type==="MAGIC")&&at.elevation>dt.elevation){
      acc=TERRAINS[at.terrain].rangedAccuracy||0
    }

    let ac={...a.character,modifiers:{...(a.character.modifiers||{}),accuracy:Number(a.character.modifiers?.accuracy||0)+acc}},
        dc={...d.character,modifiers:{...(d.character.modifiers||{}),evasion:Number(d.character.modifiers?.evasion||0)+eva}};

    return{result:BattleEngine.calculate(ac,dc,s,opt),terrain:{acc,eva,at,dt}}
  }

  return{tile,elevation,canTraverseElevation,reachable,range,targets,resolve}
})();
