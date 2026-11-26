/** Validação do arquivo realmente gravado, para cada formato. */
import { PHRASE_SAMPLES, SR } from '../core/constants';
import type { RowFrame } from '../core/mapping';
import type { MappingConfig } from '../core/mapping';
import type { PhraseItem } from '../core/project';
import { encodeWav, parseWavHeader } from '../core/wav';
import type { RenderFile } from '../workers/protocol';
import { engine } from './engine';
import { decodeAudioFile } from './media';

const fmtB = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' kB');
const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export async function checkFile(f: RenderFile, totalSeconds: number): Promise<string> {
  const where = f.storage === 'opfs' ? 'gravado em disco/OPFS' : 'em memória';
  const rate = f.format.sampleRate;
  const expFrames = Math.round(totalSeconds * SR) * (rate / SR);
  const head = new Uint8Array(await f.blob.slice(0, 64).arrayBuffer());
  if (f.format.container === 'wav') {
    const info = parseWavHeader(head);
    const frames = info.declaredFrames;
    const okSize = f.blob.size === info.dataOffset + info.declaredDataBytes;
    const okFmt = info.sampleRate === rate && info.channels === 2 && info.bitsPerSample === 16;
    const mid = info.dataOffset + Math.floor(frames / 2) * 4;
    const slice = new Int16Array(await f.blob.slice(mid, mid + rate * 4).arrayBuffer());
    let pk = 0;
    for (const v of slice) pk = Math.max(pk, Math.abs(v));
    const problems = [!okFmt && 'formato', frames !== expFrames && 'duração', !okSize && 'tamanho', pk === 0 && 'silêncio'].filter(Boolean);
    return `${f.name}: WAV ${info.sampleRate} Hz, ${info.channels} canais, PCM ${info.bitsPerSample} bits, ${fmtT(frames / info.sampleRate)} (${frames} amostras), ${fmtB(f.blob.size)} — ${problems.length ? 'PROBLEMA: ' + problems.join(', ') : 'OK'} (${where})`;
  }
  if (f.format.container === 'flac') {
    const ok = String.fromCharCode(...head.subarray(0, 4)) === 'fLaC';
    // STREAMINFO: taxa (20 bits) a partir do byte 18; total de amostras (36 bits)
    const sr = (head[18] << 12) | (head[19] << 4) | (head[20] >> 4);
    const ch = ((head[20] >> 1) & 7) + 1;
    const bps = (((head[20] & 1) << 4) | (head[21] >> 4)) + 1;
    const total = (head[21] & 0x0f) * 2 ** 32 + ((head[22] << 24) >>> 0) + (head[23] << 16) + (head[24] << 8) + head[25];
    const problems = [!ok && 'assinatura', sr !== rate && 'taxa', ch !== 2 && 'canais', total !== expFrames && 'duração'].filter(Boolean);
    const ratio = f.blob.size / (expFrames * 4 + 44);
    return `${f.name}: FLAC ${sr} Hz, ${ch} canais, ${bps} bits, ${fmtT(total / sr)} (${total} amostras), ${fmtB(f.blob.size)} = ${(ratio * 100).toFixed(0)}% do WAV, sem perdas — ${problems.length ? 'PROBLEMA: ' + problems.join(', ') : 'OK'} (${where})`;
  }
  const sync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  const estSec = (f.blob.size * 8) / (f.format.mp3Kbps * 1000);
  const okLen = Math.abs(estSec - totalSeconds) < Math.max(1, totalSeconds * 0.02);
  return `${f.name}: MP3 ${rate} Hz, ${f.format.mp3Kbps} kbps CBR, ~${fmtT(estSec)}, ${fmtB(f.blob.size)} — ${sync && okLen ? 'OK' : 'PROBLEMA: ' + [!sync && 'cabeçalho', !okLen && 'duração'].filter(Boolean).join(', ')} (${where})`;
}

/**
 * Mede a legibilidade da 1ª frase DEPOIS da compressão: decodifica o início do arquivo
 * comprimido, alinha pelo atraso do codificador e reconstrói a imagem a partir do áudio.
 */
export async function lossyLegibility(f: RenderFile, phrase: PhraseItem, reference: Float32Array, mapping: MappingConfig, frame: RowFrame): Promise<{ ssim: number; ssimRef: number } | null> {
  const bytes = Math.ceil(((f.format.mp3Kbps * 1000) / 8) * (PHRASE_SAMPLES / SR + 2));
  const dec = await decodeAudioFile(f.blob.slice(0, bytes));
  const x = dec.left;
  let best = 0, bestLag = 0;
  for (let lag = 0; lag <= 3000 && lag + 2000 < x.length; lag += 5) {
    let s = 0;
    for (let i = 0; i < Math.min(PHRASE_SAMPLES, x.length - lag); i += 7) s += x[i + lag] * reference[i];
    if (s > best) { best = s; bestLag = lag; }
  }
  const seg = new Float32Array(PHRASE_SAMPLES);
  seg.set(x.subarray(bestLag, Math.min(x.length, bestLag + PHRASE_SAMPLES)));
  const view = { t0: 0, t1: 1, fLo: 100, fHi: 4000, scale: 'linear' as const, width: 8, height: 8, rangeDb: 60, gamma: 1, palette: 'cinza' as const };
  const stftP = { nfft: 256, hop: 4096, window: 'hann' as const };
  const bmp = { pixels: phrase.pixels.slice(), width: phrase.width, height: phrase.height };
  const [a, b] = await Promise.all([
    engine.analyze({ wav: encodeWav([seg, seg], SR), startS: 0, durationS: PHRASE_SAMPLES / SR, stft: stftP, view, mapping, frame, bmp }),
    engine.analyze({ wav: encodeWav([reference, reference], SR), startS: 0, durationS: PHRASE_SAMPLES / SR, stft: stftP, view, mapping, frame, bmp: { ...bmp, pixels: bmp.pixels.slice() } }),
  ]);
  if (!a.metrics || !b.metrics) return null;
  return { ssim: a.metrics.ssimText, ssimRef: b.metrics.ssimText };
}
