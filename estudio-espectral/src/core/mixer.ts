/**
 * Mixagem em streaming (blocos), estéreo explícito por canal.
 *
 * Garantias:
 *  - A camada espectral isolada é escrita SEM qualquer processamento do fundo (L == R).
 *  - Fundo (ruído, tons, binaural, isocrônico, música) é somado depois; ducking opcional
 *    atua APENAS no fundo.
 *  - Sem limitador por bloco (a v1.0 mudava o ganho a cada 2 s): ganho mestre FIXO,
 *    calculado antes da renderização a partir do pior caso de pico das camadas, de
 *    modo que a soma nunca satura e o equilíbrio entre camadas não "bombeia".
 *  - Envelopes (fades) aplicados explicitamente aos dois canais (regressão do bug
 *    de broadcasting (1323,2) x (1323,) da versão Python inicial).
 */
import { SR } from './constants';
import { fadeCurve } from './dsp';
import { NoiseGen, type NoiseKind, Osc } from './generators';
import type { SequencePlan } from './sequence';

export interface LayerCtl {
  gain: number; // 0..1
  mute: boolean;
  solo: boolean;
}

export interface MixSettings {
  spectral: LayerCtl;
  noise: LayerCtl & { kind: NoiseKind; bandLowHz: number; bandHighHz: number; velvetDensity: number; stereo: boolean };
  tone: LayerCtl & { freqHz: number }; // 0 = desligado
  binaural: LayerCtl & { carrierHz: number; beatHz: number }; // beat 0 = desligado
  iso: LayerCtl & { rateHz: number; carrierHz: number }; // rate 0 = desligado
  music: LayerCtl & { trackId: string | null; loop: boolean; crossfadeMs: number; fadeInMs: number; fadeOutMs: number; trimStartS: number; trimEndS: number };
  ducking: { enabled: boolean; depthDb: number };
  master: { fadeInMs: number; fadeOutMs: number; ceiling: number };
  seed: number;
}

const L = (gain: number): LayerCtl => ({ gain, mute: false, solo: false });

export const DEFAULT_MIX: MixSettings = {
  spectral: L(0.75),
  noise: { ...L(0.08), kind: 'nenhum', bandLowHz: 400, bandHighHz: 2000, velvetDensity: 1000, stereo: false },
  tone: { ...L(0.1), freqHz: 0 },
  binaural: { ...L(0.12), carrierHz: 200, beatHz: 0 },
  iso: { ...L(0.12), rateHz: 0, carrierHz: 528 },
  music: { ...L(0.2), trackId: null, loop: true, crossfadeMs: 1500, fadeInMs: 1000, fadeOutMs: 1000, trimStartS: 0, trimEndS: 0 },
  ducking: { enabled: false, depthDb: 6 },
  master: { fadeInMs: 100, fadeOutMs: 300, ceiling: 0.93 },
  seed: 1234,
};

export interface MusicData {
  left: Float32Array;
  right: Float32Array;
  peak: number;
}

type LayerName = 'spectral' | 'noise' | 'tone' | 'binaural' | 'iso' | 'music';

export function effectiveGains(m: MixSettings, hasMusic: boolean): Record<LayerName, number> {
  const layers: Record<LayerName, { ctl: LayerCtl; active: boolean }> = {
    spectral: { ctl: m.spectral, active: true },
    noise: { ctl: m.noise, active: m.noise.kind !== 'nenhum' && m.noise.kind !== 'silencio' },
    tone: { ctl: m.tone, active: m.tone.freqHz > 0 },
    binaural: { ctl: m.binaural, active: m.binaural.beatHz > 0 },
    iso: { ctl: m.iso, active: m.iso.rateHz > 0 },
    music: { ctl: m.music, active: hasMusic },
  };
  const anySolo = Object.values(layers).some((l) => l.active && l.ctl.solo);
  const out = {} as Record<LayerName, number>;
  for (const [k, l] of Object.entries(layers) as [LayerName, (typeof layers)[LayerName]][]) {
    out[k] = !l.active || l.ctl.mute || (anySolo && !l.ctl.solo) ? 0 : Math.max(0, Math.min(1, l.ctl.gain));
  }
  return out;
}

