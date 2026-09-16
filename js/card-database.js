window.CARDS={
  livia_card:{id:"livia_card",name:"莉維亞",type:"CHARACTER",characterId:"livia",faction:"HUNTER",unitType:"HERO",cost:6},
  imperial_swordsman_card:{id:"imperial_swordsman_card",name:"帝國劍士",type:"CHARACTER",characterId:"imperial_swordsman",faction:"IMPERIAL",unitType:"UNIT",cost:2},
  imperial_spearman_card:{id:"imperial_spearman_card",name:"帝國槍兵",type:"CHARACTER",characterId:"imperial_spearman_test",faction:"IMPERIAL",unitType:"UNIT",cost:3},
  imperial_mage_card:{id:"imperial_mage_card",name:"帝國法師",type:"CHARACTER",characterId:"imperial_mage_test",faction:"IMPERIAL",unitType:"UNIT",cost:4},
  fog_card:{id:"fog_card",name:"濃霧",type:"SPELL",spellType:"WEATHER",faction:"NEUTRAL",cost:2,effect:{type:"WEATHER",weather:"FOG"}},
  rain_card:{id:"rain_card",name:"暴雨",type:"SPELL",spellType:"WEATHER",faction:"NEUTRAL",cost:4,effect:{type:"WEATHER",weather:"RAIN"}},
  resurrection_card:{id:"resurrection_card",name:"復甦",type:"SPELL",spellType:"REVIVE",faction:"NEUTRAL",cost:7,effect:{type:"REVIVE",zone:"GRAVEYARD"}}
};
window.CardDatabase=(()=>({
  get(id){return CARDS[id]||null;},
  list(ids){return(ids||[]).map(id=>CARDS[id]).filter(Boolean);},
  isCharacter(card){return card?.type==="CHARACTER";},
  isSpell(card){return card?.type==="SPELL";}
}))();
