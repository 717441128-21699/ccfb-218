// 基础图像结构与原语:灰度图 + 采样 / 滤波 / 形态学
export interface Gray { w: number; h: number; d: Uint8ClampedArray; }

export function makeGray(w: number, h: number, fill = 255): Gray {
  return { w, h, d: new Uint8ClampedArray(w * h).fill(fill) };
}

export function rgbaToGray(src: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < d.length; i += 4, j++) {
    d[j] = (src[i] * 77 + src[i + 1] * 150 + src[i + 2] * 29) >> 8;
  }
  return { w, h, d };
}

export function grayToRgba(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) {
    const v = g.d[i];
    out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
  }
  return out;
}

/** 盒式平均降采样,factor<=1 时原样返回 */
export function downsample(g: Gray, factor: number): Gray {
  if (factor <= 1) return g;
  const nw = Math.max(1, Math.floor(g.w / factor));
  const nh = Math.max(1, Math.floor(g.h / factor));
  const d = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = y * factor, y1 = Math.min(g.h, y0 + factor);
    for (let x = 0; x < nw; x++) {
      const x0 = x * factor, x1 = Math.min(g.w, x0 + factor);
      let sum = 0, cnt = 0;
      for (let yy = y0; yy < y1; yy++) {
        let idx = yy * g.w + x0;
        for (let xx = x0; xx < x1; xx++) { sum += g.d[idx++]; cnt++; }
      }
      d[y * nw + x] = sum / cnt;
    }
  }
  return { w: nw, h: nh, d };
}

/** 双线性放大到指定尺寸 */
export function upsample(g: Gray, tw: number, th: number): Gray {
  const d = new Uint8ClampedArray(tw * th);
  const sx = g.w / tw, sy = g.h / th;
  for (let y = 0; y < th; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(fy); const wy = fy - y0;
    if (y0 < 0) y0 = 0;
    let y1 = y0 + 1; if (y1 >= g.h) y1 = g.h - 1;
    for (let x = 0; x < tw; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      let x0 = Math.floor(fx); const wx = fx - x0;
      if (x0 < 0) x0 = 0;
      let x1 = x0 + 1; if (x1 >= g.w) x1 = g.w - 1;
      const a = g.d[y0 * g.w + x0], b = g.d[y0 * g.w + x1];
      const c = g.d[y1 * g.w + x0], e = g.d[y1 * g.w + x1];
      d[y * tw + x] = a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + e * wx * wy;
    }
  }
  return { w: tw, h: th, d };
}

/** 可分离滑动窗口盒模糊,O(n) 与半径无关,用于大尺度背景估计 */
export function boxBlur(g: Gray, radius: number): Gray {
  if (radius < 1) return g;
  const { w, h } = g;
  const win = radius * 2 + 1;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += g.d[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      const add = Math.min(w - 1, x + radius + 1);
      const sub = Math.max(0, x - radius);
      sum += g.d[row + add] - g.d[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      const add = Math.min(h - 1, y + radius + 1);
      const sub = Math.max(0, y - radius);
      sum += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return { w, h, d: out };
}

/** Otsu 自动阈值 */
export function otsu(g: Gray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.d.length; i++) hist[g.d[i]]++;
  const total = g.d.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) { max = between; threshold = i; }
  }
  return threshold;
}

/** 二值墨迹掩码(墨迹=1) */
export function binMask(g: Gray, threshold?: number): Uint8Array {
  const t = threshold ?? otsu(g);
  const m = new Uint8Array(g.d.length);
  for (let i = 0; i < g.d.length; i++) m[i] = g.d[i] < t ? 1 : 0;
  return m;
}

/** 方形结构元膨胀(可分离,早退) */
export function dilateMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      let m = 0;
      for (let xx = x0; xx <= x1; xx++) if (mask[row + xx]) { m = 1; break; }
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      let m = 0;
      for (let yy = y0; yy <= y1; yy++) if (tmp[yy * w + x]) { m = 1; break; }
      out[y * w + x] = m;
    }
  }
  return out;
}

export function cropGray(g: Gray, x0: number, y0: number, x1: number, y1: number): Gray {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(g.w, Math.round(x1)); y1 = Math.min(g.h, Math.round(y1));
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const d = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    d.set(g.d.subarray((y0 + y) * g.w + x0, (y0 + y) * g.w + x0 + w), y * w);
  }
  return { w, h, d };
}
