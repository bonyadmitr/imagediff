import { toGray, boxBlur, downscale, channelsFromRGBA } from './image.js';
import { findOffset } from './align.js';
import { tolerantDiffField, gradientMag } from './diff.js';
import { open, dilate } from './morphology.js';
import { largestComponentBox, boxesFromMask, mergeBoxes } from './components.js';

export const DEFAULT_OPTIONS = {
  orientation: 'auto',     // 'auto' | 'horizontal' | 'vertical'
  threshold: 50,           // порог отличия (0..255); меньше = чувствительнее
  matchThreshold: 22,      // ниже этого различия пиксели считаются совпавшими (зона панелей)
  matchRadius: 2,          // допуск ±N px при сравнении — гасит «дрожание» контуров
  edgeWeight: 0.6,         // вклад канала контуров в расстояние (0 = только цвет)
  blurRadius: 1,           // радиус предварительного размытия
  maxWorkingDim: 1100,     // рабочее разрешение стадии различий (скорость)
  minBlobFrac: 0.0005,     // мин. площадь отличия как доля площади зоны сравнения
  mergeGapFrac: 0.012,     // склеивать отличия ближе этой доли стороны зоны
  maxResults: null,        // показать только N самых сильных отличий (null = все)
  maxDiffs: 60,            // больше — результат считаем шумным
  // поиск зоны панелей по доле «совпавшего контента»
  edgeContentThr: 18,      // выше этого градиента пиксель считается «содержательным»
  zoneRatioThr: 0.55,      // строка/столбец входит в панель, если совпало >= этой доли контура
  zoneMinContentFrac: 0.04, // строки с меньшим числом контурных пикселей считаем фоном панели
  zoneMinValidFrac: 0.3,   // строки/столбцы с меньшим перекрытием считаем вне зоны сравнения
  // выравнивание
  alignMaxDim: 160,
  alignRefineDim: 700,
  alignStep: 2,
  refineStep: 2,
  minSeparationFrac: 0.15,
  minOverlapFrac: 0.2,
  maxSkewFrac: 0.04,
  alignMaxScore: 70,
  manualRegions: null,
};

export function findDifferences(image, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const grayFull = toGray(image);
  const W0 = grayFull.width, H0 = grayFull.height;

  // 1. Смещение между копиями (на полутоне)
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

  // 2. Рабочий масштаб + признаки (цвет + контуры)
  const wf = Math.max(1, Math.ceil(Math.max(W0, H0) / opts.maxWorkingDim));
  const ch = channelsFromRGBA(image);
  const W = Math.max(1, Math.floor(W0 / wf)), H = Math.max(1, Math.floor(H0 / wf));
  const R = blurCh(ch.r, ch.width, ch.height, wf, opts.blurRadius);
  const G = blurCh(ch.g, ch.width, ch.height, wf, opts.blurRadius);
  const B = blurCh(ch.b, ch.width, ch.height, wf, opts.blurRadius);
  const GR = blurCh(ch.gray, ch.width, ch.height, wf, opts.blurRadius);
  const edge = gradientMag({ data: GR, width: W, height: H }).data;
  const features = { channels: [R, G, B, edge], weights: [1, 1, 1, opts.edgeWeight], width: W, height: H };

  const dx = Math.round(align.dx / wf), dy = Math.round(align.dy / wf);

  // 3. Толерантная карта различий
  const { field, valid } = tolerantDiffField(features, dx, dy, opts.matchRadius);

  // 4. Зона сравнения = плотная полоса СОВПАВШЕГО КОНТЕНТА (исключает баннеры/мини-ответ)
  let compBox = findPanelZone(field, valid, edge, W, H, opts);
  if (!compBox) {
    // фолбэк: крупнейшая просто совпадающая область (на случай гладких картинок без контуров)
    const matchMask = new Uint8Array(W * H);
    for (let i = 0; i < field.length; i++) matchMask[i] = (valid[i] && field[i] < opts.matchThreshold) ? 1 : 0;
    compBox = largestComponentBox(matchMask, W, H);
  }
  if (opts.manualRegions) {
    const a = opts.manualRegions[0];
    compBox = { x: Math.round(a.x / wf), y: Math.round(a.y / wf), w: Math.round(a.w / wf), h: Math.round(a.h / wf) };
    compBox.area = compBox.w * compBox.h;
  }
  if (!compBox || compBox.area < W * H * 0.02) {
    return fail('panels_not_found', orientation, { dx: align.dx, dy: align.dy });
  }

  // 5. Маска отличий внутри зоны
  const diffMask = new Uint8Array(W * H);
  const x1 = compBox.x, y1 = compBox.y, x2 = compBox.x + compBox.w, y2 = compBox.y + compBox.h;
  for (let y = y1; y < y2; y++)
    for (let x = x1; x < x2; x++) {
      const i = y * W + x;
      if (valid[i] && field[i] >= opts.threshold) diffMask[i] = 1;
    }
  let m = open(diffMask, W, H, 1);
  m = dilate(m, W, H, 1);

  // 6. Прямоугольники + ранжирование по силе
  const minArea = Math.max(8, Math.floor(compBox.w * compBox.h * opts.minBlobFrac));
  const gap = Math.floor(Math.min(compBox.w, compBox.h) * opts.mergeGapFrac);
  const boxesW = mergeBoxes(boxesFromMask(m, W, H, minArea), gap);

  const scored = boxesW.map((b) => ({ b, score: boxStrength(b, field, valid, W, opts.threshold) }));
  scored.sort((a, b) => b.score - a.score);
  let chosen = scored;
  if (opts.maxResults && chosen.length > opts.maxResults) chosen = chosen.slice(0, opts.maxResults);
  const diffs = chosen.map((s) => ({ ...scaleBox(s.b, wf), score: Math.round(s.score) }));

  const panelA = scaleBox({ x: compBox.x, y: compBox.y, w: compBox.w, h: compBox.h }, wf);
  const panelB = { x: panelA.x + align.dx, y: panelA.y + align.dy, w: panelA.w, h: panelA.h };

  let status = 'ok';
  if (boxesW.length === 0) status = 'no_diffs';
  else if (boxesW.length > opts.maxDiffs) status = 'too_many_diffs';

  return { status, orientation, offset: { dx: align.dx, dy: align.dy }, panelA, panelB, diffs };
}

