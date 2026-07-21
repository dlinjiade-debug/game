import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG,
  applyZoneDamage,
  createInitialState,
  ejectMass,
  resolveEating,
  resolveVirusHits,
  splitPlayer,
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
