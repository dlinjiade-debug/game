import {
  CONFIG,
  createInitialState,
  ejectMass,
  radiusFromMass,
  splitPlayer,
  stepWorld,
} from './simulation.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const stats = document.querySelector('#stats');
const leaderboard = document.querySelector('#leaderboard');
const toast = document.querySelector('#toast');
const endScreen = document.querySelector('#endScreen');
const resultTitle = document.querySelector('#resultTitle');
const restart = document.querySelector('#restart');

let state = createInitialState();
let lastTime = performance.now();
let toastTimer = 0;
const pointer = { x: 0, y: 0, screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 };
const camera = { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2, scale: 1 };

resize();
window.addEventListener('resize', resize);
window.addEventListener('mousemove', (event) => {
  pointer.screenX = event.clientX;
  pointer.screenY = event.clientY;
});
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space') {
    event.preventDefault();
    splitPlayer(state, directionFromPlayerToPointer());
    flash('分身');
  }
  if (event.code === 'KeyW') {
    ejectMass(state, directionFromPlayerToPointer());
    flash('吐球');
  }
  if (event.code === 'KeyR') reset();
});
restart.addEventListener('click', reset);

requestAnimationFrame(loop);

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  updateCamera();
  pointer.x = camera.x + (pointer.screenX - canvas.width / 2) / camera.scale;
  pointer.y = camera.y + (pointer.screenY - canvas.height / 2) / camera.scale;
  stepWorld(state, { pointerWorld: pointer }, dt);
  updateCamera();
  draw();
  updateHud();
  requestAnimationFrame(loop);
}

function reset() {
  state = createInitialState();
  endScreen.classList.add('hidden');
  lastTime = performance.now();
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function updateCamera() {
  const center = playerCenter();
  const totalMass = state.player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  const targetScale = clamp(1.1 - Math.sqrt(totalMass) / 120, 0.42, 0.95) * (window.devicePixelRatio || 1);
  camera.x += (center.x - camera.x) * 0.08;
  camera.y += (center.y - camera.y) * 0.08;
  camera.scale += (targetScale - camera.scale) * 0.06;
}

function draw() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#08111f');
  gradient.addColorStop(0.55, '#111827');
  gradient.addColorStop(1, '#130f24');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  drawGrid();
  drawZone();
  drawPellets();
  drawEjected();
  drawViruses();
  drawAllCells();

  ctx.restore();
  drawMinimap();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1 / camera.scale;
  for (let x = 0; x <= CONFIG.worldSize; x += 180) {
    line(x, 0, x, CONFIG.worldSize);
  }
  for (let y = 0; y <= CONFIG.worldSize; y += 180) {
    line(0, y, CONFIG.worldSize, y);
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 5 / camera.scale;
  ctx.strokeRect(0, 0, CONFIG.worldSize, CONFIG.worldSize);
}

function drawZone() {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1000, -1000, CONFIG.worldSize + 2000, CONFIG.worldSize + 2000);
  ctx.arc(state.zone.x, state.zone.y, state.zone.radius, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.arc(state.zone.x, state.zone.y, state.zone.radius, 0, Math.PI * 2);
  ctx.lineWidth = 8 / camera.scale;
  ctx.strokeStyle = '#f97316';
  ctx.stroke();
  ctx.restore();
}

function drawPellets() {
  for (const pellet of state.pellets) {
    ctx.beginPath();
    ctx.fillStyle = `hsl(${pellet.hue} 82% 66%)`;
    ctx.arc(pellet.x, pellet.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEjected() {
  for (const item of state.ejected) {
    ctx.beginPath();
    ctx.fillStyle = '#e0f2fe';
    ctx.arc(item.x, item.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawViruses() {
  for (const virus of state.viruses) {
    drawSpikyCircle(virus.x, virus.y, radiusFromMass(virus.mass), 18, '#4ade80', '#166534');
  }
}

function drawAllCells() {
  const all = [
    ...state.ai.flatMap((ai) => ai.cells.map((cell) => ({ cell, owner: ai }))),
    ...state.player.cells.map((cell) => ({ cell, owner: state.player })),
  ].sort((a, b) => a.cell.mass - b.cell.mass);

  for (const item of all) {
    drawCell(item.cell, item.owner);
  }
}

function drawCell(cell, owner) {
  const radius = radiusFromMass(cell.mass);
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = owner.color;
  ctx.strokeStyle = owner.id === 'player' ? '#ddd6fe' : 'rgba(255,255,255,0.62)';
  ctx.lineWidth = owner.id === 'player' ? 5 / camera.scale : 3 / camera.scale;
  ctx.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(14, radius * 0.28)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(owner.name, cell.x, cell.y);
  ctx.restore();
}

function drawSpikyCircle(x, y, radius, spikes, fill, stroke) {
  ctx.save();
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
  const size = 140;
  const left = canvas.width - size - 18;
  const top = canvas.height - size - 18;
  const scale = size / CONFIG.worldSize;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(8, 13, 28, 0.78)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, 8);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#f97316';
  ctx.arc(left + state.zone.x * scale, top + state.zone.y * scale, state.zone.radius * scale, 0, Math.PI * 2);
  ctx.stroke();

  for (const ai of state.ai) {
    const c = ownerCenter(ai);
    dot(left + c.x * scale, top + c.y * scale, 2, ai.color);
  }
  const p = playerCenter();
  dot(left + p.x * scale, top + p.y * scale, 4, '#ddd6fe');
  ctx.restore();
}

function updateHud() {
  const totalMass = state.player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  const alive = state.ai.length + (state.player.cells.length > 0 ? 1 : 0);
  const zonePercent = Math.round((state.zone.radius / CONFIG.startZoneRadius) * 100);
  stats.innerHTML = `
    <div>质量：${Math.round(totalMass)}</div>
    <div>分身：${state.player.cells.length}/${CONFIG.maxPlayerCells}</div>
    <div>存活：${alive}</div>
    <div>安全区：${zonePercent}%</div>
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
