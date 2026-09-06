import { MatchEngine, MAX_HISTORY, TURN_SECONDS } from './src/core.js';
import questionBank from './data/questions.json' with { type: 'json' };

const CHARS=[
 {id:'atha',name:'ATHA',role:'Druidesa de la Noche',weapon:'Hoz lunar',accent:'#58e07c',halo:'#123a20',body:'ath'},
 {id:'neffa',name:'NEFFA',role:'Hechicera Apocalíptica',weapon:'Báculo volcánico',accent:'#ff5f25',halo:'#3d160c',body:'nef'},
 {id:'laxxator',name:'LAXXATOR',role:'Heraldo del Día del Juicio',weapon:'Martillo planetario',accent:'#65d9ff',halo:'#0c213f',body:'lax'},
 {id:'noche',name:'NOCHE',role:'Caballero Fantasma',weapon:'Mandoble espectral',accent:'#b58cff',halo:'#20143f',body:'noc'},
 {id:'florcanela',name:'FLORCANELA',role:'Reina Hada-Banshee',weapon:'Arco de espinas feéricas',accent:'#ff7fd0',halo:'#39162c',body:'flo'},
 {id:'daal',name:'DAAL',role:'Ogro Machacacráneos',weapon:'Mazos gemelos',accent:'#d7ad52',halo:'#31250e',body:'daa'}
];
const el=id=>document.getElementById(id);
const screens={splash:'screen-splash',lobby:'screen-lobby',select:'screen-select',battle:'screen-battle',end:'screen-end'};
let engine=new MatchEngine(questionBank);
let isHost=false,myP='';let peer=null,conn=null;let localPick=null,pendingPick=null;let lastRev=-1;let timerId=null;let fx={type:'idle',t:0};let animationFrame=null;
const canvas=el('arena'),ctx=canvas.getContext('2d');

function show(name){Object.values(screens).forEach(id=>el(id).classList.remove('active'));el(screens[name]).classList.add('active');}
function status(text,on=false){el('status-text').textContent=text;el('status-dot').classList.toggle('on',on);}
function char(id){return CHARS.find(c=>c.id===id);}

function safeSend(payload){ if(conn?.open) conn.send(payload); }
function sendState(){ if(!isHost||!conn?.open) return; engine.bump(); safeSend({type:'state',state:engine.snapshot()}); renderState(); }

function bindConnection(c){
  conn=c; c.on('open',()=>{status('P2P conectado',true); safeSend({type:'hello'}); if(pendingPick){const p=pendingPick;pendingPick=null;safeSend({type:'action',action:'select',player:myP,char:p});}});
  c.on('data',msg=>{
    if(!msg||typeof msg!=='object')return;
    if(msg.type==='hello'&&isHost){sendState();return;}
    if(msg.type==='action'&&isHost){handleHostAction(msg.action,msg);return;}
    if(msg.type==='state'&&!isHost){const s=msg.state;if(!s||typeof s.rev!=='number'||s.rev<=lastRev)return;lastRev=s.rev;engine.state=s;renderState();}
  });
  c.on('close',()=>{status('Rival desconectado',false);safeResetNet();});
  c.on('error',()=>{status('Error P2P — intenta de nuevo',false);});
}
function safeResetNet(){try{conn?.close();}catch{} try{peer?.destroy();}catch{} conn=null;peer=null;isHost=false;myP='';clearTimeout(timerId);}

el('btn-enter').onclick=()=>show('lobby');
el('btn-create').onclick=()=>{
  isHost=true;myP='p1';status('Creando sala…');peer=new Peer();
  peer.on('open',id=>{el('host-code').classList.remove('hidden');el('host-id').textContent=id;status('Sala creada — esperando rival',true);engine.startSelection();renderState();show('select');});
  peer.on('connection',c=>{if(conn?.open){c.close();return;}engine.state.connected.p2=true;bindConnection(c);sendState();});
  peer.on('error',e=>{status('PeerJS: '+(e.type||'error'));});
};
el('btn-join').onclick=()=>{
  const id=el('join-id').value.trim();if(!id)return;
  isHost=false;myP='p2';status('Conectando…');peer=new Peer();
  peer.on('open',()=>{bindConnection(peer.connect(id,{reliable:true}));});
  peer.on('error',()=>status('No se pudo conectar',false));
};
el('btn-copy').onclick=()=>navigator.clipboard?.writeText(el('host-id').textContent);

