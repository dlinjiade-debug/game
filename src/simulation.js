export const CONFIG = {
  worldSize: 4200,
  maxPlayerCells: 16,
  initialPlayerMass: 120,
  pelletMass: 6,
  ejectCost: 18,
  ejectedMass: 14,
  minEjectMass: 55,
  minSplitMass: 85,
  splitImpulse: 520,
  virusMass: 120,
  minVirusPopMass: 250,
  maxVirusFragments: 8,
  eatRatio: 1.16,
  zoneDamagePerSecond: 18,
  mergeDelay: 8,
  startZoneRadius: 1900,
  finalZoneRadius: 260,
  zoneShrinkDuration: 210,
};

const AI_NAMES = ['Nova', 'Byte', 'Orbit', 'Pulse', 'Comet', 'Echo', 'Flux', 'Vega', 'Kite', 'Moss'];
const COLORS = ['#34d399', '#60a5fa', '#f97316', '#e879f9', '#facc15', '#fb7185', '#22d3ee'];

export function createInitialState(options = {}) {
  const random = createRandom(options.seed ?? Date.now());
  const aiCount = options.aiCount ?? 18;
  const pelletCount = options.pelletCount ?? 520;
  const virusCount = options.virusCount ?? 24;
  const center = CONFIG.worldSize / 2;

  const state = {
    random,
    elapsed: 0,
    nextId: 1,
    status: 'playing',
    winner: null,
    worldSize: CONFIG.worldSize,
    player: {
      id: 'player',
      name: 'You',
      color: '#7c3aed',
      cells: [makeCell('player-1', center, center, CONFIG.initialPlayerMass)],
    },
    ai: [],
    pellets: [],
    ejected: [],
    viruses: [],
    zone: {
      x: center,
      y: center,
      radius: CONFIG.startZoneRadius,
      targetRadius: CONFIG.finalZoneRadius,
    },
  };

  for (let i = 0; i < pelletCount; i += 1) spawnPellet(state);
  for (let i = 0; i < virusCount; i += 1) spawnVirus(state);
  for (let i = 0; i < aiCount; i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 450 + random() * 1200;
    state.ai.push({
      id: `ai-${i}`,
      name: AI_NAMES[i % AI_NAMES.length],
      color: COLORS[i % COLORS.length],
      cells: [makeCell(`ai-${i}-cell`, center + Math.cos(angle) * distance, center + Math.sin(angle) * distance, 85 + random() * 140)],
      intent: { x: 0, y: 0 },
    });
  }

  return state;
}

export function stepWorld(state, input, dt) {
  if (state.status !== 'playing') return state;

  state.elapsed += dt;
  updateZone(state);
  updatePlayer(state, input, dt);
  updateAi(state, dt);
  updateEjected(state, dt);
  resolvePelletEating(state);
  resolveEjectedEating(state);
  resolveVirusHits(state);
  resolveEating(state);
  applyZoneDamage(state, dt);
  cleanupDead(state);
  maintainFood(state);
  updateStatus(state);
  return state;
}

export function splitPlayer(state, direction) {
  const dir = normalize(direction);
  const additions = [];
  for (const cell of state.player.cells) {
    if (state.player.cells.length + additions.length >= CONFIG.maxPlayerCells) break;
    if (cell.mass < CONFIG.minSplitMass) continue;

    const newMass = cell.mass * 0.45;
    cell.mass -= newMass;
    cell.splitCooldown = CONFIG.mergeDelay;
    additions.push({
      ...makeCell(nextId(state, 'player-split'), cell.x + dir.x * radiusFromMass(cell.mass), cell.y + dir.y * radiusFromMass(cell.mass), newMass),
      vx: dir.x * CONFIG.splitImpulse,
      vy: dir.y * CONFIG.splitImpulse,
      splitCooldown: CONFIG.mergeDelay,
    });
  }
  state.player.cells.push(...additions);
}

export function ejectMass(state, direction) {
  const dir = normalize(direction);
  for (const cell of state.player.cells) {
    if (cell.mass <= CONFIG.minEjectMass) continue;
    cell.mass -= CONFIG.ejectCost;
    const radius = radiusFromMass(cell.mass);
    state.ejected.push({
      id: nextId(state, 'eject'),
      x: cell.x + dir.x * (radius + 18),
      y: cell.y + dir.y * (radius + 18),
      vx: dir.x * 620 + cell.vx * 0.2,
      vy: dir.y * 620 + cell.vy * 0.2,
      mass: CONFIG.ejectedMass,
      age: 0,
      owner: 'player',
    });
  }
}

