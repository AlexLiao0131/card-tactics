window.VISUALS={
  characters:{
    livia_default:{
      portrait:"assets/characters/livia/portrait.webp",
      card:"assets/characters/livia/card.webp",
      tactical:"assets/characters/livia/tactical.webp",
      expressions:{}
    }
  },
  skills:{},
  equipment:{},
  maps:{
    prototype_field:{background:null}
  },
  effects:{}
};
window.VisualDatabase=(()=>{
  function get(group,id){return VISUALS[group]?.[id]||null;}
  function asset(group,id,key){return get(group,id)?.[key]??null;}
  return {get,asset};
})();