function renderRoster(){
  const g=el('roster');g.innerHTML='';
  for(const c of CHARS){
    const taken=engine.state.p1.char===c.id||engine.state.p2.char===c.id;
    const d=document.createElement('article');d.className='hero-card'+(localPick===c.id?' selected':'')+(taken&&localPick!==c.id?' taken':'');d.style.setProperty('--accent',c.accent);d.style.setProperty('--halo',c.halo);
    d.innerHTML=`<div class="hero-portrait"><canvas width="260" height="300"></canvas></div><div class="hero-name">${c.name}</div><div class="hero-role">${c.role}</div><div class="weapon">⚔ ${c.weapon}</div>`;
    d.onclick=()=>{if(engine.state[myP]?.ready||taken)return;localPick=c.id;renderRoster();el('btn-confirm').disabled=!localPick;};
    g.appendChild(d);drawHero(d.querySelector('canvas').getContext('2d'),c,0,false,130,260);
  }
}
function updateReady(){
  for(const p of ['p1','p2']){const node=el(p+'-ready');node.classList.toggle('ok',!!engine.state[p]?.ready);node.textContent=`JUGADOR ${p==='p1'?1:2} · ${engine.state[p]?.ready?'LISTO ✓':'EN ESPERA'}`;}
  el('btn-confirm').disabled=!localPick||!!engine.state[myP]?.ready;
}
function confirmPick(){
  if(!localPick||engine.state[myP]?.ready)return;
  const c=localPick;if(isHost){handleHostAction('select',{player:myP,char:c});}else if(conn?.open){safeSend({type:'action',action:'select',player:myP,char:c});}else{pendingPick=c;status('Selección guardada — esperando P2P…');}
}
el('btn-confirm').onclick=confirmPick;

function handleHostAction(action,m){
  const p=m.player;
  if(action==='select'){engine.select(p,m.char,CHARS);sendState();return;}
  if(action==='ask'){const r=engine.askQuestion(p);if(r.ok){engine.startTimer(p,()=>{engine.resolveAnswer(p,-1);sendState();});}sendState();return;}
  if(action==='answer'){const r=engine.resolveAnswer(p,m.index);sendState();return;}
  if(action==='rematch'){engine.requestRematch(p);sendState();return;}
  if(action==='pass'){if(engine.state.phase==='combat'&&engine.state.turn===p&&!engine.state.question){engine.state.turn=p==='p1'?'p2':'p1';engine.bump();sendState();}}
}

function doAction(action,data={}){if(isHost)handleHostAction(action,{player:myP,...data});else if(conn?.open)safeSend({type:'action',action,player:myP,...data});}

el('btn-ask').onclick=()=>{if(engine.state.phase==='combat'&&engine.state.turn===myP&&!engine.state.question)doAction('ask');};
el('btn-pass').onclick=()=>{if(engine.state.phase==='combat'&&engine.state.turn===myP&&!engine.state.question)doAction('pass');};
el('btn-rematch').onclick=()=>doAction('rematch');
el('btn-lobby').onclick=()=>{safeResetNet();engine=new MatchEngine(questionBank);lastRev=-1;localPick=null;show('lobby');status('Desconectado');};

