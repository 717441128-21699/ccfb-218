// 批处理队列页:暂停/继续/取消/失败重试
import { el } from './dom.js';
import { getPool, jobs, pauseQueue, resumeQueue, isPaused, cancelJob, retryFailed, clearFinished } from '../queue/queueManager.js';
import * as store from '../store.js';
import { rerender } from '../main.js';

export function renderQueue(root: HTMLElement): void {
  root.replaceChildren();
  const pool = getPool();
  const panel = el('div', { class: 'panel' }, el('h2', {}, '批处理队列'));
  if (!pool) {
    panel.append(el('p', { class: 'muted' }, '队列未初始化。'));
    root.append(panel);
    return;
  }
  const counts = pool.counts();
  const paused = isPaused();

  const pauseBtn = el('button', {}, paused ? '继续' : '暂停');
  pauseBtn.addEventListener('click', () => { paused ? resumeQueue() : pauseQueue(); rerender(); });
  const retryBtn = el('button', {}, `重试失败(${counts.failed})`);
  retryBtn.disabled = counts.failed === 0;
  retryBtn.addEventListener('click', () => { retryFailed(); rerender(); });
  const clearBtn = el('button', { class: 'ghost' }, '清空已完成');
  clearBtn.addEventListener('click', () => { clearFinished(); rerender(); });

  panel.append(el('div', { class: 'toolbar' },
    pauseBtn, retryBtn, clearBtn,
    el('span', { class: 'badge pending' }, `排队 ${counts.pending}`),
    el('span', { class: 'badge running' }, `处理中 ${counts.running}`),
    el('span', { class: 'badge done' }, `完成 ${counts.done}`),
    el('span', { class: 'badge failed' }, `失败 ${counts.failed}`),
    el('span', { class: 'badge canceled' }, `取消 ${counts.canceled}`),
    paused ? el('span', { class: 'badge' }, '已暂停') : '',
  ));

  const views = pool.list();
  if (!views.length) {
    panel.append(el('p', { class: 'muted' }, '队列为空。到「页面整理」把页面加入队列。'));
  } else {
    const table = el('table', { class: 'grid' },
      el('tr', {}, el('th', {}, '页面'), el('th', {}, '书目'), el('th', {}, '状态'), el('th', {}, '信息'), el('th', {}, '操作')));
    for (const v of views) {
      const job = jobs.get(v.id);
      const book = job ? store.getBook(job.bookId) : undefined;
      const cancelBtn = el('button', { class: 'ghost' }, '取消');
      cancelBtn.disabled = v.status !== 'pending' && v.status !== 'running';
      cancelBtn.addEventListener('click', () => { cancelJob(v.id); rerender(); });
      table.append(el('tr', {},
        el('td', {}, job?.label ?? v.id),
        el('td', {}, book?.name ?? '—'),
        el('td', {}, el('span', { class: `badge ${v.status}` }, statusText(v.status))),
        el('td', { class: 'muted' }, v.error ?? ''),
        el('td', {}, cancelBtn),
      ));
    }
    panel.append(table);
  }
  root.append(panel);
}

function statusText(s: string): string {
  return { pending: '排队中', running: '处理中', done: '完成', failed: '失败', canceled: '已取消' }[s] ?? s;
}
