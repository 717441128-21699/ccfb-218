// 透字压制:背面透过来的字是低对比度中间调,正面笔画是深黑。
// 策略:找出"笔画核心"(很暗的像素)并膨胀一点作为保护区,原样保留 → 笔画不变细;
// 保护区外的中间调按力度推向白,越暗推得越少(保护笔画边缘的灰度过渡)。
import { Gray, dilateMask } from './imageBuffer.js';

export function suppressShowThrough(g: Gray, darkThreshold: number, aggression: number): Gray {
  const { w, h } = g;
  const n = w * h;
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (g.d[i] < darkThreshold) core[i] = 1;
  const r = Math.max(1, Math.round(Math.min(w, h) / 1500));
  const keep = dilateMask(core, w, h, r);
  const out = new Uint8ClampedArray(n);
  const a = Math.min(1, Math.max(0, aggression));
  const range = Math.max(1, 255 - darkThreshold);
  for (let i = 0; i < n; i++) {
    const v = g.d[i];
    if (keep[i]) { out[i] = v; continue; }
    const whitened = 255 - (255 - v) * (1 - a);
    const wgt = Math.min(1, Math.max(0, (v - darkThreshold) / range));
    out[i] = v + (whitened - v) * wgt;
  }
  return { w, h, d: out };
}
