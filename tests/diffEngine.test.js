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

test('maxResults оставляет N самых сильных, отсортированных по силе', () => {
  // одно крупное отличие и два мелких
  const diffs = [{ x: 20, y: 20, size: 24 }, { x: 75, y: 30, size: 8 }, { x: 45, y: 65, size: 8 }];
  const img = makePuzzle({ orientation: 'horizontal', diffs });
  const r = findDifferences(img, { maxResults: 2 });
  assert.equal(r.diffs.length, 2);
  assert.ok(r.diffs[0].score >= r.diffs[1].score, 'отсортировано по убыванию силы');
  // крупное отличие должно попасть в топ
  const big = diffs[0];
  const covered = r.diffs.some((b) =>
    big.x + big.size / 2 >= b.x && big.x + big.size / 2 <= b.x + b.w &&
    big.y + big.size / 2 >= b.y && big.y + big.size / 2 <= b.y + b.h);
  assert.ok(covered, 'крупное отличие в топ-2');
});

test('баннер не порождает ложных отличий', () => {
  const img = makePuzzle({ orientation: 'horizontal', diffs: DIFFS, banner: 40 });
  const r = findDifferences(img);
  assert.equal(r.status, 'ok');
  for (const d of DIFFS) assert.ok(covers(r.diffs, d));
  assert.ok(r.diffs.length <= DIFFS.length + 1, `лишние рамки: ${r.diffs.length}`);
});
