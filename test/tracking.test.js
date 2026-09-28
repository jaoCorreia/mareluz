import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionTracker, StrokeDetector, orientationQuaternion } from '../src/tracking.js';

function calibrate(tracker, pose = { alpha: 0, beta: 0, gamma: 0 }, hz = 60) {
  let result;
  for (let i = 0; i <= Math.ceil(hz * .6); i++) result = tracker.update(pose, i * 1000 / hz);
  assert.equal(result.calibrating, false);
  return result;
}

test('calibration requires a stable interval and starts without an attack', () => {
  const tracker = new MotionTracker();
  const pose = { alpha: 35, beta: 67, gamma: -18 };
  assert.equal(tracker.update(pose, 0).calibrating, true);
  assert.equal(tracker.update(pose, 16).active, false);
  let result;
  for (let time = 32; time <= 560; time += 16) result = tracker.update(pose, time);
  assert.equal(result.calibrating, false);
  assert.ok(Math.hypot(result.x, result.y) < .005);
  assert.equal(result.active, false);
});

test('moving the phone during calibration restarts the stable interval', () => {
  const tracker = new MotionTracker();
  let result;
  for (let time = 0; time < 1000; time += 16) result = tracker.update({ alpha: 0, beta: time / 10, gamma: 0 }, time);
  assert.equal(result.calibrating, true);
  assert.equal(result.active, false);
});

test('calibration average remains stable across the alpha 359/0 boundary', () => {
  const tracker = new MotionTracker();
  let result;
  for (let i = 0; i < 80; i++) {
    result = tracker.update({ alpha: i % 2 ? .15 : 359.85, beta: 80, gamma: 0 }, i * 16.67);
    assert.equal(result.active, false);
  }
  assert.equal(result.calibrating, false);
  assert.ok(Math.abs(result.x) < .01);
});

test('relative orientation preserves horizontal and vertical tilt directions', () => {
  const horizontal = new MotionTracker();
  const vertical = new MotionTracker();
  calibrate(horizontal);calibrate(vertical);
  let x, y;
  for (let time = 620; time < 1000; time += 20) {
    x = horizontal.update({ alpha: 0, beta: 0, gamma: 21 }, time);
    y = vertical.update({ alpha: 0, beta: 23, gamma: 0 }, time);
  }
  assert.ok(Math.abs(x.x - .5) < .025 && Math.abs(x.y) < .005);
  assert.ok(Math.abs(y.y + .5) < .025 && Math.abs(y.x) < .005);
});

test('small jitter at a noncentral pose does not become an attack', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  const outputs = [];
  for (let i = 0; i < 200; i++) {
    const time = 800 + i * 16.67;
    const result = tracker.update({ alpha: 0, beta: 12 + Math.sin(i * 2.3) * .18, gamma: 10 + Math.cos(i * 2) * .18 }, time);
    assert.equal(result.active, false);
    if (i > 20) outputs.push(result.x);
  }
  assert.ok(Math.max(...outputs) - Math.min(...outputs) < .008);
});

test('a deliberate sweep follows quickly and creates only one stroke', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  const strokes = new Set();
  let result;
  for (let i = 0; i <= 12; i++) {
    result = tracker.update({ alpha: 0, beta: 0, gamma: i * 3 }, 620 + i * 16.67);
    if (result.active) strokes.add(result.strokeId);
  }
  assert.equal(strokes.size, 1);
  assert.ok(result.x > .76);
});

test('30, 60 and 120 Hz samples produce comparable pointing', () => {
  const positions = [];
  for (const hz of [30, 60, 120]) {
    const tracker = new MotionTracker();
    calibrate(tracker, undefined, hz);
    let result;
    for (let i = 1; i <= hz * .3; i++) result = tracker.update({ alpha: 0, beta: 0, gamma: (i / (hz * .3)) * 25 }, 600 + i * 1000 / hz);
    positions.push(result.x);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < .05);
});

test('a gap or recalibration cannot create a strike between unrelated poses', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  const result = tracker.update({ alpha: 0, beta: 40, gamma: 25 }, 1500);
  assert.equal(result.reset, true);
  assert.equal(result.active, false);
  tracker.recalibrate();
  const calibration = tracker.update({ alpha: 0, beta: -30, gamma: -25 }, 1516);
  assert.equal(calibration.calibrating, true);
  assert.equal(calibration.active, false);
});

test('changing screen orientation requires recalibration', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  const result = tracker.update({ alpha: 0, beta: 0, gamma: 0 }, 620, 90);
  assert.equal(result.calibrating, true);
  assert.equal(result.active, false);
});

test('invalid and out of order measurements are ignored', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  assert.equal(tracker.update({ alpha: 0, beta: NaN, gamma: 0 }, 620), null);
  assert.equal(tracker.update({ alpha: 0, beta: 0, gamma: 0 }, 590), null);
  assert.equal(orientationQuaternion({ alpha: 0, beta: null, gamma: 0 }), null);
});

test('sensitivity changes reset the stroke before applying the new scale', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  tracker.configure({ sensitivity: 1.5 });
  const sample = tracker.update({ alpha: 0, beta: 0, gamma: 20 }, 640);
  assert.equal(sample.reset, true);
  assert.equal(sample.active, false);
});

test('continuous back and forth swipes are distinct strokes', () => {
  const detector = new StrokeDetector();
  const forward = new Set();
  const backward = new Set();
  for (let i = 0; i < 20; i++) {
    const result = detector.update({ x: i * .04, y: 0 }, i * 16);
    if (result.active) forward.add(result.strokeId);
  }
  for (let i = 1; i < 20; i++) {
    const result = detector.update({ x: .76 - i * .04, y: 0 }, (19 + i) * 16);
    if (result.active) backward.add(result.strokeId);
  }
  assert.equal(forward.size, 1);
  assert.ok([...backward].some(id => !forward.has(id)));
});

test('turning across the antipodal orientation cannot create a screen-wide strike', () => {
  const tracker = new MotionTracker();
  calibrate(tracker);
  for (const [index, beta] of [170, 174, 178, 179, 180, -179, -178].entries()) {
    const result = tracker.update({ alpha: 0, beta, gamma: 0 }, 616 + index * 16);
    assert.equal(result.active, false);
    assert.equal(result.reset, true);
    assert.equal(result.speed, 0);
  }
  const returned = tracker.update({ alpha: 0, beta: 30, gamma: 0 }, 744);
  assert.equal(returned.active, false);
  assert.equal(returned.reset, true);
});
