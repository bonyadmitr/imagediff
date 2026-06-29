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
