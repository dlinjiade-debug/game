import {
  CONFIG,
  createInitialState,
  ejectMass,
  radiusFromMass,
  splitPlayer,
  stepWorld,
} from './simulation.js';
import {
  calculateJoystick,
  cameraScaleForMass,
  frameSmoothingFactor,
  pixelRatioForViewport,
  pointerTargetForControls,
  smoothValue,
} from './input.js';
import { playEat, playSplit, playEject, playVirusPop, playDeath, playKill, playZoneWarn, initAudio } from './audio.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
const stats = document.querySelector('#stats');
const leaderboard = document.querySelector('#leaderboard');
const toast = document.querySelector('#toast');
const endScreen = document.querySelector('#endScreen');
const resultTitle = document.querySelector('#resultTitle');
const restart = document.querySelector('#restart');
const mobileSplit = document.querySelector('#mobileSplit');
const mobileEject = document.querySelector('#mobileEject');
const joystick = document.querySelector('#joystick');
const joystickBall = document.querySelector('#joystickBall');

let state = createInitialState();
let lastTime = performance.now();
let toastTimer = 0;
let zoneWarnTimer = 0;
let viewWidth = window.visualViewport?.width || window.innerWidth;
let viewHeight = window.visualViewport?.height || window.innerHeight;
let pixelRatio = pixelRatioForViewport({
  devicePixelRatio: window.devicePixelRatio,
  isTouchDevice: window.matchMedia('(pointer: coarse)').matches,
  viewWidth,
  viewHeight,
});
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let viewportResizeFrame = 0;
let backdropCanvas = null;
let backdropKey = '';
let hudLastUpdate = 0;
let hudSignature = '';
let triedLandscapeLock = false;
let joystickPointerId = null;
let joystickDirection = { x: 0, y: 0, strength: 0, active: false };
let joystickSmoothed = { x: 0, y: 0, strength: 0, active: false };
let isMoving = true;
let playerVelocity = { x: 0, y: 0 };
let previousPlayerCenter = { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2 };
let shake = { x: 0, y: 0, intensity: 0 };
let killFeed = [];
let prevPlayerAlive = true;

const pointer = {
  x: CONFIG.worldSize / 2,
  y: CONFIG.worldSize / 2,
  screenX: viewWidth / 2,
  screenY: viewHeight / 2,
};
const camera = { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2, scale: 1 };
let renderBounds = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
const stars = Array.from({ length: 240 }, (_, index) => makeStar(index));

resize();
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResize);
  window.visualViewport.addEventListener('scroll', scheduleResize);
}
window.addEventListener('mousemove', (event) => setPointerFromClient(event.clientX, event.clientY));
window.addEventListener('touchstart', handleTouch, { passive: false });
window.addEventListener('touchmove', handleTouch, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: false });
window.addEventListener('touchcancel', handleTouchCancel, { passive: false });
window.addEventListener('pointerdown', tryLandscapeLock, { passive: true });
window.addEventListener('keydown', handleKeydown);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) triedLandscapeLock = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resetJoystick();
    // Save the time so we don't get a huge dt spike when returning
    lastTime = performance.now();
  }
});
window.addEventListener('blur', resetJoystick);
restart.addEventListener('click', reset);
if (mobileSplit) {
  mobileSplit.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    performSplit();
  });
}
if (mobileEject) {
  mobileEject.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    performEject();
  });
}
if (joystick) {
  joystick.addEventListener('pointerdown', handleJoystickStart);
  joystick.addEventListener('pointermove', handleJoystickMove);
  joystick.addEventListener('pointerup', handleJoystickEnd);
  joystick.addEventListener('pointercancel', handleJoystickEnd);
  joystick.addEventListener('lostpointercapture', handleJoystickEnd);
  joystick.addEventListener('touchcancel', handleJoystickEnd);
}

