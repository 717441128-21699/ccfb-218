// 队列管理:连接 UI / store / WorkerPool
import { WorkerPool } from './pool.js';
import * as store from '../store.js';
import { effectivePreset } from '../store.js';
import { uid, imageDataToPng } from '../util.js';
import type { PipelineMeta } from '../core/pipeline.js';

export interface JobRec {
  id: string;
  bookId: string;
  pageId: string;
  label: string;
}

export const jobs = new Map<string, JobRec>();
export const pageMeta = new Map<string, PipelineMeta>();

let pool: WorkerPool | null = null;
const waiters = new Map<string, (ok: boolean) => void>();

export function initQueue(onUpdate: () => void): void {
  const n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  pool = new WorkerPool(n, 'dist/workers/processor.worker.js', onUpdate);
}
export function getPool(): WorkerPool | null { return pool; }

async function saveResult(pageId: string, res: any): Promise<void> {
  const mainImg = new ImageData(new Uint8ClampedArray(res.pixels), res.width, res.height);
  const mainBlob = await imageDataToPng(mainImg);
  await store.putImage(pageId + ':proc', mainBlob);
  const colCount = (res.colPixels as ArrayBuffer[]).length;
  for (let i = 0; i < colCount; i++) {
    const [cw, ch] = res.colDims[i];
    const img = new ImageData(new Uint8ClampedArray(res.colPixels[i]), cw, ch);
    await store.putImage(`${pageId}:col:${i}`, await imageDataToPng(img));
  }
  pageMeta.set(pageId, res.meta as PipelineMeta);
  store.updatePage(pageId, {
    width: res.width, height: res.height, colCount,
    procMs: (res.meta as PipelineMeta).ms,
  });
}

export async function enqueuePages(pageIds: string[]): Promise<void> {
  if (!pool) return;
  for (const pageId of pageIds) {
    const page = store.getPage(pageId);
    if (!page) continue;
    const preset = effectivePreset(page);
    const job: JobRec = { id: uid(), bookId: page.bookId, pageId, label: page.fileName };
    jobs.set(job.id, job);
    store.updatePage(pageId, { status: 'queued', error: undefined });
    pool.submit(
      job.id,
      async () => {
        store.updatePage(pageId, { status: 'processing' });
        const blob = await store.getImage(pageId + ':orig');
        if (!blob) throw new Error('缺少原图');
        return { blob, preset };
      },
      async res => {
        await saveResult(pageId, res);
        store.updatePage(pageId, { status: 'done' });
        store.saveMeta();
        waiters.get(pageId)?.(true);
        waiters.delete(pageId);
      },
      err => {
        store.updatePage(pageId, { status: 'failed', error: err });
        store.saveMeta();
        waiters.get(pageId)?.(false);
        waiters.delete(pageId);
      },
    );
  }
  store.saveMeta();
}

/** 处理单页并等待结果(校对页"重新处理"用) */
export function processOne(pageId: string): Promise<boolean> {
  return new Promise(res => {
    waiters.set(pageId, res);
    void enqueuePages([pageId]);
  });
}

export function pauseQueue(): void { pool?.pause(); }
export function resumeQueue(): void { pool?.resume(); }
export function isPaused(): boolean { return pool?.paused ?? false; }

export function cancelJob(jobId: string): void {
  const job = jobs.get(jobId);
  pool?.cancel(jobId);
  if (job) {
    const page = store.getPage(job.pageId);
    if (page && (page.status === 'queued' || page.status === 'processing')) {
      store.updatePage(job.pageId, { status: 'imported' });
      store.saveMeta();
    }
  }
}

export function retryFailed(): number {
  const n = pool?.retryFailed() ?? 0;
  if (n > 0) {
    for (const view of pool!.list()) {
      if (view.status === 'pending') {
        const job = jobs.get(view.id);
        if (job) store.updatePage(job.pageId, { status: 'queued', error: undefined });
      }
    }
    store.saveMeta();
  }
  return n;
}

export function clearFinished(): void {
  if (!pool) return;
  for (const view of pool.list()) {
    if (view.status === 'done' || view.status === 'canceled') jobs.delete(view.id);
  }
  pool.clearFinished();
}
