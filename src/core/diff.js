// Карта различий, толерантная к небольшому сдвигу.
// Для каждого пикселя панели A берём МИНИМАЛЬНОЕ |A - B| по окрестности радиуса r
// вокруг соответствующей точки в панели B (со смещением dx, dy). Это гасит «дрожание»
// контуров у перерисованных/пересжатых картинок: сдвиг линии на 1-2 px перестаёт
// считаться отличием, а настоящие отличия (которым нет пары рядом) остаются.
export function tolerantDiffField(gray, dx, dy, radius) {
  const { data, width: W, height: H } = gray;
  const field = new Float32Array(W * H);
  const valid = new Uint8Array(W * H);
  const xs = Math.max(0, -dx), xe = W - Math.max(0, dx);
  const ys = Math.max(0, -dy), ye = H - Math.max(0, dy);
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const a = data[y * W + x];
      let best = Infinity;
      for (let oy = -radius; oy <= radius; oy++) {
        const yy = y + dy + oy; if (yy < 0 || yy >= H) continue;
        const row = yy * W;
        for (let ox = -radius; ox <= radius; ox++) {
          const xx = x + dx + ox; if (xx < 0 || xx >= W) continue;
          const d = Math.abs(a - data[row + xx]);
          if (d < best) best = d;
        }
      }
      const i = y * W + x;
      if (best === Infinity) { field[i] = 0; valid[i] = 0; }
      else { field[i] = best; valid[i] = 1; }
    }
  }
  return { field, valid, width: W, height: H };
}
