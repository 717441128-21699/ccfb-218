// 整书导出:PNG / TIFF + 页码对照表 CSV,打包成 ZIP 下载
import * as store from '../store.js';
import { buildZip, ZipEntry } from './zip.js';
import { encodeTiff } from './tiff.js';
import { blobToImageData, downloadBlob } from '../util.js';

export interface ExportOptions {
  bookId: string;
  format: 'png' | 'tiff';
  includeColumns: boolean;
  onlyProcessed: boolean;
  onProgress?: (done: number, total: number) => void;
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function exportBook(o: ExportOptions): Promise<{ files: number; skipped: number }> {
  const book = store.getBook(o.bookId);
  if (!book) throw new Error('书目不存在');
  const pages = store.bookPages(o.bookId);
  const entries: ZipEntry[] = [];
  const rows: string[] = ['页码,原文件名,导出文件,宽,高,状态'];
  let skipped = 0;
  let done = 0;

  const ext = o.format === 'tiff' ? 'tif' : 'png';
  const safeName = book.name.replace(/[\\/:*?"<>|]/g, '_');

  for (let idx = 0; idx < pages.length; idx++) {
    const p = pages[idx];
    const no = p.pageNo ?? idx + 1;
    const base = `${safeName}_${String(no).padStart(4, '0')}`;
    let blob = await store.getImage(p.id + ':proc');
    let state = '已处理';
    if (!blob) {
      if (o.onlyProcessed) { skipped++; done++; o.onProgress?.(done, pages.length); continue; }
      blob = await store.getImage(p.id + ':orig');
      state = '原图(未处理)';
    }
    if (!blob) { skipped++; done++; o.onProgress?.(done, pages.length); continue; }

    let outName = `${base}.${ext}`;
    if (o.format === 'png') {
      entries.push({ name: outName, data: new Uint8Array(await blob.arrayBuffer()) });
    } else {
      const img = await blobToImageData(blob);
      entries.push({ name: outName, data: encodeTiff(img.data, img.width, img.height) });
    }
    rows.push([no, csvEscape(p.fileName), csvEscape(outName), p.width ?? '', p.height ?? '', state].join(','));

    if (o.includeColumns && p.colCount && p.colCount > 0) {
      for (let i = 0; i < p.colCount; i++) {
        const cb = await store.getImage(`${p.id}:col:${i}`);
        if (!cb) continue;
        const colName = `${base}_栏${String(i + 1).padStart(2, '0')}.${ext}`;
        if (o.format === 'png') {
          entries.push({ name: colName, data: new Uint8Array(await cb.arrayBuffer()) });
        } else {
          const img = await blobToImageData(cb);
          entries.push({ name: colName, data: encodeTiff(img.data, img.width, img.height) });
        }
        rows.push([no, csvEscape(p.fileName), csvEscape(colName), '', '', '栏图'].join(','));
      }
    }
    done++;
    o.onProgress?.(done, pages.length);
  }

  const csv = '﻿' + rows.join('\r\n'); // BOM 便于 Excel 识别中文
  entries.push({ name: `${safeName}_页码对照表.csv`, data: new TextEncoder().encode(csv) });
  const zip = buildZip(entries);
  downloadBlob(`${safeName}_导出.zip`, zip);
  return { files: entries.length - 1, skipped };
}

/** 只导出页码对照表 */
export async function exportMappingCsv(bookId: string): Promise<void> {
  const book = store.getBook(bookId);
  if (!book) return;
  const pages = store.bookPages(bookId);
  const rows = ['页码,原文件名,状态,宽,高,栏数,处理耗时ms'];
  pages.forEach((p, idx) => {
    rows.push([
      p.pageNo ?? idx + 1,
      csvEscape(p.fileName),
      p.status,
      p.width ?? '',
      p.height ?? '',
      p.colCount ?? '',
      p.procMs ?? '',
    ].join(','));
  });
  const csv = '﻿' + rows.join('\r\n');
  downloadBlob(`${book.name}_页码对照表.csv`, new Blob([csv], { type: 'text/csv' }));
}
