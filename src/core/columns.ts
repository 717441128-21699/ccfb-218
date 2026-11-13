// 版心与栏线检测:竖直投影找长竖线,线间切栏
import { Gray, downsample, binMask, cropGray } from './imageBuffer.js';

export interface ColumnStrip { x0: number; x1: number; }

/** 检测贯穿版面的竖线(栏线/版框边线),返回全分辨率 x 坐标 */
export function findVerticalLines(g: Gray, minLenFrac: number): number[] {
  const factor = Math.max(1, Math.round(g.h / 1200));
  const small = downsample(g, factor);
  const mask = binMask(small);
  const { w, h } = small;
  const proj = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) proj[x] += mask[row + x];
  }
  const thresh = h * minLenFrac;
  const lines: number[] = [];
  let run = -1;
  for (let x = 0; x < w; x++) {
    if (proj[x] >= thresh) {
      if (run < 0) run = x;
    } else if (run >= 0) {
      lines.push(Math.round(((run + x - 1) / 2) * factor));
      run = -1;
    }
  }
  if (run >= 0) lines.push(Math.round(((run + w - 1) / 2) * factor));
  return lines;
}

/** 版心:离版面中心最近的那条竖线 */
export function pickBanxin(lines: number[], width: number): number | null {
  if (!lines.length) return null;
  const c = width / 2;
  let best = lines[0], bd = Math.abs(lines[0] - c);
  for (const x of lines) {
    const d = Math.abs(x - c);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

/** 相邻竖线之间切出单栏(过窄的缝丢弃) */
export function splitColumns(g: Gray, lines: number[], marginPx: number): ColumnStrip[] {
  const strips: ColumnStrip[] = [];
  const minW = Math.max(16, g.w * 0.015);
  const sorted = [...lines].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const x0 = sorted[i] + marginPx;
    const x1 = sorted[i + 1] - marginPx;
    if (x1 - x0 >= minW) strips.push({ x0, x1 });
  }
  return strips;
}

export function cropColumn(g: Gray, s: ColumnStrip): Gray {
  return cropGray(g, s.x0, 0, s.x1, g.h);
}
