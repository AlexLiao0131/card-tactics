window.DisplacementEngine=(()=>{
  const WEIGHT={LIGHT:0,MEDIUM:1,HEAVY:2,IMMOVABLE:99};
  const normalizeWeight=value=>String(value||"").toUpperCase();
  function weightClass(target){
    const character=target?.character||target||{};
    const explicit=normalizeWeight(character.displacement?.weightClass||character.weightClass);
    if(Object.prototype.hasOwnProperty.call(WEIGHT,explicit))return explicit;
    const armor=window.EquipmentDatabase?.get?.(character.armorId)||character.armor;
    const armorType=normalizeWeight(armor?.type);
    if(armorType==="HEAVY")return "HEAVY";
    if(armorType==="MEDIUM")return "MEDIUM";
    return "LIGHT";
  }
  function resistance(target){
    const cls=weightClass(target),character=target?.character||target||{};
    const bonus=Math.max(0,Number(character.displacement?.resistance||0));
    return {weightClass:cls,value:Math.max(0,Number(WEIGHT[cls]??0)+bonus)};
  }
  function axis(base,resist,enabled=true,min=0){
    base=Math.max(0,Number(base||0));
    if(!enabled||base<=0)return base;
    return Math.max(Math.max(0,Number(min||0)),base-resist);
  }
  function resolve(effect={},target){
    const r=resistance(target),force=effect.force||{},resistAxes=effect.resistAxes||{};
    const baseDistance=Math.max(0,Number(force.horizontal??effect.distance??0));
    const baseLift=Math.max(0,Number(force.vertical??effect.lift??effect.launchHeight??0));
    const distance=axis(baseDistance,r.value,resistAxes.horizontal!==false,force.minHorizontal??effect.minDistance??0);
    const lift=axis(baseLift,r.value,resistAxes.vertical!==false,force.minVertical??effect.minLift??0);
    return {weightClass:r.weightClass,resistance:r.value,baseDistance,baseLift,distance,lift};
  }
  return{WEIGHT,weightClass,resistance,resolve};
})();

