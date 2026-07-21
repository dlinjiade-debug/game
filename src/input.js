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
