# Ball Battle Royale Design

## Goal

Build a single-player browser game inspired by ball arena survival games. The player controls one or more cells, eats pellets and smaller enemies, avoids larger enemies, uses split and eject actions, triggers virus bursts, and tries to survive a shrinking battle royale zone.

## Scope

- Single-player only.
- Canvas 2D rendering.
- No backend, accounts, multiplayer, or external assets.
- Keyboard and mouse controls.
- Maximum 16 player fragments.

## Core Rules

- Player cells move toward the cursor, with larger cells moving more slowly.
- Pellets increase mass.
- Ejected mass is fired forward and can later be eaten.
- Splitting launches a cell forward when it has enough mass.
- The player can have at most 16 fragments.
- Viruses are spiky hazards. A sufficiently large cell that eats a virus bursts into smaller fragments and loses some usable control.
- Larger cells can consume smaller cells when overlap and size ratio rules are satisfied.
- The safe zone shrinks over time. Cells outside the safe zone lose mass.
- AI cells eat pellets, chase smaller cells, and flee larger threats.

## Architecture

- `src/simulation.js` contains deterministic game rules and pure-ish update helpers that can be tested in Node.
- `src/main.js` owns browser input, canvas rendering, UI state, and the animation loop.
- `styles.css` defines the full-screen game shell and HUD.
- `test/simulation.test.js` covers split limit, eject mass, virus burst, collision eating, and safe-zone damage.

## Success Criteria

- Opening the page starts a playable single-player battle royale.
- Mouse movement controls direction.
- Space splits cells up to 16 total.
- W ejects mass.
- Viruses cause large cells to burst into fragments.
- The safe zone visibly shrinks and punishes players outside it.
- Tests verify the main gameplay rules.
