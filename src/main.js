import * as THREE from 'three';
import QRCode from 'qrcode';
import { makeWorld, makeCreature, makeSaber } from './world.js';
import { MotionReceiver } from './motion-protocol.js';
import { StrokeDetector } from './tracking.js';
import { saberPose, segmentIntersectsEllipse } from './combat.js';
import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="game-canvas"></div><div class="vignette"></div><canvas id="fx-canvas"></canvas><div class="damage-flash" id="damage-flash"></div>
  <div class="hud">
    <div class="topbar"><div class="brand"><span class="brand-mark">✦</span><div>MARÉ DE LUZ<small>ÚLTIMA DEFESA DA PRAIA</small></div></div><div class="top-center">SETOR 07 <span>///</span> COSTA AMANHECER</div><div class="hud-right"><button id="pair-button" class="icon-button" title="Conectar celular">⌁</button><button id="sound-button" class="icon-button" title="Som">♫</button></div></div>
    <div class="score-panel"><div class="score-block"><label>ELIMINADOS</label><strong id="score">00</strong></div><div class="score-divider"></div><div class="wave-block"><label>ONDA</label><strong id="wave">01</strong></div></div>
    <div class="reticle" id="saber-aim"></div><div class="slash-readout" id="slash-readout">CORTE PERFEITO</div>
    <div class="bottom-hud"><div class="health-wrap"><div class="health-heading"><span class="health-label">INTEGRIDADE</span><strong id="health-value">100%</strong></div><div class="health-track"><div class="health-fill" id="health-fill"></div></div></div><div class="status-pill" id="controller-status"><span class="status-dot"></span><span id="controller-status-text">MOUSE ATIVO</span></div></div>
    <div class="controls-hint"><span><span class="key">WASD</span>MOVER</span><span><span class="key">MOUSE</span>POSICIONAR</span><span><span class="key">CLIQUE</span>CORTAR</span><span><span class="key">Q E</span>GIRAR</span></div>
  </div>
  <div class="mini-panel" id="pair-panel"><span class="connect-label">CONTROLE POR MOVIMENTO</span><h2 style="font:800 24px 'Barlow Condensed';margin:7px 0 12px">CONECTE SEU CELULAR</h2><div class="qr-box"><canvas id="qr-small"></canvas></div><div class="pair-number"><span>CÓDIGO DE PAREAMENTO</span><b class="pair-code-value"></b></div><p>Abra a câmera do celular e leia o QR code. Aceite o acesso aos sensores.</p></div>
  <div class="panel-overlay" id="intro"><div class="intro-card"><div><div class="eyebrow">UM JOGO DE MOVIMENTO</div><h1 class="hero-title">MARÉ<br />DE <em>LUZ</em></h1><p class="intro-copy">Uma praia. Uma invasão. Um sabre de luz. Conecte seu celular, mova a lâmina com o giroscópio e corte as criaturas antes que alcancem você.</p><button class="primary-button" id="start-button">ENTRAR NA PRAIA <span>→</span></button><div class="small-note">Você também pode jogar agora com mouse e teclado.</div></div><div class="connect-card"><span class="connect-label">01 / CONECTE O CONTROLE</span><h2>SEU CELULAR<br />VIRA O SABRE</h2><p>Leia o QR code no celular e mantenha o jogo aberto no computador.</p><div class="qr-box"><canvas id="qr-intro"></canvas></div><div class="pair-number"><span>CÓDIGO DE PAREAMENTO</span><b class="pair-code-value"></b></div><div class="connect-foot"><span class="status-dot"></span><span id="intro-connection">Aguardando celular...</span></div></div></div></div>
  <div class="panel-overlay game-over hidden" id="game-over"><div class="intro-card"><div class="eyebrow">FIM DA DEFESA</div><h1 class="hero-title">A MARÉ<br /><em>VENCEU</em></h1><div class="final-score">CRIATURAS ELIMINADAS: <span id="final-score">00</span></div><button class="primary-button" id="restart-button">TENTAR DE NOVO <span>→</span></button></div></div>
