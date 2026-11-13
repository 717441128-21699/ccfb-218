// 共享类型:处理预设、书目、页记录
export interface BgRemovalParams { enabled: boolean; radius: number; strength: number; }
export interface ShowThroughParams { enabled: boolean; darkThreshold: number; aggression: number; }
export interface DewarpParams { enabled: boolean; deskew: boolean; straightenFrame: boolean; }
export interface ColumnsParams { enabled: boolean; split: boolean; minLineHeightFrac: number; }
export interface BinarizeParams { enabled: boolean; threshold: number; } // threshold=0 → Otsu 自动

export interface BookPreset {
  bgRemoval: BgRemovalParams;
  showThrough: ShowThroughParams;
  dewarp: DewarpParams;
  columns: ColumnsParams;
  binarize: BinarizeParams;
}

export function defaultPreset(): BookPreset {
  return {
    bgRemoval: { enabled: true, radius: 120, strength: 0.9 },
    showThrough: { enabled: true, darkThreshold: 110, aggression: 0.65 },
    dewarp: { enabled: true, deskew: true, straightenFrame: false },
    columns: { enabled: true, split: false, minLineHeightFrac: 0.55 },
    binarize: { enabled: false, threshold: 0 },
  };
}

/** 组级深合并:overrides 里出现的组整组覆盖(字段级合并) */
export function mergePreset(base: BookPreset, over: Partial<BookPreset> | null | undefined): BookPreset {
  const out = structuredClone(base);
  if (over) {
    for (const k of Object.keys(over) as (keyof BookPreset)[]) {
      const v = over[k];
      if (v) (out as any)[k] = { ...(out as any)[k], ...v };
    }
  }
  return out;
}

export type PageStatus = 'imported' | 'queued' | 'processing' | 'done' | 'failed';

export interface PageRec {
  id: string;
  bookId: string;
  fileName: string;
  pageNo: number | null;
  status: PageStatus;
  overrides: Partial<BookPreset> | null;
  error?: string;
  width?: number;
  height?: number;
  colCount?: number;
  procMs?: number;
}

export interface Book {
  id: string;
  name: string;
  createdAt: number;
  preset: BookPreset;
}
