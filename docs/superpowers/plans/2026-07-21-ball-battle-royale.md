# Ball Battle Royale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable single-player ball battle royale browser game.

**Architecture:** Put game rules in a testable JavaScript simulation module and keep browser rendering/input in a separate Canvas entry point. Use static files so the game can run from a simple local web server.

**Tech Stack:** HTML, CSS, vanilla JavaScript modules, Node built-in test runner.

## Global Constraints

- Single-player only.
- Canvas 2D rendering.
- No backend or external runtime dependencies.
- Maximum 16 player fragments.
- Include split, eject mass, virus burst, AI enemies, pellets, and shrinking safe zone.

---

### Task 1: Rule Tests

**Files:**
- Create: `package.json`
- Create: `test/simulation.test.js`

**Interfaces:**
- Consumes: `createInitialState`, `splitPlayer`, `ejectMass`, `resolveVirusHits`, `resolveEating`, `applyZoneDamage`
- Produces: tests that drive the simulation module.

- [ ] Create Node test setup with `npm test`.
- [ ] Write tests for split cap, eject cost, virus burst, eating collision, and zone damage.
- [ ] Run `npm test` and confirm the tests fail because `src/simulation.js` is missing.

### Task 2: Simulation Module

**Files:**
- Create: `src/simulation.js`

**Interfaces:**
- Produces: `CONFIG`, `createInitialState`, `splitPlayer`, `ejectMass`, `resolveVirusHits`, `resolveEating`, `applyZoneDamage`, `stepWorld`.

- [ ] Implement the minimal simulation code needed by the tests.
- [ ] Run `npm test` and confirm all rule tests pass.

### Task 3: Browser Game

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/main.js`

**Interfaces:**
- Consumes: `stepWorld`, `splitPlayer`, `ejectMass`, and `CONFIG` from `src/simulation.js`.

- [ ] Build the full-screen Canvas shell and HUD.
- [ ] Wire mouse movement, Space split, and W eject.
- [ ] Render cells, pellets, viruses, ejected mass, safe zone, minimap, leaderboard, and end screen.
- [ ] Run the game locally and verify it can be played in a browser.

### Task 4: Final Verification

**Files:**
- Use all project files.

- [ ] Run `npm test`.
- [ ] Start a local static server.
- [ ] Provide the local URL and summarize controls.
