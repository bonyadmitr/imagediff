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
