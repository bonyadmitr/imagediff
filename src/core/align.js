import { downscale } from './image.js';

// Находит вектор смещения между двумя почти одинаковыми копиями внутри кадра
// и ориентацию. Возвращает { orientation, dx, dy, score } в полном разрешении
// или null, если уверенного совпадения нет.
export function findOffset(gray, opts) {
  const factor = chooseFactor(gray.width, gray.height, opts.alignMaxDim);
  const small = downscale(gray, factor);
  const h = opts.orientation !== 'vertical' ? bestForOrientation(small, 'horizontal', opts) : null;
  const v = opts.orientation !== 'horizontal' ? bestForOrientation(small, 'vertical', opts) : null;
  let best = (h && v) ? (h.score <= v.score ? h : v) : (h || v);
  if (!best || best.score > opts.alignMaxScore) return null;
  const coarse = { orientation: best.orientation, dx: best.dx * factor, dy: best.dy * factor };
  return refine(gray, coarse, factor, opts);
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

function refine(gray, coarse, factor, opts) {
  let best = { ...coarse, score: Infinity };
  for (let ddy = -factor; ddy <= factor; ddy++)
    for (let ddx = -factor; ddx <= factor; ddx++) {
      const dx = coarse.dx + ddx, dy = coarse.dy + ddy;
      const s = mad(gray, dx, dy, opts.refineStep);
      if (s !== null && s < best.score) best = { orientation: coarse.orientation, dx, dy, score: s };
    }
  return best;
}

function chooseFactor(w, h, maxDim) {
  return Math.max(1, Math.round(Math.max(w, h) / maxDim));
}
