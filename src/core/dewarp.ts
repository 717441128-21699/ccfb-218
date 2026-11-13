// 几何校正:整体纠偏 + 书口弯曲的纵向位移校正 + 版框检测裁齐
import { Gray, downsample, binMask, makeGray } from './imageBuffer.js';

/** 竖排文本:对竖直投影方差最大的角度即为纠偏角(文字列对齐时投影最尖锐) */
export function estimateSkew(g: Gray): number {
  const factor = Math.max(1, Math.round(Math.min(g.w, g.h) / 800));
  const small = downsample(g, factor);
  const mask = binMask(small);
  const { w, h } = small;
  let best = 0, bestScore = -1;
  for (let a = -3; a <= 3.001; a += 0.2) {
    const rad = (a * Math.PI) / 180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    const pad = Math.ceil(h * Math.abs(sin)) + 2;
    const proj = new Float64Array(w + pad);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[row + x]) {
          const xp = Math.round(x * cos + y * sin + pad / 2);
          proj[xp]++;
        }
      }
    }
    let mean = 0;
    for (let i = 0; i < proj.length; i++) mean += proj[i];
    mean /= proj.length;
    let varr = 0;
    for (let i = 0; i < proj.length; i++) { const dv = proj[i] - mean; varr += dv * dv; }
    if (varr > bestScore) { bestScore = varr; best = a; }
  }
  return best;
}

/** 旋转(逆映射双线性,白底填充) */
export function rotate(g: Gray, angleDeg: number): Gray {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const { w, h } = g;
  const out = new Uint8ClampedArray(w * h).fill(255);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = dx * cos + dy * sin + cx;
      const sy = -dx * sin + dy * cos + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const wx = sx - x0, wy = sy - y0;
      const i0 = y0 * w + x0;
      out[row + x] =
        g.d[i0] * (1 - wx) * (1 - wy) + g.d[i0 + 1] * wx * (1 - wy) +
        g.d[i0 + w] * (1 - wx) * wy + g.d[i0 + w + 1] * wx * wy;
    }
  }
  return { w, h, d: out };
}

/**
 * 书口弯曲校正:把页面横向分带,统计每带墨迹质心的纵向偏移,
 * 平滑后按列反向平移。竖排书页靠近书口处字列会向下(或向上)弯,
 * 质心偏移的一阶近似足以拉直。
 */
export function verticalDewarp(g: Gray, maxShift: number): { img: Gray; offsets: Float32Array } {
  const factor = Math.max(1, Math.round(g.w / 800));
  const small = downsample(g, factor);
  const mask = binMask(small);
  const { w, h } = small;
  const bands = Math.max(8, Math.min(64, w >> 2));
  const bandW = w / bands;
  const cy = new Float32Array(bands);
  const cnt = new Float32Array(bands);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        const b = Math.min(bands - 1, Math.floor(x / bandW));
        cy[b] += y; cnt[b]++;
      }
    }
  }
  let valid = 0, globalCy = 0;
  for (let b = 0; b < bands; b++) {
    if (cnt[b] > 20) { cy[b] /= cnt[b]; globalCy += cy[b]; valid++; }
    else cy[b] = NaN;
  }
  if (valid < 4) return { img: g, offsets: new Float32Array(g.w) };
  globalCy /= valid;
  // 空带用邻居插值
  for (let b = 0; b < bands; b++) {
    if (!Number.isNaN(cy[b])) continue;
    let lo = b - 1, hi = b + 1;
    while (lo >= 0 && Number.isNaN(cy[lo])) lo--;
    while (hi < bands && Number.isNaN(cy[hi])) hi++;
    if (lo >= 0 && hi < bands) cy[b] = cy[lo] + (cy[hi] - cy[lo]) * ((b - lo) / (hi - lo));
    else cy[b] = lo >= 0 ? cy[lo] : cy[Math.min(hi, bands - 1)];
  }
  // 偏移量 + 移动平均平滑 + 限幅
  let off = new Float32Array(bands);
  for (let b = 0; b < bands; b++) off[b] = cy[b] - globalCy;
  const sm = new Float32Array(bands);
  for (let b = 0; b < bands; b++) {
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = b + k;
      if (j >= 0 && j < bands) { s += off[j]; c++; }
    }
    sm[b] = s / c;
  }
  const lim = maxShift / factor;
  for (let b = 0; b < bands; b++) sm[b] = Math.max(-lim, Math.min(lim, sm[b]));
  // 全分辨率逐列插值平移
  const full = new Float32Array(g.w);
  for (let x = 0; x < g.w; x++) {
    const fb = (x / factor / bandW) - 0.5;
    const b0 = Math.max(0, Math.min(bands - 1, Math.floor(fb)));
    const b1 = Math.min(bands - 1, b0 + 1);
    const t = Math.max(0, Math.min(1, fb - b0));
    full[x] = Math.round((sm[b0] * (1 - t) + sm[b1] * t) * factor);
  }
  const out = new Uint8ClampedArray(g.d.length).fill(255);
  for (let x = 0; x < g.w; x++) {
    const sh = full[x];
    for (let y = 0; y < g.h; y++) {
      const sy = y + sh;
      if (sy >= 0 && sy < g.h) out[y * g.w + x] = g.d[sy * g.w + x];
    }
  }
  return { img: { w: g.w, h: g.h, d: out }, offsets: full };
}

/** 版框检测:找四条边最强的长直线,返回 [x0,y0,x1,y1],找不到返回 null */
export function detectFrame(g: Gray): [number, number, number, number] | null {
  const factor = Math.max(1, Math.round(g.h / 1000));
  const small = downsample(g, factor);
  const mask = binMask(small);
  const { w, h } = small;
  const vproj = new Uint32Array(w);
  const hproj = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) { vproj[x]++; hproj[y]++; }
    }
  }
  const vth = h * 0.45, hth = w * 0.45;
  let x0 = -1, x1 = -1, y0 = -1, y1 = -1;
  for (let x = 0; x < w; x++) if (vproj[x] >= vth) { x0 = x; break; }
  for (let x = w - 1; x >= 0; x--) if (vproj[x] >= vth) { x1 = x; break; }
  for (let y = 0; y < h; y++) if (hproj[y] >= hth) { y0 = y; break; }
  for (let y = h - 1; y >= 0; y--) if (hproj[y] >= hth) { y1 = y; break; }
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) return null;
  if ((x1 - x0) < w * 0.3 || (y1 - y0) < h * 0.3) return null;
  return [x0 * factor, y0 * factor, x1 * factor, y1 * factor];
}

/** 版框拉直:纠偏后版框已近似轴对齐,按框裁剪并内缩框线宽度 */
export function cropToFrame(g: Gray, frame: [number, number, number, number]): Gray {
  const inset = Math.max(2, Math.round(Math.min(g.w, g.h) * 0.004));
  const x0 = frame[0] + inset, y0 = frame[1] + inset;
  const x1 = frame[2] - inset, y1 = frame[3] - inset;
  if (x1 - x0 < g.w * 0.2 || y1 - y0 < g.h * 0.2) return g;
  const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
  const out = makeGray(w, h, 255);
  for (let y = 0; y < h; y++) {
    const sy = Math.round(y0) + y;
    if (sy < 0 || sy >= g.h) continue;
    const sx = Math.round(x0);
    out.d.set(g.d.subarray(sy * g.w + sx, sy * g.w + sx + Math.min(w, g.w - sx)), y * w);
  }
  return out;
}
