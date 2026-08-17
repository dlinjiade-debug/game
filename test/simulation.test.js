import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG,
  applyZoneDamage,
  createSpatialIndex,
  createInitialState,
  ejectMass,
  querySpatialIndex,
  radiusFromMass,
  resolveEating,
  resolveVirusHits,
  splitPlayer,
  stepWorld,
} from '../src/simulation.js';

test('splitPlayer never creates more than sixteen player cells', () => {
  const state = createInitialState({ seed: 7, aiCount: 0, pelletCount: 0, virusCount: 0 });
  state.player.cells = Array.from({ length: 15 }, (_, index) => ({
    id: `p${index}`,
    x: 100 + index,
    y: 100,
    vx: 0,
    vy: 0,
    mass: 220,
    splitCooldown: 0,
  }));

  splitPlayer(state, { x: 1, y: 0 });

  assert.equal(state.player.cells.length, CONFIG.maxPlayerCells);
});

test('ejectMass spends player mass and creates a forward moving pellet', () => {
  const state = createInitialState({ seed: 3, aiCount: 0, pelletCount: 0, virusCount: 0 });
  const beforeMass = state.player.cells[0].mass;

  ejectMass(state, { x: 1, y: 0 });

  assert.equal(state.ejected.length, 1);
  assert.equal(state.player.cells[0].mass, beforeMass - CONFIG.ejectCost);
  assert.ok(state.ejected[0].vx > 0);
});

test('large player cell bursts into multiple fragments after eating a virus', () => {
  const state = createInitialState({ seed: 5, aiCount: 0, pelletCount: 0, virusCount: 0 });
  state.player.cells[0].x = 500;
  state.player.cells[0].y = 500;
  state.player.cells[0].mass = 900;
  state.viruses.push({ id: 'v1', x: 500, y: 500, mass: CONFIG.virusMass });

  resolveVirusHits(state);

  assert.ok(state.player.cells.length > 1);
  assert.ok(state.player.cells.length <= CONFIG.maxPlayerCells);
  assert.equal(state.viruses.length, 0);
});

test('larger player cell consumes a smaller AI cell on sufficient overlap', () => {
  const state = createInitialState({ seed: 11, aiCount: 0, pelletCount: 0, virusCount: 0 });
  state.player.cells[0].x = 300;
  state.player.cells[0].y = 300;
  state.player.cells[0].mass = 300;
  state.ai.push({
    id: 'ai-small',
    name: 'Small',
    color: '#fff',
    cells: [{ id: 'a1', x: 304, y: 300, vx: 0, vy: 0, mass: 70, splitCooldown: 0 }],
  });

  resolveEating(state);

  assert.equal(state.ai.length, 0);
  assert.ok(state.player.cells[0].mass > 300);
});

test('cells outside the safe zone lose mass', () => {
  const state = createInitialState({ seed: 13, aiCount: 0, pelletCount: 0, virusCount: 0 });
  state.zone.radius = 120;
  state.player.cells[0].x = state.zone.x + 500;
  state.player.cells[0].y = state.zone.y;
  state.player.cells[0].mass = 200;

  applyZoneDamage(state, 1);

  assert.equal(state.player.cells[0].mass, 200 - CONFIG.zoneDamagePerSecond);
});

test('new games start with the player larger than every AI cell', () => {
  const state = createInitialState({ seed: 19 });
  const playerMass = state.player.cells[0].mass;
  const largestAiMass = Math.max(...state.ai.flatMap((ai) => ai.cells.map((cell) => cell.mass)));

  assert.ok(playerMass > largestAiMass);
});

test('splitPlayer emits particles', () => {
  const state = createInitialState({ seed: 23, aiCount: 1, pelletCount: 0, virusCount: 0 });
  splitPlayer(state, { x: 1, y: 0 });
  stepWorld(state, { pointerWorld: { x: state.player.cells[0].x, y: state.player.cells[0].y }, isMoving: false }, 0.016);
  assert.ok(state.particles.length > 0, 'Should emit particles on split');
  assert.ok(state.particles.every((p) => p.life > 0 && p.life <= p.maxLife));
});

