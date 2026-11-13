// 导出页:整书导出 PNG/TIFF + 页码对照表
import * as store from '../store.js';
import { el } from './dom.js';
import { exportBook, exportMappingCsv } from '../export/exportBook.js';

export function renderExport(root: HTMLElement): void {
  root.replaceChildren();
  const books = store.listBooks();
  const ui = store.getUiState();
  const bookId = ui.bookId && store.getBook(ui.bookId) ? ui.bookId : books[0]?.id;
  const panel = el('div', { class: 'panel' }, el('h2', {}, '导出'));
  if (!bookId) {
    panel.append(el('p', { class: 'muted' }, '请先建书目。'));
    root.append(panel);
    return;
  }
  const book = store.getBook(bookId)!;
  const pages = store.bookPages(bookId);
  const doneCount = pages.filter(p => p.status === 'done').length;

  const bookSel = el('select', {}, ...books.map(b => el('option', { value: b.id, selected: b.id === bookId }, b.name)));
  bookSel.addEventListener('change', () => { store.setUiState({ bookId: bookSel.value }); });

  const fmtPng = el('input', { type: 'radio', name: 'fmt', checked: true });
  const fmtTiff = el('input', { type: 'radio', name: 'fmt' });
  const colCb = el('input', { type: 'checkbox' });
  const onlyProcCb = el('input', { type: 'checkbox', checked: true });

  const progressOuter = el('div', { class: 'progress-outer', style: 'display:none;max-width:420px' });
  const progressInner = el('div', { class: 'progress-inner' });
  progressOuter.append(progressInner);
  const status = el('span', { class: 'muted' });

  const exportBtn = el('button', { class: 'primary' }, '导出整书 ZIP');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    progressOuter.style.display = 'block';
    status.textContent = '打包中…';
    try {
      const res = await exportBook({
        bookId: bookSel.value,
        format: fmtTiff.checked ? 'tiff' : 'png',
        includeColumns: colCb.checked,
        onlyProcessed: onlyProcCb.checked,
        onProgress: (d, t) => { progressInner.style.width = `${(d / Math.max(1, t)) * 100}%`; },
      });
      status.textContent = `完成:导出 ${res.files} 个文件${res.skipped ? `,跳过 ${res.skipped} 页(未处理)` : ''}。`;
    } catch (err) {
      status.textContent = '导出失败:' + String(err);
    }
    exportBtn.disabled = false;
  });

  const csvBtn = el('button', {}, '仅导出页码对照表');
  csvBtn.addEventListener('click', () => void exportMappingCsv(bookSel.value));

  panel.append(
    el('div', { class: 'col' },
      el('label', { class: 'field' }, '书目', bookSel),
      el('div', {},
        el('label', { class: 'field' }, fmtPng, 'PNG'),
        el('label', { class: 'field' }, fmtTiff, 'TIFF(未压缩,600dpi 标记)')),
      el('div', {},
        el('label', { class: 'field' }, colCb, '同时导出单栏图(需预设开启切栏)'),
        el('label', { class: 'field' }, onlyProcCb, '仅导出已处理页')),
      el('p', { class: 'muted' }, `「${book.name}」共 ${pages.length} 页,已处理 ${doneCount} 页。ZIP 内含页码对照表 CSV。`),
      el('div', { class: 'toolbar' }, exportBtn, csvBtn, status),
      progressOuter,
    ),
  );
  root.append(panel);
}
