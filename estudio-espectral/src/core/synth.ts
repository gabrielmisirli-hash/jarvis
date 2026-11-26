/**
 * Imagem -> som espectral (mono). Cada linha de pixel vira um seno na frequência
 * dada por mapping.ts; a coluna vira tempo (1024 colunas = 5,0204 s), o brilho vira
 * amplitude (linear).
 *
 * Calibração contra os 7 WAVs originais (docs/CALIBRACAO_ESPECTRAL.md):
 *  - frequência por linha FIXA na tela: 8000·(50/8000)^(linha/(H-1)) Hz;
 *  - dentro de cada traço contínuo a fase é constante, e muda a cada novo traço
 *    (modo 'traco'), o que dá a textura dos originais;
 *  - normalização por RMS da região ativa ≈ 0,107 (picos variam 0,60–0,79 nos originais).
 */
import { PHRASE_SAMPLES, SR } from './constants';
import { Rng, gaussianSmooth } from './dsp';
import type { GrayImage } from './image';
import { inkBox } from './image';
import { DEFAULT_MAPPING, type MappingConfig, rowFrame, rowToHz, validateMapping } from './mapping';

export interface SynthParams {
  mapping: MappingConfig;
  samples: number;
  sampleRate: number;
  /** suavização gaussiana do envelope temporal, em ms (v0.3/v1.0: 2,5 ms) */
  sigmaMs: number;
  /** 'traco': fase aleatória (determinística) por traço, como os originais; 'fixa': fase fixa por linha (v1.0). */
  phaseMode: 'traco' | 'fixa';
  normalize: 'rms' | 'pico';
  /** alvo RMS (região ativa) — 0,107 medido nos originais */
  targetRms: number;
  /** alvo de pico no modo 'pico' (v1.0: 0,75) e teto de segurança no modo 'rms' */
  targetPeak: number;
  /** limiar de "tinta" (0..1) abaixo do qual a linha é ignorada */
  threshold: number;
  /** fade nas bordas da frase, ms */
  edgeFadeMs: number;
  seed: number;
}

export const DEFAULT_SYNTH: SynthParams = {
  mapping: DEFAULT_MAPPING,
  samples: PHRASE_SAMPLES,
  sampleRate: SR,
  sigmaMs: 2.5,
  phaseMode: 'traco',
  normalize: 'rms',
  targetRms: 0.107,
  targetPeak: 0.97,
  threshold: 0.025,
  edgeFadeMs: 8,
  seed: 20251126,
};

/** Preset que reproduz a v1.0 Python (para comparação; não recomendado). */
export const V10_SYNTH: SynthParams = {
  ...DEFAULT_SYNTH,
  mapping: { preset: 'v10', scale: 'log', fLowHz: 180, fHighHz: 1800, anchor: 'texto' },
  phaseMode: 'fixa',
  normalize: 'pico',
  targetPeak: 0.75,
};

export interface SynthResult {
  mono: Float32Array;
  rowsUsed: number;
  minHz: number;
  maxHz: number;
  gain: number;
  peak: number;
  activeRms: number;
}

