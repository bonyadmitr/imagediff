// Карта различий, толерантная к небольшому сдвигу, по НЕСКОЛЬКИМ признакам (каналам).
// Для каждого пикселя панели A берём по окрестности радиуса r вокруг соответствующей
// точки в панели B МИНИМАЛЬНОЕ расстояние, где расстояние = взвешенный максимум модулей
// разностей по каналам. Это гасит «дрожание» контуров, но ловит и перекраски (цветовые
// каналы), и изменения формы (канал контуров).
//
// features: { channels: Float32Array[], weights: number[], width, height }
export function tolerantDiffField(features, dx, dy, radius) {
  const { channels, weights, width: W, height: H } = features;
  const C = channels.length;
  const field = new Float32Array(W * H);
  const valid = new Uint8Array(W * H);
  const xs = Math.max(0, -dx), xe = W - Math.max(0, dx);
  const ys = Math.max(0, -dy), ye = H - Math.max(0, dy);
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const ai = y * W + x;
      let best = Infinity;
      for (let oy = -radius; oy <= radius; oy++) {
        const yy = y + dy + oy; if (yy < 0 || yy >= H) continue;
        const row = yy * W;
        for (let ox = -radius; ox <= radius; ox++) {
          const xx = x + dx + ox; if (xx < 0 || xx >= W) continue;
          const bi = row + xx;
          let dmax = 0;
          for (let c = 0; c < C; c++) {
            const d = weights[c] * Math.abs(channels[c][ai] - channels[c][bi]);
            if (d > dmax) dmax = d;
          }
          if (dmax < best) best = dmax;
        }
      }
      if (best === Infinity) { field[ai] = 0; valid[ai] = 0; }
      else { field[ai] = best; valid[ai] = 1; }
    }
  }
  return { field, valid, width: W, height: H };
}

// Карта силы границ: |gx| + |gy| (приближение модуля градиента) по полутону.
export function gradientMag(gray) {
  const { data, width: W, height: H } = gray;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = x > 0 ? x - 1 : x, x1 = x < W - 1 ? x + 1 : x;
      const y0 = y > 0 ? y - 1 : y, y1 = y < H - 1 ? y + 1 : y;
      const gx = data[y * W + x1] - data[y * W + x0];
      const gy = data[y1 * W + x] - data[y0 * W + x];
      out[y * W + x] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return { data: out, width: W, height: H };
}
