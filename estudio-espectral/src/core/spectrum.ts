/**
 * Análise espectral LOCAL (sem bibliotecas externas): FFT radix-2, STFT,
 * renderização do espectrograma em RGBA, e reconstrução por banco de filtros
 * nas frequências das linhas (para métricas BMP x WAV).
 *
 * Tudo aqui opera sobre AMOSTRAS DE ÁUDIO (o WAV decodificado), nunca sobre os pixels
 * do BMP: a imagem C é derivada de B (som), conforme exigido.
 */
import { gaussianSmooth } from './dsp';
import type { GrayImage } from './image';
import { type MappingConfig, type RowFrame, hzToRow, rowToHz } from './mapping';

const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();
function plan(n: number) {
  let p = twiddleCache.get(n);
  if (p) return p;
  if (n & (n - 1)) throw new Error('Tamanho de FFT deve ser potência de 2.');
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  p = { cos, sin, rev };
  twiddleCache.set(n, p);
  return p;
}

/** FFT complexa in-place. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step], s = sin[k * step];
        const a = start + k, b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

export type WindowKind = 'hann' | 'hamming' | 'blackman';
export function makeWindow(kind: WindowKind, n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / n;
    if (kind === 'hamming') w[i] = 0.54 - 0.46 * Math.cos(x);
    else if (kind === 'blackman') w[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
    else w[i] = 0.5 - 0.5 * Math.cos(x);
  }
  return w;
}

export interface StftParams {
  nfft: number;
  hop: number;
  window: WindowKind;
}
export const DEFAULT_STFT: StftParams = { nfft: 2048, hop: 64, window: 'hann' };

export interface Spectrogram {
  /** dB, [frame * bins + bin] */
  db: Float32Array;
  frames: number;
  bins: number;
  sampleRate: number;
  hop: number;
  nfft: number;
  maxDb: number;
}

/** STFT centrada (frame k centrado na amostra k·hop), magnitude em dB re amplitude de seno. */
export function stft(x: Float32Array, sampleRate: number, p: StftParams = DEFAULT_STFT, onProgress?: (f: number) => void): Spectrogram {
  const { nfft, hop } = p;
  const win = makeWindow(p.window, nfft);
  let wsum = 0;
  for (const v of win) wsum += v;
  const bins = nfft / 2 + 1;
  const frames = Math.floor(x.length / hop) + 1;
  const db = new Float32Array(frames * bins);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const half = nfft >> 1;
  let maxDb = -Infinity;
  for (let f = 0; f < frames; f++) {
    const c = f * hop - half;
    for (let i = 0; i < nfft; i++) {
      const j = c + i;
      re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const amp = (2 * Math.hypot(re[b], im[b])) / wsum;
      const v = 20 * Math.log10(amp + 1e-9);
      db[f * bins + b] = v;
      if (v > maxDb) maxDb = v;
    }
    if (onProgress && (f & 255) === 0) onProgress(f / frames);
  }
  return { db, frames, bins, sampleRate, hop, nfft, maxDb };
}

export type Palette = 'cinza' | 'magma' | 'cinza-invertido' | 'viridis';
const PALETTES: Record<Palette, [number, number, number, number][]> = {
  cinza: [[0, 0, 0, 0], [1, 255, 255, 255]],
  'cinza-invertido': [[0, 255, 255, 255], [1, 0, 0, 0]],
  magma: [[0, 0, 0, 4], [0.25, 80, 18, 123], [0.5, 182, 54, 121], [0.75, 251, 136, 97], [1, 252, 253, 191]],
  viridis: [[0, 68, 1, 84], [0.25, 59, 82, 139], [0.5, 33, 145, 140], [0.75, 94, 201, 98], [1, 253, 231, 37]],
};
export function paletteLut(p: Palette): Uint8Array {
  const stops = PALETTES[p];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k], [t1, r1, g1, b1] = stops[k + 1];
    const u = (t - t0) / (t1 - t0);
    lut[i * 3] = r0 + (r1 - r0) * u;
    lut[i * 3 + 1] = g0 + (g1 - g0) * u;
    lut[i * 3 + 2] = b0 + (b1 - b0) * u;
  }
  return lut;
}

export interface ViewParams {
  t0: number;
  t1: number;
  fLo: number;
  fHi: number;
  scale: 'log' | 'linear';
  width: number;
  height: number;
  /** faixa dinâmica exibida, dB abaixo do máximo */
  rangeDb: number;
  /** gama > 1 escurece meios-tons, < 1 clareia */
  gamma: number;
  palette: Palette;
}