export function imageToMono(img: GrayImage, params: Partial<SynthParams> = {}): SynthResult {
  const p: SynthParams = { ...DEFAULT_SYNTH, ...params, mapping: { ...DEFAULT_SYNTH.mapping, ...(params.mapping ?? {}) } };
  const err = validateMapping(p.mapping, p.sampleRate);
  if (err) throw new Error(err);
  const { width: W, height: H, data } = img;
  const n = p.samples;
  const out = new Float64Array(n);
  const box = inkBox(img, p.threshold);
  if (box.empty) return { mono: new Float32Array(n), rowsUsed: 0, minHz: 0, maxHz: 0, gain: 0, peak: 0, activeRms: 0 };
  const frame = rowFrame(p.mapping, H, box.top, box.bottom);
  const sigma = (p.sigmaMs * p.sampleRate) / 1000;
  const env = new Float64Array(n);
  // posição (em colunas) do centro de cada amostra: (i+0,5)·W/n — como np.interp nos originais
  const colPos = new Float64Array(n);
  for (let i = 0; i < n; i++) colPos[i] = ((i + 0.5) * W) / n;
  let minHz = Infinity, maxHz = 0, rowsUsed = 0;

  for (let row = 0; row < H; row++) {
    let rowMax = 0;
    const base = row * W;
    for (let x = 0; x < W; x++) if (data[base + x] > rowMax) rowMax = data[base + x];
    if (rowMax <= p.threshold) continue;
    const f = rowToHz(p.mapping, frame, row);
    if (!(f > 20 && f < p.sampleRate / 2 - 100)) continue;
    rowsUsed++;
    minHz = Math.min(minHz, f);
    maxHz = Math.max(maxHz, f);
    // interpolação linear entre centros de coluna; zero fora de [0,5 ; W-0,5]
    for (let i = 0; i < n; i++) {
      const xp = colPos[i] - 0.5;
      if (xp < 0 || xp > W - 1) { env[i] = 0; continue; }
      const x0 = Math.floor(xp);
      const fr = xp - x0;
      const v0 = data[base + x0];
      const v1 = x0 + 1 < W ? data[base + x0 + 1] : v0;
      env[i] = v0 + (v1 - v0) * fr;
    }
    const e = gaussianSmooth(env, sigma);
    const w = (2 * Math.PI * f) / p.sampleRate;
    if (p.phaseMode === 'fixa') {
      const ph = (row * 2.399963229728653) % (2 * Math.PI);
      for (let i = 0; i < n; i++) if (e[i] > 1e-9) out[i] += e[i] * Math.sin(w * i + ph);
    } else {
      // nova fase a cada traço contínuo (envelope > limiar). A troca ocorre onde o
      // envelope é ~0, portanto não gera cliques.
      const rng = new Rng((p.seed ^ Math.imul(row + 1, 0x9e3779b1)) >>> 0);
      const eps = 1e-4;
      let on = false;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const v = e[i];
        if (v > eps) {
          if (!on) { ph = rng.next() * 2 * Math.PI; on = true; }
          out[i] += v * Math.sin(w * i + ph);
        } else {
          if (on) on = false;
          if (v > 1e-9) out[i] += v * Math.sin(w * i + ph);
        }
      }
    }
  }

  // normalização
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  let gain = 0;
  if (peak > 0) {
    if (p.normalize === 'pico') {
      gain = p.targetPeak / peak;
    } else {
      const thr = peak * 1e-4;
      let s = 0, c = 0;
      for (let i = 0; i < n; i++) if (Math.abs(out[i]) > thr) { s += out[i] * out[i]; c++; }
      const r = Math.sqrt(s / Math.max(1, c));
      gain = p.targetRms / r;
      if (peak * gain > p.targetPeak) gain = p.targetPeak / peak; // teto de segurança contra clipping
    }
  }
  const mono = new Float32Array(n);
  const fadeN = Math.min(Math.round((p.sampleRate * p.edgeFadeMs) / 1000), n >> 1);
  for (let i = 0; i < n; i++) mono[i] = out[i] * gain;
  for (let i = 0; i < fadeN; i++) {
    const t = Math.sin(((i / Math.max(1, fadeN - 1)) * Math.PI) / 2) ** 2;
    mono[i] *= t;
    mono[n - 1 - i] *= t;
  }
  let fpeak = 0, s = 0, c = 0;
  for (let i = 0; i < n; i++) fpeak = Math.max(fpeak, Math.abs(mono[i]));
  for (let i = 0; i < n; i++) if (Math.abs(mono[i]) > fpeak * 1e-4) { s += mono[i] * mono[i]; c++; }
  return { mono, rowsUsed, minHz, maxHz, gain, peak: fpeak, activeRms: Math.sqrt(s / Math.max(1, c)) };
}
