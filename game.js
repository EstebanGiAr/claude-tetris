'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // tuerca - gris metálico
  '#ef5350', // bomba - rojo
  '#fff176', // rayo - amarillo eléctrico
  '#f06292', // tinte - rosa
  '#4db6ac', // gravedad - verde azulado
  '#80d8ff', // congelar - celeste hielo
  '#aed581', // + (pentominó X) - verde lima
  '#9575cd', // U (pentominó) - violeta
  '#4fc3f7', // Y (pentominó) - celeste
  '#ffee58', // single 1x1 - amarillo brillante
];

const NUT = 8; // tipo de pieza "tuerca" (reto): anillo con agujero central

// Powerups: piezas especiales de 1x1 cuyo efecto se dispara al encajar.
const BOMB = 9, BOLT = 10, DYE = 11, GRAVITY = 12, FREEZE = 13;
const POWERUPS = [BOMB, BOLT, DYE, GRAVITY, FREEZE];
const POWERUP_NAMES = { 9: 'BOMBA', 10: 'RAYO', 11: 'TINTE', 12: 'GRAVEDAD', 13: 'CONGELAR' };
const POWERUP_EVERY = 5; // líneas entre apariciones de powerups
const FREEZE_MS = 5000;
const TOAST_MS = 1800;

// Pentominós (5 bloques) que aparecen ocasionalmente para añadir dificultad puntual.
const PLUS = 14, U_PENT = 15, Y_PENT = 16, SINGLE = 17;
const PENTOS = [PLUS, U_PENT, Y_PENT];
const PENTO_CHANCE = 0.12; // probabilidad de que la pieza aleatoria sea un pentominó

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (reto): anillo con agujero central
  [[9]],   // Bomba: destruye un área 3x3
  [[10]],  // Rayo: limpia fila y columna del impacto
  [[11]],  // Tinte: convierte el color más abundante en comodines
  [[12]],  // Gravedad: compacta los huecos del tablero
  [[13]],  // Congelar: pausa la caída 5s
  [[0,14,0],[14,14,14],[0,14,0]],                  // + (pentominó X), invariante a la rotación
  [[15,0,15],[15,15,15],[0,0,0]],                  // U
  [[0,16,0,0],[16,16,0,0],[0,16,0,0],[0,16,0,0]],  // Y
  [[17]],  // Single: recompensa que llega tras un Tetris
];

function isPowerup(type) {
  return POWERUPS.includes(type);
}

const LINE_SCORES = [0, 100, 300, 500, 800];

// --- Combo, T-spin, B2B y Perfect Clear (ver CLAUDE.md) ---
const TSPIN_SCORES = [400, 800, 1200, 1600];  // 0,1,2,3+ líneas con T-spin completo
const TSPIN_MINI = [100, 200, 400, 600];      // variante mini
const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];
const COMBO_BONUS = 50; // puntos planos por eslabón de combo, multiplicados por nivel
const B2B_MULT = 1.5;
const T_TYPE = 3; // índice de la pieza T en PIECES

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayCombo = document.getElementById('overlay-combo');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let wild, freezeRemaining, pendingPowerup, nextPowerupAt, toastText, toastUntil, toastColor;
let combo, maxCombo, b2b, lastActionWasRotate;
let flashColor, flashUntil, shakeUntil, bigText, bigUntil;
let audioCtx, muted;

function createMatrix(fill) {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(fill));
}

function createBoard() {
  return createMatrix(0);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  let type;
  if (pendingPowerup) {
    pendingPowerup = false;
    type = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  } else if (Math.random() < PENTO_CHANCE) {
    type = PENTOS[Math.floor(Math.random() * PENTOS.length)];
  } else {
    type = Math.floor(Math.random() * 8) + 1;
  }
  return makePiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      markAction('rotate');
      return;
    }
  }
}

// Recuerda si el último movimiento válido de la pieza actual fue un giro,
// clave para distinguir un T-spin de un encaje normal (regla de las 3 esquinas).
function markAction(kind) {
  lastActionWasRotate = kind === 'rotate';
}

