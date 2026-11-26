/** Cliente promissificado do worker de áudio. */
import type { AnalyzeReq, AnalyzeRes, RenderReq, RenderRes, SynthReq, SynthRes, WorkerRes } from '../workers/protocol';

type Pending = { resolve: (v: WorkerRes) => void; reject: (e: Error & { cancelled?: boolean }) => void; onProgress?: (f: number) => void };

class EngineClient {
  private worker: Worker | null = null;
  private seq = 1;
  private pending = new Map<number, Pending>();

  private get w(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerRes>) => {
        const m = ev.data;
        const p = this.pending.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { p.onProgress?.(m.fraction); return; }
        this.pending.delete(m.id);
        if (m.type === 'error') p.reject(Object.assign(new Error(m.message), { cancelled: m.cancelled }));
        else p.resolve(m);
      };
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error('Falha no worker de áudio: ' + e.message));
        this.pending.clear();
        this.worker = null;
      };
    }
    return this.worker;
  }

  private call<T extends WorkerRes>(msg: Omit<SynthReq | AnalyzeReq | RenderReq, 'id'>, transfer: Transferable[] = [], onProgress?: (f: number) => void): { id: number; promise: Promise<T> } {
    const id = this.seq++;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: WorkerRes) => void, reject, onProgress });
      this.w.postMessage({ ...msg, id }, transfer);
    });
    return { id, promise };
  }

  synth(req: Omit<SynthReq, 'id' | 'type'>): Promise<SynthRes> {
    return this.call<SynthRes>({ type: 'synth', ...req }).promise;
  }
  analyze(req: Omit<AnalyzeReq, 'id' | 'type'>): Promise<AnalyzeRes> {
    return this.call<AnalyzeRes>({ type: 'analyze', ...req }).promise;
  }
  render(req: Omit<RenderReq, 'id' | 'type'>, onProgress: (f: number) => void): { id: number; promise: Promise<RenderRes> } {
    return this.call<RenderRes>({ type: 'render', ...req }, [], onProgress);
  }
  cancel(id: number) {
    this.worker?.postMessage({ type: 'cancel', id });
  }
}

export const engine = new EngineClient();
