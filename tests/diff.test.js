import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tolerantDiffField, gradientMag } from '../src/core/diff.js';

const feat = (data, W, H) => ({ channels: [data], weights: [1], width: W, height: H });

// Панель A в столбцах 0..9, панель B в столбцах 20..29 — копия со сдвигом на 1px.
// Вокруг соответствия столбца A x=5 в B ставим инородные значения — это настоящее отличие.
test('tolerantDiffField: терпит сдвиг 1px, ловит настоящее отличие', () => {
  const W = 30, H = 8;
  const g = new Float32Array(W * H);
  const val = (k) => ((k * 37) % 200) + 10;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 10; x++) g[y * W + x] = val(x);          // панель A
    for (let x = 20; x < 30; x++) g[y * W + x] = val(x - 20 - 1); // панель B, сдвиг на 1px
  }
  for (let y = 0; y < H; y++) for (let xx = 24; xx <= 26; xx++) g[y * W + xx] = 999; // отличие

  const tol = tolerantDiffField(feat(g, W, H), 20, 0, 1);
  assert.ok(tol.field[3 * W + 8] < 1, `чистый столбец=${tol.field[3 * W + 8]}`);
  assert.ok(tol.field[3 * W + 5] > 100, `столбец с отличием=${tol.field[3 * W + 5]}`);

  const strict = tolerantDiffField(feat(g, W, H), 20, 0, 0);
  assert.ok(strict.field[3 * W + 8] > 0, 'без допуска сдвиг даёт ненулевую разницу');
});

// Перекраска с ОДИНАКОВОЙ яркостью: по цветовым каналам разница есть, по полутону — почти нет.
test('tolerantDiffField: ловит перекраску по цветовым каналам', () => {
  const W = 20, H = 4;
  const r = new Float32Array(W * H), g = new Float32Array(W * H), b = new Float32Array(W * H);
  // панель A x=0..7, панель B x=10..17, offset 10. В B столбец 13 перекрашен (R↔G).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 8; x++) { r[y*W+x] = 200; g[y*W+x] = 50; b[y*W+x] = 50; }
    for (let x = 10; x < 18; x++) { r[y*W+x] = 200; g[y*W+x] = 50; b[y*W+x] = 50; }
    r[y*W+13] = 50; g[y*W+13] = 200; // перекраска: яркость ~та же, цвет другой
  }
  const features = { channels: [r, g, b], weights: [1, 1, 1], width: W, height: H };
  const tol = tolerantDiffField(features, 10, 0, 0);
  assert.ok(tol.field[1 * W + 3] > 100, `перекрашенный столбец=${tol.field[1 * W + 3]}`);
});

test('gradientMag: ноль на постоянном поле, всплеск на границе', () => {
  const W = 6, H = 3;
  const d = new Float32Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 3; x < W; x++) d[y * W + x] = 100; // граница на x=3
  const e = gradientMag({ data: d, width: W, height: H });
  assert.equal(e.data[1 * W + 0], 0, 'плоская зона');
  assert.ok(e.data[1 * W + 2] > 0 || e.data[1 * W + 3] > 0, 'граница даёт градиент');
});
