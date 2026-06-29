import { downscale } from './image.js';

// Находит вектор смещения между двумя почти одинаковыми копиями внутри кадра
// и ориентацию. Возвращает { orientation, dx, dy, score } в полном разрешении
// или null, если уверенного совпадения нет.
export function findOffset(gray, opts) {
  // Грубый поиск на сильно уменьшенной копии.
  const cf = chooseFactor(gray.width, gray.height, opts.alignMaxDim);
  const small = downscale(gray, cf);
  const h = opts.orientation !== 'vertical' ? bestForOrientation(small, 'horizontal', opts) : null;
  const v = opts.orientation !== 'horizontal' ? bestForOrientation(small, 'vertical', opts) : null;
  let best = (h && v) ? (h.score <= v.score ? h : v) : (h || v);
  if (!best || best.score > opts.alignMaxScore) return null;

  // Уточнение на умеренно уменьшенной копии (НЕ на полном разрешении — это было бы
  // в десятки раз дороже, а такая точность не нужна: дальше всё считается на рабочем
  // масштабе с допуском matchRadius).
  const rf = chooseFactor(gray.width, gray.height, opts.alignRefineDim);
  const med = downscale(gray, rf);
  const coarseMed = {
    orientation: best.orientation,
    dx: Math.round(best.dx * cf / rf),
    dy: Math.round(best.dy * cf / rf),
  };
  const win = Math.ceil(cf / rf) + 1;
  const r = refineAt(med, coarseMed, win, opts.refineStep);
  return { orientation: best.orientation, dx: r.dx * rf, dy: r.dy * rf, score: r.score };
}

function bestForOrientation(g, orientation, opts) {
  const { width: W, height: H } = g;
  const primary = orientation === 'horizontal' ? W : H;
  const secondary = orientation === 'horizontal' ? H : W;
  const minSep = Math.floor(primary * opts.minSeparationFrac);
  const maxSep = primary - Math.floor(primary * opts.minOverlapFrac);
  const maxSkew = Math.floor(secondary * opts.maxSkewFrac);
  let best = null;
  for (let sep = minSep; sep <= maxSep; sep++) {
    for (let skew = -maxSkew; skew <= maxSkew; skew++) {
      const dx = orientation === 'horizontal' ? sep : skew;
      const dy = orientation === 'horizontal' ? skew : sep;
      const s = mad(g, dx, dy, opts.alignStep);
      if (s !== null && (!best || s < best.score)) best = { orientation, dx, dy, score: s };
    }
  }
  return best;
}

// Среднее абсолютное отличие по перекрытию (с подвыборкой шагом step). null при малом перекрытии.
function mad(g, dx, dy, step) {
  const { data, width: W, height: H } = g;
  let sum = 0, n = 0;
  const x0 = Math.max(0, -dx), x1 = W - Math.max(0, dx);
  const y0 = Math.max(0, -dy), y1 = H - Math.max(0, dy);
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      sum += Math.abs(data[y * W + x] - data[(y + dy) * W + (x + dx)]); n++;
    }
  return n < 32 ? null : sum / n;
}

// Точный перебор смещения в окне ±win (шаг 1) вокруг грубой оценки, на переданном
// (уже уменьшенном) изображении. Окно небольшое, поэтому это дёшево.
function refineAt(gray, coarse, win, step) {
  let best = { orientation: coarse.orientation, dx: coarse.dx, dy: coarse.dy, score: Infinity };
  for (let ddy = -win; ddy <= win; ddy++)
    for (let ddx = -win; ddx <= win; ddx++) {
      const dx = coarse.dx + ddx, dy = coarse.dy + ddy;
      const s = mad(gray, dx, dy, step);
      if (s !== null && s < best.score) best = { orientation: coarse.orientation, dx, dy, score: s };
    }
  return best;
}

function chooseFactor(w, h, maxDim) {
  return Math.max(1, Math.round(Math.max(w, h) / maxDim));
}