`;

const canvasHost = document.querySelector('#game-canvas');
const fxCanvas = document.querySelector('#fx-canvas');
const fx = fxCanvas.getContext('2d');
const { scene, camera, renderer } = makeWorld();
canvasHost.appendChild(renderer.domElement);
scene.add(camera);
const saber = makeSaber(camera);
const clock = new THREE.Clock();
const temp = new THREE.Vector3();
const enemyCenter = new THREE.Vector3();
const player = { x: 0, z: 10, yaw: 0, pitch: -.035, health: 100 };
const saberPoint = { x: .65, y: .34 };
const inputReceiver = new MotionReceiver();
const mouseStroke = new StrokeDetector();
const aimElement = document.querySelector('#saber-aim');
const strikeHits = new Set();
let previousPhonePoint = null;
const creatures = [];
const sparks = [];
const keys = new Set();
const slashTrails = [];
let pairCode = newPairCode();
const roomToken = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
function newPairCode() { return String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000); }
let ws = null;
let connected = false;
let running = false;
let soundOn = true;
let audio = null;
let score = 0;
let wave = 1;
let waveElapsed = 0;
let spawnTimer = 0;
let activeStrikeKey = null;
let manualSwing = null;
let lastManualSwing = -Infinity;
let lastMouse = null;
let messageTimer = 0;
let damageTimer = 0;

const clamp = (n,a,b) => Math.max(a, Math.min(b,n));

function updateStatus() {
  const status = document.querySelector('#controller-status');
  const label = document.querySelector('#controller-status-text');
  status.classList.toggle('connected',connected);
  label.textContent = connected ? 'CELULAR CONECTADO' : 'MOUSE ATIVO';
  document.querySelector('#intro-connection').textContent = connected ? 'Celular conectado. Pronto para jogar.' : 'Aguardando celular...';
}

function connectRelay() {
  ws = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/relay`);
  ws.addEventListener('open',()=> ws.send(JSON.stringify({type:'join',role:'game',code:pairCode,token:roomToken})));
  ws.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.type==='error') {
      if(data.code==='ROOM_TAKEN') {
        pairCode=newPairCode();drawQr();
        ws.send(JSON.stringify({type:'join',role:'game',code:pairCode,token:roomToken}));
      } else document.querySelector('#intro-connection').textContent=data.message;
    }
    if(data.type==='peer') {
      connected=data.connected;
      inputReceiver.reset(); previousPhonePoint=null; mouseStroke.reset(); lastMouse=null;
      if(connected) manualSwing=null;
      updateStatus();
    }
    if(data.type==='motion') {
      const samples=inputReceiver.accept(data,performance.now());
      for(const sample of samples) {
        if(!running) { previousPhonePoint=null; continue; }
        const next={x:.5+sample.x*.44,y:.5-sample.y*.42};
        if(sample.active&&!sample.reset&&previousPhonePoint) {
          strikeSegment(previousPhonePoint,next,'phone:'+sample.stream+':'+sample.strokeId,sample.speed);
        }
        saberPoint.x=next.x; saberPoint.y=next.y;
        previousPhonePoint=next;
        document.querySelector('#controller-status-text').textContent=sample.calibrating?'CALIBRANDO CELULAR':'CELULAR CONECTADO';
      }
    }
  });
  ws.addEventListener('close',()=>{
    connected=false;inputReceiver.reset();previousPhonePoint=null;updateStatus();
    setTimeout(connectRelay,1800);
  });
}

async function drawQr() {
  try {
    const link=new URL('/controller.html',location.origin);
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {
      try {
        const result=await fetch('/api/network');
        if(result.ok) link.hostname=(await result.json()).address;
      } catch { /* The current origin remains usable for local testing. */ }
    }
    link.searchParams.set('code',pairCode);
    for(const id of ['#qr-intro','#qr-small']) await QRCode.toCanvas(document.querySelector(id),link.href,{margin:0,width:200,color:{dark:'#0b2930',light:'#eefcf4'}});
  } catch(error) { console.error('QR code:',error); }
  document.querySelectorAll('.pair-code-value').forEach(element=>element.textContent=pairCode);
}

