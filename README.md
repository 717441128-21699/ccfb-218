# 古籍扫描整理工具

浏览器里跑的批量古籍扫描图整理工具:TypeScript + Canvas/OffscreenCanvas,图像算法全部手写(无第三方运行时依赖),Web Worker 池并行批处理。

## 运行

```bash
npm install
npm start        # 编译 + 起服务 → http://localhost:8080
# 开发: npm run watch (tsc --watch) + npm run dev
```

## 功能对照

| 需求 | 实现 |
|---|---|
| 按书建目录、批量导入、按文件名排页、缺页/重页提示 | 书目页 + 页面整理页;页码取文件名最后一串数字,`pageIssues()` 检测断号与重号 |
| 去底色、去污 | `core/background.ts`:降采样 + O(n) 滑动窗盒模糊估计背景场,除法归一化 |
| 透字压制、正面笔画不变细 | `core/showthrough.ts`:暗阈值取笔画核心→膨胀成保护区原样保留,区外中间调按力度推白 |
| 书口弯曲几何校正、版框拉直 | `core/dewarp.ts`:竖直投影方差搜纠偏角;横向分带墨迹质心→逐列反向平移;投影峰值找版框四边裁齐 |
| 自动找版心、栏线、切单栏 | `core/columns.ts`:竖直投影找长竖线,离版面中心最近者为版心,相邻线间切栏 |
| Worker 并行、暂停/取消/失败重试 | `queue/pool.ts` Worker 池(默认 min(8, 核数-1)),取消=终止并重建 worker,失败保留任务可重试 |
| 参数按书存预设、单页覆盖 | 书目级 `BookPreset` 存 localStorage;页面级按组覆盖,`mergePreset()` 深合并 |
| 校对页前后对比、撤销重做 | 校对页滑动对比条;每页内存版本栈,撤销/重做写回 IndexedDB |
| 导出整书 TIFF/PNG + 页码对照表 | 手写未压缩 TIFF 编码器 + 手写 ZIP(存储式),CSV 带 BOM |
| 合成测试扫描图 | 页面整理页「生成测试扫描图」:竖排文字+版框+鱼尾版心+栏线,可叠加发黄/水渍/透字/书口弯曲/倾斜/缺页重页 |
| 600dpi 单页 < 5s | 背景估计等分析在降采样图进行;实测 4961×7016(35MP)全流程约 1.5s(`node test/perf.mjs`) |

## 结构

```
src/
  core/        图像算法(imageBuffer 基础原语 / background / showthrough / dewarp / columns / pipeline)
  workers/     processor.worker.ts(解码→流水线→回传, transferable)
  queue/       pool.ts(Worker 池)+ queueManager.ts(与 store/UI 对接)
  ui/          五个页面 + 预设表单
  synth/       合成测试扫描图
  export/      tiff.ts / zip.ts / exportBook.ts
  store.ts     localStorage(元数据)+ IndexedDB(图像 Blob)
test/          smoke.mjs(功能)perf.mjs(600dpi 性能)
```

## 说明与取舍

- 原图与处理结果存 IndexedDB,元数据(书目/页面/预设/覆盖)存 localStorage;清浏览器数据会丢失。
- 版框拉直 = 纠偏后按检测框裁齐(假设扫描件透视形变很小);真遇到斜拍透视需要四角点透视变换,可后续加。
- 弯曲校正是一阶近似(逐列纵向平移),对书口附近的弧形弯曲有效,不处理横向波浪。
- 校对页撤销/重做的版本栈在内存里,刷新页面后只保留当前结果。
- 测试:`node test/smoke.mjs`、`node test/perf.mjs`。
