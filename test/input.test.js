import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateJoystick, cameraScaleForMass, pointerTargetForControls } from '../src/input.js';

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

test('cameraScaleForMass zooms out more on mobile and as mass grows', () => {
  const smallMobile = cameraScaleForMass({ totalMass: 180, viewWidth: 640, viewHeight: 360 });
  const largeMobile = cameraScaleForMass({ totalMass: 1600, viewWidth: 640, viewHeight: 360 });
  const smallDesktop = cameraScaleForMass({ totalMass: 180, viewWidth: 1280, viewHeight: 720 });

  assert.ok(smallMobile < smallDesktop);
  assert.ok(largeMobile < smallMobile);
  assert.ok(smallMobile <= 0.38);
});

test('pointerTargetForControls stops on mobile when the joystick is idle', () => {
  const playerCenter = { x: 500, y: 600 };
  const result = pointerTargetForControls({
    playerCenter,
    joystickDirection: { x: 0, y: 0, strength: 0, active: false },
    isTouchDevice: true,
    camera: { x: 0, y: 0, scale: 1 },
    pointerScreen: { x: 200, y: 120 },
    view: { width: 800, height: 360 },
  });

  assert.deepEqual(result, playerCenter);
});
