import { toGray, boxBlur, downscale } from './image.js';
import { findOffset } from './align.js';
import { tolerantDiffField } from './diff.js';
import { open, dilate } from './morphology.js';
import { largestComponentBox, boxesFromMask, mergeBoxes } from './components.js';

export const DEFAULT_OPTIONS = {
  orientation: 'auto',     // 'auto' | 'horizontal' | 'vertical'
  threshold: 50,           // порог отличия по яркости (0..255); меньше = чувствительнее
  matchThreshold: 22,      // ниже этого различия пиксели считаются совпавшими (поиск зоны панелей)
  matchRadius: 2,          // допуск ±N px при сравнении — гасит «дрожание» перерисованных контуров
  blurRadius: 1,           // радиус предварительного размытия (гасит сглаживание/шум)
  maxWorkingDim: 1100,     // рабочее разрешение стадии различий (ради скорости)
  minBlobFrac: 0.0005,     // мин. площадь отличия как доля площади зоны сравнения
  mergeGapFrac: 0.012,     // склеивать отличия ближе этой доли стороны зоны
  maxDiffs: 60,            // больше — результат считаем шумным
  alignMaxDim: 160,        // макс. сторона при ГРУБОМ поиске смещения (скорость)
  alignRefineDim: 700,     // макс. сторона при УТОЧНЕНИИ смещения (скорость/точность)
  alignStep: 2,            // подвыборка пикселей при оценке совпадения
  refineStep: 2,
  minSeparationFrac: 0.15, // панели разнесены минимум на эту долю стороны
  minOverlapFrac: 0.2,     // минимальное перекрытие
  maxSkewFrac: 0.04,       // допустимый перекос по второй оси
  alignMaxScore: 70,       // если лучшее среднее различие выше — панели не найдены
  manualRegions: null,     // [{x,y,w,h},{x,y,w,h}] — задать панели вручную (аварийный люк)
};

export function findDifferences(image, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const grayFull = toGray(image);
  const W0 = grayFull.width, H0 = grayFull.height;

  // 1. Смещение между копиями (на полном разрешении, внутри ядра идёт уменьшение)
  let align;
  if (opts.manualRegions && opts.manualRegions.length === 2) {
    const [a, b] = opts.manualRegions;
    const dx = Math.round(b.x - a.x), dy = Math.round(b.y - a.y);
    align = { dx, dy, orientation: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical' };
  } else {
    align = findOffset(grayFull, opts);
  }
  if (!align) return fail('panels_not_found', null, null);
  const orientation = align.orientation;

  // 2. Рабочее разрешение: уменьшаем картинку для стадии различий (скорость)
  const wf = Math.max(1, Math.ceil(Math.max(W0, H0) / opts.maxWorkingDim));
  const gw = downscale(grayFull, wf);
  const blur = boxBlur(gw, opts.blurRadius);
  const W = gw.width, H = gw.height;
  const dx = Math.round(align.dx / wf), dy = Math.round(align.dy / wf);

  // 3. Толерантная к сдвигу карта различий
  const { field, valid } = tolerantDiffField(blur, dx, dy, opts.matchRadius);

  // 4. Зона сравнения = крупнейшая область совпадения
  let compBox;
  if (opts.manualRegions) {
    const a = opts.manualRegions[0];
    compBox = scaleBox({ x: a.x, y: a.y, w: a.w, h: a.h }, 1 / wf);
    compBox.area = compBox.w * compBox.h;
  } else {
    const matchMask = new Uint8Array(W * H);
    for (let i = 0; i < field.length; i++) matchMask[i] = (valid[i] && field[i] < opts.matchThreshold) ? 1 : 0;
    compBox = largestComponentBox(matchMask, W, H);
  }
  if (!compBox || compBox.area < W * H * 0.02) {
    return fail('panels_not_found', orientation, { dx: align.dx, dy: align.dy });
  }

  // 5. Маска отличий внутри зоны сравнения
  const diffMask = new Uint8Array(W * H);
  const x1 = compBox.x, y1 = compBox.y, x2 = compBox.x + compBox.w, y2 = compBox.y + compBox.h;
  for (let y = y1; y < y2; y++)
    for (let x = x1; x < x2; x++) {
      const i = y * W + x;
      if (valid[i] && field[i] >= opts.threshold) diffMask[i] = 1;
    }
  let m = open(diffMask, W, H, 1);  // убрать одиночный шум
  m = dilate(m, W, H, 1);           // слегка нарастить

  // 6. Прямоугольники (в рабочем разрешении) → обратно в координаты оригинала
  const minArea = Math.max(8, Math.floor(compBox.w * compBox.h * opts.minBlobFrac));
  const gap = Math.floor(Math.min(compBox.w, compBox.h) * opts.mergeGapFrac);
  const boxesW = mergeBoxes(boxesFromMask(m, W, H, minArea), gap);
  const diffs = boxesW.map((b) => scaleBox(b, wf));

  const panelA = scaleBox({ x: compBox.x, y: compBox.y, w: compBox.w, h: compBox.h }, wf);
  const panelB = { x: panelA.x + align.dx, y: panelA.y + align.dy, w: panelA.w, h: panelA.h };

  let status = 'ok';
  if (diffs.length === 0) status = 'no_diffs';
  else if (diffs.length > opts.maxDiffs) status = 'too_many_diffs';

  return { status, orientation, offset: { dx: align.dx, dy: align.dy }, panelA, panelB, diffs };
}

function scaleBox(b, k) {
  return { x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round(b.w * k), h: Math.round(b.h * k) };
}

function fail(status, orientation, offset) {
  return { status, orientation, offset, panelA: null, panelB: null, diffs: [] };
}
