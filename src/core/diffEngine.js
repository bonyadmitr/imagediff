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
