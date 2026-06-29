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
