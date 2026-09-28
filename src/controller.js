import './style.css';
import { MotionTracker, StrokeDetector } from './tracking.js';
import { MAX_BATCH_SAMPLES } from './motion-limits.js';

const codeInput = document.querySelector('#code');
const connectButton = document.querySelector('#connect');
const calibrateButton = document.querySelector('#calibrate');
const linkState = document.querySelector('#link-state');
const sensorState = document.querySelector('#sensor-state');
const sensorNote = document.querySelector('#sensor-note');
const meter = document.querySelector('#sensor-meter');
const touchButton = document.querySelector('#touch-mode');
const touchPad = document.querySelector('#touch-pad');
const touchCursor = document.querySelector('#touch-cursor');
const sensitivityInput = document.querySelector('#sensitivity');
const stabilityInput = document.querySelector('#stability');
const tracker = new MotionTracker();
const touchStroke = new StrokeDetector();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const screenAngle = () => window.screen.orientation?.angle ?? (Number(window.orientation) || 0);
const createStreamId = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) codeInput.value = urlCode.replace(/\D/g, '').slice(0, 6);

let socket = null;
let paired = false;
let sensorsStarted = false;
let sensorReadings = 0;
let touchMode = false;
let stream = createStreamId();
let sequence = 0;
let pending = [];
let flushTimer = null;
let needsReset = true;
let activePointerId = null;
let lastTouchPoint = { x: 0, y: 0 };

function setLink(text, active = false) {
  linkState.textContent = text;
  linkState.classList.toggle('on', active);
}

function resetInput() {
  // Each input session owns its stroke IDs, including switches between sensors and touch.
  stream = createStreamId();
  sequence = 0;
  if (activePointerId !== null && touchPad.hasPointerCapture(activePointerId)) touchPad.releasePointerCapture(activePointerId);
  activePointerId = null;
  pending = [];
  needsReset = true;
  tracker.stroke.reset();
  touchStroke.reset();
}

function queueSample(result, time) {
  if (!paired) { needsReset = true; return; }
  pending.push({ ...result, time, seq: sequence++, reset: needsReset || result.reset });
  needsReset = false;
  if (pending.length > MAX_BATCH_SAMPLES) {
    pending = pending.slice(-MAX_BATCH_SAMPLES);
    pending[0].reset = true;
  }
  flushTimer ??= setTimeout(flush, 16);
}

function flush() {
  flushTimer = null;
  if (socket?.readyState !== WebSocket.OPEN || !paired || socket.bufferedAmount > 4096) {
    pending = [];
    needsReset = true;
    return;
  }
  if (pending.length) socket.send(JSON.stringify({ type: 'motion', version: 2, stream, samples: pending }));
  pending = [];
}

function onOrientation(event) {
  if (touchMode) return;
  const time = performance.now();
  const result = tracker.update({ alpha: event.alpha, beta: event.beta, gamma: event.gamma }, time, screenAngle());
  if (!result) return;
  sensorReadings++;
  if (result.calibrating) {
    sensorState.textContent = 'CALIBRANDO ' + Math.round(result.progress * 100) + '%';
    sensorNote.textContent = 'Segure o celular na posição de jogo, parado por meio segundo.';
    meter.style.width = result.progress * 100 + '%';
  } else {
    sensorState.textContent = result.active ? 'CORTANDO' : 'PRONTO';
    sensorNote.textContent = 'Incline para mirar; cruze a criatura com a ponta da lâmina para cortar.';
    meter.style.width = clamp(result.speed / 3, 0, 1) * 100 + '%';
  }
  queueSample(result, time);
}

function watchForReadings() {
  const before = sensorReadings;
  setTimeout(() => {
    if (!touchMode && sensorReadings === before) enableTouch('Nenhuma leitura do sensor. Confira as permissões; o toque está disponível abaixo.');
  }, 4000);
}

async function startSensors() {
  if (!window.isSecureContext) {
    sensorNote.textContent = 'Abra por HTTPS para ativar os sensores.';
    return false;
  }
  try {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientação indisponível neste navegador.');
    if (!sensorsStarted) {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('Acesso ao giroscópio negado.');
      }
      window.addEventListener('deviceorientation', onOrientation);
      sensorsStarted = true;
    }
    tracker.recalibrate();
    resetInput();
    calibrateButton.disabled = false;
    sensorState.textContent = 'CALIBRANDO';
    sensorNote.textContent = 'Segure o celular na posição de jogo, parado por meio segundo.';
    watchForReadings();
    return true;
  } catch (error) {
    sensorState.textContent = 'SEM ACESSO';
    sensorNote.textContent = error.message;
    return false;
  }
}

