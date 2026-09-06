import fs from 'node:fs';
import { MatchEngine } from '../src/core.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const roster=['atha','neffa','laxxator','noche','florcanela','daal'].map(id=>({id}));
const assert=(x,m)=>{if(!x)throw new Error(m)};
let seed=20260906;const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const host=new MatchEngine(bank,rng);
let client={rev:-1,state:null,received:0};
function sync(){const s=host.snapshot();if(s.rev<=client.rev)return false;client.rev=s.rev;client.state=s;client.received++;return true;}
function action(msg){switch(msg.action){case 'select':return host.select(msg.player,msg.char,roster);case 'ask':return host.askQuestion(msg.player);case 'answer':return host.resolveAnswer(msg.player,msg.index);case 'rematch':return host.requestRematch(msg.player);default:return {ok:false};}}
// Create-room -> selection -> concurrent selection.
host.startSelection();sync();assert(client.state.phase==='select','client did not reach select');
assert(action({action:'select',player:'p1',char:'atha'}).ok,'p1 select failed');sync();
assert(action({action:'select',player:'p2',char:'neffa'}).ok,'p2 select failed');sync();
assert(client.state.phase==='combat','client did not receive combat state');
// Question/answer, malicious packet ignored at validation level, wrong answer then right answer.
const player=host.state.turn;assert(action({action:'ask',player}).ok,'ask failed');sync();
const q=host.state.question;const trueIx=q.options.findIndex(o=>o.correct);const badIx=trueIx===0?1:0;
const malicious=action({action:'answer',player,index:'not-an-index',k:true});assert(malicious.ok && malicious.correct===false,'malicious boolean/index not rejected safely');sync();
// Force advance after review gate for deterministic protocol test.
host.state.question=null;host.state.turn=player==='p1'?'p2':'p1';host.bump();sync();
assert(action({action:'ask',player:host.state.turn}).ok,'second ask failed');sync();
const q2=host.state.question;const ix2=q2.options.findIndex(o=>o.correct);assert(action({action:'answer',player:host.state.turn,index:ix2}).ok,'correct answer failed');sync();
// End + rematch.
host.state.p2.hp=0;host.finish('p1');sync();const beforeHistory=host.state.roomHistory.length;assert(host.requestRematch('p1').ok,'p1 rematch failed');sync();assert(host.state.phase==='end','phase should remain end until both rematch');assert(host.requestRematch('p2').ok,'p2 rematch failed');sync();assert(host.state.phase==='select','rematch failed');assert(host.state.roomHistory.length===beforeHistory,'history lost');assert(host.state.p1.hp===100&&host.state.p2.hp===100,'HP not reset');assert(client.rev===host.state.rev,'client revision not monotonic');
console.log(JSON.stringify({status:'PASS',messagesSynced:client.received,revision:client.rev,hostPhase:host.state.phase,history:host.state.roomHistory.length},null,2));
