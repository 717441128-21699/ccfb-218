// 冒烟测试:合成一张带缺陷的"扫描页",跑完整流水线
import { runPipeline } from '../dist/core/pipeline.js';
import { defaultPreset } from '../dist/types.js';

const W = 1200, H = 1700;
const d = new Uint8ClampedArray(W * H);

// 底:发黄 + 左侧书口阴影
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const gutter = Math.exp(-x / (W * 0.15)) * 45;
    d[y * W + x] = 205 - gutter + Math.sin(y / 300) * 8;
  }
}
// 水渍
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - W * 0.7, dy = y - H * 0.3;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r < 160) d[y * W + x] -= 40 * (1 - r / 160);
}
// 竖排文字块(深黑)+ 栏线
const margin = 100, cols = 8;
const colW = (W - margin * 2) / cols;
const bend = x => Math.round(H * 0.02 * Math.exp(-x / (W * 0.16))); // 书口弯曲
for (let c = 0; c <= cols; c++) {
  const x = Math.round(margin + (W - margin * 2) - c * colW);
  for (let y = margin; y < H - margin; y++) {
    const yy = y + bend(x);
    if (yy >= 0 && yy < H) d[yy * W + x] = 30; // 栏线
  }
}
for (let c = 0; c < cols; c++) {
  const cx = Math.round(margin + (W - margin * 2) - c * colW - colW / 2);
  for (let r = 0; r < 16; r++) {
    const cy = margin + 40 + r * 80;
    for (let yy = -22; yy < 22; yy++) for (let xx = -22; xx < 22; xx++) {
      if (Math.abs(xx) + Math.abs(yy) < 30) {
        const y2 = cy + yy + bend(cx);
        if (y2 >= 0 && y2 < H) d[y2 * W + cx + xx] = 25;
      }
    }
  }
}
// 透字:镜像的浅灰字
for (let c = 0; c < cols; c++) {
  const cx = Math.round(margin + c * colW + colW / 2);
  for (let r = 0; r < 16; r++) {
    const cy = margin + 40 + r * 80;
    for (let yy = -20; yy < 20; yy++) for (let xx = -20; xx < 20; xx++) {
      if (Math.abs(xx) + Math.abs(yy) < 28) {
        const v = d[(cy + yy) * W + cx + xx];
        d[(cy + yy) * W + cx + xx] = Math.min(v, 165);
      }
    }
  }
}

const preset = defaultPreset();
preset.columns.split = true;
const t0 = Date.now();
const out = runPipeline({ w: W, h: H, d }, preset);
const ms = Date.now() - t0;

// 校验
const main = out.main;
let bgSum = 0, bgN = 0;
for (let y = 20; y < 120; y++) for (let x = 20; x < 120; x++) { bgSum += main.d[y * main.w + x]; bgN++; }
const bgMean = bgSum / bgN;
let inkMin = 255;
const ccx = Math.round(margin + (W - margin * 2) - colW / 2), ccy = margin + 40;
for (let yy = -20; yy < 20; yy++) for (let xx = -20; xx < 20; xx++) {
  inkMin = Math.min(inkMin, main.d[(ccy + yy) * main.w + ccx + xx]);
}

console.log('尺寸:', main.w, 'x', main.h);
console.log('耗时:', ms, 'ms');
console.log('栏线数:', out.meta.lines.length, '(期望 9)');
console.log('版心 x:', out.meta.banxinX, '(期望约', W / 2, ')');
console.log('切栏数:', out.columns.length, '(期望 8)');
console.log('背景均值(去底色后应>235):', bgMean.toFixed(1));
console.log('笔画最暗值(应<60,笔画没被破坏):', inkMin);
console.log('纠偏角:', out.meta.skewDeg);

const ok =
  out.meta.lines.length === 9 &&
  out.columns.length === 8 &&
  bgMean > 235 &&
  inkMin < 60 &&
  Math.abs(out.meta.banxinX - W / 2) < W * 0.1;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
