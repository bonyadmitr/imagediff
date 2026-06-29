# ImageDiff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA, которая принимает одно изображение с двумя почти одинаковыми картинками и подсвечивает рамками все отличия — полностью автоматически.

**Architecture:** Переносимое ядро `diffEngine` (чистые ES-модули, работают только с пиксельными буферами RGBA, без DOM) + тонкий платформенный адаптер на Canvas/DOM. Ключевая идея алгоритма — найти вектор смещения между двумя копиями через само-сопоставление (а не резать кадр пополам), затем выделить зону панелей как крупнейшую область совпадения и найти отличия как высококонтрастные пятна внутри неё.

**Tech Stack:** Чистый JavaScript (ES modules), без зависимостей. Тесты — встроенный `node:test` (Node 26). PWA — статический `index.html` + service worker + web manifest.

---

## Структура файлов

```
ImageDiff/
├─ package.json                  # type:module, скрипт test
├─ src/core/
│  ├─ image.js                   # toGray, downscale, boxBlur
│  ├─ align.js                   # findOffset — поиск смещения и ориентации
│  ├─ morphology.js              # erode, dilate, open для бинарных масок
│  ├─ components.js              # связные компоненты, рамки, слияние
│  └─ diffEngine.js              # findDifferences — оркестрация конвейера
├─ app/
│  ├─ index.html                 # один экран
│  ├─ app.js                     # адаптер: Canvas, загрузка, отрисовка рамок
│  ├─ style.css
│  ├─ manifest.webmanifest
│  └─ sw.js                      # service worker (офлайн)
├─ tests/
│  ├─ helpers/synth.js           # генератор синтетических головоломок (RGBA)
│  ├─ image.test.js
│  ├─ morphology.test.js
│  ├─ components.test.js
│  ├─ align.test.js
│  └─ diffEngine.test.js
└─ README.md                     # подробная документация (рус.)
```

Принцип тестов: **качество, а не покрытие.** Тестируем реальные риски — корректность ориентации/смещения, попадание рамок в реальные отличия, устойчивость к лишнему контенту (баннер), краевой случай «нет отличий».

---

## Task 1: Scaffolding

**Files:** Create `package.json`, `.gitignore`

- [ ] **Step 1: package.json**

```json
{
  "name": "imagediff",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: .gitignore**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: scaffolding"`

---

## Task 2: `src/core/image.js` (TDD)

**Files:** Create `src/core/image.js`, `tests/image.test.js`

- [ ] **Step 1: Failing test** (`tests/image.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGray, downscale, boxBlur } from '../src/core/image.js';

function rgba(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i*4] = fill[0]; data[i*4+1] = fill[1]; data[i*4+2] = fill[2]; data[i*4+3] = 255;
  }
  return { data, width, height };
}

test('toGray по Rec.601', () => {
  const g = toGray(rgba(2, 1, [255, 0, 0]));
  assert.ok(Math.abs(g.data[0] - 76.245) < 0.5);
  assert.equal(g.width, 2);
});

test('downscale усредняет блок 2x2 в один пиксель', () => {
  const data = new Float32Array([0, 100, 200, 0]); // 2x2
  const out = downscale({ data, width: 2, height: 2 }, 2);
  assert.equal(out.width, 1);
  assert.equal(out.data[0], 75);
});

test('boxBlur сохраняет постоянное поле', () => {
  const data = new Float32Array(9).fill(50);
  const out = boxBlur({ data, width: 3, height: 3 }, 1);
  for (const v of out.data) assert.ok(Math.abs(v - 50) < 1e-6);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` → модуль не найден.

- [ ] **Step 3: Implement `src/core/image.js`** (полный код)

```js
// Утилиты работы с изображениями. Чистые функции, без DOM.
// RgbaImage: { data: Uint8ClampedArray, width, height }  (RGBA)
// GrayImage: { data: Float32Array, width, height }

export function toGray(image) {
  const { data, width, height } = image;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { data: out, width, height };
}

export function downscale(gray, factor) {
  if (factor <= 1) return { data: gray.data.slice(), width: gray.width, height: gray.height };
  const { data, width, height } = gray;
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      const sy = y * factor, sx = x * factor;
      for (let dy = 0; dy < factor; dy++) {
        const yy = sy + dy; if (yy >= height) break;
        for (let dx = 0; dx < factor; dx++) {
          const xx = sx + dx; if (xx >= width) break;
          sum += data[yy * width + xx]; n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { data: out, width: w, height: h };
}

export function boxBlur(gray, r) {
  if (r <= 0) return { data: gray.data.slice(), width: gray.width, height: gray.height };
  const { data, width, height } = gray;
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const win = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += data[row + clamp(k, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      sum += data[row + clamp(x + r + 1, 0, width - 1)] - data[row + clamp(x - r, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / win;
      sum += tmp[clamp(y + r + 1, 0, height - 1) * width + x] - tmp[clamp(y - r, 0, height - 1) * width + x];
    }
  }
  return { data: out, width, height };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
```

- [ ] **Step 4: Run, expect PASS** — `npm test`
- [ ] **Step 5: Commit** — `git commit -am "feat(core): image utils (toGray, downscale, boxBlur)"`

---

## Task 3: `src/core/morphology.js` (TDD)

**Files:** Create `src/core/morphology.js`, `tests/morphology.test.js`

- [ ] **Step 1: Failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erode, dilate, open } from '../src/core/morphology.js';

