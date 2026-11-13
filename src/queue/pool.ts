// Worker 池:并行调度、暂停/继续、取消(终止并重建 worker)、失败重试
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'canceled';
export interface PoolJobView { id: string; status: JobStatus; error?: string; }

interface Task {
  id: string;
  payload: () => Promise<Record<string, unknown>>;
  onDone: (res: any) => Promise<void>;
  onFail: (msg: string) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private running = new Map<Worker, Task>();
  private pending: Task[] = [];
  private tasks = new Map<string, Task>();
  private status = new Map<string, { status: JobStatus; error?: string }>();
  paused = false;

  constructor(private size: number, private url: string, private onUpdate: () => void) {
    for (let i = 0; i < size; i++) this.spawn();
  }

  private spawn(): void {
    const w = new Worker(this.url, { type: 'module' });
    w.onmessage = ev => { void this.handleMsg(w, ev.data); };
    w.onerror = e => this.handleCrash(w, e.message || 'worker 异常');
    this.workers.push(w);
    this.idle.push(w);
  }

  submit(id: string, payload: Task['payload'], onDone: Task['onDone'], onFail: Task['onFail']): void {
    const t: Task = { id, payload, onDone, onFail };
    this.tasks.set(id, t);
    this.status.set(id, { status: 'pending' });
    this.pending.push(t);
    this.kick();
    this.onUpdate();
  }

  private async kick(): Promise<void> {
    if (this.paused) { this.onUpdate(); return; }
    while (this.idle.length && this.pending.length) {
      const w = this.idle.shift()!;
      const t = this.pending.shift()!;
      this.running.set(w, t);
      this.status.set(t.id, { status: 'running' });
      try {
        const p = await t.payload();
        // payload 可能拿到很大的 ArrayBuffer,作为 transfer 交给 worker
        const transfer: Transferable[] = [];
        w.postMessage({ cmd: 'process', jobId: t.id, ...p }, transfer);
      } catch (err) {
        this.running.delete(w);
        this.idle.push(w);
        this.fail(t, String((err as Error)?.message || err));
      }
    }
    this.onUpdate();
  }

  private async handleMsg(w: Worker, msg: any): Promise<void> {
    const t = this.running.get(w);
    if (!t) return;
    this.running.delete(w);
    this.idle.push(w);
    if (msg && msg.ok) {
      try {
        await t.onDone(msg);
        this.status.set(t.id, { status: 'done' });
      } catch (err) {
        this.status.set(t.id, { status: 'failed', error: String(err) });
        t.onFail(String(err));
      }
    } else {
      this.fail(t, (msg && msg.error) || '处理失败');
    }
    this.kick();
  }

  private fail(t: Task, msg: string): void {
    this.status.set(t.id, { status: 'failed', error: msg });
    t.onFail(msg);
  }

  private handleCrash(w: Worker, msg: string): void {
    const t = this.running.get(w);
    this.running.delete(w);
    if (t) this.fail(t, msg);
    this.replace(w);
    this.kick();
  }

  private replace(w: Worker): void {
    this.workers = this.workers.filter(x => x !== w);
    try { w.terminate(); } catch { /* ignore */ }
    this.spawn();
  }

  pause(): void { this.paused = true; this.onUpdate(); }
  resume(): void { this.paused = false; this.kick(); }

  cancel(id: string): void {
    const st = this.status.get(id);
    if (!st) return;
    if (st.status === 'pending') {
      this.pending = this.pending.filter(t => t.id !== id);
      this.status.set(id, { status: 'canceled' });
    } else if (st.status === 'running') {
      for (const [w, t] of this.running) {
        if (t.id === id) {
          this.running.delete(w);
          this.status.set(id, { status: 'canceled' });
          this.replace(w);
          break;
        }
      }
    }
    this.onUpdate();
    this.kick();
  }

  retryFailed(): number {
    let n = 0;
    for (const [id, st] of this.status) {
      if (st.status === 'failed') {
        const t = this.tasks.get(id);
        if (t) { this.status.set(id, { status: 'pending' }); this.pending.push(t); n++; }
      }
    }
    this.kick();
    return n;
  }

  clearFinished(): void {
    for (const [id, st] of [...this.status]) {
      if (st.status === 'done' || st.status === 'canceled') {
        this.status.delete(id);
        this.tasks.delete(id);
      }
    }
    this.onUpdate();
  }

  list(): PoolJobView[] {
    return [...this.status].map(([id, s]) => ({ id, status: s.status, error: s.error }));
  }

  counts(): { pending: number; running: number; done: number; failed: number; canceled: number } {
    const c = { pending: 0, running: 0, done: 0, failed: 0, canceled: 0 };
    for (const [, s] of this.status) c[s.status]++;
    return c;
  }
}
