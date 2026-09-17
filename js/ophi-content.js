(()=>{
  // Ophi Supplement Pack — formal content module.
  // Runtime systems read the same global databases as the original content files.
  Object.assign(EQUIPMENT,{
    ophi_elven_bow:{id:"ophi_elven_bow",name:"奧菲的精靈長弓",kind:"WEAPON",weaponKind:"BOW",attackType:"SHOT",element:"NONE",affixes:[]},
    ophi_ranger_sword:{id:"ophi_ranger_sword",name:"精靈遊俠劍",kind:"WEAPON",weaponKind:"SWORD",attackType:"SLASH",element:"NONE",affixes:[],defenseProfiles:[{id:"ophi_sword_parry",method:"PARRY",name:"遊俠劍招架",vs:{SLASH:{chance:70},PIERCE:{chance:65},SHOT:{chance:15},STRIKE:{chance:0},MAGIC:{chance:0}}}]}
  });

  Object.assign(PASSIVES,{
    ELVEN_PATHFINDER:{id:"ELVEN_PATHFINDER",name:"山林之民",category:"PASSIVE",description:"精靈在森林與山地如履平地。",terrainTraits:["FOREST_WALK","MOUNTAIN_WALK"]},
    FOREST_LANGUAGE:{id:"FOREST_LANGUAGE",name:"森語",category:"PASSIVE",description:"以聽覺感知魔力，並能聽見植物的語言。"},
    EAGLE_SHARED_VISION:{id:"EAGLE_SHARED_VISION",name:"鷹眼共享",category:"PASSIVE",description:"與老鷹夥伴共享視覺，作為超遠距離曲射的觀測來源。"}
  });

  Object.assign(SKILLS,{
    ophi_elven_shot:{id:"ophi_elven_shot",name:"精靈弓射",category:"ATTACK",weapon:"elven_bow",power:1.1,range:{min:2,max:5},attackType:"SHOT",element:"INHERIT",speed:5,target:"ENEMY",support:true,resource:{type:"UNLIMITED"},affixes:[]},
    ophi_eagle_arc_shot:{id:"ophi_eagle_arc_shot",name:"鷹眼曲射",category:"ATTACK",weapon:"elven_bow",power:1.25,range:{min:3,max:8},attackType:"SHOT",element:"INHERIT",speed:-10,target:"ENEMY",support:false,resource:{type:"USES",max:2},trajectory:"ARC",requiresCompanionVision:"ophi_eagle",affixes:["ARC_SHOT"]},
    ophi_healing_song:{id:"ophi_healing_song",name:"治癒歌聲",category:"MAGIC",power:0,range:{min:0,max:3},target:"ALLY",targetType:"AOE",radius:2,speed:-5,support:false,resource:{type:"USES",max:2},healingOverTime:{amount:20,duration:3,interval:"ROUND_START"},soundMagic:true,affixes:["HEAL_OVER_TIME"]},
    ophi_listen_to_forest:{id:"ophi_listen_to_forest",name:"聆聽森語",category:"SPECIAL",power:0,range:{min:0,max:4},target:"SELF",support:false,resource:{type:"UNLIMITED"},informationSkill:true,affixes:["FOREST_SENSE"]}
  });

  window.COMPANIONS=window.COMPANIONS||{};
  COMPANIONS.ophi_eagle={
    id:"ophi_eagle",name:"奧菲的老鷹",ownerCharacterId:"ophi",kind:"SCOUT",movement:"FLYING",
    occupiesCardSlot:false,canAttack:false,sharedVision:true,providesTargetingFor:["ophi_eagle_arc_shot"]
  };

  const rawOphi={
    id:"ophi",name:"奧菲",race:"ELF",faction:"ELVEN",visualId:"ophi_default",archetype:"RANGED",
    attributes:{str:20,agi:20,int:20,wil:20,vit:18,luk:18},
    combat:{hp:225,atk:98,matk:88,def:60,mdef:88,move:5},
    armorId:"elf_light_armor",weaponIds:{elven_bow:"ophi_elven_bow",ranger_sword:"ophi_ranger_sword"},equipmentIds:[],
    companionIds:["ophi_eagle"],terrainTraits:["FOREST_WALK","MOUNTAIN_WALK"],
    passives:["ELVEN_PATHFINDER","FOREST_LANGUAGE","EAGLE_SHARED_VISION"],
    skills:["ophi_elven_shot","ophi_eagle_arc_shot","ophi_healing_song","ophi_listen_to_forest"],
    lore:{role:"莉維亞第一位夥伴",genetics:"4V",notes:"精靈由遠古人類基因改造而來，為適應現今環境而分化。"}
  };
  CHARACTERS.ophi=EquipmentDatabase.resolveCharacter(rawOphi);

  CARDS.ophi_card={id:"ophi_card",name:"奧菲",type:"CHARACTER",characterId:"ophi",faction:"ELVEN",unitType:"HERO",cost:6,pack:"OPHI_SUPPLEMENT"};
  CARDS.moon_goddess_blessing_card={id:"moon_goddess_blessing_card",name:"月神祝福",type:"SPELL",spellType:"BUFF",faction:"ELVEN",cost:4,pack:"OPHI_SUPPLEMENT",effect:{type:"RACE_NIGHT_BUFF",race:"ELF",scope:"ALL_FRIENDLY_ON_FIELD",requiresTimeOfDay:"NIGHT",modifiers:{powerMultiplier:1.15,speed:10}}};
})();
