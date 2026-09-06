export const MAX_HISTORY = 10;
export const MAX_HP = 100;
export const TURN_SECONDS = 30;
export const BEAST_THRESHOLD = 3;
export const BEAST_HITS = 2;
export const BASE_DAMAGE = 20;

export function fisherYates(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shuffleOptions(question, rng = Math.random) {
  const opts = [
    { text: question.c, correct: true },
    ...question.w.map(text => ({ text, correct: false }))
  ];
  return fisherYates(opts, rng);
}

export function makeDeck(questionBank, rng = Math.random) {
  return fisherYates(questionBank.map(q => ({...q, w: [...q.w]})), rng);
}

export function createPlayer() {
  return { char: null, ready: false, hp: MAX_HP, streak: 0, beast: 0, beastCooldown: 0, rematch: false };
}

export function freshMatchState() {
  return {
    phase: 'lobby',
    p1: createPlayer(),
    p2: createPlayer(),
    turn: 'p1',
    deck: [],
    question: null,
    roomHistory: [],
    roomWins: { p1: 0, p2: 0 },
    roomStreak: { p1: 0, p2: 0 },
    matchNo: 0,
    rev: 0,
    event: null,
    winner: null,
    connected: { p1: true, p2: false }
  };
}

export class MatchEngine {
  constructor(bank, rng = Math.random) {
    this.bank = bank;
    this.rng = rng;
    this.state = freshMatchState();
    this.state.deck = makeDeck(bank, rng);
    this.timer = null;
    this.questionNonce = 0;
    this.rematchNonce = 0;
  }

  snapshot() { return structuredClone(this.state); }
  bump() { this.state.rev += 1; return this.state.rev; }
  refillDeck() { this.state.deck = makeDeck(this.bank, this.rng); }

  select(player, char, roster) {
    if (this.state.phase !== 'select') return {ok:false, reason:'not-selection'};
    if (!roster.some(x => x.id === char)) return {ok:false, reason:'unknown-character'};
    if (this.state.p1.char === char || this.state.p2.char === char) return {ok:false, reason:'character-taken'};
    const p=this.state[player];
    if (!p || p.ready) return {ok:false, reason:'already-ready'};
    p.char=char; p.ready=true;
    if (this.state.p1.ready && this.state.p2.ready) {
      this.startCombat();
    }
    this.bump();
    return {ok:true};
  }

  startSelection() {
    if (this.state.phase === 'lobby' || this.state.phase === 'select') {
      this.state.phase='select'; this.bump(); return true;
    }
    return false;
  }

  startCombat() {
    this.stopTimer();
    this.state.phase='combat';
    this.state.turn = this.rng() < .5 ? 'p1' : 'p2';
    this.state.question=null;
    this.state.p1.hp=MAX_HP; this.state.p2.hp=MAX_HP;
    this.state.p1.streak=0; this.state.p2.streak=0;
    this.state.p1.beast=0; this.state.p2.beast=0;
    this.state.p1.beastCooldown=0; this.state.p2.beastCooldown=0;
    this.state.matchNo += 1;
    this.state.event={id:Date.now()+Math.random(), type:'enter'};
    this.bump();
  }

  askQuestion(player) {
    if (this.state.phase !== 'combat' || this.state.turn !== player || this.state.question) return {ok:false,reason:'invalid-turn'};
    if (!this.state.deck.length) this.refillDeck();
    const q=this.state.deck.pop();
    const options=shuffleOptions(q,this.rng);
    this.state.question={...q, options, resolved:false, selectedIndex:null, timeout:false, nonce:++this.questionNonce};
    this.bump();
    return {ok:true, question:this.state.question};
  }

  resolveAnswer(player, selectedIndex) {
    if (this.state.phase !== 'combat' || this.state.turn !== player || !this.state.question || this.state.question.resolved) return {ok:false,reason:'invalid-answer'};
    const q=this.state.question;
    const valid=Number.isInteger(selectedIndex) && selectedIndex>=0 && selectedIndex<q.options.length;
    const correct=valid ? !!q.options[selectedIndex].correct : false;
    const actor=this.state[player];
    const target=this.state[player==='p1'?'p2':'p1'];
    let damage=0, beastActivated=false;
    if (correct) {
      actor.streak += 1;
      if (actor.beast > 0) { damage=BASE_DAMAGE*2; actor.beast -= 1; }
      else if (actor.streak >= BEAST_THRESHOLD && actor.beastCooldown===0) { actor.beast=BEAST_HITS; actor.beastCooldown=5; damage=BASE_DAMAGE*2; beastActivated=true; }
      else { damage=BASE_DAMAGE; }
      if (actor.beastCooldown>0 && !beastActivated) actor.beastCooldown -= 1;
      target.hp=Math.max(0,target.hp-damage);
    } else {
      actor.streak=0;
      actor.beast=0;
      if (actor.beastCooldown>0) actor.beastCooldown -= 1;
    }
    q.resolved=true; q.selectedIndex=valid?selectedIndex:null; q.timeout=!valid;
    this.stopTimer();
    this.state.event={id:Date.now()+Math.random(),type:correct?'attack':'miss',player,target:player==='p1'?'p2':'p1',damage,beast:beastActivated,correct,questionId:q.id};
    if (target.hp<=0) {
      this.finish(player);
    } else {
      this.bump();
      setTimeout(()=>{
        if (this.state.phase!=='combat' || !this.state.question || this.state.question.nonce!==q.nonce) return;
        this.state.question=null;
        this.state.turn = player==='p1'?'p2':'p1';
        this.bump();
      }, 1300);
    }
    this.bump();
    return {ok:true,correct,damage,beastActivated};
  }

  finish(winner) {
    this.stopTimer();
    const loser=winner==='p1'?'p2':'p1';
    this.state.phase='end'; this.state.winner=winner;
    this.state.roomWins[winner]+=1;
    this.state.roomStreak[winner]+=1; this.state.roomStreak[loser]=0;
    this.state.roomHistory.unshift({
      no:this.state.matchNo, winner, loser,
      p1Char:this.state.p1.char,p2Char:this.state.p2.char,
      winnerStreak:this.state.roomStreak[winner],
      p1Hp:this.state.p1.hp,p2Hp:this.state.p2.hp,
      questionId:this.state.question?.id??null,
      bibliography:this.state.question?.d??null,
      at:new Date().toISOString()
    });
    this.state.roomHistory=this.state.roomHistory.slice(0,MAX_HISTORY);
    this.state.event={id:Date.now()+Math.random(),type:'finish',player:winner,target:loser};
    this.bump();
  }

  requestRematch(player) {
    if (this.state.phase!=='end') return {ok:false,reason:'not-end'};
    if (this.state[player].rematch) return {ok:false,reason:'already-rematched'};
    this.state[player].rematch=true;
    if (this.state.p1.rematch && this.state.p2.rematch) {
      this.state.phase='select';
      this.state.winner=null;
      this.state.question=null;
      this.state.p1={...createPlayer(), char:null};
      this.state.p2={...createPlayer(), char:null};
      this.state.turn=this.rng()<.5?'p1':'p2';
      this.state.event={id:Date.now()+Math.random(),type:'rematch'};
      if (!this.state.deck.length) this.refillDeck();
    }
    this.bump();
    return {ok:true};
  }

  stopTimer(){ if (this.timer) { clearTimeout(this.timer); this.timer=null; } }
  startTimer(player, onTimeout) {
    this.stopTimer();
    const nonce=this.state.question?.nonce;
    if (!nonce) return;
    this.timer=setTimeout(()=>{
      if (this.state.phase==='combat' && this.state.turn===player && this.state.question?.nonce===nonce && !this.state.question.resolved) onTimeout();
    }, TURN_SECONDS*1000);
  }
}