function resize() {
  previousPhonePoint=null;lastMouse=null;mouseStroke.reset();
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  fxCanvas.width=Math.floor(innerWidth*devicePixelRatio);
  fxCanvas.height=Math.floor(innerHeight*devicePixelRatio);
  fxCanvas.style.width=`${innerWidth}px`;
  fxCanvas.style.height=`${innerHeight}px`;
  fx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener('resize',resize);
resize();

function beep(frequency,duration,type='sawtooth',volume=.05,fall=1) {
  if(!soundOn) return;
  try {
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended') audio.resume();
    const oscillator=audio.createOscillator();
    const gain=audio.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(frequency,audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*fall),audio.currentTime+duration);
    gain.gain.setValueAtTime(volume,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();oscillator.stop(audio.currentTime+duration);
  } catch { /* Audio is optional. */ }
}

function spawnCreature() {
  const type = wave>=3 && Math.random()<Math.min(.08+wave*.035,.27) ? 3 : Math.floor(Math.random()*3);
  const creature=makeCreature(type);
  const angle=player.yaw+(Math.random()-.5)*1.35;
  const distance=18+Math.random()*10;
  creature.position.set(player.x-Math.sin(angle)*distance+(Math.random()-.5)*7,0,player.z-Math.cos(angle)*distance);
  creature.userData.seed=Math.random()*10;
  creature.userData.attackAt=0;
  scene.add(creature);
  creatures.push(creature);
}

function projectCreature(creature) {
  creature.updateWorldMatrix(true,true);
  enemyCenter.set(0,.86,0);
  creature.userData.model.localToWorld(enemyCenter);
  const distance=enemyCenter.distanceTo(camera.position);
  const size=creature.scale.x*creature.userData.model.scale.x;
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(.95*size).add(enemyCenter).project(camera);
  const top=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(.49*size).add(enemyCenter).project(camera);
  enemyCenter.project(camera);
  return {x:(enemyCenter.x+1)/2,y:(1-enemyCenter.y)/2,
    radiusX:Math.abs(right.x-enemyCenter.x)/2+5/innerWidth,
    radiusY:Math.abs(top.y-enemyCenter.y)/2+5/innerHeight,
    distance,visible:enemyCenter.z<1&&enemyCenter.z>-1};
}

function hitCreature(creature) {
  creature.userData.health--;
  creature.userData.hitAt=performance.now();
  sparks.push({x:creature.position.x,y:1.1,z:creature.position.z,life:.55,color:'#9ffaff'});
  beep(380,.12,'triangle',.06,2.2);
  if(creature.userData.health>0) return;
  score++;
  document.querySelector('#score').textContent=String(score).padStart(2,'0');
  scene.remove(creature);
  creatures.splice(creatures.indexOf(creature),1);
  message('CORTE PERFEITO');
  if(ws?.readyState===1) ws.send(JSON.stringify({type:'feedback',event:'hit'}));
  beep(90,.22,'sawtooth',.07,.45);
  if(score%12===0) { player.health=Math.min(100,player.health+15);updateHealth();message('+15 INTEGRIDADE'); }
}

function strikeSegment(start,end,key,speed=1) {
  if(!running||Math.hypot(end.x-start.x,end.y-start.y)<.001) return;
  if(key!==activeStrikeKey) {
    activeStrikeKey=key;
    strikeHits.clear();
    beep(180,.16,'sawtooth',.028,2.7);
  }
  slashTrails.push({a:{...start},b:{...end},life:.16,width:Math.min(7,2+speed)});
  camera.updateMatrixWorld();
  for(const creature of [...creatures]) {
    if(strikeHits.has(creature)) continue;
    const projected=projectCreature(creature);
    if(projected.visible&&projected.distance<8.3&&segmentIntersectsEllipse(start,end,projected)) {
      strikeHits.add(creature);
      hitCreature(creature);
    }
  }
  if(strikeHits.size>1) message(`COMBO X${strikeHits.size}`);
}

function startManualSwing() {
  const now=performance.now();
  if(!running||connected||now-lastManualSwing<240) return;
  lastManualSwing=now;
  const start={x:clamp(saberPoint.x-.18,.03,.97),y:clamp(saberPoint.y+.1,.04,.95)};
  const end={x:clamp(saberPoint.x+.18,.03,.97),y:clamp(saberPoint.y-.1,.04,.95)};
  manualSwing={start,end,previous:start,elapsed:0,key:'manual:'+now};
  mouseStroke.reset();lastMouse=null;
}

function updateManualSwing(dt) {
  if(!manualSwing) return;
  manualSwing.elapsed+=dt;
  const t=Math.min(1,manualSwing.elapsed/.16);
  const next={x:manualSwing.start.x+(manualSwing.end.x-manualSwing.start.x)*t,y:manualSwing.start.y+(manualSwing.end.y-manualSwing.start.y)*t};
  strikeSegment(manualSwing.previous,next,manualSwing.key,2);
  saberPoint.x=next.x;saberPoint.y=next.y;
  manualSwing.previous=next;
  if(t===1) manualSwing=null;
}

function message(text) {
  const element=document.querySelector('#slash-readout');
  element.textContent=text;element.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer=setTimeout(()=>element.classList.remove('show'),900);
}

function updateHealth() {
  const value=Math.max(0,Math.ceil(player.health));
  document.querySelector('#health-value').textContent=`${value}%`;
  document.querySelector('#health-fill').style.width=`${value}%`;
}

function damage(amount) {
  player.health=Math.max(0,player.health-amount);
  updateHealth();
  beep(95,.28,'sawtooth',.07,.55);
  document.querySelector('#damage-flash').classList.add('show');
  clearTimeout(damageTimer);
  damageTimer=setTimeout(()=>document.querySelector('#damage-flash').classList.remove('show'),170);
  if(ws?.readyState===1) ws.send(JSON.stringify({type:'feedback',event:'damage'}));
  if(player.health<=0) endGame();
}

function endGame() {
  running=false;
  document.querySelector('#final-score').textContent=String(score).padStart(2,'0');
  document.querySelector('#game-over').classList.remove('hidden');
}

function restart() {
  for(const creature of creatures) scene.remove(creature);
  creatures.length=0;
  sparks.length=0;
  slashTrails.length=0;
  strikeHits.clear();activeStrikeKey=null;manualSwing=null;
  previousPhonePoint=null;lastMouse=null;mouseStroke.reset();
  player.x=0;player.z=10;player.yaw=0;player.pitch=-.035;player.health=100;
  score=0;wave=1;waveElapsed=0;spawnTimer=.5;
  document.querySelector('#score').textContent='00';
  document.querySelector('#wave').textContent='01';
  updateHealth();
  document.querySelector('#intro').classList.add('hidden');
  document.querySelector('#game-over').classList.add('hidden');
  running=true;
  beep(210,.33,'sine',.06,2);
}

function updatePlayer(dt,time) {
  const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
  const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const turn=(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0);
  player.yaw+=turn*dt*1.6;
  if(f||s) {
    const norm=1/Math.max(1,Math.hypot(f,s));
    const speed=(keys.has('ShiftLeft')?7:4.5)*dt*norm;
    player.x+=(-Math.sin(player.yaw)*f+Math.cos(player.yaw)*s)*speed;
    player.z+=(-Math.cos(player.yaw)*f-Math.sin(player.yaw)*s)*speed;
    player.x=clamp(player.x,-45,45);
    player.z=clamp(player.z,-17,48);
  }
  camera.position.set(player.x,1.72+(f||s?Math.sin(time*10)*.035:Math.sin(time*1.2)*.009),player.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=player.yaw;
  camera.rotation.x=player.pitch;
}

function updateCreatures(dt,time) {
  for(const creature of [...creatures]) {
    const data=creature.userData;
    const dx=player.x-creature.position.x;
    const dz=player.z-creature.position.z;
    const distance=Math.hypot(dx,dz);
    const speed=(.8+wave*.12)*data.speed;
    if(distance>1.7) {
      creature.position.x+=dx/distance*speed*dt;
      creature.position.z+=dz/distance*speed*dt;
    } else if(time-data.attackAt>1.25) {
      data.attackAt=time;
      damage(data.type===3?18:8);
    }
    creature.rotation.y=Math.atan2(dx,dz);
    data.model.position.y=Math.sin(time*5+data.seed)*.075;
    data.model.rotation.z=Math.sin(time*3+data.seed)*.045;
    if(performance.now()-data.hitAt<160) data.model.scale.setScalar(1.08);
    else data.model.scale.setScalar(1);
  }
}

function updateSaber() {
  const pose=saberPose(saberPoint,camera.fov,camera.aspect);
  saber.position.copy(pose.position);
  saber.quaternion.copy(pose.rotation);
  aimElement.style.left=saberPoint.x*100+'%';
  aimElement.style.top=saberPoint.y*100+'%';
}

function drawFx(dt) {
  fx.clearRect(0,0,innerWidth,innerHeight);
  fx.save();
  fx.globalCompositeOperation='lighter';
  for(let i=slashTrails.length-1;i>=0;i--){
    const trail=slashTrails[i];
    trail.life-=dt;
    if(trail.life<=0){slashTrails.splice(i,1);continue;}
    const alpha=trail.life/.16;
    const x1=trail.a.x*innerWidth,y1=trail.a.y*innerHeight,x2=trail.b.x*innerWidth,y2=trail.b.y*innerHeight;
    fx.strokeStyle=`rgba(58,215,255,${alpha*.38})`;
    fx.lineWidth=trail.width*5;
    fx.shadowBlur=25;fx.shadowColor='#2ce8ff';
    fx.beginPath();fx.moveTo(x1,y1);fx.lineTo(x2,y2);fx.stroke();
    fx.strokeStyle=`rgba(230,255,255,${alpha*.95})`;
    fx.lineWidth=trail.width*.55;
    fx.beginPath();fx.moveTo(x1,y1);fx.lineTo(x2,y2);fx.stroke();
  }
  for(let i=sparks.length-1;i>=0;i--){
    const spark=sparks[i];spark.life-=dt;
    if(spark.life<=0){sparks.splice(i,1);continue;}
    temp.set(spark.x,spark.y,spark.z).project(camera);
    const x=(temp.x+1)*innerWidth/2,y=(1-temp.y)*innerHeight/2;
    const alpha=spark.life/.55;
    for(let j=0;j<11;j++){
      const a=j*2.399+spark.life*2;
      const length=(1-alpha)*75+12;
      fx.strokeStyle=`rgba(${j%3?'79,226,255':'255,236,183'},${alpha*.75})`;
      fx.lineWidth=1.5;fx.shadowBlur=8;
      fx.beginPath();fx.moveTo(x+Math.cos(a)*length*.35,y+Math.sin(a)*length*.35);fx.lineTo(x+Math.cos(a)*length,y+Math.sin(a)*length);fx.stroke();
    }
  }
  fx.restore();
}

function loop() {
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05);
  const time=clock.elapsedTime;
  if(running) {
    waveElapsed+=dt;
    if(waveElapsed>32){waveElapsed=0;wave++;document.querySelector('#wave').textContent=String(wave).padStart(2,'0');message(`ONDA ${String(wave).padStart(2,'0')}`);}
    spawnTimer-=dt;
    if(spawnTimer<=0&&creatures.length<Math.min(6+wave*2,20)){spawnCreature();spawnTimer=Math.max(1,3.2-wave*.18)+Math.random()*.7;}
    updatePlayer(dt,time);
    updateCreatures(dt,time);
  } else {
    camera.position.set(player.x,1.72+Math.sin(time*1.3)*.012,player.z);
    camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
  }
  if(running) updateManualSwing(dt);
  updateSaber();
  drawFx(dt);
  renderer.render(scene,camera);
}

window.addEventListener('keydown',event=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  keys.add(event.code);
  if(event.code==='Space'&&!event.repeat) startManualSwing();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();mouseStroke.reset();lastMouse=null;});
