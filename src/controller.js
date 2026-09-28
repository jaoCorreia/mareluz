import './style.css';

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
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) codeInput.value = urlCode.replace(/\D/g, '').slice(0, 6);

let socket = null;
let origin = null;
let latestRotation = 0;
let lastPoint = null;
let lastSwing = 0;
let lastSent = 0;
let sensorsStarted = false;
let paired = false;
let sensorReadings = 0;
let touchMode = false;
let touchPoint = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = (a, b) => ((a - b + 540) % 360) - 180;

function setLink(text, active = false) {
  linkState.textContent = text;
  linkState.classList.toggle('on', active);
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN && paired) socket.send(JSON.stringify(payload));
}

function onMotion(event) {
  const rate = event.rotationRate;
  const acceleration = event.acceleration;
  latestRotation = Math.max(
    Math.abs(rate?.alpha || 0),
    Math.abs(rate?.beta || 0),
    Math.abs(rate?.gamma || 0),
    Math.hypot(acceleration?.x || 0, acceleration?.y || 0, acceleration?.z || 0) * 12
  );
}

function onOrientation(event) {
  if (touchMode) return;
  if (event.beta == null || event.gamma == null) return;
  sensorReadings++;
  if (!origin) origin = { beta: event.beta, gamma: event.gamma };
  const x = clamp(angleDelta(event.gamma, origin.gamma) / 42, -1, 1);
  const y = clamp(-angleDelta(event.beta, origin.beta) / 46, -1, 1);
  const now = performance.now();
  const velocity = lastPoint ? Math.hypot(x - lastPoint.x, y - lastPoint.y) / Math.max((now - lastPoint.time) / 1000, .01) : 0;
  const speed = Math.max(velocity, latestRotation / 105);
  const swing = speed > 1.35 && now - lastSwing > 190;
  if (swing) lastSwing = now;
  lastPoint = { x, y, time: now };
  meter.style.width = `${clamp(speed / 3, 0, 1) * 100}%`;
  sensorState.textContent = 'ATIVO';
  sensorNote.textContent = 'Movimento detectado. Faça golpes laterais ou diagonais.';
  if (now - lastSent > 28 || swing) {
    send({ type: 'motion', x, y, speed, swing });
    lastSent = now;
  }
}

async function startSensors() {
  if (sensorsStarted) return true;
  if (!window.isSecureContext) {
    sensorNote.textContent = 'Abra esta página por HTTPS para ativar os sensores.';
    sensorState.textContent = 'HTTPS NECESSÁRIO';
    return false;
  }
  try {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientação indisponível neste navegador.');
    const permissions = [];
    if (typeof DeviceOrientationEvent.requestPermission === 'function') permissions.push(DeviceOrientationEvent.requestPermission());
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') permissions.push(DeviceMotionEvent.requestPermission());
    const results = await Promise.all(permissions);
    if (results.some(result => result !== 'granted')) throw new Error('Acesso aos sensores negado.');
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    sensorsStarted = true;
    calibrateButton.disabled = false;
    sensorState.textContent = 'CALIBRANDO';
    sensorNote.textContent = 'Mantenha o celular na posição inicial por um instante.';
    setTimeout(() => {
      if (sensorReadings === 0) {
        sensorState.textContent = 'SEM LEITURA';
        sensorNote.textContent = 'O navegador não enviou dados de orientação. Confira as permissões e a conexão HTTPS.';
        enableTouch();
      }
    }, 4000);
    return true;
  } catch (error) {
    sensorState.textContent = 'SEM ACESSO';
    sensorNote.textContent = error.message;
    return false;
  }
}

function enableTouch() {
  touchMode = true;
  touchPad.classList.remove('hidden');
  touchButton.textContent = 'CONTROLE POR TOQUE ATIVO';
  sensorState.textContent = 'TOQUE ATIVO';
  sensorNote.textContent = 'Arraste no quadro abaixo; um deslize rápido faz o corte.';
}

touchButton.addEventListener('click', enableTouch);

function handleTouchPointer(event) {
  const bounds = touchPad.getBoundingClientRect();
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  const now = performance.now();
  const speed = touchPoint ? Math.hypot(x - touchPoint.x, y - touchPoint.y) / Math.max((now - touchPoint.time) / 1000, .01) : 0;
  const swing = speed > 1.25 && now - lastSwing > 190;
  if (swing) lastSwing = now;
  touchCursor.style.left = `${x * 100}%`;
  touchCursor.style.top = `${y * 100}%`;
  meter.style.width = `${clamp(speed / 3, 0, 1) * 100}%`;
  if (now - lastSent > 28 || swing) {
    send({ type: 'motion', x: (x - .5) * 2, y: (.5 - y) * 2, speed, swing });
    lastSent = now;
  }
  touchPoint = { x, y, time: now };
}

touchPad.addEventListener('pointerdown', event => {
  touchPad.setPointerCapture(event.pointerId);
  touchPoint = null;
  handleTouchPointer(event);
});
touchPad.addEventListener('pointermove', event => {
  if (touchPad.hasPointerCapture(event.pointerId)) handleTouchPointer(event);
});
touchPad.addEventListener('pointerup', event => {
  if (touchPad.hasPointerCapture(event.pointerId)) touchPad.releasePointerCapture(event.pointerId);
  touchPoint = null;
});

connectButton.addEventListener('click', async () => {
  const code = codeInput.value.replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) {
    setLink('DIGITE 6 DÍGITOS');
    return;
  }
  if (!touchMode && !(await startSensors())) enableTouch();
  socket?.close();
  paired = false;
  setLink('CONECTANDO');
  const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`);
  socket = connection;
  connection.addEventListener('open', () => connection.send(JSON.stringify({ type: 'join', role: 'controller', code })));
  connection.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.type === 'joined' || data.type === 'peer') {
      paired = data.type === 'joined' ? true : data.connected;
      setLink(paired ? 'CONECTADO' : 'AGUARDANDO JOGO', paired);
    }
    if (data.type === 'error') setLink(data.message.toUpperCase());
    if (data.type === 'feedback' && data.event === 'hit' && navigator.vibrate) navigator.vibrate(45);
    if (data.type === 'feedback' && data.event === 'damage' && navigator.vibrate) navigator.vibrate([80, 35, 80]);
  });
  connection.addEventListener('close', () => { if (socket === connection) { paired = false; setLink('DESCONECTADO'); } });
  connection.addEventListener('error', () => { if (socket === connection) setLink('FALHA NA CONEXÃO'); });
});

calibrateButton.addEventListener('click', () => {
  origin = null;
  lastPoint = null;
  sensorNote.textContent = 'Nova posição inicial definida.';
});

window.addEventListener('beforeunload', () => socket?.close());
