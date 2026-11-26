/**
 * Formatos de saída. Todos codificados no aparelho, em streaming (memória constante).
 *  - WAV PCM 16 bits (mestre, sem perdas)
 *  - FLAC 16 bits (sem perdas, ~40–60% do tamanho do WAV)
 *  - MP3 CBR (com perdas; LAME via @breezystack/lamejs, LGPL-3.0, carregado sob demanda)
 * Taxa de saída: 22050 Hz (nativa da síntese) ou 44100 Hz (reamostragem 2x com filtro FIR).
 */
import { FlacEncoder } from './flac';
import { wavHeader } from './wav';

export type Container = 'wav' | 'flac' | 'mp3';

export interface OutputFormat {
  container: Container;
  sampleRate: 22050 | 44100;
  mp3Kbps: number;
}

export const DEFAULT_OUTPUT: OutputFormat = { container: 'wav', sampleRate: 22050, mp3Kbps: 160 };

export const FORMAT_INFO: Record<Container, { label: string; ext: string; mime: string }> = {
  wav: { label: 'WAV (PCM 16 bits, sem perdas)', ext: 'wav', mime: 'audio/wav' },
  flac: { label: 'FLAC (sem perdas, menor que WAV)', ext: 'flac', mime: 'audio/flac' },
  mp3: { label: 'MP3 (compatível com tudo, com perdas)', ext: 'mp3', mime: 'audio/mpeg' },
};

/** Taxas MP3 válidas: MPEG-2 (22050 Hz) vai até 160 kbps; MPEG-1 (44100 Hz) até 320 kbps. */
export function mp3Bitrates(sampleRate: number): number[] {
  return sampleRate === 22050 ? [64, 80, 96, 112, 128, 144, 160] : [128, 160, 192, 224, 256, 320];
}

export function normalizeFormat(f: OutputFormat): OutputFormat {
  const rates = mp3Bitrates(f.sampleRate);
  const kbps = rates.includes(f.mp3Kbps) ? f.mp3Kbps : rates.reduce((a, b) => (Math.abs(b - f.mp3Kbps) < Math.abs(a - f.mp3Kbps) ? b : a));
  return { ...f, mp3Kbps: kbps };
}

/** Reamostragem 2x (22050 -> 44100) por FIR polifásico windowed-sinc, com estado entre blocos. */
export class Upsampler2x {
  private static readonly TAPS = 32; // por fase
  private static kernel: Float64Array | null = null;
  /** linha de atraso circular duplicada (escrita em pos e pos+T): leitura contígua sem módulo */
  private hist: Float64Array;
  private pos = 0;
  constructor() {
    this.hist = new Float64Array(Upsampler2x.TAPS * 2);
    if (!Upsampler2x.kernel) {
      const N = Upsampler2x.TAPS * 2;
      const k = new Float64Array(N);
      const fc = 0.225; // ciclos/amostra na taxa de 44100 Hz = ~9,9 kHz (conteúdo vai até ~8 kHz; imagens começam em ~14 kHz)
      for (let i = 0; i < N; i++) {
        const t = i - (N - 1) / 2;
        const sinc = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t);
        const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / N) + 0.08 * Math.cos((4 * Math.PI * (i + 0.5)) / N);
        k[i] = 2 * sinc * w; // ganho 2 compensa a inserção de zeros
      }
      Upsampler2x.kernel = k;
    }
  }
  process(x: Float32Array): Float32Array {
    const T = Upsampler2x.TAPS, k = Upsampler2x.kernel!;
    const out = new Float32Array(x.length * 2);
    const h = this.hist;
    for (let i = 0; i < x.length; i++) {
      this.pos = (this.pos + T - 1) % T;
      const p = this.pos;
      h[p] = h[p + T] = x[i];
      let a = 0, b = 0;
      // h[p + j] = amostra de j passos atrás
      for (let j = 0; j < T; j++) { const v = h[p + j]; a += v * k[2 * j]; b += v * k[2 * j + 1]; }
      out[2 * i] = a;
      out[2 * i + 1] = b;
    }
    return out;
  }
}

function toInt16(x: Float32Array, stats: { clipped: number }): Int16Array {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let v = x[i];
    if (v > 1) { v = 1; stats.clipped++; } else if (v < -1) { v = -1; stats.clipped++; }
    o[i] = v < 0 ? Math.max(-32768, Math.round(v * 32768)) : Math.min(32767, Math.round(v * 32767));
  }
  return o;
}

export interface StreamEncoder {
  /** bytes iniciais (cabeçalho), escritos antes de qualquer áudio */
  header: Uint8Array;
  encode(left: Float32Array, right: Float32Array): Uint8Array;
  finish(): Uint8Array;
  readonly stats: { clipped: number };
  readonly outFrames: number;
}

type Mp3Ctor = new (channels: number, sampleRate: number, kbps: number) => { encodeBuffer(l: Int16Array, r?: Int16Array): Int8Array | Uint8Array; flush(): Int8Array | Uint8Array };

export async function createEncoder(fmt: OutputFormat, framesAt22050: number, loadMp3?: () => Promise<Mp3Ctor>): Promise<StreamEncoder> {
  const f = normalizeFormat(fmt);
  const up = f.sampleRate === 44100;
  const upL = up ? new Upsampler2x() : null, upR = up ? new Upsampler2x() : null;
  const outFrames = framesAt22050 * (up ? 2 : 1);
  const stats = { clipped: 0 };
  const prep = (l: Float32Array, r: Float32Array) => [toInt16(upL ? upL.process(l) : l, stats), toInt16(upR ? upR.process(r) : r, stats)] as const;
  if (f.container === 'wav') {
    return {
      header: wavHeader(outFrames, f.sampleRate, 2),
      encode(l, r) {
        const [L, R] = prep(l, r);
        const out = new Uint8Array(L.length * 4);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < L.length; i++) { dv.setInt16(i * 4, L[i], true); dv.setInt16(i * 4 + 2, R[i], true); }
        return out;
      },
      finish: () => new Uint8Array(0),
      stats,
      outFrames,
    };
  }
  if (f.container === 'flac') {
    const enc = new FlacEncoder(f.sampleRate, outFrames);
    return { header: enc.header(), encode: (l, r) => { const [L, R] = prep(l, r); return enc.encode(L, R); }, finish: () => enc.finish(), stats, outFrames };
  }
  if (!loadMp3) throw new Error('Codificador MP3 indisponível.');
  const Mp3 = await loadMp3();
  const enc = new Mp3(2, f.sampleRate, f.mp3Kbps);
  const u8 = (b: Int8Array | Uint8Array) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
  return {
    header: new Uint8Array(0),
    encode: (l, r) => { const [L, R] = prep(l, r); return u8(enc.encodeBuffer(L, R)); },
    finish: () => u8(enc.flush()),
    stats,
    outFrames,
  };
}
