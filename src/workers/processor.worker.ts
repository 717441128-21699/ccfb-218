// 处理 Worker:接收原图 Blob + 预设,返回处理后的 RGBA 与栏图
import { runPipeline } from '../core/pipeline.js';
import { rgbaToGray, grayToRgba } from '../core/imageBuffer.js';

const sw = self as any;

sw.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.cmd !== 'process') return;
  try {
    const bmp = await createImageBitmap(m.blob as Blob);
    const w = bmp.width, h = bmp.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, w, h);
    const gray = rgbaToGray(img.data, w, h);
    const out = runPipeline(gray, m.preset);
    const mainRgba = grayToRgba(out.main);
    const colRgba = out.columns.map(c => grayToRgba(c));
    const colDims = out.columns.map(c => [c.w, c.h]);
    sw.postMessage(
      {
        jobId: m.jobId, ok: true,
        width: out.main.w, height: out.main.h,
        pixels: mainRgba.buffer,
        colDims, colPixels: colRgba.map(c => c.buffer),
        meta: out.meta,
      },
      [mainRgba.buffer, ...colRgba.map(c => c.buffer)],
    );
  } catch (err) {
    sw.postMessage({ jobId: m.jobId, ok: false, error: String((err as Error)?.message || err) });
  }
};
