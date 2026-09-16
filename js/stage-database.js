window.STAGES={
  prototype_battle:{
    id:"prototype_battle",
    name:"Prototype Battle",
    mapId:"prototype_field",

    // Existing fixed spawns remain only for the current tactical regression test.
    // Formal card deployment uses deploymentPoints below.
    playerSpawns:[
      {characterId:"livia",x:0,y:0},
      {characterId:"elf_guard_test",x:0,y:2},
      {characterId:"imperial_swordsman",x:0,y:4},
      {characterId:"imperial_hammer_test",x:1,y:1},
      {characterId:"imperial_mage_test",x:1,y:3}
    ],
    enemySpawns:[
      {characterId:"imperial_heavy_guard",x:7,y:0},
      {characterId:"forest_beast",x:7,y:2},
      {characterId:"water_guard_test",x:7,y:4},
      {characterId:"imperial_spearman_test",x:6,y:1},
      {characterId:"imperial_swordsman",x:6,y:3}
    ],

    deploymentPoints:[
      {id:"player_base",name:"我方本陣",owner:"PLAYER",captureTiles:[{x:0,y:2}],area:[{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:0,y:3},{x:0,y:4},{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:1,y:3},{x:1,y:4}]},
      {id:"center_outpost",name:"中央中立據點",owner:"NEUTRAL",captureTiles:[{x:3,y:2}],area:[{x:2,y:2},{x:3,y:2},{x:3,y:1},{x:3,y:3}]},
      {id:"enemy_base",name:"敵方本陣",owner:"ENEMY",captureTiles:[{x:7,y:2}],area:[{x:6,y:0},{x:6,y:1},{x:6,y:2},{x:6,y:3},{x:6,y:4},{x:7,y:0},{x:7,y:1},{x:7,y:2},{x:7,y:3},{x:7,y:4}]}
    ],
    cardRules:{crystalsPerTurn:10,startingHand:3,drawPerTurn:1},
    victory:{type:"DEFEAT_ALL_ENEMIES"},
    defeat:{type:"DEFEAT_ALL_PLAYERS"},
    scriptId:"prototype_script"
  }
};
window.StageDatabase=(()=>({
  get(id){return STAGES[id]||null;}
}))();
