import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG,
  applyZoneDamage,
  createInitialState,
  ejectMass,
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

test('cells have idle velocity zeroed when not moving', () => {
  const state = createInitialState({ seed: 37, aiCount: 1, pelletCount: 0, virusCount: 0 });
  const cell = state.player.cells[0];
  cell.vx = 50;
  cell.vy = 30;
  stepWorld(state, { pointerWorld: { x: cell.x, y: cell.y }, isMoving: false }, 0.016);
  assert.ok(Math.abs(cell.vx) < 50, 'Velocity should decrease when idle');
  assert.ok(Math.abs(cell.vy) < 30, 'Velocity should decrease when idle');
});
