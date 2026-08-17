// Dead zone radius in screen pixels — below this, input is treated as neutral.
// A dead zone of 12px prevents tiny unintentional movements from jitter.
// Once activated, the release threshold is slightly higher (14px) to add
// hysteresis and prevent rapid on/off flickering near the edge.
const DEAD_ZONE = 12;
const RELEASE_HYSTERESIS = 14;

export function pixelRatioForViewport({ devicePixelRatio = 1, isTouchDevice = false, viewWidth = 0, viewHeight = 0 }) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const isLandscapeTouch = isTouchDevice && viewWidth > viewHeight;
  return Math.min(isLandscapeTouch ? 2 : 3, ratio);
}

export function frameSmoothingFactor(rate, dt) {
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(dt) || dt <= 0) return 0;
  return 1 - Math.exp(-rate * dt);
}

export function smoothValue(current, target, rate, dt) {
  return current + (target - current) * frameSmoothingFactor(rate, dt);
}

export function calculateJoystick({ clientX, clientY, centerX, centerY, maxDistance }) {
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const distance = Math.hypot(dx, dy);

  if (distance < DEAD_ZONE) {
    return { x: 0, y: 0, knobX: 0, knobY: 0, strength: 0, active: false };
  }

  const clampedDistance = Math.min(distance, maxDistance);
  const x = dx / distance;
  const y = dy / distance;

  return {
    x,
    y,
    knobX: x * clampedDistance,
    knobY: y * clampedDistance,
    strength: clampedDistance / maxDistance,
    active: true,
  };
}

export function cameraScaleForMass({ totalMass, viewWidth, viewHeight }) {
  const isMobileLandscape = viewWidth < 900 && viewWidth > viewHeight;
  const isSmallScreen = viewWidth < 700 || viewHeight < 520;
  const base = isMobileLandscape ? 0.44 : isSmallScreen ? 0.50 : 0.72;
  const massZoomOut = Math.log2(Math.max(1, totalMass / 180)) * (isMobileLandscape ? 0.12 : 0.095);
  const minScale = isMobileLandscape ? 0.14 : isSmallScreen ? 0.18 : 0.26;
  const maxScale = isMobileLandscape ? 0.38 : isSmallScreen ? 0.46 : 0.62;

  return clamp(base - massZoomOut, minScale, maxScale);
}

export function pointerTargetForControls({ playerCenter, joystickDirection, isTouchDevice, camera, pointerScreen, view }) {
  if (joystickDirection.active) {
    const reach = 650 + joystickDirection.strength * 520;
    return {
      x: playerCenter.x + joystickDirection.x * reach,
      y: playerCenter.y + joystickDirection.y * reach,
      isIdle: false,
    };
  }

  if (isTouchDevice) {
    return { x: playerCenter.x, y: playerCenter.y, isIdle: true };
  }

  const worldX = camera.x + (pointerScreen.x - view.width / 2) / camera.scale;
  const worldY = camera.y + (pointerScreen.y - view.height / 2) / camera.scale;
  const dx = worldX - playerCenter.x;
  const dy = worldY - playerCenter.y;
  const screenDist = Math.hypot(dx * camera.scale, dy * camera.scale);

  if (screenDist < 120) {
    return { x: playerCenter.x, y: playerCenter.y, isIdle: true };
  }

  return { x: worldX, y: worldY, isIdle: false };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
