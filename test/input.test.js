import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateJoystick } from '../src/input.js';

test('calculateJoystick clamps the sliding ball inside the wheel', () => {
  const result = calculateJoystick({
    clientX: 220,
    clientY: 100,
    centerX: 100,
    centerY: 100,
    maxDistance: 60,
  });

  assert.equal(result.active, true);
  assert.equal(result.knobX, 60);
  assert.equal(result.knobY, 0);
  assert.equal(result.x, 1);
  assert.equal(result.y, 0);
  assert.equal(result.strength, 1);
});

test('calculateJoystick returns proportional strength for short drags', () => {
  const result = calculateJoystick({
    clientX: 130,
    clientY: 100,
    centerX: 100,
    centerY: 100,
    maxDistance: 60,
  });

  assert.equal(result.active, true);
  assert.equal(result.knobX, 30);
  assert.equal(result.strength, 0.5);
});

test('calculateJoystick is idle near the center', () => {
  const result = calculateJoystick({
    clientX: 103,
    clientY: 104,
    centerX: 100,
    centerY: 100,
    maxDistance: 60,
  });

  assert.deepEqual(result, { x: 0, y: 0, knobX: 0, knobY: 0, strength: 0, active: false });
});
