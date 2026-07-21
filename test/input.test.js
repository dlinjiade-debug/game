import test from 'node:test';
import assert from 'node:assert/strict';

import { directionFromKeys } from '../src/input.js';

test('directionFromKeys returns cardinal directions for one pressed key', () => {
  assert.deepEqual(directionFromKeys(new Set(['up'])), { x: 0, y: -1, active: true });
  assert.deepEqual(directionFromKeys(new Set(['right'])), { x: 1, y: 0, active: true });
});

test('directionFromKeys normalizes diagonal movement', () => {
  const result = directionFromKeys(new Set(['up', 'right']));
  const expected = Math.SQRT1_2;

  assert.equal(result.active, true);
  assert.ok(Math.abs(result.x - expected) < 0.0001);
  assert.ok(Math.abs(result.y + expected) < 0.0001);
});

test('directionFromKeys is idle with no pressed keys', () => {
  assert.deepEqual(directionFromKeys(new Set()), { x: 0, y: 0, active: false });
});