test('open убирает одиночный пиксель-шум', () => {
  const m = new Uint8Array(25); // 5x5
  m[12] = 1; // центр
  const out = open(m, 5, 5, 1);
  assert.equal(out.reduce((a, b) => a + b, 0), 0);
});

test('dilate растит блок', () => {
  const m = new Uint8Array(25);
  m[12] = 1;
  const out = dilate(m, 5, 5, 1);
  assert.equal(out.reduce((a, b) => a + b, 0), 9); // 3x3
});

test('erode сохраняет ядро сплошного квадрата', () => {
  const m = new Uint8Array(25).fill(0);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y*5+x] = 1; // 3x3
  const out = erode(m, 5, 5, 1);
  assert.equal(out.reduce((a, b) => a + b, 0), 1); // остаётся центр
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `src/core/morphology.js`**

```js
// Морфология бинарных масок (Uint8Array со значениями 0/1), квадратное ядро радиуса r.
export function erode(mask, width, height, r) { return morph(mask, width, height, r, true); }
export function dilate(mask, width, height, r) { return morph(mask, width, height, r, false); }
export function open(mask, width, height, r) {
  return dilate(erode(mask, width, height, r), width, height, r);
}

function morph(mask, width, height, r, isErode) {
  if (r <= 0) return mask.slice();
  const want = isErode ? 0 : 1; // эрозия: ноль если рядом есть 0; дилатация: единица если рядом есть 1
  const tmp = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  // горизонтальный проход
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) { if (isErode) { hit = true; break; } else continue; }
        if (mask[y * width + xx] === want) { hit = true; break; }
      }
      tmp[y * width + x] = (isErode ? !hit : hit) ? 1 : 0;
    }
  }
  // вертикальный проход
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) { if (isErode) { hit = true; break; } else continue; }
        if (tmp[yy * width + x] === want) { hit = true; break; }
      }
      out[y * width + x] = (isErode ? !hit : hit) ? 1 : 0;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(core): morphology (erode/dilate/open)"`

---

## Task 4: `src/core/components.js` (TDD)

**Files:** Create `src/core/components.js`, `tests/components.test.js`

- [ ] **Step 1: Failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectedComponents, largestComponentBox, boxesFromMask, mergeBoxes } from '../src/core/components.js';

test('два раздельных пятна → две компоненты', () => {
  const m = new Uint8Array(25);
  m[0] = 1;            // угол
  m[12] = 1; m[13] = 1; // центр пара
  const comps = connectedComponents(m, 5, 5);
  assert.equal(comps.length, 2);
});