export function resolveVirusHits(state) {
  const allPlayers = [state.player, ...state.ai];
  for (const owner of allPlayers) {
    for (let cellIndex = owner.cells.length - 1; cellIndex >= 0; cellIndex -= 1) {
      const cell = owner.cells[cellIndex];
      const virusIndex = state.viruses.findIndex((virus) => canEat(cell, virus) && cell.mass >= CONFIG.minVirusPopMass);
      if (virusIndex === -1) continue;

      state.viruses.splice(virusIndex, 1);
      burstCell(state, owner, cellIndex);
    }
  }
}

export function resolveEating(state) {
  const owners = [state.player, ...state.ai];
  for (let a = 0; a < owners.length; a += 1) {
    for (let b = 0; b < owners.length; b += 1) {
      if (a === b) continue;
      eatCellsBetween(owners[a], owners[b]);
    }
  }
  cleanupDead(state);
}

export function applyZoneDamage(state, dt) {
  const owners = [state.player, ...state.ai];
  for (const owner of owners) {
    for (const cell of owner.cells) {
      const distance = Math.hypot(cell.x - state.zone.x, cell.y - state.zone.y);
      if (distance > state.zone.radius) {
        cell.mass = Math.max(18, cell.mass - CONFIG.zoneDamagePerSecond * dt);
      }
    }
  }
}

export function radiusFromMass(mass) {
  return Math.sqrt(mass) * 4;
}

function makeCell(id, x, y, mass) {
  return { id, x, y, vx: 0, vy: 0, mass, splitCooldown: 0 };
}

function updateZone(state) {
  const t = Math.min(1, state.elapsed / CONFIG.zoneShrinkDuration);
  state.zone.radius = lerp(CONFIG.startZoneRadius, CONFIG.finalZoneRadius, easeInOut(t));
}

function updatePlayer(state, input, dt) {
  for (const cell of state.player.cells) {
    moveCellToward(cell, input.pointerWorld ?? { x: cell.x, y: cell.y }, dt);
  }
  mergeFriendlyCells(state.player, dt);
}

function updateAi(state, dt) {
  const playerCells = state.player.cells;
  for (const ai of state.ai) {
    for (const cell of ai.cells) {
      const threat = nearest(cell, playerCells.filter((p) => p.mass > cell.mass * 1.25));
      const prey = nearest(cell, playerCells.filter((p) => cell.mass > p.mass * CONFIG.eatRatio));
      const pellet = nearest(cell, state.pellets);

      let target = pellet ?? { x: CONFIG.worldSize / 2, y: CONFIG.worldSize / 2 };
      if (prey && distance(cell, prey) < 700) target = prey;
      if (threat && distance(cell, threat) < 520) {
        target = { x: cell.x + (cell.x - threat.x), y: cell.y + (cell.y - threat.y) };
      }

      moveCellToward(cell, target, dt);
    }
    mergeFriendlyCells(ai, dt);
  }
}

function moveCellToward(cell, target, dt) {
  const dir = normalize({ x: target.x - cell.x, y: target.y - cell.y });
  const speed = Math.max(70, 310 - radiusFromMass(cell.mass) * 1.45);
  cell.vx = lerp(cell.vx, dir.x * speed, 0.08);
  cell.vy = lerp(cell.vy, dir.y * speed, 0.08);
  cell.x = clamp(cell.x + cell.vx * dt, 0, CONFIG.worldSize);
  cell.y = clamp(cell.y + cell.vy * dt, 0, CONFIG.worldSize);
  cell.vx *= 0.985;
  cell.vy *= 0.985;
  cell.splitCooldown = Math.max(0, cell.splitCooldown - dt);
}

function mergeFriendlyCells(owner, dt) {
  for (let i = 0; i < owner.cells.length; i += 1) {
    for (let j = owner.cells.length - 1; j > i; j -= 1) {
      const a = owner.cells[i];
      const b = owner.cells[j];
      if (a.splitCooldown > 0 || b.splitCooldown > 0) continue;
      const needed = Math.max(radiusFromMass(a.mass), radiusFromMass(b.mass)) * 0.45;
      if (distance(a, b) > needed) continue;
      a.mass += b.mass;
      a.x = (a.x + b.x) / 2;
      a.y = (a.y + b.y) / 2;
      owner.cells.splice(j, 1);
    }
  }
}

