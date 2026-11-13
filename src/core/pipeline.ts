// 处理流水线:按预设串联各算法步骤,在 Worker 内运行
import type { BookPreset } from '../types.js';
import { Gray, otsu } from './imageBuffer.js';
import { removeBackground } from './background.js';
import { suppressShowThrough } from './showthrough.js';
import { estimateSkew, rotate, verticalDewarp, detectFrame, cropToFrame } from './dewarp.js';
import { findVerticalLines, pickBanxin, splitColumns, cropColumn, ColumnStrip } from './columns.js';

export interface PipelineMeta {
  skewDeg: number;
  dewarped: boolean;
  frame: [number, number, number, number] | null;
  lines: number[];
  banxinX: number | null;
  strips: ColumnStrip[];
  ms: number;
}

export interface PipelineOutput {
  main: Gray;
  columns: Gray[];
  meta: PipelineMeta;
}

export function runPipeline(input: Gray, p: BookPreset): PipelineOutput {
  const t0 = Date.now();
  let g = input;

  if (p.bgRemoval.enabled) g = removeBackground(g, p.bgRemoval.radius, p.bgRemoval.strength);
  if (p.showThrough.enabled) g = suppressShowThrough(g, p.showThrough.darkThreshold, p.showThrough.aggression);

  let skew = 0;
  let dewarped = false;
  let frame: [number, number, number, number] | null = null;
  if (p.dewarp.enabled) {
    if (p.dewarp.deskew) {
      skew = estimateSkew(g);
      if (Math.abs(skew) > 0.05) g = rotate(g, -skew);
    }
    const dw = verticalDewarp(g, Math.round(g.h * 0.05));
    g = dw.img;
    dewarped = true;
    if (p.dewarp.straightenFrame) {
      frame = detectFrame(g);
      if (frame) g = cropToFrame(g, frame);
    }
  }

  let lines: number[] = [];
  let banxinX: number | null = null;
  let strips: ColumnStrip[] = [];
  let columns: Gray[] = [];
  if (p.columns.enabled) {
    lines = findVerticalLines(g, p.columns.minLineHeightFrac);
    banxinX = pickBanxin(lines, g.w);
    strips = splitColumns(g, lines, Math.max(2, Math.round(g.w * 0.002)));
    if (p.columns.split) columns = strips.map(s => cropColumn(g, s));
  }

  if (p.binarize.enabled) {
    const t = p.binarize.threshold > 0 ? p.binarize.threshold : otsu(g);
    const out = new Uint8ClampedArray(g.d.length);
    for (let i = 0; i < g.d.length; i++) out[i] = g.d[i] < t ? 0 : 255;
    g = { w: g.w, h: g.h, d: out };
  }

  return {
    main: g,
    columns,
    meta: { skewDeg: skew, dewarped, frame, lines, banxinX, strips, ms: Date.now() - t0 },
  };
}