function enableTouch(note = 'Arraste no quadro abaixo; um deslize rápido faz o corte.') {
  touchMode = true;
  resetInput();
  touchPad.classList.remove('hidden');
  touchButton.textContent = 'VOLTAR AO GIROSCÓPIO';
  calibrateButton.disabled = true;
  sensorState.textContent = 'TOQUE ATIVO';
  sensorNote.textContent = note;
}

touchButton.addEventListener('click', async () => {
  if (!touchMode) { enableTouch(); return; }
  touchMode = false;
  if (await startSensors()) {
    touchPad.classList.add('hidden');
    touchButton.textContent = 'USAR CONTROLE POR TOQUE';
  } else enableTouch(sensorNote.textContent + ' Use o quadro abaixo.');
});

function handleTouchPointer(event) {
  const bounds = touchPad.getBoundingClientRect();
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  const time = performance.now();
  lastTouchPoint = { x: (x - .5) * 2, y: (.5 - y) * 2 };
  const result = touchStroke.update(lastTouchPoint, time);
  touchCursor.style.left = x * 100 + '%';
  touchCursor.style.top = y * 100 + '%';
  meter.style.width = clamp(result.speed / 3, 0, 1) * 100 + '%';
  queueSample({ ...lastTouchPoint, ...result, calibrating: false }, time);
}

touchPad.addEventListener('pointerdown', event => {
  if (activePointerId !== null) return;
  activePointerId = event.pointerId;
  touchPad.setPointerCapture(event.pointerId);
  touchStroke.reset();
  handleTouchPointer(event);
});
touchPad.addEventListener('pointermove', event => {
  if (event.pointerId === activePointerId && touchPad.hasPointerCapture(event.pointerId)) handleTouchPointer(event);
});
function endTouch(event) {
  if (event.pointerId !== activePointerId) return;
  activePointerId = null;
  if (touchPad.hasPointerCapture(event.pointerId)) touchPad.releasePointerCapture(event.pointerId);
  touchStroke.reset();
  queueSample({ ...lastTouchPoint, speed: 0, strokeId: touchStroke.strokeId, active: false, reset: true }, performance.now());
}
touchPad.addEventListener('pointerup', endTouch);
touchPad.addEventListener('pointercancel', endTouch);
touchPad.addEventListener('lostpointercapture', endTouch);

connectButton.addEventListener('click', async () => {
  const code = codeInput.value.replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) { setLink('DIGITE 6 DÍGITOS'); return; }
  if (!touchMode && !(await startSensors())) enableTouch(sensorNote.textContent + ' Use o quadro abaixo.');
  socket?.close();
  paired = false;
  resetInput();
  setLink('CONECTANDO');
  const connection = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/relay');
  socket = connection;
  connection.addEventListener('open', () => connection.send(JSON.stringify({ type: 'join', role: 'controller', code })));
  connection.addEventListener('message', event => {
    if (socket !== connection) return;
    const data = JSON.parse(event.data);
    if (data.type === 'joined' || data.type === 'peer') {
      const wasPaired = paired;
      paired = data.type === 'joined' ? true : data.connected;
      if (wasPaired !== paired) resetInput();
      setLink(paired ? 'CONECTADO' : 'AGUARDANDO JOGO', paired);
    }
    if (data.type === 'error') setLink(data.message.toUpperCase());
    if (data.type === 'feedback' && data.event === 'hit') navigator.vibrate?.(35);
    if (data.type === 'feedback' && data.event === 'damage') navigator.vibrate?.([80, 35, 80]);
  });
  connection.addEventListener('close', () => {
    if (socket === connection) { paired = false; resetInput(); setLink('DESCONECTADO'); }
  });
  connection.addEventListener('error', () => { if (socket === connection) setLink('FALHA NA CONEXÃO'); });
});

calibrateButton.addEventListener('click', () => {
  tracker.recalibrate();
  resetInput();
  sensorState.textContent = 'CALIBRANDO';
  sensorNote.textContent = 'Segure o celular parado por meio segundo.';
  queueSample({ x: 0, y: 0, speed: 0, strokeId: tracker.stroke.strokeId, active: false, reset: true, calibrating: true }, performance.now());
});

for (const input of [sensitivityInput, stabilityInput]) input.addEventListener('input', () => {
  tracker.configure({ sensitivity: Number(sensitivityInput.value), stability: Number(stabilityInput.value) });
  resetInput();
  document.querySelector('#sensitivity-value').textContent = Number(sensitivityInput.value).toFixed(1) + '×';
  document.querySelector('#stability-value').textContent = Math.round(Number(stabilityInput.value) * 100) + '%';
});

document.addEventListener('visibilitychange', () => { tracker.recalibrate(); resetInput(); });
window.addEventListener('beforeunload', () => socket?.close());
