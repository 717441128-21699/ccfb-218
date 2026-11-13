// 合成测试扫描图:竖排文字 + 版框 + 版心鱼尾 + 栏线,
// 再叠加发黄、水渍、透字、书口弯曲、倾斜等缺陷,用于无真实扫描图时测试。
import { uid } from '../util.js';

const TEXT = '天地玄黃宇宙洪荒日月盈昃辰宿列張律呂調陽雲騰致雨露結為霜金生麗水玉出崑岡劍號巨闕珠稱夜光果珍李柰菜重芥薑海鹹河淡鱗潛羽翔龍師火帝鳥官人皇始制文字乃服衣裳推位讓國有虞陶唐吊民伐罪周發殷湯坐朝問道垂拱平章';

export interface SynthOptions {
  width: number;
  height: number;
  count: number;
  startPage: number;
  yellowing: boolean;
  stains: boolean;
  showThrough: boolean;
  curvature: boolean;
  skewDeg: number;
  messyNumbering: boolean; // 模拟缺页 + 重页
}

function rand(seed: { v: number }): number {
  seed.v = (seed.v * 1103515245 + 12345) & 0x7fffffff;
  return seed.v / 0x7fffffff;
}

function drawCleanPage(w: number, h: number, pageNo: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const margin = Math.round(w * 0.09);
  const innerW = w - margin * 2, innerH = h - margin * 2;
  const charH = innerH / 20;
  const colW = charH * 1.25;
  const cols = Math.floor(innerW / colW);
  const banxinCol = Math.floor(cols / 2);

  // 栏线
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = Math.max(1, w * 0.0006);
  for (let i = 0; i <= cols; i++) {
    const x = margin + innerW - i * colW;
    ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, margin + innerH); ctx.stroke();
  }
  // 版框
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(2, w * 0.0014);
  ctx.strokeRect(margin, margin, innerW, innerH);

  // 版心:象鼻线 + 双鱼尾 + 页码小字
  const bx = margin + innerW - banxinCol * colW - colW / 2;
  ctx.fillStyle = '#1a1a1a';
  const fisH = charH * 0.9, fisW = colW * 0.34;
  ctx.fillRect(bx - fisW / 2, margin, fisW, ctx.lineWidth * 1.2);
  ctx.fillRect(bx - fisW / 2, margin + innerH - ctx.lineWidth * 1.2, fisW, ctx.lineWidth * 1.2);
  for (const fy of [margin + innerH * 0.22, margin + innerH * 0.78]) {
    ctx.beginPath();
    ctx.moveTo(bx, fy - fisH / 2);
    ctx.lineTo(bx + fisW / 2, fy);
    ctx.lineTo(bx, fy + fisH / 2);
    ctx.lineTo(bx - fisW / 2, fy);
    ctx.closePath(); ctx.fill();
  }
  ctx.font = `${charH * 0.5}px "Songti SC","SimSun",serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(pageNo), bx, margin + innerH * 0.5);

  // 正文(竖排,从右往左,跳过版心列)
  ctx.font = `${charH * 0.9}px "Songti SC","SimSun",serif`;
  ctx.fillStyle = '#151515';
  const seed = { v: pageNo * 7919 + 13 };
  for (let i = 0; i < cols; i++) {
    if (i === banxinCol) continue;
    const x = margin + innerW - i * colW - colW / 2;
    const rows = 19;
    for (let r = 0; r < rows; r++) {
      if (rand(seed) < 0.04) continue; // 偶尔缺字,更像真书
      const ch = TEXT[(i * 17 + r * 7 + pageNo * 13) % TEXT.length];
      ctx.fillText(ch, x, margin + charH * (r + 0.92));
    }
  }
  return c;
}

function applyDefects(src: HTMLCanvasElement, o: SynthOptions, pageNo: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const seed = { v: pageNo * 31337 + 7 };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;

  // 纸底
  ctx.fillStyle = o.yellowing ? '#e3d3a8' : '#efe9da';
  ctx.fillRect(0, 0, w, h);
  if (o.yellowing) {
    for (let i = 0; i < 6; i++) {
      const x = rand(seed) * w, y = rand(seed) * h, r = (0.2 + rand(seed) * 0.4) * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(170,130,60,0.16)');
      g.addColorStop(1, 'rgba(170,130,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.drawImage(src, 0, 0);

  // 透字:镜像的正文层淡淡透过来
  if (o.showThrough) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, w * 0.002, h * 0.001);
    ctx.restore();
  }

  // 水渍 / 霉斑
  if (o.stains) {
    const n = 5 + Math.floor(rand(seed) * 8);
    for (let i = 0; i < n; i++) {
      const x = rand(seed) * w, y = rand(seed) * h;
      const rx = (0.03 + rand(seed) * 0.12) * w, ry = rx * (0.5 + rand(seed));
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      const dark = rand(seed) < 0.3;
      g.addColorStop(0, dark ? 'rgba(70,55,30,0.28)' : 'rgba(130,100,50,0.18)');
      g.addColorStop(0.7, dark ? 'rgba(70,55,30,0.12)' : 'rgba(130,100,50,0.08)');
      g.addColorStop(1, 'rgba(130,100,50,0)');
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // 书口弯曲:逐列纵向位移,左侧(书口)位移最大
  let bent: HTMLCanvasElement = c;
  if (o.curvature) {
    const b = document.createElement('canvas');
    b.width = w; b.height = h;
    const bctx = b.getContext('2d')!;
    bctx.fillStyle = o.yellowing ? '#e3d3a8' : '#efe9da';
    bctx.fillRect(0, 0, w, h);
    const A = h * 0.02;
    const slice = 4;
    for (let x = 0; x < w; x += slice) {
      const t = x / w;
      const dy = Math.round(A * Math.exp(-t / 0.16) + A * 0.25 * Math.sin(t * Math.PI));
      bctx.drawImage(c, x, 0, slice, h, x, dy, slice, h);
    }
    bent = b;
  }

  // 倾斜
  let out = bent;
  if (Math.abs(o.skewDeg) > 0.01) {
    const s = document.createElement('canvas');
    s.width = w; s.height = h;
    const sctx = s.getContext('2d')!;
    sctx.fillStyle = o.yellowing ? '#e3d3a8' : '#efe9da';
    sctx.fillRect(0, 0, w, h);
    sctx.translate(w / 2, h / 2);
    sctx.rotate((o.skewDeg * Math.PI) / 180);
    sctx.drawImage(bent, -w / 2, -h / 2);
    out = s;
  }

  // 扫描噪声
  const nctx = out.getContext('2d')!;
  const img = nctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const nz = (rand(seed) - 0.5) * 9;
    d[i] += nz; d[i + 1] += nz; d[i + 2] += nz;
  }
  nctx.putImageData(img, 0, 0);
  return out;
}

export async function generateScans(o: SynthOptions, onProgress?: (i: number, n: number) => void): Promise<File[]> {
  const files: File[] = [];
  const nameOf = (no: number, suffix = '') => `page_${String(no).padStart(4, '0')}${suffix}.png`;
  for (let i = 0; i < o.count; i++) {
    const no = o.startPage + i;
    if (o.messyNumbering && no === o.startPage + 2) continue; // 缺一页
    const clean = drawCleanPage(o.width, o.height, no);
    const final = applyDefects(clean, o, no);
    const blob = await new Promise<Blob | null>(res => final.toBlob(res, 'image/png'));
    if (blob) files.push(new File([blob], nameOf(no), { type: 'image/png' }));
    if (o.messyNumbering && no === o.startPage + 4 && blob) {
      files.push(new File([blob], nameOf(no, 'b'), { type: 'image/png' })); // 重页
    }
    onProgress?.(i + 1, o.count);
    await new Promise(r => setTimeout(r)); // 让出主线程刷新进度
  }
  return files;
}

export function synthPresetSizes(): { label: string; w: number; h: number }[] {
  return [
    { label: '2400×3400(约 300dpi,快)', w: 2400, h: 3400 },
    { label: '3508×4961(A4 约 420dpi)', w: 3508, h: 4961 },
    { label: '4961×7016(A4 600dpi,大图)', w: 4961, h: 7016 },
  ];
}

export function newSynthSessionId(): string { return uid(); }
