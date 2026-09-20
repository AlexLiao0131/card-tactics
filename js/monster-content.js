(()=>{
  // Content-only extension point: new monsters/cards can register here or in additional content modules.
  CHARACTERS.water_lurker=EquipmentDatabase.resolveCharacter({
    id:"water_lurker",name:"潛水魔",race:"AQUATIC_MONSTER",faction:"MONSTER",archetype:"MELEE",
    attributes:{str:12,agi:13,int:7,wil:10,vit:13,luk:8},
    combat:{hp:250,atk:76,matk:38,def:56,mdef:58,move:4},
    armorId:"natural_hide",weaponIds:{claw:"forest_claw"},terrainTraits:["AQUATIC"],skills:["claw"]
  });

  CARDS.flood_card={
    id:"flood_card",name:"洪水術",type:"SPELL",spellType:"WEATHER",faction:"MONSTER",cost:4,
    availability:"BATTLE_ONLY",source:"ENCOUNTER",
    effect:{type:"WEATHER",weather:"HEAVY_RAIN"}
  };

  MonsterDatabase.register({
    id:"water_lurker",characterId:"water_lurker",family:"AQUATIC",
    habitat:["WATER"],traits:["AQUATIC"],
    encounterRewards:[{type:"BATTLE_CARD",cardId:"flood_card",count:1,chance:1}]
  });
})();