// Detecta T-spin con la regla de las 3 esquinas: solo aplica a la pieza T,
// solo si llegó a su posición final rotando, y necesita 3 de sus 4 diagonales
// ocupadas (fuera del tablero cuenta como ocupado). La esquina "mini" vs "full"
// depende de si las dos diagonales frontales (las contrarias a la punta) están llenas.
function detectTSpin() {
  if (current.type !== T_TYPE || !lastActionWasRotate) return 'none';
  const cx = current.x + 1;
  const cy = current.y + 1;
  const occupied = (x, y) => x < 0 || x >= COLS || y < 0 || y >= ROWS || (y >= 0 && !!board[y][x]);
  const corners = {
    tl: occupied(cx - 1, cy - 1),
    tr: occupied(cx + 1, cy - 1),
    bl: occupied(cx - 1, cy + 1),
    br: occupied(cx + 1, cy + 1),
  };
  const filled = Object.values(corners).filter(Boolean).length;
  if (filled < 3) return 'none';

  // Las esquinas "frontales" son las adyacentes al lado donde apunta la punta de la T;
  // si ambas están ocupadas es T-spin completo, si no, es mini.
  const shape = current.shape;
  let frontCorners;
  if (shape[0][1]) frontCorners = ['tl', 'tr'];       // punta hacia arriba
  else if (shape[2][1]) frontCorners = ['bl', 'br'];  // punta hacia abajo
  else if (shape[1][0]) frontCorners = ['tl', 'bl'];  // punta hacia la izquierda
  else frontCorners = ['tr', 'br'];                   // punta hacia la derecha

  const frontFilled = frontCorners.every(k => corners[k]);
  return frontFilled ? 'full' : 'mini';
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Al limpiar una línea, los comodines (tinte) conectados a ella se destruyen en cascada.
function popWildCascade(r) {
  const queue = [];
  for (let c = 0; c < COLS; c++) {
    if (r - 1 >= 0 && wild[r - 1][c]) queue.push([r - 1, c]);
    if (r + 1 < ROWS && wild[r + 1][c]) queue.push([r + 1, c]);
  }
  const visited = new Set();
  while (queue.length) {
    const [cr, cc] = queue.pop();
    const key = `${cr},${cc}`;
    if (visited.has(key) || !wild[cr][cc]) continue;
    visited.add(key);
    board[cr][cc] = 0;
    wild[cr][cc] = false;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cr + dr, nc = cc + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && wild[nr][nc]) queue.push([nr, nc]);
    }
  }
}

// tspin: 'none' | 'mini' | 'full' detectado antes de encajar la pieza.
// fromPowerup: true si lo que acaba de encajar fue una pieza-powerup (no cuenta
// para el combo ni para B2B, sea cual sea el resultado).
function clearLines(tspin, fromPowerup) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      popWildCascade(r);
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      wild.splice(r, 1);
      wild.unshift(new Array(COLS).fill(false));
      cleared++;
      r++;
    }
  }

  // Combo: cada línea limpiada en turnos consecutivos sube el multiplicador;
  // un bloqueo sin líneas lo rompe, salvo que venga de un powerup (neutral).
  if (cleared > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else if (!fromPowerup) {
    combo = 0;
  }
  const comboMult = Math.max(1, combo);
  let b2bChainApplied = false; // esta limpieza fue difícil Y continuaba una racha B2B

  if (cleared > 0 || tspin !== 'none') {
    const idx = Math.min(cleared, 3);
    let base = tspin === 'full' ? TSPIN_SCORES[idx]
      : tspin === 'mini' ? TSPIN_MINI[idx]
      : (LINE_SCORES[cleared] || 0);

    const difficult = cleared === 4 || tspin !== 'none';
    b2bChainApplied = difficult && b2b;
    if (b2bChainApplied) base *= B2B_MULT;

    score += Math.round(base * level * comboMult) + COMBO_BONUS * (combo - 1) * level;

    if (!fromPowerup) {
      b2b = difficult ? true : (cleared > 0 ? false : b2b);
    }

    triggerClearEffects(cleared, tspin, b2bChainApplied, comboMult);
  }

  if (cleared > 0) {
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (lines >= nextPowerupAt) {
      pendingPowerup = true;
      nextPowerupAt += POWERUP_EVERY;
    }
    if (cleared === 4) {
      next = makePiece(SINGLE); // recompensa: la pieza en cola pasa a ser el single 1x1
      showToast('PIEZA 1×1');
    }

    // Perfect Clear: el tablero quedó totalmente vacío tras la limpieza.
    if (board.every(row => row.every(v => !v))) {
      const bonus = PERFECT_SCORES[cleared] * level * (b2bChainApplied ? 2 : 1);
      score += bonus;
      showBig('¡PERFECT CLEAR!');
      flash('#ffffff', 500);
      shake(400);
      playPerfectClear();
    }
  }

  updateHUD();
}

