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

window.CollisionEngine=(()=>{
  const MAX_CHAIN_DEPTH=6,IMPACT_PER_FORCE=5;
  const terrainProfile=tile=>{
    if(!tile)return {kind:"BOUNDARY",solid:true,height:99,hardness:3,response:"STOP",impactMultiplier:1.25};
    const data=TERRAINS[tile.terrain]||{};
    if(data.passable!==false)return null;
    return {kind:"TERRAIN",id:tile.terrain,solid:true,height:Number(data.collisionHeight??tile.collisionHeight??99),hardness:Number(data.hardness??2),response:data.collisionResponse||"STOP",impactMultiplier:Number(data.impactMultiplier||1)};
  };
  const objectProfile=object=>{
    if(!object||object.destroyed||object.blocksMovement!==true)return null;
    const maxDurability=Math.max(1,Number(object.maxDurability??object.durability??(object.destructible?40:999999)));
    if(object.destructible&&object.durability==null)object.durability=maxDurability;
    return {kind:"OBJECT",id:object.id,solid:true,height:Number(object.collisionHeight??99),hardness:Number(object.hardness??(object.destructible?2:4)),response:object.collisionResponse||(object.destructible?"BREAK":"STOP"),impactMultiplier:Number(object.impactMultiplier||1),destructible:!!object.destructible,maxDurability,object};
  };
  const activeCollision=unit=>(unit?.effects||[]).map(e=>e?.collision?{...e.collision,effectId:e.id}:null).filter(Boolean).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0))[0]||null;
  function unitProfile(unit){
    const special=activeCollision(unit);
    if(special)return {kind:special.kind||"SHIELD",id:special.effectId||unit.id,solid:special.solid!==false,height:Number(special.height??3),hardness:Number(special.hardness??3),response:special.response||"STOP",impactMultiplier:Number(special.impactMultiplier||1),unit,special:true};
    const r=DisplacementEngine.resistance(unit);
    return {kind:"UNIT",id:unit.id,solid:true,height:Number(unit.character?.collision?.height??2),hardness:Number(unit.character?.collision?.hardness??Math.max(1,r.value+1)),response:"TRANSFER",impactMultiplier:Number(unit.character?.collision?.impactMultiplier||1),unit,weightClass:r.weightClass,resistance:r.value};
  }
  function surfaceAt({map,units,x,y,z,excludeId}){
    const tile=TacticalEngine.tile(map,x,y);
    if(!tile)return terrainProfile(null);
    const object=(map.objects||[]).find(o=>!o.destroyed&&o.x===x&&o.y===y&&o.blocksMovement===true);
    const op=objectProfile(object);
    if(op&&Number(z)<=Number(op.height))return op;
    const unit=(units||[]).find(u=>u.alive&&u.id!==excludeId&&u.x===x&&u.y===y);
    if(unit){const up=unitProfile(unit);if(Number(z)<=Number(TacticalEngine.elevation(tile))+Number(up.height))return up;}
    const tp=terrainProfile(tile);
    if(tp&&Number(z)<=Number(TacticalEngine.elevation(tile))+Number(tp.height))return tp;
    return null;
  }
  function impactDamage({remainingForce=0,mover,surface}){
    const movingWeight=Math.max(1,Number(DisplacementEngine.resistance(mover).value)+1);
    const hardness=Math.max(1,Number(surface?.hardness||1));
    return Math.max(0,Math.round(Number(remainingForce||0)*IMPACT_PER_FORCE*(movingWeight+hardness-1)*Number(surface?.impactMultiplier||1)));
  }
  function canTransfer(mover,other,remainingForce){
    if(!other?.alive||remainingForce<=0)return false;
    const mr=DisplacementEngine.resistance(mover),or=DisplacementEngine.resistance(other);
    return remainingForce>or.value&&or.value<=mr.value+1;
  }
  return{MAX_CHAIN_DEPTH,IMPACT_PER_FORCE,terrainProfile,objectProfile,unitProfile,surfaceAt,impactDamage,canTransfer};
})();