requestAnimationFrame(loop);

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  // Track pre-step state for kill detection
  const prevAI = state.ai.map((ai) => ({ id: ai.id, name: ai.name, alive: ai.cells.length > 0 }));
  prevPlayerAlive = state.player.cells.length > 0;
  const prevPelletCount = state.pellets.length;
  const prevVirusCount = state.viruses.length;

  updateCamera(dt);
  updatePointerWorld(dt);
  stepWorld(state, { pointerWorld: pointer, isMoving }, dt);

  // Detect events and play sounds
  const pelletDiff = prevPelletCount - state.pellets.length;
  if (pelletDiff > 0) playEat();
  if (prevVirusCount > state.viruses.length) { playVirusPop(); triggerShake(15); }

  const deadAIs = prevAI.filter((p) => p.alive && !state.ai.some((ai) => ai.id === p.id));
  for (const dead of deadAIs) {
    playKill();
    killFeed.unshift({ text: `⚡ 你 消灭了 ${dead.name}`, time: performance.now() });
    if (killFeed.length > 8) killFeed.length = 8;
  }
  if (deadAIs.length > 0) { triggerShake(10); triggerHaptic('kill'); }
  if (prevPlayerAlive && state.player.cells.length === 0) {
    playDeath();
    triggerShake(25);
    triggerHaptic('death');
  }

  // Decay shake
  shake.intensity *= 0.88;
  if (shake.intensity < 0.3) shake.intensity = 0;
  shake.x = (Math.random() - 0.5) * shake.intensity;
  shake.y = (Math.random() - 0.5) * shake.intensity;

  // Zone warning: play sound periodically when player is near the zone edge
  if (state.player.cells.length > 0) {
    const pc = playerCenter();
    const distToEdge = state.zone.radius - Math.hypot(pc.x - state.zone.x, pc.y - state.zone.y);
    if (distToEdge < 280 && performance.now() - zoneWarnTimer > 1800) {
      playZoneWarn();
      zoneWarnTimer = performance.now();
    }
  }

  updateCamera(dt);
  draw();
  updateHud(now);
  requestAnimationFrame(loop);
}

function handleKeydown(event) {
  if (event.repeat) return;
  if (event.code === 'Space') {
    event.preventDefault();
    performSplit();
  }
  if (event.code === 'KeyW') {
    performEject();
  }
  if (event.code === 'KeyR') reset();
}

function handleTouch(event) {
  tryLandscapeLock();
  // Skip if the touch is on a button or the joystick
  if (event.target.closest('button') || event.target.closest('.joystick')) return;
  event.preventDefault();
  // Use changedTouches to get the touch that triggered this event
  const touch = event.changedTouches[0];
  if (!touch) return;
  setPointerFromClient(touch.clientX, touch.clientY);
}

function handleTouchEnd(event) {
  // If all touches are gone, reset pointer to center (idle state)
  if (event.touches.length === 0) {
    setPointerFromClient(viewWidth / 2, viewHeight / 2);
  }
}

function handleTouchCancel(event) {
  // On touch cancel (system gesture, etc.), reset everything
  handleTouchEnd(event);
  if (joystickPointerId !== null) {
    resetJoystick();
  }
}

function handleJoystickStart(event) {
  if (!joystick) return;
  event.preventDefault();
  initAudio();
  tryLandscapeLock();
  joystickPointerId = event.pointerId;
  try {
    joystick.setPointerCapture(event.pointerId);
  } catch {
    resetJoystick();
    return;
  }
  joystick.classList.add('active');
  updateJoystick(event);
}

function handleJoystickMove(event) {
  if (!joystick || event.pointerId !== joystickPointerId) return;
  event.preventDefault();
  updateJoystick(event);
}

function handleJoystickEnd(event) {
  if (event?.pointerId != null && event.pointerId !== joystickPointerId) return;
  if (event) event.preventDefault();
  resetJoystick();
}

function resetJoystick() {
  joystickPointerId = null;
  joystickDirection = { x: 0, y: 0, strength: 0, active: false };
  joystickSmoothed = { x: 0, y: 0, strength: 0, active: false };
  joystick?.classList.remove('active');
  if (joystickBall) joystickBall.style.transform = 'translate(-50%, -50%)';
}

