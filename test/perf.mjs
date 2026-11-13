// 600dpi 大图性能测试:4961×7016 ≈ 35MP
import { runPipeline } from '../dist/core/pipeline.js';
import { defaultPreset } from '../dist/types.js';

const W = 4961, H = 7016;
console.log(`合成 ${W}x${H} 测试图…`);
const d = new Uint8ClampedArray(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    d[y * W + x] = 205 - Math.exp(-x / (W * 0.15)) * 45;
  }
}
const margin = Math.round(W * 0.09), cols = 9;
const colW = (W - margin * 2) / cols;
for (let c = 0; c <= cols; c++) {
  const x = Math.round(margin + (W - margin * 2) - c * colW);
  for (let y = margin; y < H - margin; y++) d[y * W + x] = 30;
}
// 文字块(稀疏一点,够检测即可)
for (let c = 0; c < cols; c++) {
  const cx = Math.round(margin + (W - margin * 2) - c * colW - colW / 2);
  for (let r = 0; r < 20; r++) {
    const cy = margin + 150 + r * 300;
    for (let yy = -90; yy < 90; yy += 2) for (let xx = -90; xx < 90; xx += 2) {
      if (Math.abs(xx) + Math.abs(yy) < 120) d[(cy + yy) * W + cx + xx] = 25;
    }
  }
}

const preset = defaultPreset();
preset.columns.split = true;
const t0 = Date.now();
const out = runPipeline({ w: W, h: H, d }, preset);
const ms = Date.now() - t0;
console.log(`流水线总耗时: ${ms} ms (${(ms / 1000).toFixed(2)} s),目标 < 5000 ms`);
console.log('栏线:', out.meta.lines.length, '栏:', out.columns.length, '版心x:', out.meta.banxinX);
process.exit(ms < 5000 ? 0 : 1);
