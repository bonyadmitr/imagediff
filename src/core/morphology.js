// Морфология бинарных масок (Uint8Array со значениями 0/1), квадратное ядро радиуса r.
export function erode(mask, width, height, r) { return morph(mask, width, height, r, true); }
export function dilate(mask, width, height, r) { return morph(mask, width, height, r, false); }
export function open(mask, width, height, r) {
  return dilate(erode(mask, width, height, r), width, height, r);
}

function morph(mask, width, height, r, isErode) {
  if (r <= 0) return mask.slice();
  const want = isErode ? 0 : 1; // эрозия: ноль если рядом есть 0; дилатация: единица если рядом есть 1
  const tmp = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  // горизонтальный проход
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) { if (isErode) { hit = true; break; } else continue; }
        if (mask[y * width + xx] === want) { hit = true; break; }
      }
      tmp[y * width + x] = (isErode ? !hit : hit) ? 1 : 0;
    }
  }
  // вертикальный проход
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) { if (isErode) { hit = true; break; } else continue; }
        if (tmp[yy * width + x] === want) { hit = true; break; }
      }
      out[y * width + x] = (isErode ? !hit : hit) ? 1 : 0;
    }
  }
  return out;
}
