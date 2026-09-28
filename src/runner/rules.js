export const SKILLS = {
  shield: { name: 'Escudo', cost: 25, duration: 5 },
  pulse: { name: 'Pulso', cost: 40, duration: .65 }
};
export const SENSOR_TIMEOUT_MS = 900;
const radians = Math.PI / 180;

export function sensorAvailable({ manual, available, hidden, lastReading }, now) {
  return Boolean(available && !hidden && (manual || now - lastReading < SENSOR_TIMEOUT_MS));
}

// Device screen normal projected onto gravity's up axis (W3C Z-X'-Y'' orientation).
export function screenFacingUp(beta, gamma) {
  if (![beta, gamma].every(Number.isFinite)) return null;
  return Math.cos(beta * radians) * Math.cos(gamma * radians);
}

export function collectionGate(facing, wasCollecting = false) {
  return Number.isFinite(facing) && facing > (wasCollecting ? .12 : .35);
}

export function difficulty(seconds) {
  const progression = 1 - Math.exp(-Math.max(0, seconds) / 120);
  return { speed: 12 + progression * 25, interval: 1.45 - progression * .9, redChance: .24 + progression * .29 };
}

export function createRun() {
  return { phase: 'ready', elapsed: 0, distance: 0, battery: 100, energy: 0, score: 0,
    blue: 0, avoided: 0, combo: 0, shield: 0, pulse: 0, lastEvent: null };
}

export function advanceRun(state, dt) {
  if (state.phase !== 'running') return;
  const step = Math.max(0, Math.min(dt, .1));
  state.elapsed += step;
  state.distance += difficulty(state.elapsed).speed * step;
  state.shield = Math.max(0, state.shield - step);
  state.pulse = Math.max(0, state.pulse - step);
  state.battery = Math.max(0, state.battery - step * .55);
  if (state.battery === 0) state.phase = 'over';
}

export function collectData(state, kind, collecting) {
  if (state.phase !== 'running') return null;
  if (!collecting) {
    if (kind === 'red') state.avoided++;
    return { type: 'miss', kind };
  }
  if (kind === 'blue') {
    state.blue++;
    state.combo++;
    const points = 100 + Math.min(4, Math.floor(state.combo / 5)) * 25;
    state.score += points;
    state.energy = Math.min(100, state.energy + 10);
    state.battery = Math.min(100, state.battery + 1.5);
    return state.lastEvent = { type: 'blue', points };
  }
  if (kind !== 'red') return null;
  if (state.shield > 0) { state.avoided++; return state.lastEvent = { type: 'blocked' }; }
  state.combo = 0;
  state.battery = Math.max(0, state.battery - 22);
  if (state.battery === 0) state.phase = 'over';
  return state.lastEvent = { type: 'damage' };
}

export function activateSkill(state, skill) {
  const config = SKILLS[skill];
  if (!config || state.phase !== 'running' || state.energy < config.cost || state[skill] > 0) return false;
  state.energy -= config.cost;
  state[skill] = config.duration;
  return true;
}

export function normalizeRunnerInput(data) {
  if (data?.type !== 'runner-input' || data.version !== 1 || typeof data.stream !== 'string' || !data.stream.length || data.stream.length > 64) return null;
  if (!Number.isSafeInteger(data.seq) || data.seq < 0 || !Number.isFinite(data.time) || data.time < 0) return null;
  if (!['alpha', 'beta', 'gamma'].every(key => Number.isFinite(data[key]))) return null;
  if (Math.abs(data.alpha) > 180 || Math.abs(data.beta) > 180 || Math.abs(data.gamma) > 90) return null;
  return { type: 'runner-input', version: 1, stream: data.stream, seq: data.seq, time: data.time,
    alpha: data.alpha, beta: data.beta, gamma: data.gamma, available: data.available === true };
}

export class RunnerInput {
  constructor() { this.reset(); }
  reset() { this.stream = null; this.seq = -1; this.time = -1; this.lastReceived = -Infinity; this.offset = Infinity; this.collecting = false; this.pose = null; }
  accept(data, now) {
    const packet = normalizeRunnerInput(data);
    if (!packet) return false;
    if (this.stream !== packet.stream) { this.reset(); this.stream = packet.stream; }
    if (packet.seq <= this.seq || packet.time < this.time) return false;
    this.seq = packet.seq; this.time = packet.time;
    this.offset = Math.min(this.offset, now - packet.time);
    if (now - packet.time - this.offset > 250) { this.collecting = false; return false; }
    this.lastReceived = now;
    this.pose = packet;
    this.collecting = packet.available && collectionGate(screenFacingUp(packet.beta, packet.gamma), this.collecting);
    return true;
  }
  isFresh(now) { return Boolean(this.pose?.available) && now - this.lastReceived < SENSOR_TIMEOUT_MS; }
  isCollecting(now) { return this.isFresh(now) && this.collecting; }
}
