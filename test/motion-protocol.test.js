import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionReceiver, normalizeMotionPacket } from '../src/motion-protocol.js';

const sample = (seq, extra = {}) => ({ x: seq * .1, y: 0, time: seq * 16, seq, strokeId: 1, speed: 2, active: true, ...extra });
const packet = samples => ({ type: 'motion', version: 2, stream: 'phone-a', samples });

test('all positions in a batched curved path survive the relay', () => {
  const samples = [sample(0), sample(1, { y: .3 }), sample(2, { y: -.2 })];
  const receiver = new MotionReceiver();
  const received = receiver.accept(normalizeMotionPacket(packet(samples)), 10000);
  assert.deepEqual(received.map(point => [point.x, point.y]), [[0, 0], [.1, .3], [.2, -.2]]);
  assert.equal(received[0].active, false);
  assert.equal(received[1].active, true);
});

test('duplicate and out of order packets cannot repeat a strike', () => {
  const receiver = new MotionReceiver();
  receiver.accept(packet([sample(0), sample(1)]), 100);
  assert.deepEqual(receiver.accept(packet([sample(1), sample(0)]), 110), []);
  assert.equal(receiver.accept(packet([sample(2)]), 120)[0].reset, false);
});

test('packet loss, delayed arrival and a new stream break the attack path', () => {
  const receiver = new MotionReceiver();
  receiver.accept(packet([sample(0)]), 100);
  assert.equal(receiver.accept(packet([sample(2)]), 120)[0].active, false);
  assert.equal(receiver.accept(packet([sample(3)]), 500)[0].active, false);
  assert.equal(receiver.accept({ ...packet([sample(0)]), stream: 'phone-b' }, 520)[0].active, false);
});

test('recalibration is always a neutral sample even if flagged as active', () => {
  const receiver = new MotionReceiver();
  receiver.accept(packet([sample(0)]), 100);
  assert.equal(receiver.accept(packet([sample(1, { calibrating: true })]), 120)[0].active, false);
});

test('malformed sensor values are rejected before reaching the game', () => {
  for (const values of [{ x: Infinity }, { x: 2 }, { y: NaN }, { time: -1 }, { seq: 1.2 }, { strokeId: -3 }]) {
    assert.equal(normalizeMotionPacket(packet([sample(0, values)])), null);
  }
  assert.equal(normalizeMotionPacket(packet(Array.from({ length: 9 }, (_, i) => sample(i)))), null);
});

test('buffered batches after a stall never replay old attacks', () => {
  const receiver = new MotionReceiver();
  receiver.accept(packet([sample(0)]), 100);
  const delayed = receiver.accept(packet([sample(1), sample(2), sample(3)]), 1100);
  assert.ok(delayed.every(point => !point.active && point.reset));
  // Further buffered batches are stale even though arrival intervals look normal.
  assert.ok(receiver.accept(packet([sample(4), sample(5)]), 1116).every(point => !point.active));
  const fresh = receiver.accept(packet([sample(6, { time: 1040 }), sample(7, { time: 1056 })]), 1156);
  assert.equal(fresh[0].active, false);
  assert.equal(fresh[1].active, true);
  // A duplicate after another stall cannot revive an old stroke.
  assert.deepEqual(receiver.accept(packet([sample(2)]), 1500), []);
});

test('switching input streams keeps identical stroke counters distinct and breaks the path', () => {
  const receiver = new MotionReceiver();
  const gyro = receiver.accept(packet([sample(0), sample(1)]), 100)[1];
  const touch = receiver.accept({ ...packet([sample(0), sample(1)]), stream: 'touch-session' }, 132);
  assert.equal(touch[0].active, false);
  assert.equal(touch[1].active, true);
  assert.notEqual(gyro.stream + ':' + gyro.strokeId, touch[1].stream + ':' + touch[1].strokeId);
});
