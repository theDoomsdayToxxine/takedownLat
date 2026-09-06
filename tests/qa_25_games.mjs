import fs from 'node:fs';
import { MatchEngine, fisherYates, MAX_HISTORY } from '../src/core.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const chars=['atha','neffa','laxxator','noche','florcanela','daal'].map(id=>({id}));
let seed=987654321; const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const assert=(x,m)=>{if(!x)throw new Error(m)};

// Static content invariants.
assert(bank.length===650,'bank !== 650');
for(const q of bank){assert(q.q&&q.c&&Array.isArray(q.w)&&q.w.length===3,'bad question shape');assert(q.d,'missing bibliography');}
for(let i=0;i<250;i++){const s=fisherYates([...Array(650).keys()],rng);assert(new Set(s).size===650,'shuffle duplicate');assert(s.length===650,'shuffle length');}

// Same-room: 25 matches with rematch after every match, history preserved and capped at 10.
const engine=new MatchEngine(bank,rng);
engine.startSelection();
const results=[];
for(let game=1;game<=25;game++){
  // rotate through 6 distinct heroes without collisions
  const a=chars[(game-1)%6].id; const b=chars[(game)%6].id;
  assert(engine.state.phase==='select','not select at game start');
  const p1=engine.select('p1',a,chars); assert(p1.ok,'p1 selection rejected');
  const p2=engine.select('p2',b,chars); assert(p2.ok,'p2 selection rejected');
  assert(engine.state.phase==='combat','combat failed to start');

  const seen=new Set(); let wrongEvidence=false; let asks=0;
  while(engine.state.phase==='combat' && asks<60){
    asks++;
    const player=engine.state.turn;
    assert(engine.askQuestion(player).ok,'ask rejected');
    const q=engine.state.question; assert(q&&q.options.length===4,'question not ready');
    seen.add(q.id);
    const trueIx=q.options.findIndex(o=>o.correct);
    const wrongIx=(asks%5===0)?(trueIx===0?1:0):trueIx;
    const before=q.d;
    const ans=engine.resolveAnswer(player,wrongIx); assert(ans.ok,'answer rejected');
    if(asks%5===0){assert(before,'wrong-answer source missing');wrongEvidence=true;}
    // Advance post-impact animation gate deterministically in test.
    if(engine.state.phase==='combat' && engine.state.question?.resolved){engine.state.question=null;engine.state.turn=player==='p1'?'p2':'p1';engine.bump();}
  }
  assert(engine.state.phase==='end','match did not end');
  assert(seen.size===asks,'question repeated inside match');
  assert(wrongEvidence,'wrong-answer evidence was not exercised');
  const histBefore=engine.state.roomHistory.length;
  const winner=engine.state.winner;

  assert(engine.requestRematch('p1').ok,'p1 rematch rejected');
  assert(engine.requestRematch('p2').ok,'p2 rematch rejected');
  assert(engine.state.phase==='select','rematch did not return to selection');
  assert(engine.state.roomHistory.length===Math.min(histBefore,MAX_HISTORY),'history not preserved/capped');
  assert(engine.state.p1.hp===100&&engine.state.p2.hp===100,'HP reset failure');
  assert(engine.state.p1.streak===0&&engine.state.p2.streak===0,'combat streak reset failure');
  assert(engine.state.p1.char===null&&engine.state.p2.char===null,'character reset failure');
  results.push({game,winner,questions:asks,history:engine.state.roomHistory.length,rematch:'OK'});
}
assert(engine.state.roomHistory.length===10,'history final length must be 10');
console.log(JSON.stringify({status:'PASS',bank:bank.length,fisherYatesPermutations:250,sameRoomMatches:25,historyFinal:10,results},null,2));
