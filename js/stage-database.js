window.STAGES={
  prototype_battle:{
    id:"prototype_battle",
    name:"Prototype Battle",
    mapId:"prototype_field",
    playerSpawns:[
      {characterId:"livia",x:0,y:0},
      {characterId:"elf_guard_test",x:0,y:2},
      {characterId:"imperial_swordsman",x:0,y:4},
      {characterId:"imperial_spearman_test",x:1,y:1},
      {characterId:"imperial_mage_test",x:1,y:3}
    ],
    enemySpawns:[
      {characterId:"imperial_heavy_guard",x:7,y:0},
      {characterId:"forest_beast",x:7,y:2},
      {characterId:"water_guard_test",x:7,y:4},
      {characterId:"imperial_hammer_test",x:6,y:1},
      {characterId:"imperial_swordsman",x:6,y:3}
    ],
    victory:{type:"DEFEAT_ALL_ENEMIES"},
    defeat:{type:"DEFEAT_ALL_PLAYERS"},
    scriptId:"prototype_script"
  }
};
window.StageDatabase=(()=>({
  get(id){return STAGES[id]||null;}
}))();
