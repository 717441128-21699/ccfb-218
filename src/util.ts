import type { PageRec } from './types.js';

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 从文件名提取页码:取最后一个数字串(page_007b → 7) */
export function parsePageNo(fileName: string): number | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = base.match(/(\d+)(?!.*\d)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 缺页 / 重页检测 */
export function pageIssues(pages: PageRec[]): { missing: number[]; dup: number[] } {
  const nums = pages.map(p => p.pageNo).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const dup: number[] = [];
  const seen = new Set<number>();
  for (const n of nums) {
    if (seen.has(n) && !dup.includes(n)) dup.push(n);
    seen.add(n);
  }
  const missing: number[] = [];
  if (nums.length) {
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!seen.has(n)) missing.push(n);
  }
  return { missing, dup };
}

export function naturalByName(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true });
}

export function downloadBlob(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

export async function imageDataToPng(img: ImageData): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

export function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '—';
  return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
}