function renderState(){
  const s=engine.state;
  if(s.phase==='select'){show('select');renderRoster();updateReady();}
  else if(s.phase==='combat'){show('battle');renderBattle();}
  else if(s.phase==='end'){show('end');renderEnd();}
  else if(s.phase==='lobby'){show('lobby');}
}
function renderBattle(){
  const s=engine.state;const c1=char(s.p1.char),c2=char(s.p2.char);
  el('hud-p1-name').textContent=c1?.name||'P1';el('hud-p2-name').textContent=c2?.name||'P2';
  el('hp1').style.width=s.p1.hp+'%';el('hp2').style.width=s.p2.hp+'%';el('streak1').textContent=`RACHA ${s.p1.streak}${s.p1.beast?' • BESTIA ×2':''}`;el('streak2').textContent=`RACHA ${s.p2.streak}${s.p2.beast?' • BESTIA ×2':''}`;
  el('turn-name').textContent=s.turn.toUpperCase();
  const q=s.question;
  if(!q){el('q-text').textContent='Pulsa «TRAER PREGUNTA» para atacar.';el('q-spec').textContent='—';el('q-count').textContent=`PARTIDA ${s.matchNo}`;el('options').innerHTML='';el('q-feedback').textContent='';el('q-source').classList.add('hidden');el('btn-ask').disabled=s.turn!==myP;el('btn-pass').disabled=s.turn!==myP;setTimer(TURN_SECONDS);}
  else{el('q-text').textContent=q.q;el('q-spec').textContent=q.s;el('q-count').textContent=`PREGUNTA ${q.id} / 650`;el('options').innerHTML='';q.options.forEach((o,i)=>{const b=document.createElement('button');b.className='opt';b.textContent=String.fromCharCode(65+i)+'. '+o.text;b.disabled=s.turn!==myP||q.resolved;b.onclick=()=>answer(i);if(q.resolved){if(o.correct)b.classList.add('correct');if(i===q.selectedIndex&&!o.correct)b.classList.add('wrong');}el('options').appendChild(b);});el('btn-ask').disabled=true;el('btn-pass').disabled=true;el('q-source').classList.toggle('hidden',!q.d);el('q-source').href=q.d||'#';el('q-feedback').textContent=q.resolved?(q.timeout?'Tiempo agotado.':'Respuesta procesada.'):'La bibliografía aparecerá aquí si la pregunta se resuelve incorrectamente.';}
  fx=s.event||fx;startAnimationLoop();
}
function answer(i){if(!engine.state.question||engine.state.question.resolved||engine.state.turn!==myP)return;doAction('answer',{index:i});}
function renderEnd(){
  const s=engine.state;const win=s.winner===myP;el('end-title').textContent=win?'¡VICTORIA!':'DERROTA';el('end-title').style.color=win?'var(--gold)':'#ff5f4a';el('end-sub').textContent=`${char(s[s.winner]?.char)?.name||s.winner} vence • partida ${s.matchNo}`;
  const q=s.question;if(q?.d){el('end-sub').textContent += ' • evidencia bibliográfica disponible.';el('end-evidence').classList.remove('hidden');el('end-source').href=q.d;}else{el('end-evidence').classList.add('hidden');el('end-source').href='#';}
  el('history-list').innerHTML=s.roomHistory.map(h=>`<div class="hist-row"><span>#${h.no}</span><span class="win">${char(s[h.winner]?.char)?.name||h.winner}</span><span class="loss">${char(s[h.loser]?.char)?.name||h.loser}</span><span>RACHA ${h.winnerStreak}</span><span>${h.questionId||'—'}</span></div>`).join('');
  el('btn-rematch').textContent=s[myP].rematch?'ESPERANDO RIVAL…':'REVANCHA';el('btn-rematch').disabled=s[myP].rematch;
}
function setTimer(v){clearInterval(timerId);el('timer').textContent=v;const q=engine.state.question;if(!q||q.resolved||engine.state.turn!==myP)return;let left=TURN_SECONDS;timerId=setInterval(()=>{left--;el('timer').textContent=Math.max(left,0);if(left<=0)clearInterval(timerId);},1000);}
function startAnimationLoop(){if(animationFrame)return;const step=()=>{animationFrame=requestAnimationFrame(step);drawArena();};step();}

