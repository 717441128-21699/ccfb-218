// 校对页:处理前后对比(滑动对比)、撤销/重做、单页重新处理
import * as store from '../store.js';
import { el } from './dom.js';
import { processOne, pageMeta } from '../queue/queueManager.js';
import { rerender } from '../main.js';
import { fmtMs } from '../util.js';

interface VersionStack { stack: Blob[]; idx: number; }
const versions = new Map<string, VersionStack>();
let currentPageId: string | null = null;
let objectUrls: string[] = [];

function revokeUrls(): void {
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls = [];
}

async function ensureVersion(pageId: string): Promise<VersionStack | null> {
  let v = versions.get(pageId);
  if (!v) {
    const proc = await store.getImage(pageId + ':proc');
    if (!proc) return null;
    v = { stack: [proc], idx: 0 };
    versions.set(pageId, v);
  }
  return v;
}

export function renderProof(root: HTMLElement): void {
  root.replaceChildren();
  revokeUrls();
  const books = store.listBooks();
  const ui = store.getUiState();
  const bookId = ui.bookId && store.getBook(ui.bookId) ? ui.bookId : books[0]?.id;
  const panel = el('div', { class: 'panel' }, el('h2', {}, '校对'));
  if (!bookId) {
    panel.append(el('p', { class: 'muted' }, '请先建书目并导入页面。'));
    root.append(panel);
    return;
  }
  const pages = store.bookPages(bookId);
  const bookSel = el('select', {}, ...books.map(b => el('option', { value: b.id, selected: b.id === bookId }, b.name)));
  bookSel.addEventListener('change', () => { store.setUiState({ bookId: bookSel.value, pageId: undefined }); currentPageId = null; rerender(); });

  const pageSel = el('select', {},
    ...pages.map(p => el('option', { value: p.id, selected: p.id === (ui.pageId ?? currentPageId) },
      `${p.pageNo ?? '?'} — ${p.fileName}${p.status === 'done' ? ' ✓' : ''}`)));
  pageSel.addEventListener('change', () => {
    currentPageId = pageSel.value;
    store.setUiState({ pageId: pageSel.value });
    rerender();
  });

  panel.append(el('div', { class: 'toolbar' },
    el('label', { class: 'field' }, '书目', bookSel),
    el('label', { class: 'field' }, '页面', pageSel)));

  const pageId = ui.pageId ?? currentPageId ?? pages[0]?.id;
  currentPageId = pageId ?? null;
  if (!pageId) {
    panel.append(el('p', { class: 'muted' }, '这本书还没有页面。'));
    root.append(panel);
    return;
  }
  const page = store.getPage(pageId)!;
  const viewer = el('div');
  panel.append(viewer);
  root.append(panel);
  void buildViewer(viewer, pageId, page.fileName, page.procMs);
}

async function buildViewer(container: HTMLElement, pageId: string, label: string, procMs?: number): Promise<void> {
  const orig = await store.getImage(pageId + ':orig');
  const v = await ensureVersion(pageId);
  if (!orig) {
    container.append(el('p', { class: 'muted' }, '找不到原图。'));
    return;
  }
  if (!v) {
    container.append(el('p', { class: 'muted' }, '本页还没有处理结果。到「页面整理」把它入队,或点下方「立即处理」。'));
    container.append(actionBar(pageId, null));
    return;
  }

  const origUrl = URL.createObjectURL(orig);
  const procUrl = URL.createObjectURL(v.stack[v.idx]);
  objectUrls.push(origUrl, procUrl);

  container.append(actionBar(pageId, v));

  const meta = pageMeta.get(pageId);
  if (meta) {
    container.append(el('p', { class: 'muted', style: 'font-size:12px' },
      `纠偏 ${meta.skewDeg.toFixed(2)}° · 竖线 ${meta.lines.length} 条 · 版心 x=${meta.banxinX ?? '—'} · 栏 ${meta.strips.length} · 处理耗时 ${fmtMs(meta.ms)}`));
  } else if (procMs !== undefined) {
    container.append(el('p', { class: 'muted', style: 'font-size:12px' }, `处理耗时 ${fmtMs(procMs)}`));
  }

  // 滑动对比:底层处理后,上层裁切显示处理前
  const cmp = el('div', { class: 'compare' });
  const afterImg = el('img', { src: procUrl, alt: '处理后', style: 'width:100%' });
  const beforeWrap = el('div', { class: 'before-wrap', style: 'width:50%' });
  const beforeImg = el('img', { src: origUrl, alt: '处理前' });
  beforeWrap.append(beforeImg);
  cmp.append(afterImg, beforeWrap,
    el('span', { class: 'cmp-label', style: 'left:8px' }, '处理前'),
    el('span', { class: 'cmp-label', style: 'right:8px' }, '处理后'));
  const slider = el('input', { type: 'range', min: '0', max: '100', value: '50', style: 'width:100%' });
  const sync = () => {
    beforeImg.style.width = cmp.clientWidth + 'px';
    beforeWrap.style.width = (parseFloat(slider.value) / 100 * cmp.clientWidth) + 'px';
  };
  slider.addEventListener('input', sync);
  afterImg.addEventListener('load', sync);
  window.addEventListener('resize', sync);
  container.append(cmp, slider);
}

function actionBar(pageId: string, v: VersionStack | null): HTMLElement {
  const undoBtn = el('button', {}, '撤销');
  undoBtn.disabled = !v || v.idx <= 0;
  undoBtn.addEventListener('click', async () => {
    const s = versions.get(pageId);
    if (!s || s.idx <= 0) return;
    s.idx--;
    await store.putImage(pageId + ':proc', s.stack[s.idx]);
    rerender();
  });
  const redoBtn = el('button', {}, '重做');
  redoBtn.disabled = !v || v.idx >= v.stack.length - 1;
  redoBtn.addEventListener('click', async () => {
    const s = versions.get(pageId);
    if (!s || s.idx >= s.stack.length - 1) return;
    s.idx++;
    await store.putImage(pageId + ':proc', s.stack[s.idx]);
    rerender();
  });
  const reprocBtn = el('button', { class: 'primary' }, '按当前参数重新处理');
  reprocBtn.addEventListener('click', async () => {
    reprocBtn.disabled = true;
    reprocBtn.textContent = '处理中…';
    const ok = await processOne(pageId);
    if (ok) {
      const proc = await store.getImage(pageId + ':proc');
      if (proc) {
        let s = versions.get(pageId);
        if (!s) { s = { stack: [], idx: -1 }; versions.set(pageId, s); }
        s.stack.length = s.idx + 1;
        s.stack.push(proc);
        s.idx++;
      }
    }
    rerender();
  });
  return el('div', { class: 'toolbar' },
    undoBtn, redoBtn, reprocBtn,
    v ? el('span', { class: 'muted' }, `版本 ${v.idx + 1}/${v.stack.length}`) : '',
    el('span', { class: 'muted' }, '拖动滑块对比处理前后;改预设或单页覆盖后点「重新处理」。'));
}
