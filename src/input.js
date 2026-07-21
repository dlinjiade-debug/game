export function calculateJoystick({ clientX, clientY, centerX, centerY, maxDistance }) {
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const distance = Math.hypot(dx, dy);

  if (distance < 8) {
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
    };
  }

  if (isTouchDevice) {
    return playerCenter;
  }

  return {
    x: camera.x + (pointerScreen.x - view.width / 2) / camera.scale,
    y: camera.y + (pointerScreen.y - view.height / 2) / camera.scale,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
