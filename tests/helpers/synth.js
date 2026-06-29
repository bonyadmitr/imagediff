// Генератор синтетических головоломок «найди отличия» как RGBA-изображений.
// Две панели с одинаковым текстурным фоном; в панель B добавлены квадраты-отличия
// гарантированно высокого контраста.
export function makePuzzle({
  orientation = 'horizontal',
  panelW = 120, panelH = 90, gap = 10,
  diffs = [],          // [{ x, y, size }] в координатах панели
  banner = 0,          // высота нижнего баннера (0 = нет)
} = {}) {
  let W, H;
  if (orientation === 'horizontal') { W = panelW * 2 + gap; H = panelH + banner; }
  else { W = panelW; H = panelH * 2 + gap + banner; }
  const data = new Uint8ClampedArray(W * H * 4);
  data.fill(255);

  const drawPanel = (ox, oy, withDiffs) => {
    for (let y = 0; y < panelH; y++)
      for (let x = 0; x < panelW; x++) {
        const v = bg(x, y);
        put(data, W, ox + x, oy + y, v, v, v);
      }
    if (withDiffs) for (const d of diffs)
      for (let y = 0; y < d.size; y++)
        for (let x = 0; x < d.size; x++) {
          const base = bg(d.x + x, d.y + y);
          const val = base >= 128 ? 0 : 255; // гарантированный контраст
          put(data, W, ox + d.x + x, oy + d.y + y, val, val, val);
        }
  };

  if (orientation === 'horizontal') { drawPanel(0, 0, false); drawPanel(panelW + gap, 0, true); }
  else { drawPanel(0, 0, false); drawPanel(0, panelH + gap, true); }

  if (banner) for (let y = H - banner; y < H; y++) for (let x = 0; x < W; x++)
    put(data, W, x, y, (x * 17) % 256, 100, 200); // не повторяется как панель

  return { data, width: W, height: H };
}

// Непериодический низкочастотный фон (сумма несоизмеримых синусов): меняется по обеим
// осям и не повторяется на размере панели, поэтому совпадение даёт только истинное смещение.
function bg(x, y) {
  const v = 128
    + 55 * Math.sin(x * 0.13 + 0.5)
    + 45 * Math.sin(y * 0.09 + 1.3)
    + 35 * Math.sin((x + y) * 0.06)
    + 25 * Math.sin((x - 2 * y) * 0.045);
  return Math.max(10, Math.min(245, Math.round(v)));
}
function put(data, W, x, y, r, g, b) {
  const i = (y * W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
}
