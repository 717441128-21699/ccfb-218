// 入口:路由 + 导航 + 队列初始化
import { loadMeta } from './store.js';
import { initQueue, getPool } from './queue/queueManager.js';
import { renderBooks } from './ui/booksPage.js';
import { renderPages } from './ui/pagesPage.js';
import { renderQueue } from './ui/queuePage.js';
import { renderProof } from './ui/proofPage.js';
import { renderExport } from './ui/exportPage.js';

const routes: Record<string, (root: HTMLElement) => void> = {
  '#/books': renderBooks,
  '#/pages': renderPages,
  '#/queue': renderQueue,
  '#/proof': renderProof,
  '#/export': renderExport,
};

export let currentRoute = '#/books';
let app: HTMLElement;
let renderTimer: number | null = null;

export function rerender(): void {
  render(currentRoute);
}

/** 队列更新时节流刷新,避免输入框失焦 */
function scheduleRerender(): void {
  if (renderTimer !== null) return;
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    updateBadge();
    if (currentRoute === '#/queue' || currentRoute === '#/pages') rerender();
  }, 300);
}

function updateBadge(): void {
  const badge = document.getElementById('queue-badge');
  const pool = getPool();
  if (!badge || !pool) return;
  const c = pool.counts();
  badge.textContent = c.running + c.pending > 0
    ? `队列:处理中 ${c.running} · 排队 ${c.pending} · 完成 ${c.done} · 失败 ${c.failed}`
    : c.done + c.failed > 0
      ? `队列:完成 ${c.done} · 失败 ${c.failed}`
      : '';
}

function render(hash: string): void {
  currentRoute = routes[hash] ? hash : '#/books';
  document.querySelectorAll('#topbar nav a').forEach(a => {
    a.classList.toggle('active', (a as HTMLElement).dataset.route === currentRoute);
  });
  routes[currentRoute](app);
  updateBadge();
}

function onHashChange(): void {
  render(location.hash || '#/books');
}

function boot(): void {
  loadMeta();
  app = document.getElementById('app')!;
  initQueue(scheduleRerender);
  window.addEventListener('hashchange', onHashChange);
  render(location.hash || '#/books');
}

boot();
