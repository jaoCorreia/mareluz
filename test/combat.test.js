import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { saberPose, segmentIntersectsEllipse } from '../src/combat.js';

const target = { x: .5, y: .5, radiusX: .08, radiusY: .045 };

test('swept collision catches a target between consecutive samples', () => {
  assert.equal(segmentIntersectsEllipse({ x: .2, y: .5 }, { x: .8, y: .5 }, target), true);
});

test('a near miss or a short motion beside the target does not expand into a hit', () => {
  assert.equal(segmentIntersectsEllipse({ x: .2, y: .55 }, { x: .8, y: .55 }, target), false);
  assert.equal(segmentIntersectsEllipse({ x: .32, y: .5 }, { x: .34, y: .5 }, target), false);
});

test('collision respects projected width and height independently', () => {
  assert.equal(segmentIntersectsEllipse({ x: .57, y: .495 }, { x: .57, y: .505 }, target), true);
  assert.equal(segmentIntersectsEllipse({ x: .5, y: .56 }, { x: .505, y: .56 }, target), false);
});

test('the rendered rigid blade tip projects exactly to the hit point at any aspect ratio', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
    const camera = new PerspectiveCamera(72, aspect, .04, 500);
    camera.updateMatrixWorld();
    for (const x of [.06, .3, .5, .7, .94]) for (const y of [.08, .5, .92]) {
      const pose = saberPose({ x, y }, camera.fov, aspect);
      const tip = new Vector3(0, 2.02, 0).applyQuaternion(pose.rotation).add(pose.position);
      assert.ok(Math.abs(tip.distanceTo(pose.position) - 2.02) < 1e-10);
      tip.project(camera);
      assert.ok(Math.abs((tip.x + 1) / 2 - x) < 1e-10);
      assert.ok(Math.abs((1 - tip.y) / 2 - y) < 1e-10);
    }
  }
});
