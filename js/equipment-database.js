window.EQUIPMENT={
  kahns_bow:{id:"kahns_bow",name:"卡恩贈送的獵弓",kind:"WEAPON",attackType:"SHOT",element:"NONE",affixes:[]},
  black_sword:{id:"black_sword",name:"父親留下的黑劍",kind:"WEAPON",attackType:"SLASH",element:"NONE",affixes:["PHYSICAL_DEFENSE_IGNORE","IGNORE_ARMOR_DISADVANTAGE"]},
  imperial_sword:{id:"imperial_sword",name:"帝國制式長劍",kind:"WEAPON",attackType:"SLASH",element:"NONE",affixes:[]},
  forest_claw:{id:"forest_claw",name:"利爪",kind:"WEAPON",attackType:"SLASH",element:"NONE",affixes:[]},
  training_club:{id:"training_club",name:"訓練木棒",kind:"WEAPON",attackType:"STRIKE",element:"NONE",affixes:[]},
  standard_sword:{id:"standard_sword",name:"制式長劍",kind:"WEAPON",attackType:"SLASH",element:"NONE",affixes:[]},
  blessed_sword:{id:"blessed_sword",name:"精靈祝福長劍",kind:"WEAPON",attackType:"SLASH",element:"NONE",affixes:[]},
  imperial_spear:{id:"imperial_spear",name:"帝國制式長槍",kind:"WEAPON",attackType:"PIERCE",element:"NONE",affixes:[]},
  imperial_hammer:{id:"imperial_hammer",name:"帝國制式戰錘",kind:"WEAPON",attackType:"STRIKE",element:"NONE",affixes:[]},
  imperial_staff:{id:"imperial_staff",name:"帝國制式法杖",kind:"WEAPON",attackType:"MAGIC",element:"NONE",affixes:[]},

  livia_light_armor:{id:"livia_light_armor",name:"輕型防具",kind:"ARMOR",type:"LIGHT",types:["LIGHT"],element:"NONE",affixes:[]},
  imperial_medium_armor:{id:"imperial_medium_armor",name:"帝國制式中型甲",kind:"ARMOR",type:"MEDIUM",types:["MEDIUM"],element:"NONE",affixes:[]},
  imperial_heavy_shield_armor:{id:"imperial_heavy_shield_armor",name:"帝國制式重甲＋大型盾牌",kind:"ARMOR",type:"HEAVY",types:["HEAVY","SHIELD"],element:"NONE",affixes:[]},
  natural_hide:{id:"natural_hide",name:"自然外皮",kind:"ARMOR",type:"LIGHT",types:["LIGHT"],element:"NATURE",affixes:[]},
  no_armor:{id:"no_armor",name:"無甲",kind:"ARMOR",type:"NONE",types:["NONE"],element:"NONE",affixes:[]},
  water_medium_armor:{id:"water_medium_armor",name:"水紋中型甲",kind:"ARMOR",type:"MEDIUM",types:["MEDIUM"],element:"WATER",affixes:[]},
  elf_light_armor:{id:"elf_light_armor",name:"精靈輕甲",kind:"ARMOR",type:"LIGHT",types:["LIGHT"],element:"NONE",affixes:[]},
  imperial_heavy_armor:{id:"imperial_heavy_armor",name:"帝國制式重甲",kind:"ARMOR",type:"HEAVY",types:["HEAVY"],element:"NONE",affixes:[]},
  mage_cloth:{id:"mage_cloth",name:"法師布衣",kind:"ARMOR",type:"LIGHT",types:["LIGHT"],element:"NONE",affixes:[]},

  blue_cloak:{id:"blue_cloak",name:"藍色斗篷",kind:"ACCESSORY",affixes:["MAGIC_RESIST"]},
  leather_bracers:{id:"leather_bracers",name:"皮護腕",kind:"ACCESSORY",affixes:[]},
  sapphire_pendant:{id:"sapphire_pendant",name:"藍寶石掛墜",kind:"ACCESSORY",affixes:["ANCIENT_MAGIC_MEDIUM"]},
  imperial_heavy_plate:{id:"imperial_heavy_plate",name:"帝國制式重甲",kind:"ACCESSORY",affixes:[]},
  imperial_large_shield:{id:"imperial_large_shield",name:"帝國大型盾牌",kind:"ACCESSORY",affixes:[]},
  elf_blessed_guard:{id:"elf_blessed_guard",name:"精靈祝福武器",kind:"GUARD",affixes:["ARTIFACT_PARRY"]}
};

window.EquipmentDatabase=(()=>{
  function get(id){ return EQUIPMENT[id]||null; }
  function list(ids=[]){ return ids.map(get).filter(Boolean); }
  function resolveCharacter(character){
    const weapons={};
    Object.entries(character.weaponIds||{}).forEach(([slot,id])=>{
      const item=get(id);
      if(item) weapons[slot]=item;
    });
    return {
      ...character,
      armor:get(character.armorId)||{name:"無甲",type:"NONE",types:["NONE"],element:"NONE",affixes:[]},
      weapons,
      equipment:list(character.equipmentIds),
      guard:character.guardId?get(character.guardId):undefined
    };
  }
  return {get,list,resolveCharacter};
})();