window.PostEngagementEngine=(()=>{
  const FALL_THRESHOLD=2;
  const FALL_DAMAGE_PER_LEVEL=10;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

  function occupied(units,x,y,id){return (units||[]).some(u=>u.alive&&u.id!==id&&u.x===x&&u.y===y)}
  function tileElevation(map,x,y){return TacticalEngine.elevation(TacticalEngine.tile(map,x,y))}
  function groundZ(map,unit){return Number.isFinite(Number(unit?.z))?Number(unit.z):tileElevation(map,unit?.x,unit?.y)}
  function syncGroundZ(map,unit){if(unit)unit.z=tileElevation(map,unit.x,unit.y);return unit?.z}
  function direction(source,target,type){
    let dx=Math.sign(target.x-source.x),dy=Math.sign(target.y-source.y);
    if(dx&&dy){if(Math.abs(target.x-source.x)>=Math.abs(target.y-source.y))dy=0;else dx=0;}
    if(type==="PULL"){dx=-dx;dy=-dy}
    return {dx,dy};
  }
  function openDistance(map,units,target,dir,distance,{z=null,airborne=false}={}){
    let x=target.x,y=target.y,total=0;
    for(let i=0;i<distance;i++){
      const from=TacticalEngine.tile(map,x,y),nx=x+dir[0],ny=y+dir[1],to=TacticalEngine.tile(map,nx,ny);
      if(!to||!TERRAINS[to.terrain]?.passable||occupied(units,nx,ny,target.id))break;
      if(airborne){if(TacticalEngine.elevation(to)>Number(z))break;}
      else if(TacticalEngine.elevationDelta(from,to)>1)break;
      x=nx;y=ny;total++;
    }
    return total;
  }
  function fallbackDirection(map,units,target,distance,opt={}){
    return DIRS.map((d,index)=>({d,index,space:openDistance(map,units,target,d,distance,opt)}))
      .sort((a,b)=>b.space-a.space||a.index-b.index)[0]?.d||[0,0];
  }
  function fallDamage(drop){return drop>=FALL_THRESHOLD?(drop-FALL_THRESHOLD+1)*FALL_DAMAGE_PER_LEVEL:0}
  function resolveLanding({map,target,fromZ}){
    const landingZ=tileElevation(map,target.x,target.y),drop=Math.max(0,Number(fromZ)-landingZ),damage=fallDamage(drop);
    if(damage&&target.alive){target.hp=Math.max(0,target.hp-damage);if(target.hp===0)target.alive=false;}
    target.z=landingZ;
    return {fromZ:Number(fromZ),toZ:landingZ,drop,damage,damaging:damage>0};
  }
  function forcedMove({map,units,source,target,effect}){
    if(!target?.alive)return {type:effect.type,applied:false,reason:"TARGET_DEAD"};
    const displacement=window.DisplacementEngine?.resolve?.(effect,target)||{distance:Math.max(0,Number(effect.distance||0)),lift:Math.max(0,Number(effect.lift??effect.launchHeight??0)),weightClass:"LIGHT",resistance:0,baseDistance:Number(effect.distance||0),baseLift:Number(effect.lift??effect.launchHeight??0)};
    const distance=displacement.distance,startGround=tileElevation(map,target.x,target.y);
    const lift=displacement.lift;
    const startZ=groundZ(map,target),travelZ=startZ+lift,airborne=lift>0||startZ>startGround;
    target.z=travelZ;
    let dir=direction(source,target,effect.type);
    if(!dir.dx&&!dir.dy){const fallback=fallbackDirection(map,units,target,distance,{z:travelZ,airborne});dir={dx:fallback[0],dy:fallback[1]};}
    if(!dir.dx&&!dir.dy){const landing=resolveLanding({map,target,fromZ:travelZ});return {type:effect.type,applied:lift>0,reason:lift>0?null:"BLOCKED",start:{x:target.x,y:target.y,z:startZ},end:{x:target.x,y:target.y,z:target.z},steps:[],airborne,lift,displacement,landing,falls:landing.damaging?[{from:landing.fromZ,to:landing.toZ,drop:landing.drop}]:[],fallDamage:landing.damage,defeated:!target.alive};}
    const start={x:target.x,y:target.y,z:startZ},steps=[];
    for(let i=0;i<distance;i++){
      const from=TacticalEngine.tile(map,target.x,target.y),nx=target.x+dir.dx,ny=target.y+dir.dy,to=TacticalEngine.tile(map,nx,ny);
      if(!to||!TERRAINS[to.terrain]?.passable||occupied(units,nx,ny,target.id))break;
      if(airborne){if(TacticalEngine.elevation(to)>travelZ)break;}
      else if(TacticalEngine.elevationDelta(from,to)>1)break;
      target.x=nx;target.y=ny;target.z=travelZ;steps.push({x:nx,y:ny,z:travelZ,elevation:TacticalEngine.elevation(to)});
    }
    const landing=resolveLanding({map,target,fromZ:travelZ});
    const falls=landing.damaging?[{from:landing.fromZ,to:landing.toZ,drop:landing.drop}]:[];
    return {type:effect.type,applied:steps.length>0||lift>0,start,end:{x:target.x,y:target.y,z:target.z},steps,airborne,lift,travelZ,displacement,landing,falls,fallDamage:landing.damage,defeated:!target.alive};
  }
  function process({map,units,queue=[]},hooks={}){
    const results=[];
    for(const item of queue){
      const {source,target,effect}=item;if(!target?.alive)continue;
      let result={type:effect.type,applied:false,reason:"UNSUPPORTED"};
      if(effect.type==="KNOCKBACK"||effect.type==="PULL")result=forcedMove({map,units,source,target,effect});
      const entry={...item,result};results.push(entry);hooks.onEffect?.(entry);if(result.defeated)hooks.onDefeated?.(target,source,effect);
    }
    return {queue,results};
  }
  return{process,forcedMove,resolveLanding,groundZ,syncGroundZ,fallDamage,FALL_THRESHOLD,FALL_DAMAGE_PER_LEVEL};
})();
