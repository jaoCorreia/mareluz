import test from 'node:test';
import assert from 'node:assert/strict';
import { screenFacingUp, collectionGate, sensorAvailable, createRun, advanceRun, collectData, difficulty, activateSkill, normalizeRunnerInput, RunnerInput } from '../src/runner/rules.js';
const running = () => ({ ...createRun(), phase: 'running' });
const packet = (seq, extra = {}) => ({ type: 'runner-input', version: 1, stream: 'device', seq, time: seq * 33, alpha: 0, beta: 0, gamma: 0, available: true, ...extra });

test('screen-up uses gravity regardless of yaw; vertical and inverted phones cannot collect', () => {
  assert.equal(screenFacingUp(0, 0), 1);
  assert.equal(screenFacingUp(180, 0), -1);
  assert.equal(collectionGate(screenFacingUp(90, 0)), false);
  assert.equal(collectionGate(screenFacingUp(0, 90)), false);
  assert.equal(collectionGate(screenFacingUp(35, 20)), true);
  assert.equal(collectionGate(screenFacingUp(-179, 0)), false);
  assert.equal(screenFacingUp(null, 0), null);
});
test('collection hysteresis prevents flicker at the opening threshold', () => {
  assert.equal(collectionGate(.34, false), false);
  assert.equal(collectionGate(.36, false), true);
  assert.equal(collectionGate(.2, true), true);
  assert.equal(collectionGate(.1, true), false);
});
test('screen down ignores blue and red; screen up earns energy or drains battery', () => {
  const state = running();
  collectData(state, 'blue', false); collectData(state, 'red', false);
  assert.equal(state.score, 0); assert.equal(state.energy, 0); assert.equal(state.battery, 100);
  collectData(state, 'blue', true); assert.equal(state.score, 100); assert.equal(state.energy, 10);
  collectData(state, 'red', true); assert.equal(state.battery, 78); assert.equal(state.combo, 0);
});
test('energy and battery cap at 100; red damage ends the run exactly at zero', () => {
  const state = running();
  for (let i = 0; i < 15; i++) collectData(state, 'blue', true);
  assert.equal(state.energy, 100); assert.equal(state.battery, 100);
  for (let i = 0; i < 5; i++) collectData(state, 'red', true);
  assert.equal(state.battery, 0); assert.equal(state.phase, 'over');
  assert.equal(collectData(state, 'blue', true), null);
});
test('skills spend earned energy and shield prevents red damage for its duration', () => {
  const state = running(); assert.equal(activateSkill(state, 'shield'), false);
  state.energy = 65; assert.equal(activateSkill(state, 'shield'), true); assert.equal(state.energy, 40);
  assert.equal(activateSkill(state, 'shield'), false);
  assert.equal(collectData(state, 'red', true).type, 'blocked'); assert.equal(state.battery, 100);
  assert.equal(activateSkill(state, 'pulse'), true); assert.equal(state.energy, 0);
  for (let i = 0; i < 51; i++) advanceRun(state, .1);
  assert.equal(state.shield, 0); assert.equal(collectData(state, 'red', true).type, 'damage');
});
test('difficulty increases; elapsed movement and battery stop during pause', () => {
  assert.ok(difficulty(180).speed > difficulty(60).speed);
  assert.ok(difficulty(180).interval < difficulty(60).interval);
  assert.ok(difficulty(180).redChance > difficulty(60).redChance);
  const state = running(); advanceRun(state, .1); assert.ok(state.distance > 0); assert.ok(state.battery < 100);
  state.phase = 'paused'; const before = { ...state }; advanceRun(state, .1); assert.deepEqual(state, before);
  state.phase = 'running'; state.battery = .001; advanceRun(state, .1); assert.equal(state.phase, 'over');
});
test('invalid packets, stale readings, reordering and sensor suspension cannot reopen collection', () => {
  for (const extra of [{ beta: Infinity }, { gamma: 100 }, { seq: -1 }, { available: false, alpha: NaN }, { time: -1 }]) assert.equal(normalizeRunnerInput(packet(0, extra)), null);
  const input = new RunnerInput();
  assert.equal(input.accept(packet(0), 100), true); assert.equal(input.isCollecting(150), true);
  assert.equal(input.accept(packet(0, { beta: 180 }), 160), false);
  assert.equal(input.accept(packet(1, { beta: 180 }), 133), true); assert.equal(input.isCollecting(150), false);
  assert.equal(input.accept(packet(2), 1100), false); assert.equal(input.isCollecting(1100), false);
  assert.equal(input.accept(packet(3, { time: 1000 }), 1100), true); assert.equal(input.isCollecting(1100), true);
  assert.equal(input.isFresh(2100), false); assert.equal(input.isCollecting(2100), false);
  input.accept(packet(4, { time: 1033, available: false }), 1133); assert.equal(input.isFresh(1133), false);
});


test('live heartbeat cannot keep an expired physical sensor collecting', () => {
  const input = new RunnerInput();
  const sensor = { manual: false, available: true, hidden: false, lastReading: 0 };
  for (let time = 0; time <= 2013; time += 33) {
    const available = sensorAvailable(sensor, time);
    input.accept(packet(time / 33, { time, available }), time + 100);
    if (time >= 900) {
      assert.equal(available, false);
      assert.equal(input.isCollecting(time + 100), false);
      assert.equal(input.isFresh(time + 100), false);
    }
  }
  assert.equal(sensorAvailable({ ...sensor, manual: true }, 5000), true);
  assert.equal(sensorAvailable({ ...sensor, manual: true, hidden: true }, 5000), false);
});
