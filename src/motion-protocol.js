import { MAX_SAMPLE_GAP_MS, MAX_TRANSIT_DELAY_MS, MAX_BATCH_SAMPLES } from './motion-limits.js';

export function normalizeMotionPacket(data) {
  if (data?.type !== 'motion' || data.version !== 2 || typeof data.stream !== 'string' || !data.stream.length || data.stream.length > 64
    || !Array.isArray(data.samples) || !data.samples.length || data.samples.length > MAX_BATCH_SAMPLES) return null;
  const samples = [];
  for (const sample of data.samples) {
    if (!sample || !['x', 'y', 'time', 'seq', 'strokeId', 'speed'].every(key => Number.isFinite(sample[key]))) return null;
    if (!Number.isSafeInteger(sample.seq) || sample.seq < 0 || !Number.isSafeInteger(sample.strokeId) || sample.strokeId < 0) return null;
    if (sample.time < 0 || Math.abs(sample.x) > 1 || Math.abs(sample.y) > 1 || sample.speed < 0) return null;
    samples.push({ x: sample.x, y: sample.y, time: sample.time, seq: sample.seq, strokeId: sample.strokeId,
      speed: Math.min(sample.speed, 50), active: sample.active === true, reset: sample.reset === true, calibrating: sample.calibrating === true });
  }
  return { type: 'motion', version: 2, stream: data.stream, samples };
}

export class MotionReceiver {
  constructor() { this.reset(); }

  reset() { this.stream = null; this.previous = null; this.receivedAt = null; this.clockOffset = null; }

  accept(data, receivedAt) {
    const packet = normalizeMotionPacket(data);
    if (!packet) return [];
    if (packet.stream !== this.stream) {
      this.previous = null;
      this.stream = packet.stream;
      this.receivedAt = null;
      this.clockOffset = null;
    }
    const arrivalGap = this.receivedAt != null && receivedAt - this.receivedAt > MAX_TRANSIT_DELAY_MS;
    this.receivedAt = receivedAt;
    const result = [];
    for (const sample of packet.samples) {
      const previous = this.previous;
      if (previous && (sample.seq <= previous.seq || sample.time <= previous.time)) continue;
      // Lowest observed clock offset estimates the usual transport delay without clock sync.
      // Keep it across stalls so buffered old swings cannot hit current enemy positions.
      this.clockOffset = Math.min(this.clockOffset ?? Infinity, receivedAt - sample.time);
      const stale = arrivalGap || receivedAt - sample.time - this.clockOffset > MAX_TRANSIT_DELAY_MS;
      const reset = stale || previous?.stale || sample.reset || sample.calibrating || !previous || sample.seq !== previous.seq + 1
        || sample.time - previous.time > MAX_SAMPLE_GAP_MS;
      result.push({ ...sample, reset, active: sample.active && !reset, stream: packet.stream });
      this.previous = { ...sample, stale };
    }
    return result;
  }
}
