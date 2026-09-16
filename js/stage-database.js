window.STAGES={
  prototype_battle:{
    id:"prototype_battle",
    name:"Prototype Battle",
    mapId:"prototype_field",
    environment:{timeOfDay:"NIGHT"},

    // STAGE source: these actors are forced by the scenario, not drawn from the battle deck.
    playerSpawns:[
      {characterId:"livia",x:0,y:0,source:"STAGE"},
      {characterId:"elf_guard_test",x:0,y:2,source:"STAGE"},
      {characterId:"imperial_swordsman",x:0,y:4,source:"STAGE"},
      {characterId:"imperial_hammer_test",x:1,y:1,source:"STAGE"},
      {characterId:"imperial_mage_test",x:1,y:3,source:"STAGE"}
    ],
    enemySpawns:[
      {characterId:"imperial_heavy_guard",x:7,y:0,source:"STAGE"},
      {characterId:"forest_beast",x:7,y:2,source:"STAGE"},
      {characterId:"water_guard_test",x:7,y:4,source:"STAGE"},
      {characterId:"imperial_spearman_test",x:6,y:1,source:"STAGE"},
      {characterId:"imperial_swordsman",x:6,y:3,source:"STAGE"}
    ],

    // Prototype battle deck stands in for the future Deck Editor selection from Collection.
    // Unique HERO cards forced by this stage are filtered out when the runtime builds the deck.
    battleDeck:[
      "livia_card",
      "imperial_swordsman_card",
      "imperial_swordsman_card",
      "imperial_spearman_card",
      "imperial_mage_card",
      "fog_card",
      "rain_card",
      "resurrection_card"
    ],

    deploymentPoints:[
      {id:"player_base",name:"我方本陣",owner:"PLAYER",captureTiles:[{x:0,y:2}],area:[{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:0,y:3},{x:0,y:4},{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:1,y:3},{x:1,y:4}]},
      {id:"center_outpost",name:"中央中立據點",owner:"NEUTRAL",captureTiles:[{x:3,y:2}],area:[{x:2,y:2},{x:3,y:2},{x:3,y:1},{x:3,y:3}]},
      {id:"enemy_base",name:"敵方本陣",owner:"ENEMY",captureTiles:[{x:7,y:2}],area:[{x:6,y:0},{x:6,y:1},{x:6,y:2},{x:6,y:3},{x:6,y:4},{x:7,y:0},{x:7,y:1},{x:7,y:2},{x:7,y:3},{x:7,y:4}]}
    ],
    cardRules:{crystalsPerTurn:10,handSize:5},
    victory:{type:"DEFEAT_ALL_ENEMIES"},
    defeat:{type:"DEFEAT_ALL_PLAYERS"},
    scriptId:"prototype_script"
  }
};
window.StageDatabase=(()=>({
  get(id){
    const stage=STAGES[id];
    return stage?JSON.parse(JSON.stringify(stage)):null;
  }
}))();
