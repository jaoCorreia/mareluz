import { collectionGate, screenFacingUp, sensorAvailable, SKILLS } from './rules.js';
import './style.css';
const $ = id => document.getElementById(id);
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) $('code').value = urlCode.replace(/\D/g, '').slice(0, 6);
let socket, paired = false, connectWanted = false, code = '', reconnectTimer;
let hadPaired = false, retryCount = 0;
let manual = false, manualUp = false, sensorsStarted = false, sensorAttempt = 0, readings = 0;
let latest = { alpha: 0, beta: 175, gamma: 0, available: false };
let alphaOrigin = null, collecting = false, wakeLock;
let lastReading = -Infinity;
let stream = crypto.randomUUID(), seq = 0;
let state = { phase: 'ready', battery: 100, energy: 0, shield: 0, pulse: 0 };
const wrapAngle = angle => ((angle + 540) % 360) - 180;
function setLink(text, active = false) { $('link-state').textContent = text; $('link-state').classList.toggle('on', active); }
function resetStream() { stream = crypto.randomUUID(); seq = 0; }
function send(data) { if (socket?.readyState === 1 && socket.bufferedAmount < 4096) socket.send(JSON.stringify(data)); }
function poseUi() {
  collecting = latest.available && collectionGate(screenFacingUp(latest.beta, latest.gamma), collecting);
  $('orientation-card').classList.toggle('active', collecting);
  $('pose-label').textContent = !latest.available ? 'AGUARDANDO SENSOR' : collecting ? 'COLETA ABERTA' : 'COLETA FECHADA';
  $('phone-model').style.transform = `rotateX(${collecting ? 30 : 160}deg) rotateZ(${latest.gamma * .35}deg)`;
  $('flip').textContent = manualUp ? 'TELA PARA CIMA · TOQUE PARA FECHAR' : 'TELA PARA BAIXO · TOQUE PARA COLETAR';
}
function statusUi() {
  $('phone-battery').innerHTML = `${Math.ceil(state.battery)}<small>%</small>`;
  $('phone-energy').innerHTML = `${state.energy}<small>/100</small>`;
  for (const skill of ['shield', 'pulse']) $(skill).disabled = !paired || state.phase !== 'running' || state.energy < SKILLS[skill].cost || state[skill] > 0;
  $('run-note').textContent = { ready: 'Inicie a corrida no computador.', running: 'Vire o celular e escolha o que coletar.', paused: 'Corrida pausada. Continue no computador.', over: `Bateria esgotada. ${state.score || 0} pontos! Reinicie no computador.` }[state.phase];
}
function onOrientation(event) {
  if (manual || document.hidden || ![event.beta, event.gamma].every(Number.isFinite)) return;
  const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
  alphaOrigin ??= alpha;
  latest = { alpha: wrapAngle(alpha - alphaOrigin), beta: event.beta, gamma: event.gamma, available: true };
  lastReading = performance.now();
  readings++; poseUi();
  $('sensor-note').textContent = 'Tela para cima absorve tudo. Vire para baixo para evitar os vermelhos.';
}
async function enableSensors() {
  const attempt = ++sensorAttempt;
  if (!window.isSecureContext) { $('sensor-note').textContent = 'Sensores precisam de HTTPS. O controle por toque está disponível.'; return false; }
  try {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Este navegador não oferece sensores de orientação.');
    if (!sensorsStarted) {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const granted = await DeviceOrientationEvent.requestPermission();
        if (attempt !== sensorAttempt) return false;
        if (granted !== 'granted') throw new Error('Sem acesso ao movimento. Use o toque ou permita os sensores no navegador.');
      }
      window.addEventListener('deviceorientation', onOrientation); sensorsStarted = true;
    }
    if (attempt !== sensorAttempt) return false;
    alphaOrigin = null; latest.available = false; resetStream();
    $('sensor-note').textContent = 'Vire a tela do celular para cima para testar a coleta.';
    const before = readings;
    setTimeout(() => { if (!manual && readings === before) { $('sensor-note').textContent = 'Nenhuma leitura recebida. Ative as permissões ou use o toque abaixo.'; $('manual-controls').classList.remove('hidden'); } }, 3500);
    return true;
  } catch (error) { $('sensor-note').textContent = error.message; return false; }
}
function enableManual() {
  sensorAttempt++; manual = true; manualUp = false;
  latest = { alpha: 0, beta: 175, gamma: 0, available: true }; resetStream();
  $('manual-controls').classList.remove('hidden'); $('manual-mode').textContent = 'USAR GIROSCÓPIO';
  $('sensor-note').textContent = 'Toque no botão abaixo para alternar entre coletar e deixar passar.'; poseUi();
}
async function keepAwake() {
  try { if ('wakeLock' in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* Browser may decline. */ }
}
function connectSocket() {
  clearTimeout(reconnectTimer);
  if (!connectWanted) return;
  const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`);
  socket = connection; setLink('CONECTANDO');
  connection.addEventListener('open', () => { if (socket === connection) send({ type: 'join', role: 'controller', mode: 'runner', code }); });
  connection.addEventListener('message', event => {
    if (socket !== connection) return;
    const data = JSON.parse(event.data);
    if (data.type === 'joined' || data.type === 'peer') {
      paired = data.type === 'joined' || data.connected;
      if (paired) { hadPaired = true; retryCount = 0; }
      setLink(paired ? 'CONECTADO' : 'AGUARDANDO', paired); statusUi();
    }
    if (data.type === 'runner-state') { state = data; statusUi(); }
    if (data.type === 'feedback') navigator.vibrate?.(data.event === 'hit' ? 25 : [90, 35, 70]);
    if (data.type === 'error') {
      paired = false; statusUi();
      if (data.code === 'ROOM_NOT_FOUND' && hadPaired && connectWanted) {
        setLink('AGUARDANDO O JOGO'); connection.close();
      } else { setLink(data.message); connectWanted = false; }
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    paired = false; statusUi(); setLink(connectWanted ? 'RECONECTANDO' : 'DESCONECTADO');
    if (connectWanted) reconnectTimer = setTimeout(connectSocket, Math.min(8000, 1600 * 2 ** retryCount++));
  });
  connection.addEventListener('error', () => { if (socket === connection) setLink('CONEXÃO INDISPONÍVEL'); });
}
$('connect').onclick = async () => {
  if ($('connect').disabled) return;
  code = $('code').value.replace(/\D/g, '');
  if (code.length !== 6) { setLink('DIGITE 6 DÍGITOS'); return; }
  $('connect').disabled = true;
  try {
    if (!manual && !(await enableSensors())) enableManual();
    const old = socket; socket = null; old?.close();
    connectWanted = true; paired = false; hadPaired = false; retryCount = 0; resetStream(); connectSocket(); keepAwake();
  } finally { $('connect').disabled = false; }
};
$('manual-mode').onclick = async () => {
  if (!manual) { enableManual(); return; }
  manual = false;
  if (await enableSensors()) { $('manual-controls').classList.add('hidden'); $('manual-mode').textContent = 'USAR CONTROLE POR TOQUE'; }
  else enableManual();
};
$('flip').onclick = () => {
  if (!manual) enableManual();
  manualUp = !manualUp; latest = { alpha: 0, beta: manualUp ? 12 : 175, gamma: 0, available: true }; poseUi();
};
for (const skill of ['shield', 'pulse']) $(skill).onclick = () => { if (!$(skill).disabled) send({ type: 'skill', skill }); };
setInterval(() => {
  const now = performance.now();
  const available = sensorAvailable({ manual, available: latest.available, hidden: document.hidden, lastReading }, now);
  if (paired) send({ type: 'runner-input', version: 1, stream, seq: seq++, time: now, ...latest, available });
  if (!available && !manual && latest.available) {
    $('pose-label').textContent = 'SENSOR INTERROMPIDO';
    $('orientation-card').classList.remove('active');
    $('sensor-note').textContent = 'Sem leituras recentes. Confira os sensores ou use o controle por toque.';
  }
}, 33);
document.addEventListener('visibilitychange', () => {
  latest.available = manual && !document.hidden;
  if (document.hidden) send({ type: 'runner-input', version: 1, stream, seq: seq++, time: performance.now(), ...latest, available: false });
  else { alphaOrigin = null; resetStream(); if (paired) keepAwake(); }
  poseUi();
});
window.addEventListener('beforeunload', () => { connectWanted = false; socket?.close(); wakeLock?.release(); });
statusUi(); poseUi();