// Decide qué toast/flash/shake/sonido mostrar tras una limpieza concreta.
function triggerClearEffects(cleared, tspin, isB2BChain, comboMult) {
  if (tspin !== 'none') {
    const label = tspin === 'full' ? 'T-SPIN' : 'T-SPIN MINI';
    showBig(isB2BChain ? `B2B ${label}` : label);
    flash(COLORS[T_TYPE], 350);
    if (cleared >= 2) shake(300);
    playTSpin();
  } else if (cleared === 4) {
    showBig(isB2BChain ? 'B2B TETRIS' : '¡TETRIS!');
    flash(COLORS[1], 400);
    shake(350);
    playTetris();
  } else if (cleared > 0) {
    playClear(cleared);
  }

  if (comboMult >= 2) {
    showToast(`COMBO x${comboMult}`, COLORS[3]);
    playCombo(comboMult);
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy > current.y) markAction('drop');
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    markAction('drop');
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const tspin = detectTSpin();
  const fromPowerup = isPowerup(current.type);
  if (fromPowerup) {
    applyPowerup(current.type, current.x, current.y);
  } else {
    merge();
  }
  clearLines(tspin, fromPowerup);
  spawn();
}

function showToast(text, color) {
  toastText = text;
  toastColor = color || 'rgba(255,255,255,0.9)';
  toastUntil = performance.now() + TOAST_MS;
}

// Texto grande centrado para los eventos importantes: Tetris, T-spin, B2B, Perfect Clear.
function showBig(text) {
  bigText = text;
  bigUntil = performance.now() + TOAST_MS;
}

// Destello de color a pantalla completa, se desvanece en `ms` milisegundos.
function flash(color, ms) {
  flashColor = color;
  flashUntil = performance.now() + ms;
}

// Vibración breve del tablero completo.
function shake(ms) {
  shakeUntil = performance.now() + ms;
}

function applyPowerup(type, x, y) {
  switch (type) {
    case BOMB: blast(x, y); break;
    case BOLT: bolt(x, y); break;
    case DYE: dye(); break;
    case GRAVITY: compact(); break;
    case FREEZE: freeze(); break;
  }
  showToast(POWERUP_NAMES[type]);
}

// Bomba: vacía el área 3x3 centrada en el punto de impacto.
function blast(x, y) {
  let destroyed = 0;
  for (let r = y - 1; r <= y + 1; r++) {
    for (let c = x - 1; c <= x + 1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (board[r][c]) destroyed++;
      board[r][c] = 0;
      wild[r][c] = false;
    }
  }
  score += 10 * destroyed * level;
}

// Rayo: vacía la fila y la columna completas del punto de impacto.
function bolt(x, y) {
  let destroyed = 0;
  for (let c = 0; c < COLS; c++) {
    if (board[y][c]) destroyed++;
    board[y][c] = 0;
    wild[y][c] = false;
  }
  for (let r = 0; r < ROWS; r++) {
    if (board[r][x]) destroyed++;
    board[r][x] = 0;
    wild[r][x] = false;
  }
  score += 10 * destroyed * level;
}

// Tinte: el color más abundante del tablero se convierte en comodines frágiles.
function dye() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] && board[r][c] !== NUT) counts[board[r][c]]++;
  let bestColor = 0;
  for (let i = 1; i < counts.length; i++)
    if (counts[i] > counts[bestColor]) bestColor = i;
  if (!bestColor) return;
  let marked = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === bestColor) { wild[r][c] = true; marked++; }
  score += 10 * marked * level;
}

// Gravedad: compacta cada columna hacia abajo, eliminando huecos intermedios.
function compact() {
  for (let c = 0; c < COLS; c++) {
    const colorStack = [];
    const wildStack = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) {
        colorStack.push(board[r][c]);
        wildStack.push(wild[r][c]);
      }
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      if (colorStack.length) {
        board[r][c] = colorStack.pop();
        wild[r][c] = wildStack.pop();
      } else {
        board[r][c] = 0;
        wild[r][c] = false;
      }
    }
  }
  score += 50 * level;
}

// Congelar: detiene la caída automática durante FREEZE_MS.
function freeze() {
  freezeRemaining = FREEZE_MS;
  score += 100 * level;
}

