import QRCode from 'qrcode';
import { createWorld } from './world.js';
import { createRun, advanceRun, collectData, difficulty, activateSkill, SKILLS, RunnerInput } from './rules.js';
import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
<div id="world"></div><div class="vignette"></div><div id="damage-flash"></div>
<header class="game-header"><a href="/corredor.html" class="wordmark">FLUXO<span>▰</span></a><div class="header-meta">CORREDOR DE DADOS <i></i> SETOR 01</div><nav><button id="sound" class="round-button" aria-label="Desativar som">♫</button><button id="pair" class="round-button" aria-label="Conectar celular">⌁</button><button id="pause" class="round-button" aria-label="Pausar corrida">Ⅱ</button></nav></header>
<div class="game-hud"><div class="scoreboard"><span class="eyebrow">DADOS COLETADOS</span><strong id="score">00000</strong><div class="run-stats"><span><b id="distance">0</b> M</span><span><b id="speed">12</b> M/S</span><span id="timer">00:00</span></div></div>
<div class="battery-panel"><div><span class="eyebrow">BATERIA</span><strong><span id="battery">100</span><small>%</small></strong></div><div class="battery-icon"><i id="battery-fill"></i></div><small id="battery-note">MANTENHA A CORRIDA VIVA</small></div>
<div id="next-data" class="next-data"><span>PRÓXIMO DADO</span><b>PREPARE-SE</b><i><em></em></i></div>
<div id="collect-mode" class="collect-mode"><span class="mode-symbol">↓</span><div><b id="mode-text">COLETA FECHADA</b><small id="mode-note">Tela para baixo · dados passam</small></div></div>
<div id="event-toast" class="event-toast" role="status"></div>
<div class="bottom-bar"><div class="skills"><button id="shield" class="skill-button" disabled><span class="skill-key">1</span><div><b>◈ ESCUDO</b><span id="shield-detail">25 ENERGIA · 5S</span></div></button><button id="pulse" class="skill-button" disabled><span class="skill-key">2</span><div><b>⌁ PULSO</b><span id="pulse-detail">40 ENERGIA · LIMPAR</span></div></button><div class="energy"><span>ENERGIA AZUL <b id="energy">0/100</b></span><i><em id="energy-fill"></em></i></div></div><div class="input-status"><span id="connection-dot" class="dot"></span><span id="connection">TECLADO DISPONÍVEL</span><small id="keyboard-hint">ESPAÇO alterna a tela · 1 / 2 habilidades</small></div></div></div>
<section class="overlay intro" id="intro"><div class="intro-layout"><div class="intro-main"><div class="eyebrow"><span class="tiny-line"></span> UM JOGO SOBRE ESCOLHAS</div><h1>NO MEIO<br/>DO <em>FLUXO.</em></h1><p class="lead">Nem todo dado merece entrar.<br/>Corra. Vire o celular. Escolha o que absorver.</p><div class="rules-mini"><div><span class="rule-icon blue">+</span><p><b>AZUL É POTÊNCIA.</b><small>Pontos, recarga e energia para habilidades.</small></p></div><div><span class="rule-icon red">!</span><p><b>VERMELHO É RUÍDO.</b><small>Feche a coleta antes que ele drene sua bateria.</small></p></div></div><button id="start" class="button primary">INICIAR CORRIDA <span>↗</span></button><button id="start-keyboard" class="text-button">EXPERIMENTAR COM O TECLADO <span>→</span></button><p class="fine-print">A corrida consome bateria lentamente. A velocidade e a dificuldade aumentam com o tempo.</p></div><aside class="pair-card"><div class="card-top"><span>01 / CONECTE</span><i class="dot blue"></i></div><h2>O CONTROLE<br/>ESTÁ NA SUA MÃO.</h2><div class="qr-frame"><canvas id="qr-intro"></canvas></div><div class="code-display"><span>CÓDIGO DA PARTIDA</span><b class="pair-code"></b></div><div class="phone-rule"><span>↑</span><p><b>TELA PARA CIMA</b><small>Coleta tudo que chegar.</small></p></div><div class="phone-rule"><span>↓</span><p><b>TELA PARA BAIXO</b><small>Deixa tudo passar.</small></p></div><p id="pair-state" role="status">Leia o QR code com o celular.</p><a href="/" class="back-link">Conheça também Maré de Luz ↗</a></aside></div><div class="intro-footer"><span>PRIMEIRA PESSOA / MOVIMENTO REAL</span><span>AZUL + &nbsp; VERMELHO !</span></div></section>
<section id="pause-overlay" class="overlay hidden"><div class="result-card"><span class="eyebrow">RESPIRA. O FLUXO ESPERA.</span><h2>CORRIDA<br/><em>PAUSADA.</em></h2><p id="pause-reason">Retome quando estiver pronto.</p><button id="resume" class="button primary">CONTINUAR <span>→</span></button><button id="use-keyboard" class="text-button">CONTINUAR COM TECLADO</button></div></section>
<section id="game-over" class="overlay hidden"><div class="result-card"><span class="eyebrow">SINAL PERDIDO / BATERIA ESGOTADA</span><h2>FIM DO<br/><em>FLUXO.</em></h2><div class="result-score"><span>DADOS COLETADOS</span><strong id="final-score">0</strong></div><div class="results"><span><b id="final-distance">0</b> METROS</span><span><b id="final-blue">0</b> AZUIS</span><span><b id="final-red">0</b> EVITADOS</span></div><p id="record"></p><button id="restart" class="button primary">CORRER DE NOVO <span>↗</span></button><button id="menu" class="text-button">VOLTAR AO INÍCIO</button></div></section>
<section class="pair-modal hidden" id="pair-modal"><button class="modal-close" id="close-pair" aria-label="Fechar conexão">×</button><span class="eyebrow">SEU CELULAR É O CONTROLE</span><h2>CONECTE AO FLUXO.</h2><div class="qr-frame"><canvas id="qr-small"></canvas></div><b class="pair-code"></b><p>Abra o QR code no celular, conecte e permita o movimento.</p></section>`;

const $ = id => document.getElementById(id);
let world;
try { world = createWorld($('world')); }
catch { $('pair-state').textContent = 'O navegador não conseguiu iniciar o 3D. Ative a aceleração gráfica e recarregue.'; $('start').disabled = true; $('start-keyboard').disabled = true; throw new Error('WebGL unavailable'); }
world.resize(); window.addEventListener('resize', () => world.resize());
let state = createRun();
const input = new RunnerInput();
let socket, connected = false, usePhone = false, keyboardUp = false;
let code = newCode();
const token = [...crypto.getRandomValues(new Uint8Array(24))].map(byte => byte.toString(16).padStart(2, '0')).join('');
let items = [], serial = 0, spawnIn = .2, lastFrame = performance.now(), lastStateSent = 0;
let sound = true, audio, toastTimer, lastCollecting = false;
let best = 0; try { best = Number(localStorage.getItem('fluxo-best')) || 0; } catch { /* Storage is optional. */ }
function newCode() { return String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000); }
function send(data) { if (socket?.readyState === 1 && socket.bufferedAmount < 32768) socket.send(JSON.stringify(data)); }
function connectRelay() {
  const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`);
  socket = connection;
  connection.addEventListener('open', () => send({ type: 'join', role: 'game', mode: 'runner', code, token }));
  connection.addEventListener('message', event => {
    if (socket !== connection) return;
    const data = JSON.parse(event.data);
    if (data.type === 'error') {
      if (data.code === 'ROOM_TAKEN') { code = newCode(); drawQr(); send({ type: 'join', role: 'game', mode: 'runner', code, token }); }
      else $('pair-state').textContent = data.message;
    }
    if (data.type === 'peer') {
      connected = data.connected; input.reset();
      $('connection-dot').classList.toggle('blue', connected);
      $('connection').textContent = connected ? 'CELULAR CONECTADO' : 'TECLADO DISPONÍVEL';
      $('pair-state').textContent = connected ? 'Conectado. Vire a tela para cima para testar.' : 'Leia o QR code com o celular.';
      if (!connected && usePhone && state.phase === 'running') pause('O celular desconectou. Reconecte para continuar.');
      sendState();
    }
    if (data.type === 'runner-input') input.accept(data, performance.now());
    if (data.type === 'skill' && usePhone && input.isFresh(performance.now())) skill(data.skill);
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    connected = false; input.reset();
    $('connection').textContent = 'RECONECTANDO'; $('connection-dot').classList.remove('blue');
    if (usePhone && state.phase === 'running') pause('A conexão caiu. A corrida está protegida até você voltar.');
    setTimeout(connectRelay, 1400);
  });
  connection.addEventListener('error', () => { $('pair-state').textContent = 'Conexão indisponível. Você pode jogar com o teclado.'; });
}
async function drawQr() {
  const link = new URL('/corredor-controle.html', location.origin);
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    try { const response = await fetch('/api/network'); if (response.ok) link.hostname = (await response.json()).address; } catch { /* Keep local origin. */ }
  }
  link.searchParams.set('code', code);
  document.querySelectorAll('.pair-code').forEach(element => element.textContent = code);
  for (const id of ['qr-intro', 'qr-small']) await QRCode.toCanvas($(id), link.href, { margin: 0, width: 180, color: { dark: '#102d3b', light: '#f1f2df' } });
}
function tone(frequency, duration = .1, type = 'sine', volume = .04) {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume(); const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .6, audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch { /* Sound is optional. */ }
}
function toast(text, danger = false) {
  $('event-toast').textContent = text; $('event-toast').classList.toggle('danger', danger); $('event-toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('event-toast').classList.remove('show'), 1000);
}
function sendState() { send({ type: 'runner-state', phase: state.phase, battery: state.battery, energy: state.energy, shield: state.shield, pulse: state.pulse, score: state.score }); }
function start(phone) {
  if (phone && (!connected || !input.isFresh(performance.now()))) {
    $('pair-state').textContent = connected ? 'Ative os sensores ou o toque no celular antes de iniciar.' : 'Conecte o celular pelo QR code ou experimente com o teclado.';
    $('pair-modal').classList.remove('hidden'); return;
  }
  for (const item of items) world.removePickup(item);
  items = []; serial = 0; spawnIn = .2; keyboardUp = false; usePhone = phone;
  state = createRun(); state.phase = 'running'; lastFrame = performance.now();
  for (const id of ['intro', 'game-over', 'pause-overlay', 'pair-modal']) $(id).classList.add('hidden');
  $('keyboard-hint').textContent = usePhone ? '↑ coleta · ↓ deixa passar · habilidades no celular' : 'ESPAÇO alterna a tela · 1 / 2 habilidades';
  $('connection').textContent = usePhone ? 'CELULAR CONECTADO' : 'CONTROLE POR TECLADO';
  toast(usePhone ? 'VIRE PARA CIMA PARA COLETAR' : 'ESPAÇO ABRE E FECHA A COLETA'); tone(380, .15); sendState();
}
function pause(reason = 'Retome quando estiver pronto.') {
  if (state.phase !== 'running') return;
  state.phase = 'paused'; $('pause-reason').textContent = reason; $('pause-overlay').classList.remove('hidden'); sendState();
}
function resume(keyboard = false) {
  if (state.phase !== 'paused') return;
  if (keyboard) { usePhone = false; keyboardUp = false; $('connection').textContent = 'CONTROLE POR TECLADO'; $('keyboard-hint').textContent = 'ESPAÇO alterna a tela · 1 / 2 habilidades'; }
  if (usePhone && (!connected || !input.isFresh(performance.now()))) { $('pause-reason').textContent = 'Conecte o celular e ative os sensores, ou continue com o teclado.'; return; }
  state.phase = 'running'; lastFrame = performance.now(); $('pause-overlay').classList.add('hidden'); sendState();
}
function end() {
  state.phase = 'over'; $('game-over').classList.remove('hidden');
  $('final-score').textContent = state.score.toLocaleString('pt-BR'); $('final-distance').textContent = Math.floor(state.distance);
  $('final-blue').textContent = state.blue; $('final-red').textContent = state.avoided;
  const newBest = state.score > best; best = Math.max(best, state.score);
  try { localStorage.setItem('fluxo-best', String(best)); } catch { /* Storage is optional. */ }
  $('record').textContent = newBest ? 'NOVO RECORDE PESSOAL' : `SEU RECORDE: ${best.toLocaleString('pt-BR')}`;
  tone(65, .6, 'triangle', .08); sendState();
}
function skill(name) {
  if (!activateSkill(state, name)) return;
  if (name === 'pulse') {
    let removed = 0;
    items = items.filter(item => { if (item.kind !== 'red') return true; world.removePickup(item); removed++; return false; });
    state.avoided += removed; toast(`PULSO · ${removed} RUÍDOS LIMPOS`); tone(155, .6, 'triangle', .08);
  } else { toast('ESCUDO ATIVO · 5 SEGUNDOS'); tone(550, .25); }
  sendState();
}
function handleCollect(item, collecting) {
  const result = collectData(state, item.kind, collecting);
  if (result?.type === 'blue') { toast(`+${result.points} DADOS  /  +10 ENERGIA`); tone(730 + state.combo * 12); send({ type: 'feedback', event: 'hit' }); }
  if (result?.type === 'damage') { toast('RUÍDO ABSORVIDO · −22% BATERIA', true); tone(100, .24, 'sawtooth', .04); $('damage-flash').classList.remove('flash'); void $('damage-flash').offsetWidth; $('damage-flash').classList.add('flash'); send({ type: 'feedback', event: 'damage' }); }
  if (result?.type === 'blocked') { toast('ESCUDO BLOQUEOU O RUÍDO'); tone(330); }
}
function updateHud(now) {
  const collecting = usePhone ? input.isCollecting(now) : keyboardUp;
  $('score').textContent = String(state.score).padStart(5, '0'); $('distance').textContent = Math.floor(state.distance);
  $('speed').textContent = difficulty(state.elapsed).speed.toFixed(1); $('timer').textContent = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`;
  $('battery').textContent = Math.ceil(state.battery); $('battery-fill').style.width = `${state.battery}%`; $('battery-fill').classList.toggle('low', state.battery < 25);
  $('battery-note').textContent = state.battery < 25 ? 'BATERIA CRÍTICA · BUSQUE AZUIS' : 'MANTENHA A CORRIDA VIVA';
  $('energy').textContent = `${state.energy}/100`; $('energy-fill').style.width = `${state.energy}%`;
  for (const name of ['shield', 'pulse']) $(name).disabled = state.phase !== 'running' || state.energy < SKILLS[name].cost || state[name] > 0;
  $('shield-detail').textContent = state.shield > 0 ? `ATIVO · ${state.shield.toFixed(1)}S` : '25 ENERGIA · 5S';
  $('collect-mode').classList.toggle('active', collecting); $('mode-text').textContent = collecting ? 'COLETA ABERTA' : 'COLETA FECHADA';
  $('mode-note').textContent = collecting ? 'Tela para cima · absorvendo dados' : 'Tela para baixo · dados passam';
  document.querySelector('.mode-symbol').textContent = collecting ? '↑' : '↓';
  const next = items.reduce((closest, item) => !closest || item.object.position.z > closest.object.position.z ? item : closest, null);
  $('next-data').classList.toggle('red', next?.kind === 'red');
  $('next-data').querySelector('b').textContent = next ? next.kind === 'red' ? '! RUÍDO · FECHE A TELA' : '+ AZUL · ABRA A TELA' : 'CAMINHO LIVRE';
  $('next-data').querySelector('em').style.width = next ? `${Math.max(0, (next.object.position.z + 65) / 67 * 100)}%` : '0%';
  if (collecting !== lastCollecting && state.phase === 'running') tone(collecting ? 340 : 180, .07, 'sine', .025);
  lastCollecting = collecting;
  return collecting;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
  if (state.phase === 'running' && usePhone && !input.isFresh(now)) pause('O celular parou de enviar movimentos. Volte à página do controle e reconecte.');
  const wasRunning = state.phase === 'running';
  advanceRun(state, dt);
  const collecting = updateHud(now);
  if (state.phase === 'running') {
    const level = difficulty(state.elapsed);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const kind = serial < 3 ? 'blue' : serial === 3 ? 'red' : Math.random() < level.redChance ? 'red' : 'blue';
      items.push(world.createPickup(kind, serial++)); spawnIn += level.interval * (.84 + Math.random() * .3);
    }
    for (const item of items) { item.object.position.z += level.speed * dt; item.frame.rotation.z += dt * .7; item.frame.rotation.y += dt * .4; item.object.position.y = 1.72 + Math.sin(now * .002 + item.serial) * .075; }
    items = items.filter(item => { if (item.object.position.z < 2) return true; handleCollect(item, collecting); world.removePickup(item); return false; });
  }
  if (wasRunning && state.phase === 'over') end();
  const pose = usePhone && input.isFresh(now) ? input.pose : { beta: keyboardUp ? 12 : 175, gamma: 0, alpha: 0 };
  world.update(dt, state, pose, collecting, now / 1000);
  if (now - lastStateSent > 200) { sendState(); lastStateSent = now; }
}
$('start').onclick = () => start(true); $('start-keyboard').onclick = () => start(false);
$('restart').onclick = () => start(usePhone); $('menu').onclick = () => { state = createRun(); $('game-over').classList.add('hidden'); $('intro').classList.remove('hidden'); sendState(); };
$('pause').onclick = () => state.phase === 'paused' ? resume() : pause(); $('resume').onclick = () => resume(); $('use-keyboard').onclick = () => resume(true);
$('shield').onclick = () => skill('shield'); $('pulse').onclick = () => skill('pulse');
$('pair').onclick = () => { pause('Conecte o controle. Depois, continue a corrida.'); $('pair-modal').classList.toggle('hidden'); }; $('close-pair').onclick = () => $('pair-modal').classList.add('hidden');
$('sound').onclick = () => { sound = !sound; $('sound').textContent = sound ? '♫' : '♪'; $('sound').setAttribute('aria-label', sound ? 'Desativar som' : 'Ativar som'); };
window.addEventListener('keydown', event => {
  if (event.repeat || event.target instanceof HTMLInputElement) return;
  if (event.code === 'Space' && state.phase === 'running' && !usePhone) { event.preventDefault(); keyboardUp = !keyboardUp; }
  if (event.code === 'Digit1') skill('shield'); if (event.code === 'Digit2') skill('pulse');
  if (event.code === 'Escape') state.phase === 'paused' ? resume() : pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('A corrida foi pausada enquanto você estava em outra aba.'); });
window.addEventListener('beforeunload', () => socket?.close());
drawQr().catch(() => { $('pair-state').textContent = 'Use o código na página /corredor-controle.html.'; }); connectRelay(); requestAnimationFrame(frame);