renderer.domElement.addEventListener('mousemove',event=>{
  if(!running||connected||manualSwing) return;
  if(event.buttons===2){player.yaw-=event.movementX*.004;player.pitch=clamp(player.pitch-event.movementY*.004,-.8,.8);mouseStroke.reset();lastMouse=null;return;}
  const next={x:clamp(event.clientX/innerWidth,.03,.97),y:clamp(event.clientY/innerHeight,.05,.92)};
  const now=performance.now();
  const stroke=mouseStroke.update({x:next.x*2-1,y:next.y*2-1},now);
  if(lastMouse&&stroke.active&&!stroke.reset) strikeSegment(lastMouse,next,'mouse:'+stroke.strokeId,stroke.speed);
  saberPoint.x=next.x;saberPoint.y=next.y;
  lastMouse={...next,time:now};
});
renderer.domElement.addEventListener('mousedown',event=>{
  if(event.button===0&&running) startManualSwing();
});
renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
document.querySelector('#start-button').addEventListener('click',restart);
document.querySelector('#restart-button').addEventListener('click',restart);
document.querySelector('#pair-button').addEventListener('click',()=>document.querySelector('#pair-panel').classList.toggle('open'));
document.querySelector('#sound-button').addEventListener('click',event=>{soundOn=!soundOn;event.currentTarget.style.opacity=soundOn?'1':'.45';});

drawQr();connectRelay();updateStatus();loop();
