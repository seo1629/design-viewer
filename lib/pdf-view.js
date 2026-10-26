'use client';

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { clampPdfZoom, pageTurn } from '@/lib/format';

// Worker is the same 4.10.38 build as pdfjs-dist (copied to public/).
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const docs = new Map();
let renderTask = null;
let paintSeq = 0;
let gate = Promise.resolve();

function room(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function deadWorker(err) {
  return /worker|terminated|transport|Loading task/i.test(String(err?.message || err || ''));
}

export async function openPdfDoc(url, fresh = false) {
  if (!url) throw new Error('no pdf url');
  if (fresh) {
    const old = docs.get(url);
    docs.delete(url);
    try { await old?.destroy?.(); } catch { /* already dead */ }
  }
  const hit = docs.get(url);
  if (hit) return hit;
  const doc = await getDocument({ url, isEvalSupported: false }).promise;
  docs.set(url, doc);
  return doc;
}

async function cancelPaint() {
  const task = renderTask;
  renderTask = null;
  if (!task) return;
  task.cancel();
  try { await task.promise; } catch { /* RenderingCancelledException */ }
}

// rotation 은 PDF 자체 회전(/Rotate) 위에 더하는 화면 회전입니다.
// pdf.js 는 rotation 을 넘기면 /Rotate 를 덮어쓰므로 직접 더해 줍니다.
async function paintOnce(canvas, url, pageNumber, rotation, fitW, fitH, zoom, fresh) {
  const doc = await openPdfDoc(url, fresh);
  const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, pageNumber | 0)));
  const baseRotate = pageTurn(page.rotate || 0);
  const rot = pageTurn(baseRotate + pageTurn(rotation));
  const base = page.getViewport({ scale: 1, rotation: rot });
  const bw = room(base.width, 1);
  const bh = room(base.height, 1);
  const fit = Math.min(room(fitW, bw) / bw, room(fitH, bh) / bh);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const z = clampPdfZoom(zoom);
  const cssScale = Math.min(8, Math.max(0.2, (Number.isFinite(fit) && fit > 0 ? fit : 1) * z));
  const viewport = page.getViewport({ scale: cssScale * dpr, rotation: rot });
  const w = Math.max(1, Math.floor(Number.isFinite(viewport.width) ? viewport.width : 1));
  const h = Math.max(1, Math.floor(Number.isFinite(viewport.height) ? viewport.height : 1));
  await cancelPaint();
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w / dpr}px`;
  canvas.style.height = `${h / dpr}px`;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return null;
    throw err;
  } finally {
    renderTask = null;
  }
  return { pages: doc.numPages, baseRotate };
}

/**
 * 페이지마다 글자 방향을 보고 바로 세우려면 /Rotate 위에 몇 도를 더 돌려야 하는지 추정합니다.
 * 글자 길이로 가중한 다수결. 글자가 거의 없거나(도면이 선으로만 된 경우) 방향이 섞여 애매하면 0.
 * 결과: { 1: 0, 2: 90, ... } (pages 를 주면 그 페이지만)
 */
export async function detectPageTurns(url, pages) {
  const doc = await openPdfDoc(url);
  const list = pages?.length ? pages : Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const out = {};
  for (const n of list) {
    if (n < 1 || n > doc.numPages) continue;
    const page = await doc.getPage(n);
    const base = pageTurn(page.rotate || 0);
    const tc = await page.getTextContent();
    out[n] = turnFromText(tc.items, base);
  }
  return out;
}

export function turnFromText(items, base = 0) {
  const votes = { 0: 0, 90: 0, 180: 0, 270: 0 };
  let total = 0;
  for (const it of items || []) {
    const len = String(it?.str || '').trim().length;
    if (!len || !Array.isArray(it.transform)) continue;
    const [a, b] = it.transform;
    if (!a && !b) continue;
    // 글자 진행 방향(반시계, PDF 좌표) → /Rotate(시계) 적용 후 화면에서의 방향
    const text = pageTurn(Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90);
    votes[pageTurn(text - base)] += len;
    total += len;
  }
  if (total < 10) return 0;
  const [best, n] = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
  return n / total >= 0.6 ? Number(best) : 0;
}

export async function paintPdfPage(canvas, url, pageNumber, rotation, fitW, fitH, zoom) {
  if (!canvas || !url) return null;
  const mine = ++paintSeq;
  let unlock = () => {};
  const prev = gate;
  gate = new Promise((r) => { unlock = r; });
  await prev;
  try {
    if (mine !== paintSeq) return null;
    try {
      return await paintOnce(canvas, url, pageNumber, rotation, fitW, fitH, zoom, false);
    } catch (err) {
      if (mine !== paintSeq) return null;
      if (!deadWorker(err)) throw err;
      return await paintOnce(canvas, url, pageNumber, rotation, fitW, fitH, zoom, true);
    }
  } finally {
    unlock();
  }
}
