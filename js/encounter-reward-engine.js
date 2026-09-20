window.EncounterRewardEngine=(()=>{
  function create({playerCardState,pushLog,rng=Math.random}={}){
    if(typeof playerCardState!=="function")throw new Error("EncounterRewardEngine requires playerCardState callback.");
    function roll(reward){
      const chance=Math.max(0,Math.min(1,Number(reward?.chance??1)));
      return chance>=1||rng()<chance;
    }
    function grantCard(cardId,count=1){
      const state=playerCardState(),card=CardDatabase.get(cardId);
      if(!state?.zones?.hand||!card||!CardDatabase.isBattleOnly(card))return 0;
      const n=Math.max(0,Math.floor(Number(count||0)));
      for(let i=0;i<n;i++)state.zones.hand.push(card.id);
      if(n)pushLog?.(`遭遇獎勵｜獲得「${card.name}」×${n}（僅限本場戰鬥）。`,"SYSTEM");
      return n;
    }
    function onDefeated(unit){
      const monster=MonsterDatabase.forCharacter(unit?.character?.id);
      if(!monster)return [];
      const granted=[];
      for(const reward of monster.encounterRewards){
        if(reward.type!=="BATTLE_CARD"||!roll(reward))continue;
        const count=Math.max(1,Math.floor(Number(reward.count||1)));
        const amount=grantCard(reward.cardId,count);
        if(amount)granted.push({type:reward.type,cardId:reward.cardId,count:amount,monsterId:monster.id});
      }
      return granted;
    }
    return Object.freeze({grantCard,onDefeated});
  }
  return Object.freeze({create});
})();
