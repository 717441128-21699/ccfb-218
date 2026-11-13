// 去底色 / 去污:大尺度背景估计 + 除法归一化
// 发黄、水渍都是低频分量,估计出背景场 bg 后 out = in/bg*255 即可压平。
import { Gray, downsample, upsample, boxBlur } from './imageBuffer.js';

export function removeBackground(g: Gray, radius: number, strength: number): Gray {
  // 背景估计在降采样图上做(600dpi 大图也能保持在毫秒级)
  const factor = Math.max(1, Math.round(Math.min(g.w, g.h) / 384));
  let bg = downsample(g, factor);
  bg = boxBlur(bg, Math.max(4, Math.round(radius / factor)));
  bg = upsample(bg, g.w, g.h);
  const out = new Uint8ClampedArray(g.d.length);
  const t = Math.min(1, Math.max(0, strength));
  for (let i = 0; i < g.d.length; i++) {
    const b = bg.d[i];
    const v = g.d[i];
    const norm = b > 8 ? Math.min(255, (v * 255) / b) : 255;
    out[i] = v + (norm - v) * t;
  }
  return { w: g.w, h: g.h, d: out };
}
