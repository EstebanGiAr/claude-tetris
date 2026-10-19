# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build tools, no package.json, no tests.

## Running the game

There is no build/test/lint tooling. To run it:

```bash
# Open directly
start index.html       # Windows
open index.html        # macOS
xdg-open index.html    # Linux

# Or serve locally (needed if testing anything that requires http://)
python3 -m http.server 8000
npx serve .
```

Then verify changes by opening the page in a browser and playing — there are no automated tests.

## Architecture

Three files, all logic lives in `game.js`:

- `index.html` — DOM structure: main `<canvas id="board">` (300×600, i.e. COLS×BLOCK by ROWS×BLOCK), a side panel (score/lines/level/combo/next-piece preview canvas/theme+sound toggles/controls), and a hidden overlay div reused for both "PAUSE" and "GAME OVER" states.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — entire game, no modules/classes, all top-level functions and module-scoped mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, etc.).

Key mechanics to know before touching `game.js`:

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-color index `1–8`.
- **Pieces**: defined as square matrices in `PIECES`; rotation (`rotateCW`) is a transpose + row reversal, not a lookup table of rotation states. Index `8` (`NUT`) is the "tuerca" challenge piece — a 3×3 ring with an empty center (`[[8,8,8],[8,0,8],[8,8,8]]`), rotation-invariant, drawn with the normal block color plus a dark circle (`drawNutHole`) over the hole; `isNutRing` finds already-settled holes on the board so they keep rendering after the piece locks.
- **Collision** (`collide`): checks board bounds and existing fixed blocks.
- **Wall kicks** (`tryRotate`): on rotation collision, tries horizontal offsets `[0, -1, 1, -2, 2]` before giving up on the rotation.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates `dt` and drops the piece one row once `dropAccum >= dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top; re-checks the same row index after a splice (`r++`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by current `level` and by the combo multiplier; hard drop adds 2 points per cell dropped, soft drop adds 1 point per row.
- **Combo / T-spin / B2B / Perfect Clear** (`clearLines`, `detectTSpin`, `markAction`): consecutive line-clearing locks increment `combo` (reset on a clear-less lock, except powerups, which are neutral), multiplying that lock's score. `detectTSpin` uses the 3-corner rule (needs `current.type === T_TYPE` and the last successful action to have been a rotation, tracked via `markAction`) to return `'none' | 'mini' | 'full'`, which swaps the base score for `TSPIN_SCORES`/`TSPIN_MINI`. A Tetris or T-spin right after another one (`b2b`) multiplies the base by `B2B_MULT` (1.5). An empty board after clearing adds a `PERFECT_SCORES` bonus (doubled if it was also a B2B chain). Each event calls `showBig`/`flash`/`shake` for visual feedback and a `play*` function for a Web-Audio-synthesized sound (no audio assets).
- **Leveling/speed**: level increments every 10 cleared lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down until collision, drawn at `globalAlpha = 0.2`.
- **Audio**: `ensureAudio()` lazily creates a single `AudioContext` on the first keydown/button click (autoplay policy); `playTone`/`playSeq` synthesize short oscillator tones for clears, combos, T-spins, Tetris/B2B, Perfect Clear, and game over. `muted` is a user preference persisted in `localStorage` (`tetris-muted`), toggled with the `M` key or the `#sound-toggle` button, and — unlike other state — is *not* reset by `init()`.
- Pausing and game-over reuse the same `#overlay` element, just swapping title/score text and toggling the `hidden` class — there's no separate state machine.

If you change `COLS`, `ROWS`, or `BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).

Note: code comments and the README are in Spanish; match that convention when editing `game.js` or `README.md`.