function spawn() {
  current = next;
  lastActionWasRotate = false; // la pieza nueva aún no se movió ni rotó
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    // La pieza nueva no cabe: la partida termina aquí, sin seguir generando piezas.
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (combo >= 2) {
    comboEl.textContent = `x${combo}`;
    comboEl.classList.remove('hidden');
    // reinicia la animación de pulso en cada eslabón del combo
    comboEl.classList.remove('pulse');
    void comboEl.offsetWidth; // fuerza reflow para poder repetir la animación
    comboEl.classList.add('pulse');
  } else {
    comboEl.classList.add('hidden');
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Dibuja el agujero de la tuerca: círculo oscuro con borde metálico en la celda central.
function drawNutHole(context, x, y, size, alpha) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  const radius = size * 0.42;
  context.globalAlpha = alpha ?? 1;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0,0,0,0.55)';
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = COLORS[NUT];
  context.stroke();
  context.globalAlpha = 1;
}

// Dibuja el icono de una pieza-powerup sobre su celda.
function drawPowerIcon(context, x, y, type, size, alpha) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = 'rgba(0,0,0,0.65)';
  context.fillStyle = 'rgba(0,0,0,0.65)';
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  switch (type) {
    case BOMB: {
      context.beginPath();
      context.arc(cx, cy + size * 0.06, size * 0.26, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(cx + size * 0.12, cy - size * 0.22);
      context.lineTo(cx + size * 0.28, cy - size * 0.38);
      context.stroke();
      break;
    }
    case BOLT: {
      context.beginPath();
      context.moveTo(cx + size * 0.05, cy - size * 0.32);
      context.lineTo(cx - size * 0.15, cy + size * 0.05);
      context.lineTo(cx + size * 0.05, cy + size * 0.05);
      context.lineTo(cx - size * 0.1, cy + size * 0.32);
      context.lineTo(cx + size * 0.25, cy - size * 0.1);
      context.lineTo(cx + size * 0.02, cy - size * 0.1);
      context.closePath();
      context.fill();
      break;
    }
    case DYE: {
      context.beginPath();
      context.moveTo(cx, cy - size * 0.32);
      context.quadraticCurveTo(cx + size * 0.26, cy + size * 0.1, cx, cy + size * 0.32);
      context.quadraticCurveTo(cx - size * 0.26, cy + size * 0.1, cx, cy - size * 0.32);
      context.fill();
      break;
    }
    case GRAVITY: {
      for (const dx of [-size * 0.18, 0, size * 0.18]) {
        context.beginPath();
        context.moveTo(cx + dx, cy - size * 0.28);
        context.lineTo(cx + dx, cy + size * 0.12);
        context.moveTo(cx + dx - size * 0.08, cy + size * 0.02);
        context.lineTo(cx + dx, cy + size * 0.18);
        context.lineTo(cx + dx + size * 0.08, cy + size * 0.02);
        context.stroke();
      }
      break;
    }
    case FREEZE: {
      for (let i = 0; i < 3; i++) {
        const angle = (Math.PI / 3) * i;
        context.beginPath();
        context.moveTo(cx - Math.cos(angle) * size * 0.3, cy - Math.sin(angle) * size * 0.3);
        context.lineTo(cx + Math.cos(angle) * size * 0.3, cy + Math.sin(angle) * size * 0.3);
        context.stroke();
      }
      break;
    }
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const now = performance.now();
  const shaking = shakeUntil > now;
  ctx.save();
  if (shaking) {
    const amount = 4 * (shakeUntil - now) / 350; // se amortigua hacia el final
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }

  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // agujero de las tuercas ya fijas en el tablero: celda vacía rodeada por un anillo completo
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!board[r][c] && isNutRing(r, c)) drawNutHole(ctx, c, r, BLOCK);

  // marco pulsante sobre los comodines (tinte)
  const pulse = 0.35 + 0.35 * Math.abs(Math.sin(performance.now() / 300));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!wild[r][c]) continue;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS[DYE];
      ctx.strokeRect(c * BLOCK + 2, r * BLOCK + 2, BLOCK - 4, BLOCK - 4);
      ctx.globalAlpha = 1;
    }
  }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);
  if (isPowerup(current.type)) drawPowerIcon(ctx, current.x, gy, current.type, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
  if (isPowerup(current.type)) drawPowerIcon(ctx, current.x, current.y, current.type, BLOCK);

  // aviso de efecto activado
  if (toastUntil && now < toastUntil) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = toastColor || 'rgba(255,255,255,0.9)';
    ctx.fillText(toastText, canvas.width / 2, 24);
  }

  // contador de congelación activa
  if (freezeRemaining > 0) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS[FREEZE];
    ctx.fillText(`❄ ${(freezeRemaining / 1000).toFixed(1)}s`, canvas.width / 2, canvas.height - 10);
  }

  // texto grande para combos/eventos destacados (Tetris, T-spin, B2B, Perfect Clear)
  if (bigUntil > now) {
    const remaining = bigUntil - now;
    ctx.globalAlpha = Math.min(1, remaining / 300);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(bigText, canvas.width / 2, canvas.height / 2);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'start';
  ctx.restore();

  // destello de color a pantalla completa
  if (flashUntil > now && flashColor) {
    const alpha = 0.35 * (flashUntil - now) / 500;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
}

// Comprueba si una celda vacía del tablero está rodeada por los 8 vecinos de una tuerca,
// es decir, si forma el agujero central de un anillo ya encajado.
function isNutRing(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== NUT) return false;
    }
  }
  return true;
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
  if (isPowerup(next.type)) drawPowerIcon(nextCtx, offX, offY, next.type, NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayCombo.textContent = `Combo máx.: x${maxCombo}`;
  overlay.classList.remove('hidden');
  playGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayCombo.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  // Si ya no se está jugando (p.ej. un frame encolado llegó tarde), no seguir.
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
    dropAccum = 0;
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        markAction('drop');
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return; // lockPiece() pudo terminar la partida: no programar otro frame.
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  wild = createMatrix(false);
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  freezeRemaining = 0;
  pendingPowerup = false;
  nextPowerupAt = POWERUP_EVERY;
  toastText = '';
  toastUntil = 0;
  combo = 0;
  maxCombo = 0;
  b2b = false;
  lastActionWasRotate = false;
  flashColor = null;
  flashUntil = 0;
  shakeUntil = 0;
  bigText = '';
  bigUntil = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// --- Efectos de sonido sintetizados con Web Audio API (sin assets externos) ---

// Crea el AudioContext de forma perezosa (solo tras un gesto del usuario, como
// exige la política de autoplay de los navegadores) y lo reanuda si estaba suspendido.
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* navegador sin soporte de Web Audio: el juego sigue funcionando sin sonido */ }
}

