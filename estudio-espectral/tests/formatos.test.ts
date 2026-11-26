import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SR } from '../src/core/constants';
import { createEncoder, Upsampler2x, type OutputFormat } from '../src/core/encoders';
import { concat } from '../src/core/flac';
import { DEFAULT_MAPPING, rowFrame } from '../src/core/mapping';
import { compareImages } from '../src/core/metrics';
import { rowFilterbank, stft } from '../src/core/spectrum';
import { imageToMono } from '../src/core/synth';
import { syntheticBmp } from './helpers';

/** Decodificador FLAC mínimo (só o subconjunto que o nosso codificador produz) — para o teste de ida e volta. */
function decodeFlac(u8: Uint8Array): { sampleRate: number; total: number; L: Int32Array; R: Int32Array } {
  let pos = 0, bit = 0;
  const rd = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) { v = v * 2 + ((u8[pos] >> (7 - bit)) & 1); if (++bit === 8) { bit = 0; pos++; } }
    return v;
  };
  const rs = (n: number) => { const v = rd(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; };
  expect(String.fromCharCode(...u8.subarray(0, 4))).toBe('fLaC');
  pos = 8 + 4 + 6; // após min/max bloco e min/max quadro
  const sampleRate = rd(20); rd(3); rd(5);
  const total = rd(36);
  pos = 42;
  bit = 0;
  const L = new Int32Array(total), R = new Int32Array(total);
  let done = 0;
  const sub = (n: number, bps: number) => {
    rd(1);
    const t = rd(6);
    rd(1);
    const x = new Int32Array(n);
    if (t === 0) { x.fill(rs(bps)); return x; }
    if (t === 1) { for (let i = 0; i < n; i++) x[i] = rs(bps); return x; }
    const order = t & 7;
    for (let i = 0; i < order; i++) x[i] = rs(bps);
    rd(2);
    const po = rd(4), parts = 1 << po, size = n / parts;
    const res = new Int32Array(n);
    for (let p = 0; p < parts; p++) {
      const k = rd(4);
      for (let i = p === 0 ? order : p * size; i < (p + 1) * size; i++) {
        let q = 0;
        while (rd(1) === 0) q++;
        const u = q * 2 ** k + rd(k);
        res[i] = u & 1 ? -(u + 1) / 2 : u / 2;
      }
    }
    for (let i = order; i < n; i++) {
      const a = x[i - 1] ?? 0, b = x[i - 2] ?? 0, c = x[i - 3] ?? 0, d = x[i - 4] ?? 0;
      x[i] = res[i] + [0, a, 2 * a - b, 3 * a - 3 * b + c, 4 * a - 6 * b + 4 * c - d][order];
    }
    return x;
  };
  while (done < total) {
    expect(rd(16)).toBe(0xfff8);
    rd(4); rd(4);
    const ch = rd(4);
    rd(3); rd(1);
    let first = rd(8);
    let more = 0;
    while (first & 0x80) { first = (first << 1) & 0xff; more++; }
    for (let i = 1; i < more; i++) rd(8);
    const n = rd(16) + 1;
    rd(8);
    const a = sub(n, 16);
    const b = sub(n, ch === 0b1000 ? 17 : 16);
    for (let i = 0; i < n; i++) { L[done + i] = a[i]; R[done + i] = ch === 0b1000 ? a[i] - b[i] : b[i]; }
    if (bit) { bit = 0; pos++; }
    pos += 2; // CRC-16
    done += n;
  }
  return { sampleRate, total, L, R };
}

async function encodeAll(fmt: OutputFormat, l: Float32Array, r: Float32Array) {
  const mp3 = async () => (await import('@breezystack/lamejs')).Mp3Encoder as never;
  const enc = await createEncoder(fmt, l.length, mp3);
  const parts = [enc.header];
  for (let s = 0; s < l.length; s += 22050) parts.push(enc.encode(l.subarray(s, s + 22050), r.subarray(s, s + 22050)));
  parts.push(enc.finish());
  return concat(parts);
}

const phrase = imageToMono(syntheticBmp()).mono;
const noisy = Float32Array.from(phrase, (v, i) => v + 0.05 * Math.sin(i * 0.37) * Math.sin(i * 0.0011));
const outDir = join(__dirname, '..', 'relatorios', 'gerados');
mkdirSync(outDir, { recursive: true });

describe('formatos de saída', () => {
  it('FLAC é sem perdas (ida e volta idêntica ao PCM 16 bits), L=R e estéreo distinto', async () => {
    for (const [name, L, R] of [['igual', phrase, phrase], ['diferente', phrase, noisy]] as const) {
      const bytes = await encodeAll({ container: 'flac', sampleRate: 22050, mp3Kbps: 160 }, L, R);
      writeFileSync(join(outDir, `teste_${name}.flac`), bytes);
      const d = decodeFlac(bytes);
      expect(d.sampleRate).toBe(SR);
      expect(d.total).toBe(L.length);
      const q = (v: number) => (v < 0 ? Math.max(-32768, Math.round(v * 32768)) : Math.min(32767, Math.round(v * 32767)));
      for (let i = 0; i < L.length; i++) {
        if (d.L[i] !== q(L[i]) || d.R[i] !== q(R[i])) throw new Error(`amostra ${i} difere`);
      }
      expect(bytes.length).toBeLessThan(L.length * 4 * 0.8); // menor que o WAV
    }
  });

  it('MP3 é gerado em 22050 e 44100 Hz', async () => {
    for (const fmt of [{ container: 'mp3', sampleRate: 22050, mp3Kbps: 160 }, { container: 'mp3', sampleRate: 44100, mp3Kbps: 320 }] as OutputFormat[]) {
      const bytes = await encodeAll(fmt, phrase, phrase);
      writeFileSync(join(outDir, `teste_${fmt.sampleRate}_${fmt.mp3Kbps}.mp3`), bytes);
      expect(bytes[0]).toBe(0xff); // sincronismo do primeiro quadro
      const dur = phrase.length / SR;
      expect(bytes.length).toBeGreaterThan(((fmt.mp3Kbps * 1000) / 8) * dur * 0.9);
    }
  });

  it('reamostragem 2x preserva a frase (sem imagens espelhadas) e a legibilidade', () => {
    const up = new Upsampler2x();
    const y = new Float32Array(phrase.length * 2);
    for (let s = 0; s < phrase.length; s += 4096) y.set(up.process(phrase.subarray(s, s + 4096)), 2 * s);
    const sp = stft(y, 44100, { nfft: 4096, hop: 4096, window: 'blackman' });
    let inBand = 0, image = 0;
    for (let f = 0; f < sp.frames; f++) for (let b = 1; b < sp.bins; b++) {
      const hz = (b * 44100) / 4096, p = 10 ** (sp.db[f * sp.bins + b] / 10);
      if (hz < 9000) inBand += p; else if (hz > 13000) image += p;
    }
    expect(10 * Math.log10(image / inBand)).toBeLessThan(-50);
    // decimando de volta (amostras pares, com atraso do filtro) a reconstrução continua legível
    const back = new Float32Array(phrase.length);
    for (let i = 0; i < back.length; i++) back[i] = y[Math.min(y.length - 1, 2 * i + 63)];
    const cmp = compareImages(syntheticBmp(), rowFilterbank(back, SR, DEFAULT_MAPPING, rowFrame(DEFAULT_MAPPING, 60), 1024, 60));
    expect(cmp.ssimText).toBeGreaterThan(0.5);
  });
});
