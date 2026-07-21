import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateJoystick } from '../src/input.js';

test('calculateJoystick clamps knob travel and returns normalized direction', () => {
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

test('calculateJoystick treats tiny movements as idle', () => {
  const result = calculateJoystick({
    clientX: 104,
    clientY: 103,
    centerX: 100,
    centerY: 100,
    maxDistance: 60,
  });

  assert.equal(result.active, false);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});