test('largestComponentBox берёт крупнейшую', () => {
  const m = new Uint8Array(25);
  m[0] = 1;
  for (let i = 10; i < 15; i++) m[i] = 1;
  const box = largestComponentBox(m, 5, 5);
  assert.equal(box.area, 5);
});

test('boxesFromMask отбрасывает мелочь по minArea', () => {
  const m = new Uint8Array(25);
  m[0] = 1; // площадь 1
  for (let i = 10; i < 14; i++) m[i] = 1; // площадь 4
  const boxes = boxesFromMask(m, 5, 5, 3);
  assert.equal(boxes.length, 1);
});

test('mergeBoxes сливает близкие', () => {
  const merged = mergeBoxes([
    { x: 0, y: 0, w: 2, h: 2 },
    { x: 3, y: 0, w: 2, h: 2 },
  ], 2);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].w, 5);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `src/core/components.js`**

```js
// Связные компоненты бинарной маски (8-связность) и работа с рамками.
export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height);
  const comps = [];
  const stack = [];
  let label = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    label++;
    let area = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    stack.push(i); labels[i] = label;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width, y = (idx - x) / width;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let ny = y - 1; ny <= y + 1; ny++) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (mask[n] && !labels[n]) { labels[n] = label; stack.push(n); }
        }
      }
    }
    comps.push({ area, minX, minY, maxX, maxY });
  }
  return comps;
}

export function largestComponentBox(mask, width, height) {
  const comps = connectedComponents(mask, width, height);
  if (!comps.length) return null;
  let b = comps[0];
  for (const c of comps) if (c.area > b.area) b = c;
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1, area: b.area };
}

export function boxesFromMask(mask, width, height, minArea) {
  return connectedComponents(mask, width, height)
    .filter(c => c.area >= minArea)
    .map(c => ({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 }));
}

export function mergeBoxes(boxes, gap) {
  const arr = boxes.map(b => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < arr.length && !merged; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (near(arr[i], arr[j], gap)) { arr[i] = union(arr[i], arr[j]); arr.splice(j, 1); merged = true; break; }
      }
    }
  }
  return arr;
}

function near(a, b, gap) {
  return !(a.x > b.x + b.w + gap || b.x > a.x + a.w + gap || a.y > b.y + b.h + gap || b.y > a.y + a.h + gap);
}
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(core): connected components and box merging"`

---

## Task 5: `tests/helpers/synth.js` + `src/core/align.js` (TDD)

**Files:** Create `tests/helpers/synth.js`, `src/core/align.js`, `tests/align.test.js`

- [ ] **Step 1: Synthetic puzzle generator** (`tests/helpers/synth.js`)

```js
// Генератор синтетических головоломок «найди отличия» как RGBA-изображений.
// Две панели с одинаковым текстурным фоном; в панель B добавлены квадраты-отличия
// гарантированно высокого контраста.
export function makePuzzle({
  orientation = 'horizontal',
  panelW = 120, panelH = 90, gap = 10,
  diffs = [],          // [{ x, y, size }] в координатах панели
  banner = 0,          // высота нижнего баннера (0 = нет)
} = {}) {
  let W, H;
  if (orientation === 'horizontal') { W = panelW * 2 + gap; H = panelH + banner; }
  else { W = panelW; H = panelH * 2 + gap + banner; }
  const data = new Uint8ClampedArray(W * H * 4);
  data.fill(255);

  const drawPanel = (ox, oy, withDiffs) => {
    for (let y = 0; y < panelH; y++)
      for (let x = 0; x < panelW; x++) {
        const v = bg(x, y);
        put(data, W, ox + x, oy + y, v, v, v);
      }
    if (withDiffs) for (const d of diffs)
      for (let y = 0; y < d.size; y++)
        for (let x = 0; x < d.size; x++) {
          const base = bg(d.x + x, d.y + y);
          const val = base >= 128 ? 0 : 255; // гарантированный контраст
          put(data, W, ox + d.x + x, oy + d.y + y, val, val, val);
        }
  };

  if (orientation === 'horizontal') { drawPanel(0, 0, false); drawPanel(panelW + gap, 0, true); }
  else { drawPanel(0, 0, false); drawPanel(0, panelH + gap, true); }

  if (banner) for (let y = H - banner; y < H; y++) for (let x = 0; x < W; x++)
    put(data, W, x, y, (x * 17) % 256, 100, 200); // не повторяется как панель

  return { data, width: W, height: H };
}

function bg(x, y) {
  const grad = x;                                   // горизонтальный градиент → сигнал для выравнивания
  const checker = (((x >> 3) + (y >> 3)) % 2) ? 40 : 0;
  return Math.min(220, 40 + grad + checker);
}
function put(data, W, x, y, r, g, b) {
  const i = (y * W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
}
```

