// Платформенный адаптер (Canvas/DOM): загрузка картинки, вызов ядра, отрисовка рамок,
// топ-N и удаление лишней рамки по нажатию.
import { findDifferences } from '../src/core/diffEngine.js';

const MAX_DIM = 2000; // ограничение стороны для скорости/памяти

const el = {
  dropzone: document.getElementById('dropzone'),
  file: document.getElementById('file'),
  result: document.getElementById('result'),
  canvas: document.getElementById('canvas'),
  status: document.getElementById('status'),
  hint: document.getElementById('hint'),
  sensitivity: document.getElementById('sensitivity'),
  orientation: document.getElementById('orientation'),
  maxShow: document.getElementById('maxShow'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
};

let sourceImageData = null;
const state = { result: null, dismissed: new Set(), pad: 4, lineWidth: 3 };

// --- Загрузка картинки -------------------------------------------------------

el.dropzone.addEventListener('click', () => el.file.click());
el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.file.click(); });
el.file.addEventListener('change', () => { if (el.file.files[0]) loadFile(el.file.files[0]); });

el.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropzone.classList.add('over'); });
el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('over'));
el.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  el.dropzone.classList.remove('over');
  const f = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (f) loadFile(f);
});

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

async function loadFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    sourceImageData = bitmapToImageData(bitmap);
    el.dropzone.hidden = true;
    el.result.hidden = false;
    run();
  } catch {
    showStatus('error', 'Не удалось открыть файл как изображение.');
  }
}

function bitmapToImageData(bitmap) {
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const off = new OffscreenCanvas(w, h);
  const ctx = off.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// --- Прогон ядра -------------------------------------------------------------

function currentOptions() {
  const s = Number(el.sensitivity.value);          // 1..100
  const threshold = Math.round(95 - s * 0.85);       // выше чувствительность → ниже порог
  return { threshold, orientation: el.orientation.value };
}

function run() {
  if (!sourceImageData) return;
  state.result = findDifferences(sourceImageData, currentOptions());
  state.dismissed.clear();
  const big = Math.max(sourceImageData.width, sourceImageData.height);
  state.pad = Math.max(2, Math.round(big * 0.004));
  state.lineWidth = Math.max(2, Math.round(big * 0.003));
  render();
}

// Видимые отличия: отсортированы по силе (ядро уже вернуло так), топ-N, без снятых.
function visibleDiffs() {
  const r = state.result;
  if (!r || !r.diffs) return [];
  const max = Number(el.maxShow.value);
  let list = r.diffs.map((b, i) => ({ b, i })).filter((d) => !state.dismissed.has(d.i));
  if (max > 0) list = list.slice(0, max);
  return list;
}

function render() {
  const img = sourceImageData;
  const canvas = el.canvas;
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(img, 0, 0);

  const r = state.result;
  reportStatus(r);
  if (!r || !r.offset) return;
  const { dx, dy } = r.offset;
  const p = state.pad;
  ctx.lineWidth = state.lineWidth;
  ctx.strokeStyle = '#ff2d55';
  for (const { b } of visibleDiffs()) {
    roundRect(ctx, b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p);
    roundRect(ctx, b.x + dx - p, b.y + dy - p, b.w + 2 * p, b.h + 2 * p);
  }
}

function roundRect(ctx, x, y, w, h) {
  const r = Math.min(8, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.stroke();
}

// --- Удаление рамки по нажатию ----------------------------------------------

el.canvas.addEventListener('click', (e) => {
  const r = state.result;
  if (!r || !r.offset) return;
  const rect = el.canvas.getBoundingClientRect();
  const ix = (e.clientX - rect.left) / rect.width * el.canvas.width;
  const iy = (e.clientY - rect.top) / rect.height * el.canvas.height;
  const { dx, dy } = r.offset;
  const p = state.pad + 4; // небольшой допуск на попадание
  for (const { b, i } of visibleDiffs()) {
    const inA = ix >= b.x - p && ix <= b.x + b.w + p && iy >= b.y - p && iy <= b.y + b.h + p;
    const inB = ix >= b.x + dx - p && ix <= b.x + dx + b.w + p && iy >= b.y + dy - p && iy <= b.y + dy + b.h + p;
    if (inA || inB) { state.dismissed.add(i); render(); return; }
  }
});

// --- Статусы -----------------------------------------------------------------

function reportStatus(r) {
  if (!r) return;
  switch (r.status) {
    case 'ok': {
      const shown = visibleDiffs().length;
      const total = r.diffs.length - state.dismissed.size;
      showStatus('ok', shown < total ? `Показано ${shown} из ${total}` : `Найдено отличий: ${shown}`);
      el.hint.style.visibility = shown > 0 ? 'visible' : 'hidden';
      break;
    }
    case 'no_diffs':
      showStatus('warn', 'Отличий не найдено. Попробуйте повысить чувствительность.');
      el.hint.style.visibility = 'hidden';
      break;
    case 'too_many_diffs':
      showStatus('warn', `Слишком много отличий — вероятно шум. Понизьте чувствительность.`);
      break;
    case 'panels_not_found':
      showStatus('error', 'Не удалось распознать две картинки автоматически. В будущей версии поможет ручное выделение.');
      el.hint.style.visibility = 'hidden';
      break;
  }
}

function showStatus(kind, text) {
  el.status.className = 'status ' + kind;
  el.status.textContent = text;
}

// --- Контролы ----------------------------------------------------------------

el.sensitivity.addEventListener('input', debounce(run, 150));
el.orientation.addEventListener('change', run);
el.maxShow.addEventListener('change', render);

el.reset.addEventListener('click', () => {
  sourceImageData = null;
  state.result = null;
  el.result.hidden = true;
  el.dropzone.hidden = false;
  el.file.value = '';
  showStatus('', '');
});

el.save.addEventListener('click', () => {
  el.canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'imagediff.png'; a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// --- PWA: офлайн -------------------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