function updateEjected(state, dt) {
  for (const pellet of state.ejected) {
    pellet.age += dt;
    pellet.x = clamp(pellet.x + pellet.vx * dt, 0, CONFIG.worldSize);
    pellet.y = clamp(pellet.y + pellet.vy * dt, 0, CONFIG.worldSize);
    pellet.vx *= 0.94;
    pellet.vy *= 0.94;
  }
}

function resolvePelletEating(state) {
  const owners = [state.player, ...state.ai];
  for (const owner of owners) {
    for (const cell of owner.cells) {
      for (let i = state.pellets.length - 1; i >= 0; i -= 1) {
        const pellet = state.pellets[i];
        if (distance(cell, pellet) < radiusFromMass(cell.mass)) {
          cell.mass += pellet.mass;
          state.pellets.splice(i, 1);
        }
      }
    }
  }
}

function resolveEjectedEating(state) {
  const owners = [state.player, ...state.ai];
  for (const owner of owners) {
    for (const cell of owner.cells) {
      for (let i = state.ejected.length - 1; i >= 0; i -= 1) {
        const pellet = state.ejected[i];
        if (pellet.age < 0.45 && owner.id === pellet.owner) continue;
        if (distance(cell, pellet) < radiusFromMass(cell.mass)) {
          cell.mass += pellet.mass;
          state.ejected.splice(i, 1);
        }
      }
    }
  }
}

function eatCellsBetween(hunterOwner, preyOwner) {
  for (const hunter of hunterOwner.cells) {
    for (let i = preyOwner.cells.length - 1; i >= 0; i -= 1) {
      const prey = preyOwner.cells[i];
      if (!canEat(hunter, prey)) continue;
      hunter.mass += prey.mass * 0.92;
      preyOwner.cells.splice(i, 1);
    }
  }
}

function canEat(hunter, prey) {
  const hunterRadius = radiusFromMass(hunter.mass);
  const preyRadius = radiusFromMass(prey.mass);
  return hunter.mass > prey.mass * CONFIG.eatRatio && distance(hunter, prey) < hunterRadius - preyRadius * 0.25;
}

function burstCell(state, owner, cellIndex) {
  const cell = owner.cells[cellIndex];
  const isPlayer = owner.id === 'player';
  const cap = isPlayer ? CONFIG.maxPlayerCells : 6;
  const slots = Math.max(0, cap - owner.cells.length + 1);
  const fragmentCount = clamp(Math.min(CONFIG.maxVirusFragments, slots, Math.floor(cell.mass / 90)), 2, cap);
  const keptMass = cell.mass * 0.86;
  const massEach = keptMass / fragmentCount;
  const fragments = [];

  for (let i = 0; i < fragmentCount; i += 1) {
    const angle = (Math.PI * 2 * i) / fragmentCount + state.random() * 0.25;
    fragments.push({
      ...makeCell(nextId(state, `${owner.id}-burst`), cell.x + Math.cos(angle) * 20, cell.y + Math.sin(angle) * 20, massEach),
      vx: Math.cos(angle) * (360 + state.random() * 180),
      vy: Math.sin(angle) * (360 + state.random() * 180),
      splitCooldown: CONFIG.mergeDelay,
    });
  }

  owner.cells.splice(cellIndex, 1, ...fragments);
}

function cleanupDead(state) {
  state.ai = state.ai.filter((ai) => ai.cells.length > 0);
}

function maintainFood(state) {
  while (state.pellets.length < 520) spawnPellet(state);
  while (state.viruses.length < 24) spawnVirus(state);
}

function updateStatus(state) {
  if (state.player.cells.length === 0) {
    state.status = 'lost';
    state.winner = 'AI';
  } else if (state.ai.length === 0) {
    state.status = 'won';
    state.winner = 'You';
  }
}

function spawnPellet(state) {
  state.pellets.push({
    id: nextId(state, 'pellet'),
    x: state.random() * CONFIG.worldSize,
    y: state.random() * CONFIG.worldSize,
    mass: CONFIG.pelletMass,
    hue: Math.floor(state.random() * 360),
  });
}

function spawnVirus(state) {
  state.viruses.push({
    id: nextId(state, 'virus'),
    x: 160 + state.random() * (CONFIG.worldSize - 320),
    y: 160 + state.random() * (CONFIG.worldSize - 320),
    mass: CONFIG.virusMass,
  });
}

function nearest(origin, items) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = distance(origin, item);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.0001) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nextId(state, prefix) {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function createRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