window.PostEngagementEngine=(()=>{
  const FALL_THRESHOLD=2,FALL_DAMAGE_PER_LEVEL=10,DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  const tileElevation=(map,x,y)=>TacticalEngine.elevation(TacticalEngine.tile(map,x,y));
  const groundZ=(map,unit)=>Number.isFinite(Number(unit?.z))?Number(unit.z):tileElevation(map,unit?.x,unit?.y);
  const syncGroundZ=(map,unit)=>{if(unit)unit.z=tileElevation(map,unit.x,unit.y);return unit?.z};
  function direction(source,target,type){let dx=Math.sign(target.x-source.x),dy=Math.sign(target.y-source.y);if(dx&&dy){if(Math.abs(target.x-source.x)>=Math.abs(target.y-source.y))dy=0;else dx=0;}if(type==="PULL"){dx=-dx;dy=-dy}return{dx,dy}}
  function fallDamage(drop){return drop>=FALL_THRESHOLD?(drop-FALL_THRESHOLD+1)*FALL_DAMAGE_PER_LEVEL:0}
  function damageUnit(unit,amount){const d=Math.max(0,Math.round(Number(amount||0)));if(d&&unit?.alive){unit.hp=Math.max(0,unit.hp-d);if(unit.hp===0)unit.alive=false}return d}
  function resolveLanding({map,target,fromZ}){const landingZ=tileElevation(map,target.x,target.y),drop=Math.max(0,Number(fromZ)-landingZ),damage=fallDamage(drop);damageUnit(target,damage);target.z=landingZ;return{fromZ:Number(fromZ),toZ:landingZ,drop,damage,damaging:damage>0}}
  function fallbackDirection(map,units,target,distance,{z,airborne}={}){
    return DIRS.map((d,index)=>{let x=target.x,y=target.y,space=0;for(let i=0;i<distance;i++){const nx=x+d[0],ny=y+d[1],to=TacticalEngine.tile(map,nx,ny);if(!to)break;const surface=CollisionEngine.surfaceAt({map,units,x:nx,y:ny,z:Number(z),excludeId:target.id});if(surface)break;if(!airborne&&TacticalEngine.elevationDelta(TacticalEngine.tile(map,x,y),to)>1)break;x=nx;y=ny;space++}return{d,index,space}}).sort((a,b)=>b.space-a.space||a.index-b.index)[0]?.d||[0,0];
  }
  function forcedMove({map,units,source,target,effect,_depth=0,_visited=new Set(),onCollision=null}){
    if(!target?.alive)return{type:effect.type,applied:false,reason:"TARGET_DEAD",collisions:[]};
    if(_depth>CollisionEngine.MAX_CHAIN_DEPTH||_visited.has(target.id))return{type:effect.type,applied:false,reason:"CHAIN_LIMIT",collisions:[]};
    const visited=new Set(_visited);visited.add(target.id);
    const displacement=DisplacementEngine.resolve(effect,target),distance=displacement.distance,startGround=tileElevation(map,target.x,target.y),lift=displacement.lift,startZ=groundZ(map,target),travelZ=startZ+lift,airborne=lift>0||startZ>startGround;
    target.z=travelZ;
    let dir=direction(source,target,effect.type);
    if(!dir.dx&&!dir.dy){const f=fallbackDirection(map,units,target,distance,{z:travelZ,airborne});dir={dx:f[0],dy:f[1]}}
    const start={x:target.x,y:target.y,z:startZ},steps=[],collisions=[];
    if(!dir.dx&&!dir.dy){const landing=resolveLanding({map,target,fromZ:travelZ});return{type:effect.type,applied:lift>0,reason:lift>0?null:"BLOCKED",start,end:{x:target.x,y:target.y,z:target.z},steps,collisions,airborne,lift,travelZ,displacement,landing,falls:landing.damaging?[{from:landing.fromZ,to:landing.toZ,drop:landing.drop}]:[],fallDamage:landing.damage,defeated:!target.alive}}
    for(let i=0;i<distance;i++){
      const nx=target.x+dir.dx,ny=target.y+dir.dy,to=TacticalEngine.tile(map,nx,ny),remaining=distance-i;
      if(!to){const surface=CollisionEngine.terrainProfile(null),damage=CollisionEngine.impactDamage({remainingForce:remaining,mover:target,surface});damageUnit(target,damage);collisions.push({kind:"BOUNDARY",x:nx,y:ny,surface,damage,stopped:true});break}
      const surface=CollisionEngine.surfaceAt({map,units,x:nx,y:ny,z:travelZ,excludeId:target.id});
      if(surface){
        const damage=CollisionEngine.impactDamage({remainingForce:remaining,mover:target,surface});damageUnit(target,damage);
        const hit=surface.unit,transfer=surface.kind==="UNIT"&&CollisionEngine.canTransfer(target,hit,remaining);
        let chain=null;
        if(transfer){
          const transferred=Math.max(1,remaining-1);
          chain=forcedMove({map,units,source:{x:target.x,y:target.y},target:hit,effect:{type:"KNOCKBACK",distance:transferred,lift:0,force:{horizontal:transferred,vertical:0},resistAxes:{horizontal:true,vertical:true}},_depth:_depth+1,_visited:visited,onCollision});
          if(hit?.alive)damageUnit(hit,Math.max(1,Math.round(damage*.5)));
        }
        let objectDamage=0,objectDestroyed=false;
        if(surface.kind==="OBJECT"&&surface.destructible&&surface.object){
          objectDamage=Math.max(1,damage);
          surface.object.durability=Math.max(0,Number(surface.object.durability??surface.maxDurability)-objectDamage);
          objectDestroyed=surface.object.durability<=0;
          if(objectDestroyed)surface.object.destroyed=true;
        }
        const collision={kind:surface.kind,x:nx,y:ny,surface,damage,transferred:transfer,chain,objectDamage,objectDestroyed,stopped:!objectDestroyed};
        collisions.push(collision);
        onCollision?.(collision,{mover:target,source,effect,depth:_depth});
        if(objectDestroyed&&target.alive){
          target.x=nx;target.y=ny;target.z=travelZ;
          steps.push({x:nx,y:ny,z:travelZ,elevation:TacticalEngine.elevation(to),brokeObject:surface.object.id});
          continue;
        }
        break;
      }
      const from=TacticalEngine.tile(map,target.x,target.y);
      if(airborne){if(TacticalEngine.elevation(to)>travelZ){const surface={kind:"TERRAIN_FACE",solid:true,height:TacticalEngine.elevation(to),hardness:2,response:"STOP",impactMultiplier:1};const damage=CollisionEngine.impactDamage({remainingForce:remaining,mover:target,surface});damageUnit(target,damage);collisions.push({kind:"TERRAIN",x:nx,y:ny,surface,damage,stopped:true});break}}
      else if(TacticalEngine.elevationDelta(from,to)>1){const surface={kind:"CLIFF_FACE",solid:true,height:TacticalEngine.elevation(to),hardness:2,response:"STOP",impactMultiplier:1};const damage=CollisionEngine.impactDamage({remainingForce:remaining,mover:target,surface});damageUnit(target,damage);collisions.push({kind:"TERRAIN",x:nx,y:ny,surface,damage,stopped:true});break}
      target.x=nx;target.y=ny;target.z=travelZ;steps.push({x:nx,y:ny,z:travelZ,elevation:TacticalEngine.elevation(to)});
    }
    const landing=resolveLanding({map,target,fromZ:travelZ}),falls=landing.damaging?[{from:landing.fromZ,to:landing.toZ,drop:landing.drop}]:[];
    return{type:effect.type,applied:steps.length>0||lift>0||collisions.length>0,start,end:{x:target.x,y:target.y,z:target.z},steps,collisions,airborne,lift,travelZ,displacement,landing,falls,fallDamage:landing.damage,defeated:!target.alive};
  }
  function process({map,units,queue=[]},hooks={}){const results=[];for(const item of queue){const{source,target,effect}=item;if(!target?.alive)continue;let result={type:effect.type,applied:false,reason:"UNSUPPORTED"};if(effect.type==="KNOCKBACK"||effect.type==="PULL")result=forcedMove({map,units,source,target,effect});const entry={...item,result};results.push(entry);hooks.onEffect?.(entry);if(result.defeated)hooks.onDefeated?.(target,source,effect)}return{queue,results}}
  return{process,forcedMove,resolveLanding,groundZ,syncGroundZ,fallDamage,FALL_THRESHOLD,FALL_DAMAGE_PER_LEVEL};
})();
