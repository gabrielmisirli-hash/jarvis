/// <reference lib="webworker" />
/**
 * Worker de áudio: toda a síntese, análise e exportação acontecem aqui, fora da
 * thread da interface, 100% no dispositivo.
 */
import { SR } from '../core/constants';
import { inkBox, type GrayImage } from '../core/image';
import { rowFrame } from '../core/mapping';
import { compareImages, normalizeRobust } from '../core/metrics';
import { SessionRenderer } from '../core/mixer';
import { planSequence } from '../core/sequence';
import { energyBand, pickByRowSpacing, renderSpectrogram, rowFilterbank, stft, stftMulti } from '../core/spectrum';
import { hzToRow, rowToHz } from '../core/mapping';
import { imageToMono } from '../core/synth';
import { decodeWav, encodeWav } from '../core/wav';
import { DEFAULT_OUTPUT, FORMAT_INFO, createEncoder, normalizeFormat, type OutputFormat, type StreamEncoder } from '../core/encoders';
import type { AnalyzeReq, RenderFile, RenderReq, SynthReq, WorkerReq, WorkerRes } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<number>();
const post = (m: WorkerRes, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);

function toGray(pixels: Uint8Array, width: number, height: number): GrayImage {
  const d = new Float32Array(pixels.length);
  for (let i = 0; i < d.length; i++) d[i] = pixels[i] / 255;
  return { width, height, data: d };
}

function doSynth(m: SynthReq) {
  const img = toGray(m.pixels, m.width, m.height);
  const r = imageToMono(img, m.synth);
  const box = inkBox(img, m.synth.threshold);
  const frame = rowFrame(m.synth.mapping, m.height, box.empty ? undefined : box.top, box.empty ? undefined : box.bottom);
  const wav = encodeWav([r.mono, r.mono], m.synth.sampleRate);
  post({ type: 'synth-done', id: m.id, mono: r.mono, wav, frame, minHz: r.minHz, maxHz: r.maxHz, peak: r.peak, activeRms: r.activeRms, rowsUsed: r.rowsUsed }, [r.mono.buffer, wav.buffer]);
}

function doAnalyze(m: AnalyzeReq) {
  const { info, channels } = decodeWav(m.wav);
  const a = Math.max(0, Math.round(m.startS * info.sampleRate));
  const b = Math.min(info.frames, a + Math.round(m.durationS * info.sampleRate));
  // mono = média dos canais (igual ao plot_spectrogram original)
  const x = new Float32Array(b - a);
  let identical: boolean | null = channels.length > 1 ? true : null;
  for (let i = a; i < b; i++) {
    let s = 0;
    for (const c of channels) s += c[i];
    x[i - a] = s / channels.length;
    if (identical && channels[0][i] !== channels[1][i]) identical = false;
  }
  let rgba: Uint8ClampedArray;
  if (m.stft.nfft === 0) {
    const specs = stftMulti(x, info.sampleRate, m.stft.hop, m.stft.window);
    // espaçamento local entre linhas do MESMO mapeamento usado na síntese
    const spacing = (hz: number) => {
      const r = hzToRow(m.mapping, m.frame, hz);
      return Math.abs(rowToHz(m.mapping, m.frame, r - 0.5) - rowToHz(m.mapping, m.frame, r + 0.5));
    };
    rgba = renderSpectrogram(specs, m.view, pickByRowSpacing(specs, spacing));
  } else {
    rgba = renderSpectrogram(stft(x, info.sampleRate, m.stft), m.view);
  }
  const band = energyBand(x, info.sampleRate);
  const res: WorkerRes = {
    type: 'analyze-done',
    id: m.id,
    rgba,
    width: m.view.width,
    height: m.view.height,
    bandLoHz: band.loHz,
    bandHiHz: band.hiHz,
    wavCheck: { sampleRate: info.sampleRate, channels: info.channels, frames: info.frames, channelsIdentical: identical },
  };
  if (m.bmp) {
    const bmp = toGray(m.bmp.pixels, m.bmp.width, m.bmp.height);
    const rec = rowFilterbank(x, info.sampleRate, m.mapping, m.frame, m.bmp.width, m.bmp.height);
    res.metrics = compareImages(bmp, rec);
    const n = normalizeRobust(rec);
    res.recon = Uint8Array.from(n.data, (v) => Math.round(v * 255));
  }
  post(res, [rgba.buffer, ...(res.recon ? [res.recon.buffer] : [])]);
}

interface Sink {
  write(chunk: Uint8Array): void;
  finish(): Promise<RenderFile>;
  abort(): Promise<void>;
}