function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const result = calculateJoystick({
    clientX: event.clientX,
    clientY: event.clientY,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    maxDistance: rect.width * 0.34,
  });
  joystickDirection = result;
  joystickBall.style.transform = `translate(calc(-50% + ${result.knobX}px), calc(-50% + ${result.knobY}px))`;
}

async function tryLandscapeLock() {
  if (triedLandscapeLock || !isTouchDevice()) return;
  triedLandscapeLock = true;

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    // Mobile browsers often reject orientation lock unless installed/fullscreen.
  }
}

function performSplit() {
  initAudio();
  splitPlayer(state, directionFromPlayerToPointer());
  playSplit();
  triggerShake(5);
  triggerHaptic('split');
  flash('分身冲刺');
}

function performEject() {
  initAudio();
  ejectMass(state, directionFromPlayerToPointer());
  playEject();
  triggerHaptic('eject');
  flash('吐球加速');
}

function reset() {
  initAudio();
  state = createInitialState();
  endScreen.classList.add('hidden');
  lastTime = performance.now();
  killFeed = [];
  playerVelocity = { x: 0, y: 0 };
  previousPlayerCenter = playerCenter();
  setPointerFromClient(viewWidth / 2, viewHeight / 2);
  hudSignature = '';
  hudLastUpdate = 0;
}

function scheduleResize() {
  if (viewportResizeFrame) return;
  viewportResizeFrame = window.requestAnimationFrame(() => {
    viewportResizeFrame = 0;
    resize();
  });
}

function resize() {
  const viewport = readViewport();
  viewWidth = viewport.width;
  viewHeight = viewport.height;
  pixelRatio = pixelRatioForViewport({
    devicePixelRatio: window.devicePixelRatio,
    isTouchDevice: isTouchDevice(),
    viewWidth,
    viewHeight,
  });
  safeInsets = readSafeInsets();

  const root = document.documentElement;
  root.style.setProperty('--viewport-width', `${viewWidth}px`);
  root.style.setProperty('--viewport-height', `${viewHeight}px`);
  root.style.setProperty('--viewport-offset-top', `${viewport.offsetTop}px`);
  root.style.setProperty('--viewport-offset-left', `${viewport.offsetLeft}px`);
  root.style.setProperty('--safe-top', `${safeInsets.top}px`);
  root.style.setProperty('--safe-right', `${safeInsets.right}px`);
  root.style.setProperty('--safe-bottom', `${safeInsets.bottom}px`);
  root.style.setProperty('--safe-left', `${safeInsets.left}px`);
  root.style.setProperty('--browser-inset-top', `${viewport.offsetTop}px`);
  root.style.setProperty('--browser-inset-bottom', `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`);

  canvas.width = Math.floor(viewWidth * pixelRatio);
  canvas.height = Math.floor(viewHeight * pixelRatio);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  const nextBackdropKey = `${viewWidth}:${viewHeight}:${pixelRatio}`;
  if (nextBackdropKey !== backdropKey) {
    backdropKey = nextBackdropKey;
    buildBackdrop();
  }
  pointer.screenX = clamp(pointer.screenX, 0, viewWidth);
  pointer.screenY = clamp(pointer.screenY, 0, viewHeight);
}

function readViewport() {
  const visualViewport = window.visualViewport;
  return {
    width: Math.max(1, visualViewport?.width || window.innerWidth),
    height: Math.max(1, visualViewport?.height || window.innerHeight),
    offsetTop: Math.max(0, visualViewport?.offsetTop || 0),
    offsetLeft: Math.max(0, visualViewport?.offsetLeft || 0),
  };
}

function readSafeInsets() {
  const styles = getComputedStyle(document.documentElement);
  return {
    top: parseCssPixels(styles.getPropertyValue('--safe-area-top')),
    right: parseCssPixels(styles.getPropertyValue('--safe-area-right')),
    bottom: parseCssPixels(styles.getPropertyValue('--safe-area-bottom')),
    left: parseCssPixels(styles.getPropertyValue('--safe-area-left')),
  };
}

function parseCssPixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildBackdrop() {
  try {
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = Math.max(1, Math.floor(viewWidth * pixelRatio));
    nextCanvas.height = Math.max(1, Math.floor(viewHeight * pixelRatio));
    const nextContext = nextCanvas.getContext('2d');
    if (!nextContext) throw new Error('Backdrop context unavailable');
    nextContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const gradient = nextContext.createRadialGradient(
      viewWidth * 0.48,
      viewHeight * 0.42,
      30,
      viewWidth * 0.5,
      viewHeight * 0.5,
      Math.max(viewWidth, viewHeight),
    );
    gradient.addColorStop(0, '#281a52');
    gradient.addColorStop(0.34, '#121638');
    gradient.addColorStop(0.72, '#080d22');
    gradient.addColorStop(1, '#030614');
    nextContext.fillStyle = gradient;
    nextContext.fillRect(0, 0, viewWidth, viewHeight);

    drawNebulaAt(nextContext, viewWidth * 0.2, viewHeight * 0.18, viewWidth * 0.45, 'rgba(124, 58, 237, 0.18)');
    drawNebulaAt(nextContext, viewWidth * 0.82, viewHeight * 0.72, viewWidth * 0.38, 'rgba(14, 165, 233, 0.13)');
    drawNebulaAt(nextContext, viewWidth * 0.55, viewHeight * 0.18, viewWidth * 0.32, 'rgba(236, 72, 153, 0.10)');
    backdropCanvas = nextCanvas;
  } catch {
    backdropCanvas = null;
  }
}

function setPointerFromClient(clientX, clientY) {
  pointer.screenX = clamp(clientX, 0, viewWidth);
  pointer.screenY = clamp(clientY, 0, viewHeight);
}

function updatePointerWorld(dt) {
  // Pointer capture is the only per-frame safety check; a held finger may not emit move events.
  if (joystickPointerId !== null && joystick.hasPointerCapture && !joystick.hasPointerCapture(joystickPointerId)) {
    resetJoystick();
  }
  const joystickFactor = frameSmoothingFactor(18, dt);
  joystickSmoothed = {
    x: smoothValue(joystickSmoothed.x, joystickDirection.x, 18, dt),
    y: smoothValue(joystickSmoothed.y, joystickDirection.y, 18, dt),
    strength: smoothValue(joystickSmoothed.strength, joystickDirection.active ? joystickDirection.strength : 0, 18, dt),
    active: joystickDirection.active,
  };
  if (!joystickDirection.active && joystickFactor > 0.99) {
    joystickSmoothed = { x: 0, y: 0, strength: 0, active: false };
  }
  const target = pointerTargetForControls({
    playerCenter: playerCenter(),
    joystickDirection: joystickSmoothed,
    isTouchDevice: isTouchDevice(),
    camera,
    pointerScreen: { x: pointer.screenX, y: pointer.screenY },
    view: { width: viewWidth, height: viewHeight },
  });
  pointer.x = target.x;
  pointer.y = target.y;
  isMoving = !target.isIdle;
}

function updateCamera(dt) {
  const center = playerCenter();
  const totalMass = state.player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  const targetScale = cameraScaleForMass({ totalMass, viewWidth, viewHeight });

  // Track player velocity for look-ahead
  const rawVx = (center.x - previousPlayerCenter.x) / Math.max(dt, 1 / 120);
  const rawVy = (center.y - previousPlayerCenter.y) / Math.max(dt, 1 / 120);
  previousPlayerCenter = center;
  playerVelocity.x = smoothValue(playerVelocity.x, rawVx, 8, dt);
  playerVelocity.y = smoothValue(playerVelocity.y, rawVy, 8, dt);

  // Look-ahead: offset camera in movement direction for better game feel
  const speed = Math.hypot(playerVelocity.x, playerVelocity.y);
  const lookAheadMax = 260;
  const lookAhead = Math.min(lookAheadMax, speed * 0.32);
  const lookX = speed > 0.01 ? (playerVelocity.x / speed) * lookAhead : 0;
  const lookY = speed > 0.01 ? (playerVelocity.y / speed) * lookAhead : 0;

  const cameraFactor = frameSmoothingFactor(5, dt);
  const scaleFactor = frameSmoothingFactor(4, dt);
  camera.x += (center.x + lookX - camera.x) * cameraFactor;
  camera.y += (center.y + lookY - camera.y) * cameraFactor;
  camera.scale += (targetScale - camera.scale) * scaleFactor;
}

