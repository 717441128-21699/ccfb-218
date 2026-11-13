// 页面整理:批量导入、自动排页、缺页/重页提示、单页覆盖、入队
import * as store from '../store.js';
import { el, modal } from './dom.js';
import { presetEditor } from './presetForm.js';
import { parsePageNo, pageIssues, naturalByName, uid, fmtMs } from '../util.js';
import { enqueuePages } from '../queue/queueManager.js';
import { generateScans, synthPresetSizes, SynthOptions } from '../synth/synthScan.js';
import { rerender } from '../main.js';
import type { BookPreset, PageRec } from '../types.js';

export function renderPages(root: HTMLElement): void {
  root.replaceChildren();
  const books = store.listBooks();
  const ui = store.getUiState();
  const bookId = ui.bookId && store.getBook(ui.bookId) ? ui.bookId : books[0]?.id;
  if (!bookId) {
    root.append(el('div', { class: 'panel' },
      el('p', { class: 'muted' }, '请先在「书目」页新建一个书目。')));
    return;
  }
  store.setUiState({ bookId });

  const book = store.getBook(bookId)!;
  const pages = store.bookPages(bookId);
  const issues = pageIssues(pages);

  // ---- 工具栏 ----
  const bookSel = el('select', {},
    ...books.map(b => el('option', { value: b.id, selected: b.id === bookId }, b.name)));
  bookSel.addEventListener('change', () => { store.setUiState({ bookId: bookSel.value }); rerender(); });

  const fileInput = el('input', { type: 'file', multiple: true, accept: 'image/*', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files?.length) await importFiles(bookId, [...fileInput.files]);
    fileInput.value = '';
  });
  const importBtn = el('button', { class: 'primary' }, '导入扫描图');
  importBtn.addEventListener('click', () => fileInput.click());

  const synthBtn = el('button', {}, '生成测试扫描图');
  synthBtn.addEventListener('click', () => synthDialog(bookId));

  const enqueueAll = el('button', {}, '全部入队');
  enqueueAll.addEventListener('click', async () => {
    await enqueuePages(store.bookPages(bookId).filter(p => p.status !== 'done').map(p => p.id));
    location.hash = '#/queue';
  });
  const enqueueFailed = el('button', {}, '失败页重新入队');
  enqueueFailed.addEventListener('click', async () => {
    await enqueuePages(store.bookPages(bookId).filter(p => p.status === 'failed').map(p => p.id));
    location.hash = '#/queue';
  });

  const toolbar = el('div', { class: 'toolbar' },
    el('label', { class: 'field' }, '书目', bookSel),
    importBtn, synthBtn, enqueueAll, enqueueFailed, fileInput);

  // ---- 拖拽导入 ----
  const dz = el('div', { class: 'dropzone' }, '把扫描图文件拖到这里导入(自动按文件名排页)');
  dz.addEventListener('dragover', ev => { ev.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async ev => {
    ev.preventDefault();
    dz.classList.remove('over');
    const files = [...(ev.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'));
    if (files.length) await importFiles(bookId, files);
  });

  // ---- 缺页/重页提示 ----
  const panel = el('div', { class: 'panel' }, el('h2', {}, `页面整理 — ${book.name}`), toolbar, dz);
  if (issues.missing.length || issues.dup.length) {
    const parts: string[] = [];
    if (issues.missing.length) parts.push(`缺页:${issues.missing.slice(0, 20).join('、')}${issues.missing.length > 20 ? ` 等 ${issues.missing.length} 页` : ''}`);
    if (issues.dup.length) parts.push(`重页:${issues.dup.join('、')}`);
    panel.append(el('div', { class: 'notice error' }, parts.join(';')));
  } else if (pages.length) {
    panel.append(el('div', { class: 'notice' }, `共 ${pages.length} 页,页码连续,无缺页重页。`));
  }

  // ---- 页面表 ----
  if (pages.length) {
    const table = el('table', { class: 'grid' },
      el('tr', {},
        el('th', {}, '页码'), el('th', {}, '文件名'), el('th', {}, '尺寸'),
        el('th', {}, '状态'), el('th', {}, '耗时'), el('th', {}, '覆盖'), el('th', {}, '操作')));
    for (const p of pages) {
      const isIssue = (p.pageNo !== null && (issues.dup.includes(p.pageNo))) ;
      const procBtn = el('button', { class: 'ghost' }, '处理');
      procBtn.addEventListener('click', async () => { await enqueuePages([p.id]); rerender(); });
      const ovBtn = el('button', { class: 'ghost' }, p.overrides ? '覆盖*' : '覆盖');
      ovBtn.addEventListener('click', () => overrideDialog(p));
      const delBtn = el('button', { class: 'danger' }, '删');
      delBtn.addEventListener('click', async () => { await store.removePage(p.id); rerender(); });
      table.append(el('tr', { class: isIssue ? 'issue' : '' },
        el('td', {}, p.pageNo !== null ? String(p.pageNo) : '—'),
        el('td', {}, p.fileName),
        el('td', {}, p.width ? `${p.width}×${p.height}` : '—'),
        el('td', {}, statusBadge(p)),
        el('td', {}, fmtMs(p.procMs)),
        el('td', {}, p.overrides ? `${Object.keys(p.overrides).length} 组` : '—'),
        el('td', {}, procBtn, ' ', ovBtn, ' ', delBtn),
      ));
    }
    panel.append(table);
  } else {
    panel.append(el('p', { class: 'muted' }, '还没有页面。导入扫描图,或点「生成测试扫描图」合成一批带缺陷的测试页。'));
  }
  root.append(panel);
}

function statusBadge(p: PageRec): HTMLElement {
  const map: Record<string, string> = {
    imported: '待处理', queued: '排队中', processing: '处理中', done: '已完成', failed: '失败',
  };
  const cls: Record<string, string> = {
    imported: '', queued: 'queued', processing: 'running', done: 'done', failed: 'failed',
  };
  const b = el('span', { class: `badge ${cls[p.status] ?? ''}` }, map[p.status] ?? p.status);
  if (p.error) b.title = p.error;
  return b;
}

async function importFiles(bookId: string, files: File[]): Promise<void> {
  const sorted = [...files].sort((a, b) => naturalByName(a.name, b.name));
  for (const f of sorted) {
    const rec = store.addPage({
      bookId, fileName: f.name, pageNo: parsePageNo(f.name),
      status: 'imported', overrides: null,
    });
    await store.putImage(rec.id + ':orig', f);
  }
  store.saveMeta();
  rerender();
}

function overrideDialog(p: PageRec): void {
  const book = store.getBook(p.bookId)!;
  const box = el('div');
  box.append(el('h3', {}, `单页覆盖 — ${p.fileName}`),
    el('p', { class: 'muted' }, '勾选「覆盖」的组将替代书目预设中的对应组,只作用于本页。'));
  box.append(presetEditor('override', book.preset, p.overrides, v => {
    store.updatePage(p.id, { overrides: v as Partial<BookPreset> | null });
    store.saveMeta();
  }));
  const close = el('button', { class: 'primary' }, '完成');
  const m = modal(box);
  close.addEventListener('click', () => { m.remove(); rerender(); });
  box.append(el('div', { class: 'toolbar', style: 'margin-top:12px' }, close));
}

function synthDialog(bookId: string): void {
  const sizes = synthPresetSizes();
  const sizeSel = el('select', {}, ...sizes.map((s, i) => el('option', { value: String(i) }, s.label)));
  const countInput = el('input', { type: 'number', value: '8', min: '1', max: '60' });
  const startInput = el('input', { type: 'number', value: '1', min: '0' });
  const mk = (label: string, checked = true) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = checked;
    return { cb, label: el('label', { class: 'field' }, cb, label) };
  };
  const yellow = mk('发黄'), stains = mk('水渍霉斑'), showT = mk('背面透字'), curv = mk('书口弯曲');
  const messy = mk('模拟缺页+重页', false);
  const skewInput = el('input', { type: 'number', value: '1.2', min: '-5', max: '5', step: '0.1' });
  const progress = el('span', { class: 'muted' });
  const genBtn = el('button', { class: 'primary' }, '生成并导入');
  const box = el('div');
  box.append(
    el('h3', {}, '生成合成测试扫描图'),
    el('div', { class: 'col' },
      el('label', { class: 'field' }, '尺寸', sizeSel),
      el('label', { class: 'field' }, '页数', countInput),
      el('label', { class: 'field' }, '起始页码', startInput),
      el('label', { class: 'field' }, '倾斜角(度)', skewInput),
      el('div', {}, yellow.label, stains.label, showT.label, curv.label, messy.label),
    ),
    el('div', { class: 'toolbar', style: 'margin-top:12px' }, genBtn, progress),
  );
  const m = modal(box);
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    const s = sizes[parseInt(sizeSel.value, 10)];
    const opts: SynthOptions = {
      width: s.w, height: s.h,
      count: Math.max(1, parseInt(countInput.value, 10) || 1),
      startPage: parseInt(startInput.value, 10) || 1,
      yellowing: yellow.cb.checked, stains: stains.cb.checked,
      showThrough: showT.cb.checked, curvature: curv.cb.checked,
      skewDeg: parseFloat(skewInput.value) || 0,
      messyNumbering: messy.cb.checked,
    };
    const files = await generateScans(opts, (i, n) => { progress.textContent = `合成 ${i}/${n}`; });
    await importFiles(bookId, files);
    m.remove();
  });
}