// Уменьшение одного канала + размытие.
function blurCh(data, w, h, factor, blurRadius) {
  const ds = downscale({ data, width: w, height: h }, factor);
  return boxBlur(ds, blurRadius).data;
}

// Зона панелей по ДОЛЕ совпавшего среди содержательного. Для каждой строки/столбца считаем
// долю «контурных» пикселей, которые совпали с другой панелью. В панели контур в основном
// совпадает (доля высокая); в баннере/тексте контур НЕ совпадает (доля низкая) → отсекается.
// Почти пустые строки (мало контура) включаем по умолчанию — это фон внутри панели.
function findPanelZone(field, valid, edge, W, H, opts) {
  const rowC = new Float32Array(H), rowM = new Float32Array(H), rowV = new Float32Array(H);
  const colC = new Float32Array(W), colM = new Float32Array(W), colV = new Float32Array(W);
  let totalContent = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!valid[i]) continue;
      rowV[y]++; colV[x]++;
      if (edge[i] < opts.edgeContentThr) continue;
      rowC[y]++; colC[x]++; totalContent++;
      if (field[i] < opts.matchThreshold) { rowM[y]++; colM[x]++; }
    }
  if (totalContent < W * H * 0.002) return null; // почти нет контуров — пусть решает фолбэк
  const yb = ratioBand(rowM, rowC, rowV, opts, W, Math.round(H * 0.01));
  const xb = ratioBand(colM, colC, colV, opts, H, Math.round(W * 0.01));
  if (!yb || !xb) return null;
  const box = { x: xb.lo, y: yb.lo, w: xb.hi - xb.lo + 1, h: yb.hi - yb.lo + 1 };
  box.area = box.w * box.h;
  return box.area >= W * H * 0.02 ? box : null;
}

// Самая длинная непрерывная полоса индексов, входящих в панель. Индекс входит, если:
// — он реально внутри перекрытия (валидных пикселей >= minValid), И
// — доля совпавшего контура >= ratioThr (строки с малым контуром считаем фоном → доля 1).
function ratioBand(matched, content, validCnt, opts, lineLen, smoothWin) {
  const sm = smooth(matched, smoothWin), sc = smooth(content, smoothWin), sv = smooth(validCnt, smoothWin);
  const minContent = lineLen * opts.zoneMinContentFrac;
  const minValid = lineLen * opts.zoneMinValidFrac;
  const n = content.length;
  let bestLo = -1, bestHi = -1, bestLen = 0, lo = -1;
  for (let i = 0; i < n; i++) {
    const inOverlap = sv[i] >= minValid;
    const ratio = sc[i] < minContent ? 1 : sm[i] / sc[i];
    const ok = inOverlap && ratio >= opts.zoneRatioThr;
    if (ok) { if (lo < 0) lo = i; }
    else if (lo >= 0) { if (i - lo > bestLen) { bestLen = i - lo; bestLo = lo; bestHi = i - 1; } lo = -1; }
  }
  if (lo >= 0 && n - lo > bestLen) { bestLo = lo; bestHi = n - 1; }
  return bestLo < 0 ? null : { lo: bestLo, hi: bestHi };
}

function smooth(arr, w) {
  if (w <= 0) return arr;
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < n) { s += arr[j]; c++; } }
    out[i] = s / c;
  }
  return out;
}

// Сила отличия: средняя величина различия × корень из площади (ярче и крупнее = сильнее).
function boxStrength(b, field, valid, W, threshold) {
  let sum = 0, cnt = 0;
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const i = y * W + x;
      if (valid[i] && field[i] >= threshold) { sum += field[i]; cnt++; }
    }
  return cnt ? (sum / cnt) * Math.sqrt(cnt) : 0;
}

function scaleBox(b, k) {
  return { x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round(b.w * k), h: Math.round(b.h * k) };
}

function fail(status, orientation, offset) {
  return { status, orientation, offset, panelA: null, panelB: null, diffs: [] };
}