function drawArena(){
  const s=engine.state;const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);drawBackground(w,h);
  const c1=char(s.p1.char),c2=char(s.p2.char);if(!c1||!c2)return;
  const now=performance.now();const t=Math.min(1,(now-(fx.t||now))/850);const type=fx.type;
  let ax=300,bx=980,ay=460,by=460;
  if(type==='attack'){const p=fx.player;const k=Math.sin(Math.min(1,t)*Math.PI);if(p==='p1')ax+=k*150,bx-=k*35;else bx-=k*150,ax+=k*35;}
  if(type==='finish'){const lose=fx.target; if(lose==='p1')ay+=Math.sin(t*Math.PI)*45;else by+=Math.sin(t*Math.PI)*45;}
  drawHero(ctx,c1,now/1000,s.p1.beast>0,ax,ay);ctx.save();ctx.scale(-1,1);drawHero(ctx,c2,now/1000,s.p2.beast>0,-bx,by);ctx.restore();
  if(type==='attack' && t<1)drawAttackEffect(ctx,fx,ax, bx, ay-70);if(s.p1.beast>0)drawBeastAura(ctx,c1,ax,ay,1);if(s.p2.beast>0)drawBeastAura(ctx,c2,bx,by,1);
}
function drawBackground(w,h){
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#221719');g.addColorStop(.55,'#120c0d');g.addColorStop(1,'#050506');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(255,86,33,.08)';ctx.fillRect(0,h*.62,w,h*.1);
  for(let i=0;i<14;i++){const x=i*100-30;ctx.fillStyle='#161417';ctx.beginPath();ctx.moveTo(x,h*.57);ctx.lineTo(x+28,h*.36);ctx.lineTo(x+75,h*.57);ctx.closePath();ctx.fill();}
  for(let i=0;i<18;i++){ctx.strokeStyle='rgba(255,91,33,.25)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(i*74,h*.76);ctx.lineTo(i*74+24,h*.72);ctx.stroke();}
  ctx.fillStyle='#0b0b0c';ctx.fillRect(0,h*.78,w,h*.22);
}
function drawBeastAura(c,cdata,x,y,scale){ctx.save();ctx.globalAlpha=.18+Math.sin(performance.now()/160)*.05;ctx.fillStyle=cdata.accent;for(let i=0;i<8;i++){const a=performance.now()/700+i*.8;c.beginPath();c.moveTo(x+Math.cos(a)*70,y-90+Math.sin(a)*40);c.lineTo(x+Math.cos(a+.25)*110,y-60+Math.sin(a+.25)*60);c.lineTo(x+Math.cos(a-.25)*110,y-60+Math.sin(a-.25)*60);c.fill();}ctx.restore();}
function drawAttackEffect(c,ev,ax,bx,y){const target=ev.target==='p1'?ax:bx;const source=ev.player==='p1'?ax:bx;const dir=ev.player==='p1'?1:-1;c.save();c.globalAlpha=.8;for(let i=0;i<14;i++){c.strokeStyle=ev.beast?'#f3ef9d':(ev.player==='p1'?'#6cff9b':'#ff6f2e');c.lineWidth=2+(i%3);c.beginPath();c.moveTo(source+dir*i*7,y+i*3);c.lineTo(target-dir*(40+i*8),y-40+i*4);c.stroke();}c.restore();}

function drawHero(c,cd,t,beast,x,y){
  c.save();c.translate(x,y);c.scale(.95,.95);const bob=Math.sin(t*3+(cd.id.charCodeAt(0)||1))*3;c.translate(0,bob);c.shadowBlur=12;c.shadowColor=cd.accent;
  if(cd.body==='ath')drawAtha(c,beast,cd);else if(cd.body==='nef')drawNeffa(c,beast,cd);else if(cd.body==='lax')drawLaxx(c,beast,cd);else if(cd.body==='noc')drawNoche(c,beast,cd);else if(cd.body==='flo')drawFlor(c,beast,cd);else drawDaal(c,beast,cd);c.restore();
}
function poly(c,pts,fill,stroke=fill){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
function limb(c,x1,y1,x2,y2,w,fill){c.strokeStyle=fill;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function head(c,x,y,r,skin,hair){c.fillStyle=skin;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.fillStyle=hair;c.beginPath();c.arc(x,y-3,r,Math.PI,Math.PI*2);c.fill();}
function drawAtha(c,b,cd){
  limb(c,-25,-55,-48,5,15,'#38572f');limb(c,25,-55,50,0,15,'#38572f');poly(c,[[-30,50],[-16,-12],[16,-12],[32,50],[20,90],[-20,90]],b?'#315c35':'#204328');head(c,0,-85,25,'#c7a47e','#1a2f18');poly(c,[[-24,-82],[-41,-110],[-27,-109],[-14,-128],[-4,-104],[10,-128],[19,-102],[37,-109],[22,-79]],'#304f29');limb(c,-14,28,-48,82,14,'#2c5132');limb(c,15,28,52,83,14,'#2c5132');limb(c,-48,82,-66,105,8,'#18341e');limb(c,52,83,72,105,8,'#18341e');limb(c,-18,4,-58,34,11,'#2c5132');limb(c,18,5,63,-2,11,'#2c5132');c.strokeStyle='#cfe8c5';c.lineWidth=5;c.beginPath();c.arc(78,-25,34,1.6,5.1);c.stroke();c.strokeStyle='#8d6a3a';c.lineWidth=5;c.beginPath();c.moveTo(63,-3);c.lineTo(88,58);c.stroke();}
function drawNeffa(c,b,cd){
  limb(c,-22,-48,-56,8,14,'#5e1710');limb(c,22,-48,55,5,14,'#5e1710');poly(c,[[-28,50],[-19,-16],[0,-8],[20,-16],[30,50],[14,78],[-15,78]],b?'#701a0e':'#3d120d');head(c,0,-86,24,'#d9a07e','#5b120c');poly(c,[[-26,-86],[-48,-119],[-25,-111],[-13,-138],[0,-110],[16,-138],[26,-110],[47,-120],[23,-84]],'#6e180c');limb(c,-14,36,-45,83,13,'#512014');limb(c,15,36,51,82,13,'#512014');limb(c,-18,4,-56,33,11,'#6b2015');limb(c,19,4,55,-3,11,'#6b2015');c.strokeStyle='#bc7d2f';c.lineWidth=6;c.beginPath();c.moveTo(60,12);c.lineTo(78,67);c.stroke();c.fillStyle='#ff6326';c.beginPath();c.arc(76,5,19+Math.sin(performance.now()/150)*3,0,Math.PI*2);c.fill();}
function drawLaxx(c,b,cd){
  poly(c,[[-35,58],[-28,-18],[0,-32],[28,-18],[35,58],[18,89],[-17,89]],b?'#294e87':'#17365e');poly(c,[[-24,8],[-7,-2],[-4,22],[-24,30]],'#d6b25c');poly(c,[[24,8],[7,-2],[4,22],[24,30]],'#d6b25c');c.strokeStyle='#b7d8ff';c.lineWidth=4;c.beginPath();c.arc(0,-54,44,.2,Math.PI*1.8);c.stroke();head(c,0,-88,23,'#d2aa88','#1c2f4e');poly(c,[[-28,-86],[-42,-105],[-23,-103],[-12,-116],[0,-104],[13,-116],[23,-102],[43,-105],[27,-85]],'#274b83');limb(c,-14,35,-42,88,14,'#1d406c');limb(c,14,35,42,88,14,'#1d406c');limb(c,-18,3,-59,30,12,'#234a78');limb(c,18,3,62,-8,12,'#234a78');c.strokeStyle='#d6b25c';c.lineWidth=9;c.beginPath();c.moveTo(63,-8);c.lineTo(103,-57);c.stroke();c.beginPath();c.arc(105,-61,18,0,Math.PI*2);c.stroke();}
function drawNoche(c,b,cd){
  poly(c,[[-36,56],[-30,-18],[0,-34],[30,-18],[36,56],[16,92],[-18,92]],b?'#3d275e':'#1c1827');poly(c,[[-17,-15],[0,-35],[17,-15],[13,29],[-13,29]],'#23202c');head(c,0,-90,22,'#5b5c66','#111117');c.fillStyle='#1b1b21';c.fillRect(-19,-112,38,35);limb(c,-15,34,-49,86,14,'#201c2a');limb(c,15,34,50,86,14,'#201c2a');limb(c,-19,2,-63,35,12,'#282232');limb(c,19,2,62,-3,12,'#282232');c.strokeStyle='#b48bff';c.lineWidth=7;c.beginPath();c.moveTo(61,-3);c.lineTo(118,-85);c.stroke();c.strokeStyle='#9f7bff';c.lineWidth=2;c.beginPath();c.arc(35,-65,56,0,Math.PI*2);c.stroke();for(let i=0;i<4;i++){c.fillStyle='#cdb3ff';c.beginPath();c.arc(30+Math.cos(i*1.6)*62,-65+Math.sin(i*1.6)*42,6,0,Math.PI*2);c.fill();}}
function drawFlor(c,b,cd){
  limb(c,-20,-48,-53,-2,13,'#4b2b3f');limb(c,20,-48,52,4,13,'#4b2b3f');poly(c,[[-27,53],[-22,-12],[0,-6],[22,-12],[28,53],[15,77],[-15,77]],b?'#7b2b63':'#422347');head(c,0,-86,23,'#d9b18a','#4c2446');poly(c,[[-25,-88],[-44,-104],[-26,-108],[-17,-124],[-7,-107],[7,-126],[18,-108],[39,-111],[22,-84]],'#6a2a62');poly(c,[[-60,-48],[-95,-86],[-72,-38],[-105,-15],[-64,-12]],'rgba(255,125,207,.4)');poly(c,[[60,-48],[95,-86],[72,-38],[105,-15],[64,-12]],'rgba(255,125,207,.4)');limb(c,-14,37,-49,83,12,'#5b3050');limb(c,14,37,48,83,12,'#5b3050');limb(c,-18,2,-61,31,10,'#653150');limb(c,18,2,60,-8,10,'#653150');c.strokeStyle='#d8b05c';c.lineWidth=4;c.beginPath();c.moveTo(58,-8);c.quadraticCurveTo(92,-35,112,-4);c.stroke();for(let i=0;i<5;i++){c.fillStyle=['#ff8fd2','#d9ff9d','#b9a0ff'][i%3];c.beginPath();c.arc(50+Math.cos(i*1.25)*55,-6+Math.sin(i*1.25)*38,5,0,Math.PI*2);c.fill();}}
function drawDaal(c,b,cd){
  poly(c,[[-58,62],[-46,-22],[-20,-38],[0,-18],[20,-38],[46,-22],[58,62],[32,100],[-32,100]],b?'#6f5b2f':'#4a412d');head(c,0,-84,34,'#84623c','#2d261d');poly(c,[[-35,-89],[-60,-75],[-42,-104],[-20,-111],[-10,-124],[0,-108],[15,-124],[24,-109],[44,-104],[58,-74],[30,-88]],'#3f3324');limb(c,-23,44,-70,95,22,'#51422d');limb(c,23,44,72,95,22,'#51422d');limb(c,-30,5,-77,-4,20,'#55462d');limb(c,30,5,77,-4,20,'#55462d');limb(c,-70,-3,-95,32,12,'#4e3d2b');limb(c,70,-3,95,32,12,'#4e3d2b');c.strokeStyle='#5c4528';c.lineWidth=9;c.beginPath();c.moveTo(-94,24);c.lineTo(-120,74);c.stroke();c.beginPath();c.moveTo(94,24);c.lineTo(120,74);c.stroke();c.fillStyle='#4e3e2d';for(const x of [-120,120]){c.beginPath();c.arc(x,78,22,0,Math.PI*2);c.fill();for(let i=0;i<8;i++){const a=i*Math.PI/4;c.fillStyle='#c2a15b';c.beginPath();c.moveTo(x+Math.cos(a)*16,78+Math.sin(a)*16);c.lineTo(x+Math.cos(a)*30,78+Math.sin(a)*30);c.lineTo(x+Math.cos(a+.1)*18,78+Math.sin(a+.1)*18);c.fill();}}}

show('splash');
setTimeout(()=>el('btn-enter').focus(),100);
