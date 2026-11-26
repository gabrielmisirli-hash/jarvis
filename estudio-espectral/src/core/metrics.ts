/** Métricas objetivas BMP x reconstrução. Nenhuma métrica isolada substitui inspeção visual. */
import type { GrayImage } from './image';
import { inkBox } from './image';

/** Normaliza para 0..1 pelo percentil p (robusto a picos). */
export function normalizeRobust(img: GrayImage, pct = 0.995): GrayImage {
  const sorted = Float32Array.from(img.data).sort();
  const ref = sorted[Math.min(sorted.length - 1, Math.floor(pct * sorted.length))] || 1;
  const d = new Float32Array(img.data.length);
  for (let i = 0; i < d.length; i++) d[i] = Math.min(1, img.data[i] / ref);
  return { width: img.width, height: img.height, data: d };
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return sab / Math.sqrt(saa * sbb + 1e-30);
}

/** SSIM (Wang et al., 2004), janela gaussiana 11x11 σ=1,5, L=1. Opcionalmente restrito a uma região. */
export function ssim(a: GrayImage, b: GrayImage, region?: { x0: number; x1: number; y0: number; y1: number }): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('SSIM: tamanhos diferentes.');
  const W = a.width, H = a.height, R = 5, sig = 1.5;
  const k: number[] = [];
  let ks = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sig * sig)); k.push(v); ks += v; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const blur = (src: Float64Array) => {
    const tmp = new Float64Array(W * H), out = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -R; i <= R; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); s += src[y * W + xx] * k[i + R]; }
      tmp[y * W + x] = s;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -R; i <= R; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); s += tmp[yy * W + x] * k[i + R]; }
      out[y * W + x] = s;
    }
    return out;
  };
  const A = Float64Array.from(a.data), B = Float64Array.from(b.data);
  const AA = A.map((v) => v * v), BB = B.map((v) => v * v), AB = A.map((v, i) => v * B[i]);
  const ma = blur(A), mb = blur(B), saa = blur(AA), sbb = blur(BB), sab = blur(AB);
  const C1 = 0.01 ** 2, C2 = 0.03 ** 2;
  const rg = region ?? { x0: 0, x1: W - 1, y0: 0, y1: H - 1 };
  let s = 0, c = 0;
  for (let y = rg.y0; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
    const i = y * W + x;
    const va = saa[i] - ma[i] * ma[i], vb = sbb[i] - mb[i] * mb[i], cv = sab[i] - ma[i] * mb[i];
    s += ((2 * ma[i] * mb[i] + C1) * (2 * cv + C2)) / ((ma[i] ** 2 + mb[i] ** 2 + C1) * (va + vb + C2));
    c++;
  }
  return s / c;
}

export interface ImageComparison {
  ssimFull: number;
  ssimText: number;
  correlation: number;
}

/** Compara BMP original com a reconstrução obtida do áudio. */
export function compareImages(bmp: GrayImage, recon: GrayImage): ImageComparison {
  const r = normalizeRobust(recon);
  const box = inkBox(bmp);
  const m = 4;
  const region = box.empty
    ? undefined
    : { x0: Math.max(0, box.left - m), x1: Math.min(bmp.width - 1, box.right + m), y0: Math.max(0, box.top - m), y1: Math.min(bmp.height - 1, box.bottom + m) };
  return { ssimFull: ssim(bmp, r), ssimText: ssim(bmp, r, region), correlation: pearson(bmp.data, r.data) };
}