// MP3 (LAME, LGPL-3.0) só é baixado/carregado quando o formato MP3 é escolhido; fica no precache para uso offline
const loadMp3 = async () => (await import('@breezystack/lamejs')).Mp3Encoder as never;

async function makeSink(name: string, kind: 'mix' | 'spectral', frames: number, mode: 'auto' | 'memory', format: OutputFormat, header: Uint8Array): Promise<Sink> {
  const mime = FORMAT_INFO[format.container].mime;
  if (mode === 'auto' && 'storage' in navigator && typeof navigator.storage.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('renders', { create: true });
      const fh = await dir.getFileHandle(name, { create: true });
      // createSyncAccessHandle: Chrome/Edge 102+, Safari 15.2+ (somente em Worker)
      const handle = await (fh as unknown as { createSyncAccessHandle(): Promise<{ write(b: Uint8Array, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void }> }).createSyncAccessHandle();
      handle.truncate(0);
      let at = handle.write(header, { at: 0 });
      return {
        write: (c) => { at += handle.write(c, { at }); },
        finish: async () => {
          handle.flush();
          handle.close();
          const blob = await fh.getFile();
          return { name, kind, blob, storage: 'opfs', frames, format };
        },
        abort: async () => { try { handle.close(); } catch { /* já fechado */ } await dir.removeEntry(name).catch(() => undefined); },
      };
    } catch {
      /* cai para memória */
    }
  }
  const parts: BlobPart[] = [header];
  return {
    write: (c) => { if (c.length) parts.push(c); },
    finish: async () => ({ name, kind, blob: new Blob(parts, { type: mime }), storage: 'memory', frames, format }),
    abort: async () => { parts.length = 0; },
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function doRender(m: RenderReq) {
  const total = Math.round(m.totalSeconds * SR);
  const gap = Math.round((m.gapMs / 1000) * SR);
  const plan = planSequence(m.phrases.map((p) => p.length), gap, total, m.endMode);
  const r = new SessionRenderer({ phrases: m.phrases, plan, mix: m.mix, music: m.music, backgroundOff: m.backgroundOff });
  const format = normalizeFormat(m.format ?? DEFAULT_OUTPUT);
  const ext = FORMAT_INFO[format.container].ext;
  const sinks: { sink: Sink; kind: 'mix' | 'spectral'; enc: StreamEncoder }[] = [];
  for (const [kind, on, suffix] of [['mix', m.outputs.mix, ''], ['spectral', m.outputs.spectral, '_camada_espectral']] as const) {
    if (!on) continue;
    const enc = await createEncoder(format, total, loadMp3);
    sinks.push({ kind, enc, sink: await makeSink(`${m.baseName}${suffix}.${ext}`, kind, enc.outFrames, m.sink, format, enc.header) });
  }
  const block = SR; // 1 s por bloco: memória constante (~0,5 MB) independentemente da duração
  try {
    for (let s = 0; s < total; s += block) {
      if (cancelled.has(m.id)) throw new Error('cancelado');
      const n = Math.min(block, total - s);
      const o = r.renderBlock(s, n);
      for (const { sink, kind, enc } of sinks) {
        sink.write(kind === 'mix' ? enc.encode(o.left, o.right) : enc.encode(o.spectral, o.spectral));
      }
      if ((s / block) % 5 === 0) {
        post({ type: 'progress', id: m.id, fraction: (s + n) / total });
        await tick();
      }
    }
    const files: RenderFile[] = [];
    for (const { sink, enc } of sinks) {
      sink.write(enc.finish());
      files.push(await sink.finish());
    }
    const clipped = sinks.filter((x) => x.kind === 'mix').reduce((a, x) => a + x.enc.stats.clipped, 0);
    post({ type: 'render-done', id: m.id, files, occurrences: plan.occurrences, masterGain: r.masterGain, clippedSamples: clipped, seconds: total / SR });
  } catch (e) {
    for (const { sink } of sinks) await sink.abort();
    const isCancel = cancelled.has(m.id);
    post({ type: 'error', id: m.id, message: isCancel ? 'Renderização cancelada. Nenhum arquivo parcial foi mantido.' : (e as Error).message, cancelled: isCancel });
  } finally {
    cancelled.delete(m.id);
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerReq>) => {
  const m = ev.data;
  try {
    if (m.type === 'cancel') cancelled.add(m.id);
    else if (m.type === 'synth') doSynth(m);
    else if (m.type === 'analyze') doAnalyze(m);
    else if (m.type === 'render') void doRender(m);
  } catch (e) {
    post({ type: 'error', id: m.id, message: (e as Error).message });
  }
};