function draw() {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  drawSpaceBackdrop();

  ctx.save();
  ctx.translate(viewWidth / 2 + shake.x, viewHeight / 2 + shake.y);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  renderBounds = calculateVisibleWorldBounds();

  drawGrid();
  drawZone();
  drawPellets();
  drawEjected();
  drawViruses();
  drawAllCells();
  drawParticles();
  drawFloatTexts();

  ctx.restore();
  drawMinimap();
  drawKillFeed();
}

function visibleWorldBounds() {
  return renderBounds;
}

function calculateVisibleWorldBounds() {
  const padding = 80;
  return {
    left: camera.x - viewWidth / (2 * camera.scale) - padding,
    right: camera.x + viewWidth / (2 * camera.scale) + padding,
    top: camera.y - viewHeight / (2 * camera.scale) - padding,
    bottom: camera.y + viewHeight / (2 * camera.scale) + padding,
  };
}

function isWorldVisible(x, y, radius = 0) {
  const bounds = visibleWorldBounds();
  return x + radius >= bounds.left && x - radius <= bounds.right &&
    y + radius >= bounds.top && y - radius <= bounds.bottom;
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.055)';
  ctx.lineWidth = 1 / camera.scale;
  for (let x = 0; x <= CONFIG.worldSize; x += 240) {
    line(x, 0, x, CONFIG.worldSize);
  }
  for (let y = 0; y <= CONFIG.worldSize; y += 240) {
    line(0, y, CONFIG.worldSize, y);
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 4 / camera.scale;
  ctx.strokeRect(0, 0, CONFIG.worldSize, CONFIG.worldSize);
}