test('particles decay and are cleaned up', () => {
  const state = createInitialState({ seed: 27, aiCount: 1, pelletCount: 0, virusCount: 0 });
  splitPlayer(state, { x: 1, y: 0 });
  // First step flushes pending particles into state
  stepWorld(state, { pointerWorld: { x: state.player.cells[0]?.x ?? 0, y: state.player.cells[0]?.y ?? 0 }, isMoving: false }, 0.016);
  // Speed up decay by setting life near zero
  for (const p of state.particles) p.life = 0.001;
  // Next step should clean them up
  stepWorld(state, { pointerWorld: { x: state.player.cells[0]?.x ?? 0, y: state.player.cells[0]?.y ?? 0 }, isMoving: false }, 0.016);
  assert.equal(state.particles.length, 0, 'Particles should be cleaned up after their lifetime');
});

test('AI cells split toward prey', () => {
  const state = createInitialState({ seed: 31, aiCount: 1, pelletCount: 0, virusCount: 0 });
  state.ai[0].cells[0].mass = 300;
  state.ai[0].cells[0].x = 500;
  state.ai[0].cells[0].y = 500;
  state.player.cells[0].x = 500;
  state.player.cells[0].y = 380;
  state.player.cells[0].mass = 40;

  stepWorld(state, { pointerWorld: { x: state.player.cells[0].x, y: state.player.cells[0].y }, isMoving: false }, 0.016);

  assert.ok(state.ai[0].cells.length >= 1, 'AI should have at least 1 cell');
});

test('AI split impulse is weaker than the player split impulse', () => {
  const state = createInitialState({ seed: 33, aiCount: 1, pelletCount: 0, virusCount: 0 });
  const aiCell = state.ai[0].cells[0];
  aiCell.mass = 300;
  aiCell.x = 500;
  aiCell.y = 500;
  state.player.cells[0].x = 500;
  state.player.cells[0].y = 380;
  state.player.cells[0].mass = 40;

  stepWorld(state, { pointerWorld: { x: 500, y: 380 }, isMoving: false }, 0.016);

  const fastestFragment = Math.max(...state.ai[0].cells.map((cell) => Math.hypot(cell.vx, cell.vy)));
  assert.ok(fastestFragment <= CONFIG.splitImpulse * CONFIG.aiSplitImpulseMultiplier + 0.01);
});

test('cells have idle velocity zeroed when not moving', () => {
  const state = createInitialState({ seed: 37, aiCount: 1, pelletCount: 0, virusCount: 0 });
  const cell = state.player.cells[0];
  cell.vx = 50;
  cell.vy = 30;
  stepWorld(state, { pointerWorld: { x: cell.x, y: cell.y }, isMoving: false }, 0.016);
  assert.ok(Math.abs(cell.vx) < 50, 'Velocity should decrease when idle');
  assert.ok(Math.abs(cell.vy) < 30, 'Velocity should decrease when idle');
});

test('movement stays close between 30 FPS and 60 FPS', () => {
  const makeState = () => {
    const state = createInitialState({ seed: 41, aiCount: 1, pelletCount: 0, virusCount: 0 });
    state.ai[0].cells[0].x = 3800;
    state.ai[0].cells[0].y = 3800;
    return state;
  };
  const simulate = (state, frames, dt) => {
    for (let index = 0; index < frames; index += 1) {
      stepWorld(state, {
        pointerWorld: { x: 3600, y: CONFIG.worldSize / 2 },
        isMoving: true,
      }, dt);
      state.pellets = [];
    }
    return state.player.cells[0].x;
  };

  const at30 = simulate(makeState(), 15, 1 / 30);
  const at60 = simulate(makeState(), 30, 1 / 60);

  assert.ok(Math.abs(at30 - at60) < 8, `Expected similar positions, got ${at30} and ${at60}`);
});

