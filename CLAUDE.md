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

- `index.html` — DOM structure: main `<canvas id="board">` (300×600, i.e. COLS×BLOCK by ROWS×BLOCK), a side panel (score/lines/level/next-piece preview canvas/controls), and a hidden overlay div reused for both "PAUSE" and "GAME OVER" states.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — entire game, no modules/classes, all top-level functions and module-scoped mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, etc.).

Key mechanics to know before touching `game.js`:

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-color index `1–7`.
- **Pieces**: defined as square matrices in `PIECES`; rotation (`rotateCW`) is a transpose + row reversal, not a lookup table of rotation states.
- **Collision** (`collide`): checks board bounds and existing fixed blocks.
- **Wall kicks** (`tryRotate`): on rotation collision, tries horizontal offsets `[0, -1, 1, -2, 2]` before giving up on the rotation.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates `dt` and drops the piece one row once `dropAccum >= dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top; re-checks the same row index after a splice (`r++`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by current `level`; hard drop adds 2 points per cell dropped, soft drop adds 1 point per row.
- **Leveling/speed**: level increments every 10 cleared lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down until collision, drawn at `globalAlpha = 0.2`.
- Pausing and game-over reuse the same `#overlay` element, just swapping title/score text and toggling the `hidden` class — there's no separate state machine.

If you change `COLS`, `ROWS`, or `BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).

Note: code comments and the README are in Spanish; match that convention when editing `game.js` or `README.md`.
