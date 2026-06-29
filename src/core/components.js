// Связные компоненты бинарной маски (8-связность) и работа с рамками.
export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height);
  const comps = [];
  const stack = [];
  let label = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    label++;
    let area = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    stack.push(i); labels[i] = label;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width, y = (idx - x) / width;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let ny = y - 1; ny <= y + 1; ny++) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (mask[n] && !labels[n]) { labels[n] = label; stack.push(n); }
        }
      }
    }
    comps.push({ area, minX, minY, maxX, maxY });
  }
  return comps;
}

export function largestComponentBox(mask, width, height) {
  const comps = connectedComponents(mask, width, height);
  if (!comps.length) return null;
  let b = comps[0];
  for (const c of comps) if (c.area > b.area) b = c;
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1, area: b.area };
}

export function boxesFromMask(mask, width, height, minArea) {
  return connectedComponents(mask, width, height)
    .filter(c => c.area >= minArea)
    .map(c => ({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 }));
}

export function mergeBoxes(boxes, gap) {
  const arr = boxes.map(b => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < arr.length && !merged; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (near(arr[i], arr[j], gap)) { arr[i] = union(arr[i], arr[j]); arr.splice(j, 1); merged = true; break; }
      }
    }
  }
  return arr;
}

function near(a, b, gap) {
  return !(a.x > b.x + b.w + gap || b.x > a.x + a.w + gap || a.y > b.y + b.h + gap || b.y > a.y + a.h + gap);
}
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}
