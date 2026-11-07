// Small pool of analysis workers with a priority queue (assets used on the current page first).

import type { AnalyzeRequest, AnalyzeResponse } from './analysis.worker';

interface Job {
  req: AnalyzeRequest;
  priority: number;
  resolve: (r: AnalyzeResponse) => void;
}

class Pool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private pending = new Map<Worker, Job>();
  private size = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));

  private spawn(): Worker {
    const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
      const job = this.pending.get(w);
      this.pending.delete(w);
      this.idle.push(w);
      job?.resolve(e.data);
      this.pump();
    };
    w.onerror = (e) => {
      const job = this.pending.get(w);
      this.pending.delete(w);
      // replace the broken worker
      this.workers = this.workers.filter((x) => x !== w);
      w.terminate();
      job?.resolve({ id: job.req.id, ok: false, error: e.message || 'Worker failed' });
      this.pump();
    };
    this.workers.push(w);
    return w;
  }

  run(req: AnalyzeRequest, priority = 0): Promise<AnalyzeResponse> {
    return new Promise((resolve) => {
      this.queue.push({ req, priority, resolve });
      this.pump();
    });
  }

  get busy() {
    return this.queue.length + this.pending.size;
  }

  private pump() {
    while (this.queue.length) {
      let w = this.idle.pop();
      if (!w && this.workers.length < this.size) w = this.spawn();
      if (!w) return;
      // highest priority first, then FIFO
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority > this.queue[bi].priority) bi = i;
      const job = this.queue.splice(bi, 1)[0];
      this.pending.set(w, job);
      w.postMessage(job.req);
    }
  }
}

export const analysisPool = new Pool();
