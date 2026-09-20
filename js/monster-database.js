window.MonsterDatabase=(()=>{
  const monsters=new Map();
  function normalize(def){
    if(!def?.id||!def?.characterId)throw new Error("MonsterDatabase.register requires id and characterId.");
    return Object.freeze({
      id:String(def.id),characterId:String(def.characterId),family:String(def.family||"MONSTER"),
      habitat:Object.freeze([...(def.habitat||[])]),traits:Object.freeze([...(def.traits||[])]),
      encounterRewards:Object.freeze([...(def.encounterRewards||[])].map(r=>Object.freeze({...r})))
    });
  }
  function register(def){const value=normalize(def);monsters.set(value.id,value);return value;}
  function get(id){return monsters.get(String(id))||null;}
  function forCharacter(characterId){return [...monsters.values()].find(m=>m.characterId===characterId)||null;}
  function list(){return [...monsters.values()];}
  return Object.freeze({register,get,forCharacter,list});
})();
