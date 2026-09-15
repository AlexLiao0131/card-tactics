window.PostEngagementEngine=(()=>{
  const FALL_THRESHOLD=2;
  const FALL_DAMAGE_PER_LEVEL=10;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

  function occupied(units,x,y,id){return (units||[]).some(u=>u.alive&&u.id!==id&&u.x===x&&u.y===y)}
  function direction(source,target,type){
    let dx=Math.sign(target.x-source.x),dy=Math.sign(target.y-source.y);
    if(dx&&dy){ if(Math.abs(target.x-source.x)>=Math.abs(target.y-source.y))dy=0;else dx=0; }
    if(type==="PULL"){dx=-dx;dy=-dy}
    return {dx,dy};
  }
  function fallDamage(drop){return drop>=FALL_THRESHOLD?(drop-FALL_THRESHOLD+1)*FALL_DAMAGE_PER_LEVEL:0}
  function forcedMove({map,units,source,target,effect}){
    if(!target?.alive)return {type:effect.type,applied:false,reason:"TARGET_DEAD"};
    const distance=Math.max(0,Number(effect.distance||0));
    const dir=direction(source,target,effect.type);
    if(!dir.dx&&!dir.dy)return {type:effect.type,applied:false,reason:"NO_DIRECTION"};
    const start={x:target.x,y:target.y},steps=[],falls=[];
    for(let i=0;i<distance;i++){
      const from=TacticalEngine.tile(map,target.x,target.y);
      const nx=target.x+dir.dx,ny=target.y+dir.dy,to=TacticalEngine.tile(map,nx,ny);
      if(!to||!TERRAINS[to.terrain]?.passable||occupied(units,nx,ny,target.id))break;
      const delta=TacticalEngine.elevationDelta(from,to);
      if(delta>1)break;
      target.x=nx;target.y=ny;
      steps.push({x:nx,y:ny,elevation:TacticalEngine.elevation(to)});
      if(delta<=-FALL_THRESHOLD)falls.push({from:TacticalEngine.elevation(from),to:TacticalEngine.elevation(to),drop:-delta});
    }
    let damage=0;
    for(const fall of falls)damage+=fallDamage(fall.drop);
    if(damage&&target.alive){
      target.hp=Math.max(0,target.hp-damage);
      if(target.hp===0)target.alive=false;
    }
    return {type:effect.type,applied:steps.length>0,start,end:{x:target.x,y:target.y},steps,falls,fallDamage:damage,defeated:!target.alive};
  }
  function process({map,units,queue=[]},hooks={}){
    const results=[];
    for(const item of queue){
      const {source,target,effect}=item;
      if(!target?.alive)continue;
      let result={type:effect.type,applied:false,reason:"UNSUPPORTED"};
      if(effect.type==="KNOCKBACK"||effect.type==="PULL")result=forcedMove({map,units,source,target,effect});
      const entry={...item,result};results.push(entry);
      hooks.onEffect?.(entry);
      if(result.defeated)hooks.onDefeated?.(target,source,effect);
    }
    return {queue,results};
  }
  return{process,forcedMove,fallDamage,FALL_THRESHOLD,FALL_DAMAGE_PER_LEVEL};
})();