function drawSpaceBackdrop() {
  if (backdropCanvas) {
    ctx.drawImage(backdropCanvas, 0, 0, viewWidth, viewHeight);
  } else {
    const gradient = ctx.createRadialGradient(viewWidth * 0.48, viewHeight * 0.42, 30, viewWidth * 0.5, viewHeight * 0.5, Math.max(viewWidth, viewHeight));
    gradient.addColorStop(0, '#281a52');
    gradient.addColorStop(0.34, '#121638');
    gradient.addColorStop(0.72, '#080d22');
    gradient.addColorStop(1, '#030614');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    drawNebula(viewWidth * 0.2, viewHeight * 0.18, viewWidth * 0.45, 'rgba(124, 58, 237, 0.18)');
    drawNebula(viewWidth * 0.82, viewHeight * 0.72, viewWidth * 0.38, 'rgba(14, 165, 233, 0.13)');
    drawNebula(viewWidth * 0.55, viewHeight * 0.18, viewWidth * 0.32, 'rgba(236, 72, 153, 0.10)');
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const star of stars) {
    const x = wrap(star.x - camera.x * star.depth * 0.04, viewWidth);
    const y = wrap(star.y - camera.y * star.depth * 0.04, viewHeight);
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = star.color;
    ctx.beginPath();
    ctx.arc(x, y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawNebula(x, y, radius, color) {
  drawNebulaAt(ctx, x, y, radius, color);
}

function drawNebulaAt(targetContext, x, y, radius, color) {
  const gradient = targetContext.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  targetContext.fillStyle = gradient;
  targetContext.beginPath();
  targetContext.arc(x, y, radius, 0, Math.PI * 2);
  targetContext.fill();
}

function drawZone() {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1000, -1000, CONFIG.worldSize + 2000, CONFIG.worldSize + 2000);
  ctx.arc(state.zone.x, state.zone.y, state.zone.radius, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(88, 28, 135, 0.28)';
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.arc(state.zone.x, state.zone.y, state.zone.radius, 0, Math.PI * 2);
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 26 / camera.scale;
  ctx.lineWidth = 10 / camera.scale;
  ctx.strokeStyle = '#fde047';
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3 / camera.scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();
  ctx.restore();
}

function drawPellets() {
  const time = state.elapsed;
  for (const pellet of state.pellets) {
    if (!isWorldVisible(pellet.x, pellet.y, 16)) continue;
    const pulse = 1 + Math.sin(time * 3 + pellet.hue * 0.1) * 0.15;
    const r = 5.5 * pulse;
    const alpha = 0.75 + Math.sin(time * 2.5 + pellet.hue * 0.15) * 0.25;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = `hsl(${pellet.hue} 90% 68%)`;
    ctx.shadowBlur = 10 / camera.scale;
    ctx.beginPath();
    ctx.fillStyle = `hsl(${pellet.hue} 95% 68%)`;
    ctx.arc(pellet.x, pellet.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEjected() {
  for (const item of state.ejected) {
    if (!isWorldVisible(item.x, item.y, 18)) continue;
    ctx.save();
    ctx.shadowColor = '#bae6fd';
    ctx.shadowBlur = 18 / camera.scale;
    ctx.beginPath();
    ctx.fillStyle = '#e0f2fe';
    ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawViruses() {
  for (const virus of state.viruses) {
    if (!isWorldVisible(virus.x, virus.y, radiusFromMass(virus.mass) + 16)) continue;
    drawSpikyCircle(virus.x, virus.y, radiusFromMass(virus.mass), 18, '#4ade80', '#166534');
  }
}

function drawAllCells() {
  const all = [];
  for (const ai of state.ai) {
    for (const cell of ai.cells) {
      if (isWorldVisible(cell.x, cell.y, radiusFromMass(cell.mass) + 24)) all.push({ cell, owner: ai });
    }
  }
  for (const cell of state.player.cells) {
    if (isWorldVisible(cell.x, cell.y, radiusFromMass(cell.mass) + 24)) all.push({ cell, owner: state.player });
  }
  all.sort((a, b) => a.cell.mass - b.cell.mass);

  for (const item of all) {
    drawCell(item.cell, item.owner);
  }
}

function drawCell(cell, owner) {
  const baseRadius = radiusFromMass(cell.mass);
  const pulse = 1 + Math.sin(state.elapsed * 2.5 + cell.x * 0.01) * 0.018;
  const radius = baseRadius * pulse;
  const isPlayer = owner.id === 'player';

  // Velocity-based stretch for dynamic feel
  const speed = Math.hypot(cell.vx, cell.vy);
  const stretchFactor = Math.min(speed / 280, 1) * 0.18;
  const stretchAngle = Math.atan2(cell.vy, cell.vx);

  ctx.save();
  ctx.translate(cell.x, cell.y);
  if (stretchFactor > 0.01) {
    ctx.rotate(stretchAngle);
    ctx.scale(1 + stretchFactor, 1 - stretchFactor * 0.5);
  }

  const fill = cellGradient(0, 0, radius, owner.color, isPlayer);
  const rimColor = isPlayer ? '#fff7c2' : shadeColor(owner.color, -46);
  const innerRimColor = isPlayer ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.7)';

  // Layered lighting keeps the ball readable at a distance while preserving the soft-gloss style.
  ctx.shadowColor = isPlayer ? 'rgba(250, 204, 21, 0.86)' : owner.color;
  ctx.shadowBlur = (isPlayer ? 30 : 18) / camera.scale;
  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = rimColor;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = (isPlayer ? 6 : 4) / camera.scale;
  ctx.stroke();

  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = innerRimColor;
  ctx.lineWidth = Math.max(2 / camera.scale, radius * 0.025);
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Broad soft reflection.
  const gloss = ctx.createRadialGradient(
    -radius * 0.34,
    -radius * 0.42,
    radius * 0.03,
    -radius * 0.25,
    -radius * 0.28,
    radius * 0.64,
  );
  gloss.addColorStop(0, 'rgba(255,255,255,0.76)');
  gloss.addColorStop(0.32, 'rgba(255,255,255,0.20)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.fillStyle = gloss;
  ctx.arc(-radius * 0.18, -radius * 0.18, radius * 0.76, 0, Math.PI * 2);
  ctx.fill();

  // Thin lower reflection gives the sphere a rounded edge instead of a flat fill.
  ctx.globalAlpha = 0.34;
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2 / camera.scale, radius * 0.035);
  ctx.arc(0, 0, radius * 0.82, 0.28, Math.PI - 0.28);
  ctx.stroke();

  // Small specular spark, kept subtle so it does not compete with the name.
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-radius * 0.48, -radius * 0.5, Math.max(1.5 / camera.scale, radius * 0.075), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
  const labelSize = Math.max(11 / camera.scale, radius * 0.28);
  ctx.lineWidth = Math.max(2.5 / camera.scale, labelSize * 0.12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${labelSize}px "Microsoft YaHei", sans-serif`;
  ctx.strokeText(owner.name, 0, 0);
  ctx.fillText(owner.name, 0, 0);
  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    if (!isWorldVisible(p.x, p.y, p.radius + 10)) continue;
    const alpha = (p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6 / camera.scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFloatTexts() {
  for (const ft of state.floatTexts) {
    if (!isWorldVisible(ft.x, ft.y, 80)) continue;
    const alpha = Math.min(1, ft.life / ft.maxLife * 2);
    const fontSize = Math.max(16, 22 / camera.scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(2, 3 / camera.scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawKillFeed() {
  const now = performance.now();
  killFeed = killFeed.filter((entry) => now - entry.time < 3500);
  const maxShow = 4;
  const entries = killFeed.slice(0, maxShow);
  const startX = viewWidth < 700 ? 10 : 220;
  const startY = viewWidth < 700 ? 60 : 48;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const age = (now - entry.time) / 3500;
    const alpha = 1 - age;
    const y = startY + i * 26;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6, 10, 28, 0.65)';
    ctx.beginPath();
    ctx.roundRect(startX, y - 10, 240, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.text, startX + 8, y);
    ctx.restore();
  }
}

function drawSpikyCircle(x, y, radius, spikes, fill, stroke) {
  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = 24 / camera.scale;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (Math.PI * i) / spikes;
    const r = i % 2 === 0 ? radius * 1.14 : radius * 0.82;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 5 / camera.scale;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMinimap() {
  const size = viewWidth < 900 && viewWidth > viewHeight ? 112 : viewWidth < 700 ? 96 : 140;
  const left = viewWidth - size - Math.max(12, safeInsets.right + 10);
  const top = Math.max(10, safeInsets.top + 8);
  const scale = size / CONFIG.worldSize;
  const playerMass = state.player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, 8);
  ctx.fillStyle = 'rgba(6, 10, 28, 0.82)';
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#f97316';
  ctx.arc(left + state.zone.x * scale, top + state.zone.y * scale, state.zone.radius * scale, 0, Math.PI * 2);
  ctx.stroke();

  for (const ai of state.ai) {
    const c = ownerCenter(ai);
    const aiMass = ai.cells.reduce((sum, cell) => sum + cell.mass, 0);
    // Show threats (bigger AIs) in red, smaller AIs in their own color
    const color = aiMass > playerMass * 1.15 ? '#ef4444' : ai.color;
    const dotSize = aiMass > playerMass * 1.15 ? 3 : 2;
    dot(left + c.x * scale, top + c.y * scale, dotSize, color);
  }
  const p = playerCenter();
  dot(left + p.x * scale, top + p.y * scale, 4, '#ddd6fe');
  ctx.restore();
}

function updateHud(now = performance.now()) {
  const totalMass = state.player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  const alive = state.ai.length + (state.player.cells.length > 0 ? 1 : 0);
  const zonePercent = Math.round((state.zone.radius / CONFIG.startZoneRadius) * 100);
  const signature = `${Math.round(totalMass)}|${state.player.cells.length}|${alive}|${zonePercent}|${state.status}`;
  if (state.status === 'playing' && (now - hudLastUpdate < 100 || signature === hudSignature)) return;

  hudLastUpdate = now;
  hudSignature = signature;
  stats.innerHTML = `
    <div><b>质量</b>${Math.round(totalMass)}</div>
    <div><b>分身</b>${state.player.cells.length}/${CONFIG.maxPlayerCells}</div>
    <div><b>存活</b>${alive}</div>
    <div><b>安全区</b>${zonePercent}%</div>
  `;

  leaderboard.innerHTML = leaders()
    .slice(0, 6)
    .map((entry) => `<li style="color:${entry.color}">${entry.name} ${Math.round(entry.mass)}</li>`)
    .join('');

  if (state.status !== 'playing') {
    endScreen.classList.remove('hidden');
    resultTitle.textContent = state.status === 'won' ? '你吃到最后了' : '被淘汰';
  }
}

function leaders() {
  return [state.player, ...state.ai]
    .filter((owner) => owner.cells.length > 0)
    .map((owner) => ({
      name: owner.name,
      color: owner.color,
      mass: owner.cells.reduce((sum, cell) => sum + cell.mass, 0),
    }))
    .sort((a, b) => b.mass - a.mass);
}

function playerCenter() {
  return ownerCenter(state.player);
}

function ownerCenter(owner) {
  if (owner.cells.length === 0) return { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2 };
  const mass = owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
  return owner.cells.reduce(
    (center, cell) => ({
      x: center.x + (cell.x * cell.mass) / mass,
      y: center.y + (cell.y * cell.mass) / mass,
    }),
    { x: 0, y: 0 },
  );
}

function directionFromPlayerToPointer() {
  const center = playerCenter();
  return { x: pointer.x - center.x, y: pointer.y - center.y };
}

function flash(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 520);
}

function triggerShake(intensity) {
  shake.intensity = Math.max(shake.intensity, intensity);
}

function triggerHaptic(type) {
  if (!isTouchDevice() || !navigator.vibrate) return;
  switch (type) {
    case 'split':
      navigator.vibrate(30);
      break;
    case 'eject':
      navigator.vibrate(15);
      break;
    case 'kill':
      navigator.vibrate([20, 30, 20]);
      break;
    case 'death':
      navigator.vibrate([50, 40, 50, 40, 100]);
      break;
  }
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(x, y, radius, color) {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function cellGradient(x, y, radius, color, isPlayer) {
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, radius * 0.12, x, y, radius);
  if (isPlayer) {
    gradient.addColorStop(0, '#fff7ad');
    gradient.addColorStop(0.22, '#fde68a');
    gradient.addColorStop(0.74, '#f4b63f');
    gradient.addColorStop(1, '#b45309');
  } else {
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.26, color);
    gradient.addColorStop(1, shadeColor(color, -34));
  }
  return gradient;
}

function shadeColor(hex, percent) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean, 16);
  const amount = Math.round(2.55 * percent);
  const red = clamp((value >> 16) + amount, 0, 255);
  const green = clamp(((value >> 8) & 0xff) + amount, 0, 255);
  const blue = clamp((value & 0xff) + amount, 0, 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function makeStar(index) {
  const random = Math.sin(index * 999.91) * 10000;
  const random2 = Math.sin(index * 237.19) * 10000;
  const random3 = Math.sin(index * 531.77) * 10000;
  return {
    x: Math.abs(random % 1) * Math.max(window.innerWidth, 320),
    y: Math.abs(random2 % 1) * Math.max(window.innerHeight, 320),
    size: 0.6 + Math.abs(random3 % 1) * 2.2,
    alpha: 0.28 + Math.abs(random % 1) * 0.72,
    depth: 0.4 + Math.abs(random2 % 1) * 1.6,
    color: Math.abs(random3 % 1) > 0.75 ? '#fef3c7' : '#dbeafe',
  };
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}