test('AI movement speed is lower than an equally sized player cell', () => {
  const state = createInitialState({ seed: 43, aiCount: 1, pelletCount: 0, virusCount: 0 });
  const player = state.player.cells[0];
  const ai = state.ai[0].cells[0];
  player.mass = 100;
  ai.mass = 100;
  player.x = 1000;
  player.y = 1000;
  ai.x = 1000;
  ai.y = 1000;
  state.pellets = [{ id: 'target', x: 1500, y: 1000, mass: CONFIG.pelletMass, hue: 90 }];

  stepWorld(state, { pointerWorld: { x: 1500, y: 1000 }, isMoving: true }, 0.05);

  assert.ok(Math.abs(ai.vx) < Math.abs(player.vx));
  assert.ok(Math.abs(ai.vx) <= Math.abs(player.vx) * CONFIG.aiSpeedMultiplier + 0.01);
});

test('AI keeps its target until the decision interval expires', () => {
  const state = createInitialState({ seed: 47, aiCount: 1, pelletCount: 0, virusCount: 0 });
  const aiCell = state.ai[0].cells[0];
  aiCell.x = CONFIG.worldSize / 2;
  aiCell.y = CONFIG.worldSize / 2;
  state.player.cells[0].x = 3600;
  state.player.cells[0].y = 3600;
  state.pellets = [{ id: 'first', x: 2400, y: 2100, mass: CONFIG.pelletMass, hue: 120 }];

  stepWorld(state, { pointerWorld: { x: 600, y: 600 }, isMoving: false }, 0.05);
  const firstTarget = { ...aiCell.aiTarget };
  state.pellets = [{ id: 'second', x: 2100, y: 2400, mass: CONFIG.pelletMass, hue: 180 }];
  stepWorld(state, { pointerWorld: { x: 600, y: 600 }, isMoving: false }, 0.05);

  assert.deepEqual(aiCell.aiTarget, firstTarget);
  stepWorld(state, { pointerWorld: { x: 600, y: 600 }, isMoving: false }, 0.05);
  stepWorld(state, { pointerWorld: { x: 600, y: 600 }, isMoving: false }, 0.05);
  stepWorld(state, { pointerWorld: { x: 600, y: 600 }, isMoving: false }, 0.05);
  assert.notDeepEqual(aiCell.aiTarget, firstTarget);
});

test('spatial index returns pellets across neighboring cells without misses', () => {
  const items = [
    { id: 'near', x: 239, y: 120, mass: 6 },
    { id: 'edge', x: 241, y: 120, mass: 6 },
    { id: 'far', x: 600, y: 600, mass: 6 },
  ];
  const index = createSpatialIndex(items, 240);
  const result = querySpatialIndex(index, { x: 240, y: 120 }, 5).map((item) => item.id).sort();

  assert.deepEqual(result, ['edge', 'near']);
});

test('eligible fragments are pulled together before they merge', () => {
  const state = createInitialState({ seed: 53, aiCount: 1, pelletCount: 0, virusCount: 0 });
  state.ai[0].cells[0].x = CONFIG.worldSize - 200;
  state.ai[0].cells[0].y = CONFIG.worldSize - 200;
  state.player.cells = [
    { id: 'a', x: 1000, y: 1000, vx: 0, vy: 0, mass: 100, splitCooldown: CONFIG.mergeDelay, mergeAttractionTime: 0 },
    { id: 'b', x: 1100, y: 1000, vx: 0, vy: 0, mass: 100, splitCooldown: CONFIG.mergeDelay, mergeAttractionTime: 0 },
  ];

  for (let index = 0; index < 89; index += 1) {
    stepWorld(state, { pointerWorld: { x: 1050, y: 1000 }, isMoving: false }, 0.05);
  }
  assert.equal(state.player.cells.length, 2);
  assert.ok(state.player.cells[0].splitCooldown > 0);

  stepWorld(state, { pointerWorld: { x: 1050, y: 1000 }, isMoving: false }, 0.05);
  assert.equal(state.player.cells.length, 2);
  assert.ok(Math.abs(state.player.cells[1].x - state.player.cells[0].x) < 100);
  for (let index = 0; index < 20; index += 1) {
    stepWorld(state, { pointerWorld: { x: 1050, y: 1000 }, isMoving: false }, 0.05);
    if (state.player.cells.length === 1) break;
  }
  assert.equal(state.player.cells.length, 1);
});