// Un tono simple con envolvente de ataque corto y caída exponencial.
function playTone(freq, dur, { type = 'square', gain = 0.06, delay = 0 } = {}) {
  if (muted || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = audioCtx.currentTime + delay;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* ignorar fallos puntuales de audio */ }
}

// Secuencia de tonos encadenados por un paso de tiempo fijo.
function playSeq(freqs, step, opts) {
  freqs.forEach((f, i) => playTone(f, step * 1.1, { ...opts, delay: (opts?.delay || 0) + i * step }));
}

function playClear(cleared) {
  playTone(520 + cleared * 40, 0.12, { type: 'triangle', gain: 0.05 });
}

function playCombo(comboMult) {
  const freq = 440 * Math.pow(2, Math.min(comboMult, 12) / 12);
  playTone(freq, 0.14, { type: 'triangle', gain: 0.06 });
}

function playTSpin() {
  playSeq([660, 500, 740], 0.08, { type: 'sawtooth', gain: 0.07 });
}

function playTetris() {
  playSeq([523, 659, 784, 1047], 0.09, { type: 'square', gain: 0.07 });
}

function playPerfectClear() {
  playSeq([523, 659, 784, 1047, 1318], 0.11, { type: 'square', gain: 0.08 });
}

function playGameOver() {
  playSeq([392, 330, 261, 196], 0.16, { type: 'sawtooth', gain: 0.07 });
}

// Mute: se recuerda entre sesiones, igual que el tema visual.
function toggleMute() {
  setMuted(!muted);
}

function setMuted(value) {
  muted = value;
  soundToggle.textContent = muted ? '🔇 Sonido' : '🔊 Sonido';
  try { localStorage.setItem('tetris-muted', muted ? '1' : '0'); } catch (e) {}
}

soundToggle.addEventListener('click', () => {
  ensureAudio();
  toggleMute();
  soundToggle.blur(); // evita que Space (caída) active el botón
});

let savedMuted = false;
try { savedMuted = localStorage.getItem('tetris-muted') === '1'; } catch (e) {}
setMuted(savedMuted);

document.addEventListener('keydown', e => {
  ensureAudio(); // primer gesto del usuario: habilita el audio (política de autoplay)
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; markAction('move'); }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; markAction('move'); }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// Tema: oscuro por defecto, el usuario puede cambiar a claro (se recuerda en localStorage)
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'light' ? '☾ Modo oscuro' : '☀ Modo claro';
  try { localStorage.setItem('tetris-theme', theme); } catch (e) {}
  if (current) draw(); // redibuja para actualizar el color de la cuadrícula (también en pausa)
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space (caída) active el botón
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark'; } catch (e) {}

applyTheme(savedTheme);
init();
