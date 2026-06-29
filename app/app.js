// Платформенный адаптер (Canvas/DOM): загрузка картинки, вызов ядра, отрисовка рамок.
import { findDifferences } from '../src/core/diffEngine.js';

const MAX_DIM = 2000; // ограничение стороны для скорости/памяти

const el = {
  dropzone: document.getElementById('dropzone'),
  file: document.getElementById('file'),
  result: document.getElementById('result'),
  canvas: document.getElementById('canvas'),
  status: document.getElementById('status'),
  sensitivity: document.getElementById('sensitivity'),
  orientation: document.getElementById('orientation'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
};

let sourceBitmap = null;       // ImageBitmap текущей картинки
let sourceImageData = null;    // ImageData (после масштабирования)

// --- Загрузка картинки -------------------------------------------------------

el.dropzone.addEventListener('click', () => el.file.click());
el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.file.click(); });
el.file.addEventListener('change', () => { if (el.file.files[0]) loadFile(el.file.files[0]); });

el.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropzone.classList.add('over'); });
el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('over'));
el.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  el.dropzone.classList.remove('over');
  const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
  if (f) loadFile(f);
});

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

async function loadFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    sourceBitmap = bitmap;
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

// --- Прогон ядра и отрисовка -------------------------------------------------

function currentOptions() {
  const s = Number(el.sensitivity.value);           // 1..100
  const threshold = Math.round(95 - s * 0.85);        // выше чувствительность → ниже порог
  return { threshold, orientation: el.orientation.value };
}

function run() {
  if (!sourceImageData) return;
  const result = findDifferences(sourceImageData, currentOptions());
  draw(result);
  reportStatus(result);
}

function draw(result) {
  const img = sourceImageData;
  const canvas = el.canvas;
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(img, 0, 0);

  if (!result.diffs?.length || !result.offset) return;
  const { dx, dy } = result.offset;
  const pad = Math.max(2, Math.round(Math.max(img.width, img.height) * 0.004));
  ctx.lineWidth = Math.max(2, Math.round(Math.max(img.width, img.height) * 0.003));
  ctx.strokeStyle = '#ff2d55';
  ctx.lineJoin = 'round';

  for (const b of result.diffs) {
    strokeRect(ctx, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);          // на панели A
    strokeRect(ctx, b.x + dx - pad, b.y + dy - pad, b.w + 2 * pad, b.h + 2 * pad); // на панели B
  }
}

function strokeRect(ctx, x, y, w, h) {
  const r = Math.min(8, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.stroke();
}

// --- Статусы -----------------------------------------------------------------

function reportStatus(result) {
  switch (result.status) {
    case 'ok':
      showStatus('ok', `Найдено отличий: ${result.diffs.length}`);
      break;
    case 'no_diffs':
      showStatus('warn', 'Отличий не найдено. Попробуйте повысить чувствительность.');
      break;
    case 'too_many_diffs':
      showStatus('warn', `Слишком много отличий (${result.diffs.length}) — вероятно шум. Понизьте чувствительность.`);
      break;
    case 'panels_not_found':
      showStatus('error', 'Не удалось распознать две картинки автоматически. В будущей версии поможет ручное выделение.');
      break;
    default:
      showStatus('', '');
  }
}

function showStatus(kind, text) {
  el.status.className = 'status ' + kind;
  el.status.textContent = text;
}

// --- Контролы ----------------------------------------------------------------

el.sensitivity.addEventListener('input', debounce(run, 150));
el.orientation.addEventListener('change', run);

el.reset.addEventListener('click', () => {
  sourceBitmap = sourceImageData = null;
  el.result.hidden = true;
  el.dropzone.hidden = false;
  el.file.value = '';
  showStatus('', '');
});

el.save.addEventListener('click', () => {
  el.canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imagediff.png';
    a.click();
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