export interface RenderInput {
  phrases: Float32Array[]; // camada espectral mono de cada frase
  plan: SequencePlan;
  mix: MixSettings;
  music: MusicData | null;
  sampleRate?: number;
  /** true = fundo desligado (prévia "sem fundo") */
  backgroundOff?: boolean;
}

export interface BlockOut {
  spectral: Float32Array; // camada isolada, mono (escrever como L = R)
  left: Float32Array;
  right: Float32Array;
}

const NOISE_RMS = 0.13; // mesmo nível nominal da v1.0

export class SessionRenderer {
  private readonly sr: number;
  private readonly g: Record<LayerName, number>;
  private readonly noiseL: NoiseGen | null;
  private readonly noiseR: NoiseGen | null;
  private readonly tone: Osc | null;
  private readonly binL: Osc | null;
  private readonly binR: Osc | null;
  private readonly isoCar: Osc | null;
  private isoPhase = 0;
  private duck = 1;
  private occIdx = 0;
  readonly masterGain: number;
  readonly peakBound: number;
  private musicSeg: { l: Float32Array; r: Float32Array; start: number; len: number } | null = null;
  private readonly xfade: number;

  constructor(private readonly inp: RenderInput) {
    const m = inp.mix;
    this.sr = inp.sampleRate ?? SR;
    const g = effectiveGains(m, !!inp.music);
    if (inp.backgroundOff) for (const k of ['noise', 'tone', 'binaural', 'iso', 'music'] as LayerName[]) g[k] = 0;
    this.g = g;
    const mk = (seed: number) => new NoiseGen({ kind: m.noise.kind, sampleRate: this.sr, seed, bandLowHz: m.noise.bandLowHz, bandHighHz: m.noise.bandHighHz, velvetDensity: m.noise.velvetDensity });
    this.noiseL = g.noise ? mk(m.seed) : null;
    this.noiseR = g.noise && m.noise.stereo ? mk(m.seed + 7919) : null;
    this.tone = g.tone ? new Osc(m.tone.freqHz, this.sr) : null;
    this.binL = g.binaural ? new Osc(m.binaural.carrierHz, this.sr) : null;
    this.binR = g.binaural ? new Osc(m.binaural.carrierHz + m.binaural.beatHz, this.sr) : null;
    this.isoCar = g.iso ? new Osc(m.iso.carrierHz, this.sr) : null;
    let spectralPeak = 0;
    for (const p of inp.phrases) for (let i = 0; i < p.length; i++) spectralPeak = Math.max(spectralPeak, Math.abs(p[i]));
    if (inp.music && g.music) {
      const a = Math.max(0, Math.round(m.music.trimStartS * this.sr));
      const endRaw = m.music.trimEndS > 0 ? Math.round(m.music.trimEndS * this.sr) : inp.music.left.length;
      const b = Math.min(inp.music.left.length, Math.max(a + 1, endRaw));
      this.musicSeg = { l: inp.music.left, r: inp.music.right, start: a, len: b - a };
    }
    this.xfade = this.musicSeg ? Math.min(Math.round((m.music.crossfadeMs * this.sr) / 1000), Math.floor(this.musicSeg.len / 2)) : 0;
    const noisePeak = this.noiseL ? this.noiseL.crest * NOISE_RMS : 0;
    // pior caso: picos somados (amplitudes nominais de cada gerador)
    this.peakBound =
      spectralPeak * g.spectral + noisePeak * g.noise + 0.2 * g.tone + 0.15 * g.binaural + 0.2 * g.iso + (inp.music?.peak ?? 0) * g.music;
    this.masterGain = this.peakBound > m.master.ceiling ? m.master.ceiling / this.peakBound : 1;
  }

