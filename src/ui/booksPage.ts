// 书目页:按书建目录、管理书目级处理预设
import * as store from '../store.js';
import { el, modal } from './dom.js';
import { presetEditor } from './presetForm.js';
import { rerender } from '../main.js';
import type { BookPreset } from '../types.js';

export function renderBooks(root: HTMLElement): void {
  root.replaceChildren();
  const books = store.listBooks();

  const nameInput = el('input', { type: 'text', placeholder: '新书名,如:萬曆某某志 卷一' });
  const createBtn = el('button', { class: 'primary' }, '新建书目');
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const b = store.addBook(name);
    store.setUiState({ bookId: b.id });
    rerender();
  });

  const panel = el('div', { class: 'panel' },
    el('h2', {}, '书目'),
    el('div', { class: 'toolbar' }, nameInput, createBtn,
      el('span', { class: 'muted' }, '每本书一套处理预设;页面整理里可逐页覆盖。')),
  );

  if (!books.length) {
    panel.append(el('p', { class: 'muted' }, '还没有书目。新建一个,然后到「页面整理」导入扫描图。'));
  } else {
    const table = el('table', { class: 'grid' },
      el('tr', {}, el('th', {}, '书名'), el('th', {}, '页数'), el('th', {}, '已处理'), el('th', {}, '创建时间'), el('th', {}, '操作')));
    for (const b of books) {
      const pages = store.bookPages(b.id);
      const done = pages.filter(p => p.status === 'done').length;
      const openBtn = el('button', {}, '打开');
      openBtn.addEventListener('click', () => {
        store.setUiState({ bookId: b.id });
        location.hash = '#/pages';
      });
      const presetBtn = el('button', { class: 'ghost' }, '处理预设');
      presetBtn.addEventListener('click', () => editPreset(b.id));
      const delBtn = el('button', { class: 'danger' }, '删除');
      delBtn.addEventListener('click', async () => {
        if (!confirm(`删除「${b.name}」及其全部页面与图像?`)) return;
        await store.removeBook(b.id);
        rerender();
      });
      table.append(el('tr', {},
        el('td', {}, b.name),
        el('td', {}, String(pages.length)),
        el('td', {}, `${done}`),
        el('td', {}, new Date(b.createdAt).toLocaleDateString('zh-CN')),
        el('td', {}, openBtn, ' ', presetBtn, ' ', delBtn),
      ));
    }
    panel.append(table);
  }
  root.append(panel);
}

function editPreset(bookId: string): void {
  const book = store.getBook(bookId);
  if (!book) return;
  const box = el('div');
  box.append(el('h3', {}, `处理预设 — ${book.name}`));
  box.append(presetEditor('preset', book.preset, book.preset, v => {
    store.updateBookPreset(bookId, v as BookPreset);
  }));
  const close = el('button', { class: 'primary' }, '完成');
  const m = modal(box);
  close.addEventListener('click', () => m.remove());
  box.append(el('div', { class: 'toolbar', style: 'margin-top:12px' }, close,
    el('span', { class: 'muted' }, '修改即时保存,之后入队的页面生效。')));
}
