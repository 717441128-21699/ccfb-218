// 元数据(localStorage)+ 图像大对象(IndexedDB)
import type { Book, PageRec, BookPreset } from './types.js';
import { defaultPreset, mergePreset } from './types.js';
import { uid } from './util.js';

const META_KEY = 'guji.meta.v1';
const UI_KEY = 'guji.ui.v1';

interface Meta { books: Book[]; pages: PageRec[]; }
let meta: Meta = { books: [], pages: [] };

export function loadMeta(): void {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) meta = JSON.parse(s);
  } catch { meta = { books: [], pages: [] }; }
}
export function saveMeta(): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

// ---------- 书目 ----------
export function listBooks(): Book[] { return meta.books; }
export function getBook(id: string): Book | undefined { return meta.books.find(b => b.id === id); }
export function addBook(name: string): Book {
  const b: Book = { id: uid(), name, createdAt: Date.now(), preset: defaultPreset() };
  meta.books.push(b);
  saveMeta();
  return b;
}
export function updateBookPreset(id: string, preset: BookPreset): void {
  const b = getBook(id);
  if (b) { b.preset = preset; saveMeta(); }
}
export async function removeBook(id: string): Promise<void> {
  for (const p of meta.pages.filter(p => p.bookId === id)) {
    await deleteImagesWithPrefix(p.id + ':');
  }
  meta.pages = meta.pages.filter(p => p.bookId !== id);
  meta.books = meta.books.filter(b => b.id !== id);
  saveMeta();
}

// ---------- 页面 ----------
export function bookPages(bookId: string): PageRec[] {
  return meta.pages
    .filter(p => p.bookId === bookId)
    .sort((a, b) => (a.pageNo ?? 1e9) - (b.pageNo ?? 1e9) || a.fileName.localeCompare(b.fileName, 'zh-Hans-CN', { numeric: true }));
}
export function getPage(id: string): PageRec | undefined { return meta.pages.find(p => p.id === id); }
export function addPage(rec: Omit<PageRec, 'id'>): PageRec {
  const p: PageRec = { ...rec, id: uid() };
  meta.pages.push(p);
  return p;
}
export function updatePage(id: string, patch: Partial<PageRec>): void {
  const p = getPage(id);
  if (p) Object.assign(p, patch);
}
export async function removePage(id: string): Promise<void> {
  await deleteImagesWithPrefix(id + ':');
  meta.pages = meta.pages.filter(p => p.id !== id);
  saveMeta();
}

export function effectivePreset(page: PageRec): BookPreset {
  const b = getBook(page.bookId);
  return mergePreset(b ? b.preset : defaultPreset(), page.overrides);
}

// ---------- UI 状态 ----------
export function getUiState(): { bookId?: string; pageId?: string } {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; }
}
export function setUiState(patch: { bookId?: string; pageId?: string }): void {
  localStorage.setItem(UI_KEY, JSON.stringify({ ...getUiState(), ...patch }));
}

// ---------- IndexedDB 图像 ----------
let dbPromise: Promise<IDBDatabase> | null = null;
function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open('guji-images', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('img'); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  return dbPromise;
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction('img', 'readwrite');
    tx.objectStore('img').put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function getImage(key: string): Promise<Blob | null> {
  const db = await getDb();
  return new Promise<Blob | null>((res, rej) => {
    const req = db.transaction('img', 'readonly').objectStore('img').get(key);
    req.onsuccess = () => res((req.result as Blob) ?? null);
    req.onerror = () => rej(req.error);
  });
}
export async function deleteImagesWithPrefix(prefix: string): Promise<void> {
  const db = await getDb();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction('img', 'readwrite');
    const req = tx.objectStore('img').getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) {
        if (String(k).startsWith(prefix)) tx.objectStore('img').delete(k);
      }
    };
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
