import { Euler, Quaternion, Vector3 } from 'three';

import { MAX_SAMPLE_GAP_MS } from './motion-limits.js';
export { MAX_SAMPLE_GAP_MS } from './motion-limits.js';
const RAD = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const alphaFor = (cutoff, dt) => 1 - Math.exp(-2 * Math.PI * cutoff * dt);

// DeviceOrientation uses intrinsic Z-X'-Y'' rotations (W3C Orientation Event).
export function orientationQuaternion({ alpha = 0, beta, gamma }, screenAngle = 0) {
  if (![beta, gamma, screenAngle].every(Number.isFinite) || (alpha != null && !Number.isFinite(alpha))) return null;
  return new Quaternion()
    .setFromEuler(new Euler(beta * RAD, gamma * RAD, (alpha ?? 0) * RAD, 'ZXY'))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -screenAngle * RAD));
}

export class StrokeDetector {
  constructor() {
    this.strokeId = 0;
    this.reset();
  }

  reset() {
    this.previous = null;
    this.active = false;
    this.distance = 0;
    this.direction = null;
    this.quietSince = null;
    this.history = [];
  }

  update(point, time) {
    const previous = this.previous;
    this.previous = { ...point, time };
    if (!previous || time <= previous.time || time - previous.time > MAX_SAMPLE_GAP_MS) {
      this.reset();
      this.previous = { ...point, time };
      return { speed: 0, active: false, strokeId: this.strokeId, reset: true };
    }
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy);
    const speed = distance / ((time - previous.time) / 1000);
    this.history.push({ x: dx, y: dy, time });
    this.history = this.history.filter(sample => time - sample.time <= 90);
    const displacement = Math.hypot(
      this.history.reduce((sum, sample) => sum + sample.x, 0),
      this.history.reduce((sum, sample) => sum + sample.y, 0)
    );
    const direction = distance > .002 ? { x: dx / distance, y: dy / distance } : null;
    const reversed = this.active && direction && this.direction && this.distance > .12
      && direction.x * this.direction.x + direction.y * this.direction.y < -.35;

    if (speed >= 1.15 && displacement >= .055 && (!this.active || reversed)) {
      this.active = true;
      this.strokeId++;
      this.distance = 0;
      this.direction = direction;
      this.quietSince = null;
    }
    if (this.active) {
      this.distance += distance;
      if (speed < .42) this.quietSince ??= time;
      else this.quietSince = null;
      if (this.quietSince != null && time - this.quietSince >= 60) this.active = false;
    }
    return { speed, active: this.active && speed >= .2, strokeId: this.strokeId, reset: false };
  }
}

export class MotionTracker {
  constructor({ sensitivity = 1, stability = .5 } = {}) {
    this.sensitivity = sensitivity;
    this.stability = stability;
    this.stroke = new StrokeDetector();
    this.screenAngle = null;
    this.recalibrate();
  }

  recalibrate() {
    this.origin = null;
    this.calibration = null;
    this.lastTime = null;
    this.raw = null;
    this.filtered = null;
    this.derivative = { x: 0, y: 0 };
    this.stroke.reset();
  }

  configure({ sensitivity = this.sensitivity, stability = this.stability }) {
    this.sensitivity = clamp(sensitivity, .5, 1.8);
    this.stability = clamp(stability, 0, 1);
    this.lastTime = null;
    this.stroke.reset();
  }

  update(angles, time, screenAngle = 0) {
    const pose = orientationQuaternion(angles, screenAngle);
    if (!pose || !Number.isFinite(time)) return null;
    if (this.screenAngle !== screenAngle) {
      this.screenAngle = screenAngle;
      this.recalibrate();
    }
    if (this.lastTime != null && time <= this.lastTime) return null;
    if (!this.origin) {
      if (this.calibration && time <= this.calibration.lastTime) return null;
      const calibration = this.calibration;
      if (!calibration || pose.angleTo(calibration.anchor) > 2.5 * RAD || time - calibration.lastTime > MAX_SAMPLE_GAP_MS) {
        this.calibration = { anchor: pose.clone(), sum: [0, 0, 0, 0], start: time, lastTime: time, count: 0 };
      }
      const sample = this.calibration;
      const sign = pose.dot(sample.anchor) < 0 ? -1 : 1;
      [pose.x, pose.y, pose.z, pose.w].forEach((value, index) => { sample.sum[index] += value * sign; });
      sample.count++;
      sample.lastTime = time;
      const progress = Math.min((time - sample.start) / 500, sample.count / 12, 1);
      if (progress < 1) return { x: 0, y: 0, speed: 0, active: false, strokeId: this.stroke.strokeId, reset: true, calibrating: true, progress };
      this.origin = new Quaternion(...sample.sum).normalize();
      this.lastTime = null;
    }

    const relative = this.origin.clone().invert().multiply(pose).normalize();
    // q and -q describe the same pose. Use the shortest rotation across 0/360.
    const sign = relative.w < 0 ? -1 : 1;
    const sine = Math.hypot(relative.x, relative.y, relative.z);
    const angle = 2 * Math.atan2(sine, Math.abs(relative.w));
    // Turning the phone behind its calibrated pose crosses the log map's 180° seam.
    // Leave that region neutral; re-entering the pointing cone starts a fresh path.
    if (angle > 135 * RAD) {
      this.lastTime = null;
      this.stroke.reset();
      return { ...(this.filtered ?? { x: 0, y: 0 }), speed: 0, active: false,
        strokeId: this.stroke.strokeId, reset: true, calibrating: false, progress: 1 };
    }
    const scale = sine > 1e-8 ? angle / sine * sign : 0;
    const deadZone = value => Math.sign(value) * Math.max(0, Math.abs(value) - .008) / .992;
    const raw = {
      x: clamp(deadZone(relative.y * scale / (42 * RAD)) * this.sensitivity, -1, 1),
      y: clamp(deadZone(-relative.x * scale / (46 * RAD)) * this.sensitivity, -1, 1)
    };
    const gap = this.lastTime == null || time - this.lastTime > MAX_SAMPLE_GAP_MS;
    if (gap) {
      this.filtered = { ...raw };
      this.derivative = { x: 0, y: 0 };
      this.stroke.reset();
    } else {
      const dt = (time - this.lastTime) / 1000;
      const derivativeAlpha = alphaFor(4, dt);
      for (const axis of ['x', 'y']) {
        this.derivative[axis] += derivativeAlpha * ((raw[axis] - this.raw[axis]) / dt - this.derivative[axis]);
      }
      // More stability at rest; raise the cutoff during deliberate movement.
      const cutoff = (4 - this.stability * 2.5) + Math.hypot(this.derivative.x, this.derivative.y) * 4;
      const alpha = alphaFor(cutoff, dt);
      for (const axis of ['x', 'y']) this.filtered[axis] += alpha * (raw[axis] - this.filtered[axis]);
    }
    this.raw = raw;
    this.lastTime = time;
    return { ...this.filtered, ...this.stroke.update(this.filtered, time), calibrating: false, progress: 1 };
  }
}
