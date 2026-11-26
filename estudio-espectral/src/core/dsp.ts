/** Utilitários DSP: PRNG determinístico, suavização gaussiana O(N), biquads RBJ. */

/** xoshiro128** — PRNG rápido e reprodutível (mesma semente => mesmo áudio). */
export class Rng {
  private s = new Uint32Array(4);
  private spare: number | null = null;
  constructor(seed: number) {
    // splitmix32 para espalhar a semente
    let x = seed >>> 0 || 0x9e3779b9;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }
  /** uniforme [0,1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }
  /** normal padrão (Box-Muller) */
  gauss(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u <= 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
}
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Larguras de 3 caixas cuja convolução tem o mesmo desvio-padrão da gaussiana. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

/** Média móvel centrada, borda em zero (equivale a mode='constant' do SciPy). */
function boxBlurInto(src: Float64Array, dst: Float64Array, width: number): void {
  const r = (width - 1) >> 1;
  const n = src.length;
  let acc = 0;
  for (let i = 0; i <= r && i < n; i++) acc += src[i];
  for (let i = 0; i < n; i++) {
    dst[i] = acc / width;
    const add = i + r + 1;
    const sub = i - r;
    if (add < n) acc += src[add];
    if (sub >= 0) acc -= src[sub];
  }
}

/** Suavização gaussiana aproximada por 3 passagens de média móvel (O(N), erro < 3%). */
export function gaussianSmooth(x: Float64Array, sigmaSamples: number): Float64Array {
  if (sigmaSamples < 0.5) return x;
  const tmp = new Float64Array(x.length);
  let a = x, b = tmp;
  let first = true;
  for (const w of boxesForGauss(sigmaSamples)) {
    if (w <= 1) continue;
    boxBlurInto(a, b, w);
    if (first) {
      a = b;
      b = new Float64Array(x.length);
      first = false;
    } else {
      const t = a; a = b; b = t;
    }
  }
  return a;
}

/** Biquad RBJ (forma direta I transposta), com estado contínuo entre blocos. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  static lowpass(fc: number, sr: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  static highpass(fc: number, sr: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  /** Shelf (RBJ) — usado no ruído cinza. gainDb > 0 reforça abaixo de fc. */
  static lowShelf(fc: number, sr: number, gainDb: number, s = 1): Biquad {
    const A = Math.pow(10, gainDb / 40), w = (2 * Math.PI * fc) / sr, c = Math.cos(w), sn = Math.sin(w);
    const al = (sn / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2), sq = 2 * Math.sqrt(A) * al;
    const a0 = A + 1 + (A - 1) * c + sq;
    return new Biquad(
      (A * (A + 1 - (A - 1) * c + sq)) / a0,
      (2 * A * (A - 1 - (A + 1) * c)) / a0,
      (A * (A + 1 - (A - 1) * c - sq)) / a0,
      (-2 * (A - 1 + (A + 1) * c)) / a0,
      (A + 1 + (A - 1) * c - sq) / a0,
    );
  }
  static highShelf(fc: number, sr: number, gainDb: number, s = 1): Biquad {
    const A = Math.pow(10, gainDb / 40), w = (2 * Math.PI * fc) / sr, c = Math.cos(w), sn = Math.sin(w);
    const al = (sn / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2), sq = 2 * Math.sqrt(A) * al;
    const a0 = A + 1 - (A - 1) * c + sq;
    return new Biquad(
      (A * (A + 1 + (A - 1) * c + sq)) / a0,
      (-2 * A * (A - 1 + (A + 1) * c)) / a0,
      (A * (A + 1 + (A - 1) * c - sq)) / a0,
      (2 * (A - 1 - (A + 1) * c)) / a0,
      (A + 1 - (A - 1) * c - sq) / a0,
    );
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export function rms(x: ArrayLike<number>, start = 0, end = x.length): number {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

export function peakAbs(x: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

/** Curva de fade equal-power (seno²), 0..1 */
export function fadeCurve(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  const s = Math.sin((c * Math.PI) / 2);
  return s * s;
}
