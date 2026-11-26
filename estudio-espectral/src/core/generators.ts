/**
 * Geradores contínuos (estado preservado entre blocos — corrige a v1.0, que gerava
 * ruído independente por bloco de 2 s e podia criar transições audíveis).
 */
import { Biquad, Rng } from './dsp';

export type NoiseKind =
  | 'nenhum'
  | 'branco'
  | 'rosa'
  | 'marrom'
  | 'azul'
  | 'violeta'
  | 'cinza'
  | 'verde'
  | 'banda'
  | 'gaussiano'
  | 'velvet'
  | 'silencio';

export interface NoiseInfo {
  id: NoiseKind;
  nome: string;
  definicao: string;
  padronizado: boolean;
}

export const NOISES: NoiseInfo[] = [
  { id: 'nenhum', nome: 'Nenhum', definicao: 'Sem camada de ruído.', padronizado: true },
  { id: 'branco', nome: 'Branco (plano)', definicao: 'Densidade espectral plana; amostras uniformes em [-1, 1].', padronizado: true },
  { id: 'rosa', nome: 'Rosa (1/f)', definicao: 'Potência cai 3 dB por oitava (filtro de P. Kellet sobre ruído branco).', padronizado: true },
  { id: 'marrom', nome: 'Marrom / vermelho (1/f²)', definicao: 'Potência cai 6 dB por oitava (integrador com fuga, corte ~7 Hz).', padronizado: true },
  { id: 'azul', nome: 'Azul (f)', definicao: 'Potência sobe 3 dB por oitava (diferença do ruído rosa).', padronizado: true },
  { id: 'violeta', nome: 'Violeta (f²)', definicao: 'Potência sobe 6 dB por oitava (diferença do ruído branco).', padronizado: true },
  { id: 'cinza', nome: 'Cinza (aproximado)', definicao: 'Branco com reforço de graves e agudos (shelves de +12 dB < 250 Hz e +6 dB > 6 kHz), aproximando o inverso de uma curva de igual sonoridade. Não é a curva ISO 226; nome não padronizado.', padronizado: false },
  { id: 'verde', nome: 'Verde (100–1000 Hz)', definicao: 'Branco filtrado passa-faixa 100–1000 Hz (4ª ordem por lado). "Verde" não tem definição técnica padronizada.', padronizado: false },
  { id: 'banda', nome: 'Banda limitada (personalizável)', definicao: 'Branco filtrado passa-faixa entre as frequências escolhidas (padrão 400–2000 Hz).', padronizado: true },
  { id: 'gaussiano', nome: 'Gaussiano (branco)', definicao: 'Espectro plano, amplitudes com distribuição normal (limitadas a ±4,5σ).', padronizado: true },
  { id: 'velvet', nome: 'Velvet (impulsos esparsos)', definicao: 'Um impulso ±1 em posição aleatória por período (densidade configurável; Karjalainen & Järveläinen, 2007).', padronizado: true },
  { id: 'silencio', nome: 'Preto (silêncio)', definicao: '"Ruído preto" não tem definição única; aqui significa silêncio.', padronizado: false },
];

export interface NoiseOptions {
  kind: NoiseKind;
  sampleRate: number;
  seed: number;
  bandLowHz?: number;
  bandHighHz?: number;
  velvetDensity?: number;
}

interface RawGen {
  next(): number;
}

function makeRaw(o: NoiseOptions): RawGen {
  const rng = new Rng(o.seed);
  const sr = o.sampleRate;
  const white = () => rng.next() * 2 - 1;
  switch (o.kind) {
    case 'branco':
      return { next: white };
    case 'gaussiano':
      return { next: () => Math.max(-4.5, Math.min(4.5, rng.gauss())) };
    case 'rosa':
    case 'azul': {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, prev = 0;
      const pink = () => {
        const w = white();
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        return y;
      };
      if (o.kind === 'rosa') return { next: pink };
      return { next: () => { const p = pink(); const d = p - prev; prev = p; return d; } };
    }
    case 'marrom': {
      let y = 0;
      const a = Math.exp((-2 * Math.PI * 7) / sr);
      return { next: () => (y = a * y + white()) };
    }
    case 'violeta': {
      let prev = 0;
      return { next: () => { const w = white(); const d = w - prev; prev = w; return d; } };
    }
    case 'cinza': {
      const ls = Biquad.lowShelf(250, sr, 12), hs = Biquad.highShelf(Math.min(6000, sr * 0.4), sr, 6);
      return { next: () => hs.process(ls.process(white())) };
    }
    case 'verde':
    case 'banda': {
      const lo = o.kind === 'verde' ? 100 : o.bandLowHz ?? 400;
      const hi = o.kind === 'verde' ? 1000 : Math.min(o.bandHighHz ?? 2000, sr * 0.45);
      const f = [Biquad.highpass(lo, sr), Biquad.highpass(lo, sr), Biquad.lowpass(hi, sr), Biquad.lowpass(hi, sr)];
      return { next: () => { let v = white(); for (const q of f) v = q.process(v); return v; } };
    }
    case 'velvet': {
      const period = Math.max(2, Math.round(sr / (o.velvetDensity ?? 1000)));
      let i = 0, pos = 0, sign = 1;
      return {
        next: () => {
          if (i % period === 0) { pos = Math.floor(rng.next() * period); sign = rng.next() < 0.5 ? -1 : 1; }
          const v = i % period === pos ? sign : 0;
          i++;
          return v;
        },
      };
    }
    default:
      return { next: () => 0 };
  }
}

/** Ruído com RMS unitário calibrado uma única vez (nível constante ao longo da sessão). */
export class NoiseGen {
  private raw: RawGen;
  readonly scale: number;
  /** pico máximo possível relativo ao RMS (para cálculo de margem) */
  readonly crest: number;
  constructor(o: NoiseOptions) {
    if (o.kind === 'nenhum' || o.kind === 'silencio') {
      this.raw = { next: () => 0 };
      this.scale = 0;
      this.crest = 0;
      return;
    }
    const probe = makeRaw({ ...o, seed: o.seed ^ 0x5bd1e995 });
    let s = 0, pk = 0;
    const N = 1 << 17;
    for (let i = 0; i < 4096; i++) probe.next(); // aquecimento dos filtros
    for (let i = 0; i < N; i++) { const v = probe.next(); s += v * v; pk = Math.max(pk, Math.abs(v)); }
    const r = Math.sqrt(s / N) || 1;
    this.scale = 1 / r;
    this.crest = Math.max(4.5, (pk / r) * 1.25);
    this.raw = makeRaw(o);
    for (let i = 0; i < 4096; i++) this.raw.next();
  }
  next(): number {
    return this.raw.next() * this.scale;
  }
}

/** Oscilador senoidal de fase contínua (sem reinício de fase entre blocos). */
export class Osc {
  private phase = 0;
  constructor(private freq: number, private sr: number) {}
  next(): number {
    const v = Math.sin(this.phase);
    this.phase += (2 * Math.PI * this.freq) / this.sr;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    return v;
  }
}
