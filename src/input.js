const VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function directionFromKeys(keys) {
  let x = 0;
  let y = 0;

  for (const key of keys) {
    const vector = VECTORS[key];
    if (!vector) continue;
    x += vector.x;
    y += vector.y;
  }

  const length = Math.hypot(x, y);
  if (length < 0.0001) return { x: 0, y: 0, active: false };
  return { x: x / length, y: y / length, active: true };
}
