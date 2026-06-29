import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tolerantDiffField } from '../src/core/diff.js';

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
  const gray = { data: g, width: W, height: H };

  const tol = tolerantDiffField(gray, 20, 0, 1);
  assert.ok(tol.field[3 * W + 8] < 1, `чистый столбец=${tol.field[3 * W + 8]}`);
  assert.ok(tol.field[3 * W + 5] > 100, `столбец с отличием=${tol.field[3 * W + 5]}`);

  const strict = tolerantDiffField(gray, 20, 0, 0);
  assert.ok(strict.field[3 * W + 8] > 0, 'без допуска сдвиг даёт ненулевую разницу');
});
