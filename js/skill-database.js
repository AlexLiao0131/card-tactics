window.SKILLS={
  bow_shot:{id:"bow_shot",name:"普通射擊",category:"ATTACK",weapon:"kahns_bow",power:1,range:{min:2,max:4},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:true,resource:{type:"UNLIMITED"},affixes:[]},
  fire_arrow:{
    id:"fire_arrow",name:"火焰附魔箭",category:"ATTACK",weapon:"kahns_bow",power:1,
    range:{min:2,max:4},attackType:"INHERIT",element:"FIRE",speed:0,target:"ENEMY",
    targetType:"SINGLE",support:true,resource:{type:"USES",max:3},affixes:[],
    statusEffects:[{type:"BURN",chance:100}],
    variants:[
      {id:"SINGLE",name:"火焰箭・單體",targetType:"SINGLE",damageParts:["WEAPON","FIRE"],statusEffects:[{type:"BURN",chance:100}]},
      {id:"MAP_AOE",name:"爆裂火焰箭",targetType:"AOE",target:"TILE",radius:1,damageParts:["FIRE"],environmentForces:["FIRE","EXPLOSION"]}
    ]
  },
  black_slash:{id:"black_slash",name:"黑劍斬擊",category:"ATTACK",weapon:"black_sword",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  fire_black_slash:{id:"fire_black_slash",name:"火焰附魔・黑劍",category:"ATTACK",weapon:"black_sword",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"FIRE",speed:0,target:"ENEMY",support:false,resource:{type:"USES",max:3},affixes:[]},
  slash:{id:"slash",name:"制式斬擊",category:"ATTACK",weapon:"sword",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  heavy_slash:{id:"heavy_slash",name:"重裝斬擊",category:"ATTACK",weapon:"sword",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:-5,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  claw:{id:"claw",name:"利爪攻擊",category:"ATTACK",weapon:"claw",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:5,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  club:{id:"club",name:"木棒敲擊",category:"ATTACK",weapon:"club",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  blessed_slash:{id:"blessed_slash",name:"祝福劍斬擊",category:"ATTACK",weapon:"blessed_sword",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:true,resource:{type:"UNLIMITED"},affixes:[]},
  thrust:{id:"thrust",name:"制式突刺",category:"ATTACK",weapon:"spear",power:1,range:{min:1,max:2},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[]},
  smash:{id:"smash",name:"戰錘重擊",category:"ATTACK",weapon:"hammer",power:1,range:{min:1,max:1},attackType:"INHERIT",element:"INHERIT",speed:-10,target:"ENEMY",support:false,resource:{type:"UNLIMITED"},affixes:[],postEffects:[{type:"KNOCKBACK",distance:2}]},
  magic_bolt:{id:"magic_bolt",name:"魔力彈",category:"MAGIC",weapon:"staff",power:1,range:{min:2,max:4},attackType:"INHERIT",element:"INHERIT",speed:0,target:"ENEMY",support:true,resource:{type:"UNLIMITED"},affixes:[]}
};
window.PASSIVES={
  GUARDIAN_INSTINCT:{id:"GUARDIAN_INSTINCT",name:"守護本能",category:"PASSIVE",defenseProfiles:[{id:"guardian_instinct_guard",method:"GUARD",name:"守護本能",canGuardAlly:true,vs:{SLASH:{damageMultiplier:.70},PIERCE:{damageMultiplier:.75},SHOT:{damageMultiplier:.70},STRIKE:{damageMultiplier:.80},MAGIC:{damageMultiplier:.90}}}]},
  CAPTAIN_HIGHEST_AUTHORITY:{id:"CAPTAIN_HIGHEST_AUTHORITY",name:"最高艦長權限",category:"PASSIVE",turnEndEffect:{type:"DRAW",count:1}}
};
window.SkillDatabase=(()=>{
  function get(id){const skill=SKILLS[id];if(!skill)throw new Error("Unknown skill: "+id);return skill}
  function list(ids){return(ids||[]).map(get)}
  function getPassive(id){return PASSIVES[id]||null}
  function passiveList(ids){return(ids||[]).map(getPassive).filter(Boolean)}
  function passiveDefenseProfiles(ids){const profiles=[];for(const passive of passiveList(ids))for(const profile of passive.defenseProfiles||[])profiles.push({...profile,sourceId:passive.id,sourceName:passive.name,sourceType:"PASSIVE"});return profiles}
  return{get,list,getPassive,passiveList,passiveDefenseProfiles}
})();
