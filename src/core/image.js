// Утилиты работы с изображениями. Чистые функции, без DOM.
// RgbaImage: { data: Uint8ClampedArray, width, height }  (RGBA)
// GrayImage: { data: Float32Array, width, height }

export function toGray(image) {
  const { data, width, height } = image;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { data: out, width, height };
}

export function downscale(gray, factor) {
  if (factor <= 1) return { data: gray.data.slice(), width: gray.width, height: gray.height };
  const { data, width, height } = gray;
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      const sy = y * factor, sx = x * factor;
      for (let dy = 0; dy < factor; dy++) {
        const yy = sy + dy; if (yy >= height) break;
        for (let dx = 0; dx < factor; dx++) {
          const xx = sx + dx; if (xx >= width) break;
          sum += data[yy * width + xx]; n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { data: out, width: w, height: h };
}

export function boxBlur(gray, r) {
  if (r <= 0) return { data: gray.data.slice(), width: gray.width, height: gray.height };
  const { data, width, height } = gray;
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const win = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += data[row + clamp(k, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      sum += data[row + clamp(x + r + 1, 0, width - 1)] - data[row + clamp(x - r, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / win;
      sum += tmp[clamp(y + r + 1, 0, height - 1) * width + x] - tmp[clamp(y - r, 0, height - 1) * width + x];
    }
  }
  return { data: out, width, height };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