- [ ] **Step 2: Failing test** (`tests/align.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGray } from '../src/core/image.js';
import { findOffset } from '../src/core/align.js';
import { DEFAULT_OPTIONS } from '../src/core/diffEngine.js';
import { makePuzzle } from './helpers/synth.js';

const near = (a, b, t = 2) => Math.abs(a - b) <= t;

test('горизонтальная пара: ориентация и смещение', () => {
  const img = makePuzzle({ orientation: 'horizontal', panelW: 120, panelH: 90, gap: 10 });
  const off = findOffset(toGray(img), DEFAULT_OPTIONS);
  assert.ok(off, 'смещение найдено');
  assert.equal(off.orientation, 'horizontal');
  assert.ok(near(off.dx, 130), `dx=${off.dx}`);
  assert.ok(near(off.dy, 0), `dy=${off.dy}`);
});

test('вертикальная пара: ориентация и смещение', () => {
  const img = makePuzzle({ orientation: 'vertical', panelW: 120, panelH: 90, gap: 10 });
  const off = findOffset(toGray(img), DEFAULT_OPTIONS);
  assert.ok(off);
  assert.equal(off.orientation, 'vertical');
  assert.ok(near(off.dy, 100), `dy=${off.dy}`);
  assert.ok(near(off.dx, 0), `dx=${off.dx}`);
});

test('баннер не сбивает определение смещения', () => {
  const img = makePuzzle({ orientation: 'horizontal', banner: 40 });
  const off = findOffset(toGray(img), DEFAULT_OPTIONS);
  assert.ok(off);
  assert.equal(off.orientation, 'horizontal');
  assert.ok(near(off.dx, 130), `dx=${off.dx}`);
});
```

- [ ] **Step 3: Run, expect FAIL** (align.js не существует)

- [ ] **Step 4: Implement `src/core/align.js`**

```js
import { downscale } from './image.js';

// Находит вектор смещения между двумя почти одинаковыми копиями внутри кадра
// и ориентацию. Возвращает { orientation, dx, dy, score } в полном разрешении
// или null, если уверенного совпадения нет.
export function findOffset(gray, opts) {
  const factor = chooseFactor(gray.width, gray.height, opts.alignMaxDim);
  const small = downscale(gray, factor);
  const h = opts.orientation !== 'vertical' ? bestForOrientation(small, 'horizontal', opts) : null;
  const v = opts.orientation !== 'horizontal' ? bestForOrientation(small, 'vertical', opts) : null;
  let best = (h && v) ? (h.score <= v.score ? h : v) : (h || v);
  if (!best || best.score > opts.alignMaxScore) return null;
  const coarse = { orientation: best.orientation, dx: best.dx * factor, dy: best.dy * factor };
  return refine(gray, coarse, factor, opts);
}

function bestForOrientation(g, orientation, opts) {
  const { width: W, height: H } = g;
  const primary = orientation === 'horizontal' ? W : H;
  const secondary = orientation === 'horizontal' ? H : W;
  const minSep = Math.floor(primary * opts.minSeparationFrac);
  const maxSep = primary - Math.floor(primary * opts.minOverlapFrac);
  const maxSkew = Math.floor(secondary * opts.maxSkewFrac);
  let best = null;
  for (let sep = minSep; sep <= maxSep; sep++) {
    for (let skew = -maxSkew; skew <= maxSkew; skew++) {
      const dx = orientation === 'horizontal' ? sep : skew;
      const dy = orientation === 'horizontal' ? skew : sep;
      const s = mad(g, dx, dy, opts.alignStep);
      if (s !== null && (!best || s < best.score)) best = { orientation, dx, dy, score: s };
    }
  }
  return best;
}

// Среднее абсолютное отличие по перекрытию (с подвыборкой шагом step). null при малом перекрытии.
function mad(g, dx, dy, step) {
  const { data, width: W, height: H } = g;
  let sum = 0, n = 0;
  const x0 = Math.max(0, -dx), x1 = W - Math.max(0, dx);
  const y0 = Math.max(0, -dy), y1 = H - Math.max(0, dy);
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      sum += Math.abs(data[y * W + x] - data[(y + dy) * W + (x + dx)]); n++;
    }
  return n < 32 ? null : sum / n;
}

function refine(gray, coarse, factor, opts) {
  let best = { ...coarse, score: Infinity };
  for (let ddy = -factor; ddy <= factor; ddy++)
    for (let ddx = -factor; ddx <= factor; ddx++) {
      const dx = coarse.dx + ddx, dy = coarse.dy + ddy;
      const s = mad(gray, dx, dy, opts.refineStep);
      if (s !== null && s < best.score) best = { orientation: coarse.orientation, dx, dy, score: s };
    }
  return best;
}

function chooseFactor(w, h, maxDim) {
  return Math.max(1, Math.round(Math.max(w, h) / maxDim));
}
```

- [ ] **Step 5: Run, expect PASS** — `npm test`
- [ ] **Step 6: Commit** — `git commit -am "feat(core): offset/orientation detection via self-similarity"`

---

## Task 6: `src/core/diffEngine.js` (TDD)

**Files:** Create `src/core/diffEngine.js`, `tests/diffEngine.test.js`

- [ ] **Step 1: Failing test** (`tests/diffEngine.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDifferences } from '../src/core/diffEngine.js';
import { makePuzzle } from './helpers/synth.js';

const DIFFS = [ { x: 20, y: 20, size: 10 }, { x: 70, y: 30, size: 10 }, { x: 40, y: 60, size: 10 } ];
const covers = (boxes, d) => boxes.some(b =>
  d.x + d.size/2 >= b.x && d.x + d.size/2 <= b.x + b.w &&
  d.y + d.size/2 >= b.y && d.y + d.size/2 <= b.y + b.h);

test('горизонтальная головоломка: находит все отличия', () => {
  const img = makePuzzle({ orientation: 'horizontal', diffs: DIFFS });
  const r = findDifferences(img);
  assert.equal(r.status, 'ok');
  for (const d of DIFFS) assert.ok(covers(r.diffs, d), `не накрыто отличие ${JSON.stringify(d)}`);
  assert.ok(r.diffs.length <= DIFFS.length + 1, `лишние рамки: ${r.diffs.length}`);
});

test('вертикальная головоломка: находит все отличия', () => {
  const img = makePuzzle({ orientation: 'vertical', diffs: DIFFS });
  const r = findDifferences(img);
  assert.equal(r.status, 'ok');
  assert.equal(r.orientation, 'vertical');
  for (const d of DIFFS) assert.ok(covers(r.diffs, d));
});

test('нет отличий → status no_diffs', () => {
  const img = makePuzzle({ orientation: 'horizontal', diffs: [] });
  const r = findDifferences(img);
  assert.equal(r.status, 'no_diffs');
  assert.equal(r.diffs.length, 0);
});

test('баннер не порождает ложных отличий', () => {
  const img = makePuzzle({ orientation: 'horizontal', diffs: DIFFS, banner: 40 });
  const r = findDifferences(img);
  assert.equal(r.status, 'ok');
  for (const d of DIFFS) assert.ok(covers(r.diffs, d));
  assert.ok(r.diffs.length <= DIFFS.length + 1, `лишние рамки: ${r.diffs.length}`);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `src/core/diffEngine.js`**

```js
import { toGray, boxBlur } from './image.js';
import { findOffset } from './align.js';
import { open, dilate } from './morphology.js';
import { largestComponentBox, boxesFromMask, mergeBoxes } from './components.js';

export const DEFAULT_OPTIONS = {
  orientation: 'auto',     // 'auto' | 'horizontal' | 'vertical'
  threshold: 45,           // порог отличия по яркости (0..255); меньше = чувствительнее
  matchThreshold: 30,      // ниже этого различия пиксели считаются совпавшими (поиск зоны панелей)
  blurRadius: 2,           // радиус предварительного размытия (гасит сглаживание)
  minBlobFrac: 0.0002,     // мин. площадь отличия как доля площади зоны сравнения
  mergeGapFrac: 0.01,      // склеивать отличия ближе этой доли стороны зоны
  maxDiffs: 60,            // больше — результат считаем шумным
  alignMaxDim: 160,        // макс. сторона при поиске смещения (скорость)
  alignStep: 2,            // подвыборка пикселей при оценке совпадения
  refineStep: 2,
  minSeparationFrac: 0.15, // панели разнесены минимум на эту долю стороны
  minOverlapFrac: 0.2,     // минимальное перекрытие
  maxSkewFrac: 0.04,       // допустимый перекос по второй оси
  alignMaxScore: 60,       // если лучшее среднее различие выше — панели не найдены
  manualRegions: null,     // [{x,y,w,h},{x,y,w,h}] — задать панели вручную (аварийный люк)
};

export function findDifferences(image, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const gray = toGray(image);
  const W = gray.width, H = gray.height;

  let align;
  if (opts.manualRegions && opts.manualRegions.length === 2) {
    const [a, b] = opts.manualRegions;
    const dx = Math.round(b.x - a.x), dy = Math.round(b.y - a.y);
    align = { dx, dy, orientation: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical' };
  } else {
    align = findOffset(gray, opts);
  }
  if (!align) return fail('panels_not_found', null, null);

  const { dx, dy, orientation } = align;

  // Поле различий на размытом полутоне
  const blur = boxBlur(gray, opts.blurRadius);
  const field = new Float32Array(W * H);
  const valid = new Uint8Array(W * H);
  const xs = Math.max(0, -dx), xe = W - Math.max(0, dx);
  const ys = Math.max(0, -dy), ye = H - Math.max(0, dy);
  for (let y = ys; y < ye; y++)
    for (let x = xs; x < xe; x++) {
      const i = y * W + x;
      field[i] = Math.abs(blur.data[i] - blur.data[(y + dy) * W + (x + dx)]);
      valid[i] = 1;
    }

  // Зона сравнения = крупнейшая область совпадения
  let compBox;
  if (opts.manualRegions) {
    const a = opts.manualRegions[0];
    compBox = { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h), area: Math.round(a.w * a.h) };
  } else {
    const matchMask = new Uint8Array(W * H);
    for (let i = 0; i < field.length; i++) matchMask[i] = (valid[i] && field[i] < opts.matchThreshold) ? 1 : 0;
    compBox = largestComponentBox(matchMask, W, H);
  }
  if (!compBox || compBox.area < W * H * 0.02) return fail('panels_not_found', orientation, { dx, dy });

  // Маска отличий внутри зоны сравнения
  const diffMask = new Uint8Array(W * H);
  const x1 = compBox.x, y1 = compBox.y, x2 = compBox.x + compBox.w, y2 = compBox.y + compBox.h;
  for (let y = y1; y < y2; y++)
    for (let x = x1; x < x2; x++) {
      const i = y * W + x;
      if (valid[i] && field[i] >= opts.threshold) diffMask[i] = 1;
    }
  let m = open(diffMask, W, H, 1);
  m = dilate(m, W, H, 2);

  const minArea = Math.max(4, Math.floor(compBox.w * compBox.h * opts.minBlobFrac));
  const gap = Math.floor(Math.min(compBox.w, compBox.h) * opts.mergeGapFrac);
  const boxes = mergeBoxes(boxesFromMask(m, W, H, minArea), gap);

  const panelA = { x: compBox.x, y: compBox.y, w: compBox.w, h: compBox.h };
  const panelB = { x: compBox.x + dx, y: compBox.y + dy, w: compBox.w, h: compBox.h };

  let status = 'ok';
  if (boxes.length === 0) status = 'no_diffs';
  else if (boxes.length > opts.maxDiffs) status = 'too_many_diffs';

  return { status, orientation, offset: { dx, dy }, panelA, panelB, diffs: boxes };
}

function fail(status, orientation, offset) {
  return { status, orientation, offset, panelA: null, panelB: null, diffs: [] };
}
```

- [ ] **Step 4: Run, expect PASS** — `npm test`
- [ ] **Step 5: Commit** — `git commit -am "feat(core): diff engine pipeline"`

---

## Task 7: PWA-адаптер (Canvas/DOM)

**Files:** Create `app/index.html`, `app/app.js`, `app/style.css`, `app/manifest.webmanifest`, `app/sw.js`. Ручная/визуальная проверка в браузере (юнит-тестов нет — это слой ввода-вывода).

- [ ] **Step 1: `app/index.html`** — один экран: зона загрузки, контролы (слайдер чувствительности, переключатель ориентации, кнопка «Выделить вручную» — заглушка-аварийный люк), canvas, статус, кнопки сохранить/другая.
- [ ] **Step 2: `app/app.js`** — загрузка картинки (file/drag/paste) → ImageData → `findDifferences` → отрисовка рамок на обеих панелях (panelA и со сдвигом offset на panelB); обработка статусов сообщениями; сохранение результата; регистрация service worker.
- [ ] **Step 3: `app/style.css`**, **`app/manifest.webmanifest`**, **`app/sw.js`** (кэш статики для офлайна).
- [ ] **Step 4: Запустить локальный сервер** `python3 -m http.server` в `app/`, проверить на примере (обезьянка/инопланетяне): рамки попадают на отличия.
- [ ] **Step 5: Commit** — `git commit -am "feat(app): PWA adapter (canvas UI, offline)"`

---

## Task 8: Документация (README, рус.)

**Files:** Create `README.md`

- [ ] **Step 1:** Подробный README на понятном русском: что это, как запустить (PWA локально и «установить»), как пользоваться, описание архитектуры, **таблица всех параметров `DEFAULT_OPTIONS`** (что значит, диапазон, на что влияет), формат результата `findDifferences`, примеры использования ядра в коде, известные ограничения (v1: только чистые картинки) и задел на будущее.
- [ ] **Step 2: Commit** — `git commit -am "docs: README на русском с описанием параметров и примерами"`

---

## Self-Review (выполнено при написании плана)

- **Покрытие спека:** платформонезависимое ядро (Tasks 2–6) ↔ §3.1; адаптер (Task 7) ↔ §3.2; алгоритм через само-сопоставление (Tasks 5–6) ↔ §4; обработка лишнего контента — тест с баннером (Task 5, 6) ↔ §1, §4; UX/ошибки (Task 7) ↔ §5, §6; тесты по качеству (Tasks 2–6) ↔ §7; документация (Task 8) ↔ §8. Аварийный люк `manualRegions` заложен в контракт ядра (Task 6) ↔ §3.2.
- **Заглушки:** код приведён полностью во всех шагах ядра и тестов; в Task 7 (слой ввода-вывода) описаны обязанности файлов — код пишется при исполнении, юнит-тестов нет осознанно.
- **Согласованность типов:** `DEFAULT_OPTIONS` определён в diffEngine.js и импортируется в align-тестах; сигнатуры `findOffset(gray, opts)`, `findDifferences(image, options)`, формы рамок `{x,y,w,h}` согласованы между задачами.
