(()=>{
  "use strict";

  // Enemy-turn orchestration only. Battle state remains owned by tactical-game.js.
  window.TacticalEnemyController={
    create(ctx){
      let queue=[];
      let stepTimer=null;

      const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
      const afterStep=(fn,ms=550)=>{
        if(stepTimer)clearTimeout(stepTimer);
        stepTimer=setTimeout(()=>{stepTimer=null;fn?.();},ms);
      };
      const showStep=(kind,message,extra={})=>{
        ctx.setEnemyView({active:true,kind,message,...extra});
        ctx.render();ctx.emitState();
      };
      const singleSkills=enemy=>ctx.skillList(enemy).filter(skill=>
        skill.target==="ENEMY"&&ctx.targetType(skill)==="SINGLE"&&ctx.canUseSkill(enemy,skill)
      );
      const targetsForSkill=(enemy,skill)=>ctx.combatTargets(enemy).filter(target=>
        target.alive&&target.team!==enemy.team&&TacticalEngine.canTarget(ctx.map(),enemy,target,skill)
      );
      const chooseAttack=enemy=>{
        for(const skill of singleSkills(enemy)){
          const targets=targetsForSkill(enemy,skill);
          if(targets.length){
            targets.sort((a,b)=>{
              const ah=a.kind==="CORE"?Number(a.core?.hp??Infinity):Number(a.hp??Infinity);
              const bh=b.kind==="CORE"?Number(b.core?.hp??Infinity):Number(b.hp??Infinity);
              return ah-bh||distance(enemy,a)-distance(enemy,b)||String(a.id).localeCompare(String(b.id));
            });
            return{attacker:enemy,defender:targets[0],skill};
          }
        }
        return null;
      };
      const movePath=enemy=>{
        if(enemy.moved||!enemy.alive)return[];
        const state=ctx.state(),objectives=ctx.living(ctx.TEAM.PLAYER).map(p=>({x:p.x,y:p.y}));
        if(state.stage?.ruleset==="CORE_CAPTURE"){
          DeploymentEngine.points(state.stage).filter(p=>p.capturable!==false&&p.owner!=="ENEMY").forEach(p=>(p.captureTiles||[]).forEach(t=>objectives.push(t)));
          const core=ctx.coreForOwner("PLAYER");if(core?.hp>0)objectives.push({x:core.x,y:core.y});
        }
        if(!objectives.length)return[];
        const reachable=TacticalEngine.reachable(state.map,state.units,enemy);if(!reachable.size)return[];
        let best=null;
        reachable.forEach((cost,key)=>{
          const[x,y]=key.split(",").map(Number),nearest=Math.min(...objectives.map(p=>Math.abs(x-p.x)+Math.abs(y-p.y)));
          if(!best||nearest<best.nearest||(nearest===best.nearest&&(cost<best.cost||(cost===best.cost&&(y<best.y||(y===best.y&&x<best.x))))))best={x,y,nearest,cost};
        });
        return best?TacticalEngine.pathTo(state.map,state.units,enemy,best.x,best.y)||[]:[];
      };
      const animateMove=(enemy,path,done)=>{
        const steps=[...(path||[])];
        const next=()=>{
          if(!steps.length||!enemy.alive){enemy.moved=true;done?.();return;}
          const tile=steps.shift();
          const result=ctx.traverseUnitPath(enemy,[tile],{kind:"UNIT"});
          ctx.pushLog(`${enemy.character.name} 移動至 (${enemy.x},${enemy.y})。`,"DETAIL");
          showStep("MOVE",`${enemy.character.name} 移動 → (${enemy.x},${enemy.y})`,{unitId:enemy.id});
          if(!result?.completed||!enemy.alive){enemy.moved=true;done?.();return;}
          afterStep(next,260);
        };
        next();
      };
      const requestAttack=attack=>{
        if(attack.defender?.kind==="CORE"){
          showStep("ATTACK",`AI 決策｜${attack.attacker.character.name} → ${attack.defender.core?.name||"CORE"}｜${attack.skill.name}`,{unitId:attack.attacker.id});
          afterStep(()=>{
            ctx.resolveDirectTargetAttack(attack.attacker,attack.defender,attack.skill);
            afterStep(continuePhase,350);
          },400);
          return;
        }
        showStep("ATTACK",`AI 決策｜${attack.attacker.character.name} → ${attack.defender.character.name}｜${attack.skill.name}`,{unitId:attack.attacker.id});
        afterStep(()=>{
          ctx.setPendingEnemyAttack(attack);ctx.setMode("enemy-reaction");
          ctx.pushLog(`${attack.attacker.character.name} 對 ${attack.defender.character.name} 發動 ${attack.skill.name}。`);
          ctx.render();ctx.emitState();
        },450);
      };
      const finishPhase=()=>{
        const state=ctx.state();
        if(ctx.checkMatchEnd()){ctx.render();return;}
        ctx.pushLog(`Round ${state.round}｜敵方回合結束。`);
        ctx.beginPlayerTurn();
      };
      const continuePhase=()=>{
        const state=ctx.state();
        if(state.phase!==ctx.PHASE.ENEMY||state.matchResult||ctx.pendingEnemyAttack())return;
        const enemy=queue.shift();
        if(!enemy){finishPhase();return;}
        if(!enemy.alive||enemy.acted){afterStep(continuePhase,0);return;}
        showStep("THINK",`AI 思考｜${enemy.character.name}`,{unitId:enemy.id});
        afterStep(()=>{
          if(state.stage?.ruleset==="CORE_CAPTURE"&&ctx.canUnitCapture(enemy)){ctx.executeCapture(enemy);afterStep(continuePhase,300);return;}
          let attack=chooseAttack(enemy);
          if(attack){requestAttack(attack);return;}
          const path=movePath(enemy);
          if(path.length)showStep("MOVE_PLAN",`AI 決策｜${enemy.character.name} 移動 ${path.length} 格`,{unitId:enemy.id});
          afterStep(()=>animateMove(enemy,path,()=>{
            if(state.stage?.ruleset==="CORE_CAPTURE"&&ctx.canUnitCapture(enemy)){ctx.executeCapture(enemy);afterStep(continuePhase,300);return;}
            attack=chooseAttack(enemy);
            if(attack){requestAttack(attack);return;}
            enemy.moved=true;enemy.acted=true;enemy.waited=true;
            showStep("WAIT",`${enemy.character.name} 待機`,{unitId:enemy.id});
            afterStep(continuePhase,300);
          }),path.length?350:0);
        },400);
      };
      const deploymentTiles=()=>{
        const state=ctx.state(),tiles=[];
        DeploymentEngine.points(state.stage).forEach(point=>{if(point.owner!=="ENEMY")return;(point.area||[]).forEach(pos=>{if(DeploymentEngine.canDeploy({stage:state.stage,map:state.map,units:state.units,owner:"ENEMY",x:pos.x,y:pos.y}))tiles.push(pos);});});
        return tiles;
      };
      const runCardPhase=done=>{
        const state=ctx.state(),cards=state.enemyCardState;
        if(!cards){done?.();return;}
        const handSize=Number(state.stage.enemyCardRules?.handSize||state.stage.cardRules?.handSize||5);
        const drawn=CardPhaseEngine.begin(cards,{handSize});
        ctx.pushLog(`Round ${state.round}｜敵方卡牌階段開始｜💎 ${cards.crystals}。`,"SYSTEM");
        if(drawn.length)ctx.pushLog(`敵方抽牌 ${drawn.length} 張。`,"SYSTEM");
        showStep("DRAW",drawn.length?`敵方抽牌 ${drawn.length} 張｜💎 ${cards.crystals}/${cards.crystalCapacity}`:`敵方檢視手牌｜💎 ${cards.crystals}/${cards.crystalCapacity}`);
        const decide=()=>{
          const cardId=cards.zones.hand.find(id=>{const card=CardDatabase.get(id);return CardDatabase.isCharacter(card)&&CardPhaseEngine.canPlay(cards,card);});
          const tile=deploymentTiles()[0];
          if(!cardId||!tile){CardPhaseEngine.end(cards);showStep("CARD_END","敵方結束卡牌階段");afterStep(done,350);return;}
          const card=CardDatabase.get(cardId);
          showStep("CARD_SELECT",`敵方選擇「${card.name}」｜消耗 ${card.cost} 水晶`,{cardId:card.id});
          afterStep(()=>{
            const unit=ctx.createEnemyCardUnit(card,tile);
            if(!CardPhaseEngine.commit(cards,card)){CardPhaseEngine.end(cards);done?.();return;}
            state.units.push(unit);
            ctx.pushLog(`敵方使用「${card.name}」部署至 (${tile.x},${tile.y})｜本回合待命｜消耗 ${card.cost} 水晶。`,"SYSTEM");
            showStep("DEPLOY",`${card.name} 部署 → (${tile.x},${tile.y})｜本回合待命`,{cardId:card.id,unitId:unit.id});
            afterStep(decide,550);
          },600);
        };
        afterStep(decide,drawn.length?600:300);
      };
      const runPhase=()=>{
        const state=ctx.state();ctx.setPhase(ctx.PHASE.ENEMY);ctx.clearSelection();ctx.clearEnemyReaction();ctx.pushLog(`Round ${state.round}｜敵方回合開始。`);
        runCardPhase(()=>{
          if(ctx.checkMatchEnd()){ctx.render();return;}
          ctx.resetActions(ctx.TEAM.ENEMY);
          ctx.living(ctx.TEAM.ENEMY).filter(u=>u.deployedRound===state.round).forEach(u=>{u.moved=true;u.acted=true;u.waited=true;});
          queue=ctx.living(ctx.TEAM.ENEMY).filter(u=>u.deployedRound!==state.round);
          showStep("TACTICAL","敵方進入戰棋階段");afterStep(continuePhase,350);
        });
      };
      const reset=()=>{queue=[];if(stepTimer){clearTimeout(stepTimer);stepTimer=null;}};
      return{runPhase,continuePhase,reset};
    }
  };
})();