  private musicAt(t: number, out: [number, number]): void {
    const seg = this.musicSeg!;
    const m = this.inp.mix.music;
    const C = this.xfade;
    let l = 0, r = 0;
    if (!m.loop) {
      if (t < seg.len) { l = seg.l[seg.start + t]; r = seg.r[seg.start + t]; }
      const fo = Math.round((m.fadeOutMs * this.sr) / 1000);
      if (fo > 0 && t > seg.len - fo) { const k = fadeCurve((seg.len - t) / fo); l *= k; r *= k; }
    } else {
      const P = seg.len - C;
      const k = Math.floor(t / P), u = t - k * P;
      let gin = 1;
      if (k > 0 && u < C) gin = Math.sin((Math.PI / 2) * (u / C));
      l = seg.l[seg.start + u] * gin;
      r = seg.r[seg.start + u] * gin;
      if (k > 0 && u < C) {
        const go = Math.cos((Math.PI / 2) * (u / C));
        l += seg.l[seg.start + u + P] * go;
        r += seg.r[seg.start + u + P] * go;
      }
    }
    const fi = Math.round((m.fadeInMs * this.sr) / 1000);
    if (fi > 0 && t < fi) { const k = fadeCurve(t / fi); l *= k; r *= k; }
    out[0] = l; out[1] = r;
  }

  /** Renderiza [start, start+count). Deve ser chamado em ordem crescente e contígua. */
  renderBlock(start: number, count: number): BlockOut {
    const { plan, phrases, mix } = this.inp;
    const spectral = new Float32Array(count);
    const inPhrase = new Uint8Array(count);
    const end = start + count;
    // camada espectral isolada
    while (this.occIdx < plan.occurrences.length && plan.occurrences[this.occIdx].end <= start) this.occIdx++;
    for (let k = this.occIdx; k < plan.occurrences.length; k++) {
      const o = plan.occurrences[k];
      if (o.start >= end) break;
      const a = Math.max(o.start, start), b = Math.min(o.end, end);
      const src = phrases[o.index];
      const fadeN = Math.round(0.3 * this.sr);
      for (let i = a; i < b; i++) {
        let v = src[i - o.start];
        if (o.truncated && i > o.end - fadeN) v *= fadeCurve((o.end - i) / fadeN);
        spectral[i - start] = v;
        inPhrase[i - start] = 1;
      }
    }
    const left = new Float32Array(count), right = new Float32Array(count);
    const g = this.g;
    const total = plan.totalSamples;
    const fi = Math.round((mix.master.fadeInMs * this.sr) / 1000);
    const fo = Math.round((mix.master.fadeOutMs * this.sr) / 1000);
    const duckTarget = Math.pow(10, -mix.ducking.depthDb / 20);
    const duckCoef = Math.exp(-1 / (0.05 * this.sr)); // 50 ms de suavização
    const mus: [number, number] = [0, 0];
    for (let i = 0; i < count; i++) {
      const t = start + i;
      const s = spectral[i] * g.spectral;
      let bl = 0, br = 0;
      if (this.noiseL) {
        const nl = this.noiseL.next() * NOISE_RMS * g.noise;
        const nr = this.noiseR ? this.noiseR.next() * NOISE_RMS * g.noise : nl;
        bl += nl; br += nr;
      }
      if (this.tone) { const v = this.tone.next() * 0.2 * g.tone; bl += v; br += v; }
      if (this.binL && this.binR) { bl += this.binL.next() * 0.15 * g.binaural; br += this.binR.next() * 0.15 * g.binaural; }
      if (this.isoCar) {
        const env = 0.5 - 0.5 * Math.cos(this.isoPhase);
        this.isoPhase += (2 * Math.PI * mix.iso.rateHz) / this.sr;
        if (this.isoPhase > 2 * Math.PI) this.isoPhase -= 2 * Math.PI;
        const v = env * this.isoCar.next() * 0.2 * g.iso;
        bl += v; br += v;
      }
      if (this.musicSeg) { this.musicAt(t, mus); bl += mus[0] * g.music; br += mus[1] * g.music; }
      if (mix.ducking.enabled) {
        const target = inPhrase[i] ? duckTarget : 1;
        this.duck = target + (this.duck - target) * duckCoef;
        bl *= this.duck; br *= this.duck;
      }
      let env = this.masterGain;
      if (fi > 0 && t < fi) env *= fadeCurve(t / fi);
      if (fo > 0 && t >= total - fo) env *= fadeCurve((total - t) / fo);
      left[i] = (s + bl) * env;
      right[i] = (s + br) * env;
    }
    return { spectral, left, right };
  }
}
