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
