import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateJoystick,
  cameraScaleForMass,
  frameSmoothingFactor,
  pixelRatioForViewport,
  pointerTargetForControls,
} from '../src/input.js';

test('pixelRatioForViewport caps coarse landscape screens at DPR 2', () => {
  assert.equal(pixelRatioForViewport({ devicePixelRatio: 3, isTouchDevice: true, viewWidth: 852, viewHeight: 393 }), 2);
  assert.equal(pixelRatioForViewport({ devicePixelRatio: 3, isTouchDevice: true, viewWidth: 393, viewHeight: 852 }), 3);
  assert.equal(pixelRatioForViewport({ devicePixelRatio: 4, isTouchDevice: false, viewWidth: 1280, viewHeight: 720 }), 3);
});

test('frameSmoothingFactor produces a stable exponential rate', () => {
  const oneFrameAt60 = frameSmoothingFactor(10, 1 / 60);
  const oneFrameAt30 = frameSmoothingFactor(10, 1 / 30);
  const sixtyFrameProgress = 1 - Math.pow(1 - oneFrameAt60, 60);
  const thirtyFrameProgress = 1 - Math.pow(1 - oneFrameAt30, 30);

  assert.ok(Math.abs(sixtyFrameProgress - thirtyFrameProgress) < 0.000001);
});

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

  assert.equal(result.x, playerCenter.x);
  assert.equal(result.y, playerCenter.y);
  assert.equal(result.isIdle, true);
});

test('pointerTargetForControls returns isIdle false when joystick is active', () => {
  const playerCenter = { x: 500, y: 600 };
  const result = pointerTargetForControls({
    playerCenter,
    joystickDirection: { x: 1, y: 0, strength: 0.5, active: true },
    isTouchDevice: true,
    camera: { x: 0, y: 0, scale: 1 },
    pointerScreen: { x: 200, y: 120 },
    view: { width: 800, height: 360 },
  });

  assert.equal(result.isIdle, false);
  assert.ok(result.x > playerCenter.x);
});

test('pointerTargetForControls idles on desktop when mouse is close to player', () => {
  const playerCenter = { x: 500, y: 500 };
  const result = pointerTargetForControls({
    playerCenter,
    joystickDirection: { x: 0, y: 0, strength: 0, active: false },
    isTouchDevice: false,
    camera: { x: 500, y: 500, scale: 0.5 },
    pointerScreen: { x: 640, y: 365 },
    view: { width: 1280, height: 720 },
  });

  assert.equal(result.isIdle, true);
  assert.equal(result.x, playerCenter.x);
  assert.equal(result.y, playerCenter.y);
});
