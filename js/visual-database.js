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
  maps:{prototype_field:{background:null}},
  effects:{},
  presentation:{
    terrain:{
      PLAIN:{fill:0x405b49},
      MUD:{fill:0x6b573f},
      FOREST:{fill:0x2d6745,marker:{primitive:"TEXT",text:"🌲",fontSize:25,lift:18}},
      HIGH_GROUND:{fill:0x817243},
      WATER:{fill:0x287292,marker:{primitive:"TEXT",text:"≈",fontSize:23,color:"#b9ecff"}},
      WALL:{fill:0x606873,marker:{primitive:"ROCK"}}
    },
    objects:{
      ROCK:{primitive:"ROCK"},
      TREE:{primitive:"TEXT",text:"🌳",fontSize:28},
      CORE:{primitive:"CRYSTAL"}
    },
    effects:{
      BURNING:{primitive:"TEXT",text:"🔥",fontSize:18},
      STEAM:{primitive:"TEXT",text:"♨",fontSize:17},
      TORNADO:{primitive:"TEXT",text:"🌪️",fontSize:27},
      FIRE_TORNADO:{primitive:"TEXT",text:"🌪️🔥",fontSize:24},
      ELECTRIFIED:{primitive:"TEXT",text:"⚡",fontSize:20},
      FRAGMENTS:{primitive:"TEXT",text:"◆",fontSize:16,color:"#d6d0c5"},
      TRAP:{primitive:"TEXT",text:"🪤",fontSize:20}
    }
  }
};
window.VisualDatabase=(()=>{
  function get(group,id){return VISUALS[group]?.[id]||null;}
  function asset(group,id,key){return get(group,id)?.[key]??null;}
  function presentation(group,id){return VISUALS.presentation?.[group]?.[id]||null;}
  return {get,asset,presentation};
})();