/** Converte o espectrograma num bitmap RGBA para Canvas (eixo de exibição ≠ conteúdo do WAV). */
export function renderSpectrogram(s: Spectrogram, v: ViewParams): Uint8ClampedArray {
  const { width: W, height: H } = v;
  const out = new Uint8ClampedArray(W * H * 4);
  const lut = paletteLut(v.palette);
  const binHz = s.sampleRate / s.nfft;
  const top = s.maxDb, floor = s.maxDb - v.rangeDb;
  // mapeamento das linhas de exibição -> bin fracionário
  const binOfRow = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const rel = 1 - (y + 0.5) / H; // 0 na base
    const hz = v.scale === 'log' ? v.fLo * Math.pow(v.fHi / v.fLo, rel) : v.fLo + (v.fHi - v.fLo) * rel;
    binOfRow[y] = hz / binHz;
  }
  for (let x = 0; x < W; x++) {
    const t = v.t0 + ((x + 0.5) / W) * (v.t1 - v.t0);
    const ff = (t * s.sampleRate) / s.hop;
    const f0 = Math.floor(ff), fu = ff - f0;
    const fa = Math.min(s.frames - 1, Math.max(0, f0)), fb = Math.min(s.frames - 1, Math.max(0, f0 + 1));
    for (let y = 0; y < H; y++) {
      const bf = binOfRow[y];
      const b0 = Math.floor(bf), bu = bf - b0;
      const ba = Math.min(s.bins - 1, Math.max(0, b0)), bb = Math.min(s.bins - 1, Math.max(0, b0 + 1));
      const va = s.db[fa * s.bins + ba] * (1 - bu) + s.db[fa * s.bins + bb] * bu;
      const vb = s.db[fb * s.bins + ba] * (1 - bu) + s.db[fb * s.bins + bb] * bu;
      const d = va * (1 - fu) + vb * fu;
      let n = (d - floor) / (top - floor);
      n = n <= 0 ? 0 : n >= 1 ? 1 : Math.pow(n, v.gamma);
      const li = Math.round(n * 255) * 3;
      const o = (y * W + x) * 4;
      out[o] = lut[li]; out[o + 1] = lut[li + 1]; out[o + 2] = lut[li + 2]; out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Reconstrói a imagem (W x H) a partir do ÁUDIO, por demodulação complexa em cada
 * frequência de linha (banco de filtros de Q aproximadamente constante). Não usa o BMP.
 */
export function rowFilterbank(
  x: Float32Array,
  sampleRate: number,
  mapping: MappingConfig,
  frame: RowFrame,
  width: number,
  height: number,
  maxSigmaMs = 40,
): GrayImage {
  const n = x.length;
  const out = new Float32Array(width * height);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let row = 0; row < height; row++) {
    const f = rowToHz(mapping, frame, row);
    if (!(f > 20 && f < sampleRate / 2 - 50)) continue;
    const df = Math.abs(rowToHz(mapping, frame, row - 0.5) - rowToHz(mapping, frame, row + 0.5));
    const sigmaT = Math.min(maxSigmaMs / 1000, 2.5 / (2 * Math.PI * Math.max(df, 1)));
    const w = (2 * Math.PI * f) / sampleRate;
    for (let i = 0; i < n; i++) {
      re[i] = x[i] * Math.cos(w * i);
      im[i] = -x[i] * Math.sin(w * i);
    }
    const sr = gaussianSmooth(re, sigmaT * sampleRate);
    const si = gaussianSmooth(im, sigmaT * sampleRate);
    for (let c = 0; c < width; c++) {
      const i = Math.min(n - 1, Math.floor(((c + 0.5) * n) / width));
      out[row * width + c] = 2 * Math.hypot(sr[i], si[i]);
    }
  }
  return { width, height, data: out };
}

/** Banda de exibição (Hz) que corresponde a um intervalo de linhas da tela. */
export function rowsToBand(mapping: MappingConfig, frame: RowFrame, rowTop: number, rowBottom: number): [number, number] {
  const a = rowToHz(mapping, frame, rowBottom), b = rowToHz(mapping, frame, rowTop);
  return [Math.min(a, b), Math.max(a, b)];
}
export { hzToRow };

/** Espectro médio de longo prazo e faixa que contém 5%-95% da energia. */
export function energyBand(x: Float32Array, sampleRate: number, lo = 0.05, hi = 0.95): { loHz: number; hiHz: number; bands: { label: string; pct: number }[] } {
  const s = stft(x, sampleRate, { nfft: 4096, hop: 2048, window: 'hann' });
  const p = new Float64Array(s.bins);
  for (let f = 0; f < s.frames; f++) for (let b = 0; b < s.bins; b++) p[b] += Math.pow(10, s.db[f * s.bins + b] / 10);
  let tot = 0;
  for (const v of p) tot += v;
  let acc = 0, loHz = 0, hiHz = 0;
  const binHz = sampleRate / s.nfft;
  for (let b = 0; b < s.bins; b++) {
    const prev = acc;
    acc += p[b] / tot;
    if (prev < lo && acc >= lo) loHz = b * binHz;
    if (prev < hi && acc >= hi) hiHz = b * binHz;
  }
  const edges = [0, 100, 200, 400, 800, 1600, 3200, 6400, sampleRate / 2];
  const bands = [];
  for (let k = 0; k < edges.length - 1; k++) {
    let e = 0;
    for (let b = 0; b < s.bins; b++) { const hz = b * binHz; if (hz >= edges[k] && hz < edges[k + 1]) e += p[b]; }
    bands.push({ label: `${edges[k]}–${Math.round(edges[k + 1])} Hz`, pct: (100 * e) / tot });
  }
  return { loHz, hiHz, bands };
}
