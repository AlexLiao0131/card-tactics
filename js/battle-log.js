window.BattleLog=(()=>{
  const TYPES=["BATTLE","SYSTEM","DETAIL"];
  function create(){return{active:"BATTLE",entries:[]};}
  function add(state,type,text){
    const t=TYPES.includes(type)?type:"SYSTEM";
    state.entries.push({type:t,text:String(text)});
  }
  function list(state,type=state.active,limit=40){
    return state.entries.filter(e=>e.type===type).slice(-limit);
  }
  function setActive(state,type){if(TYPES.includes(type))state.active=type;}
  return{TYPES,create,add,list,setActive};
})();
