/**
 * Calibração contra os pares ORIGINAIS BMP/WAV. Requer fixtures locais (fora do git).
 * Escreve relatorios/gerados/calibracao.json com as métricas medidas.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHRASE_SAMPLES, SR } from '../src/core/constants';
import { MAPPING_PRESETS, rowFrame } from '../src/core/mapping';
import { compareImages, pearson } from '../src/core/metrics';
import { energyBand, rowFilterbank, stft } from '../src/core/spectrum';
import { DEFAULT_SYNTH, V10_SYNTH, imageToMono } from '../src/core/synth';
import { encodeWav, decodeWav } from '../src/core/wav';
import { hasRefs, loadRefs } from './helpers';

function specCorr(a: Float32Array, b: Float32Array): number {
  const p = { nfft: 1024, hop: 128, window: 'hann' as const };
  const A = stft(a, SR, p), B = stft(b, SR, p);
  const binHz = SR / 1024;
  const lo = Math.ceil(50 / binHz), hi = Math.floor(4000 / binHz);
  const xa: number[] = [], xb: number[] = [];
  for (let f = 0; f < A.frames; f++) for (let k = lo; k <= hi; k++) {
    xa.push(Math.max(A.db[f * A.bins + k], A.maxDb - 60));
    xb.push(Math.max(B.db[f * B.bins + k], B.maxDb - 60));
  }
  return pearson(xa, xb);
}

describe.skipIf(!hasRefs)('calibração contra os WAVs originais', () => {
  const refs = loadRefs();
  const report: Record<string, unknown>[] = [];

  it('os originais têm o formato de referência', () => {
    for (const r of refs) {
      expect(r.sampleRate).toBe(SR);
      expect(r.wav.length).toBe(2);
      expect(r.wav[0].length).toBe(PHRASE_SAMPLES);
      expect(r.bmp.width).toBe(1024);
      expect(r.bmp.height).toBe(60);
    }
  });

  it('preset Referência reproduz os originais melhor que v1.0 e v0.3', () => {
    for (const r of refs) {
      const orig = r.wav[0];
      const row: Record<string, unknown> = { arquivo: r.name };
      const frameTela = rowFrame(MAPPING_PRESETS.referencia, 60);
      const reconOrig = compareImages(r.bmp, rowFilterbank(orig, SR, MAPPING_PRESETS.referencia, frameTela, 1024, 60));
      row.original = { ssimTexto: +reconOrig.ssimText.toFixed(3), banda: bandStr(orig) };
      for (const [nome, params] of [
        ['referencia', DEFAULT_SYNTH],
        ['v03', { ...DEFAULT_SYNTH, mapping: MAPPING_PRESETS.v03, phaseMode: 'fixa', normalize: 'pico', targetPeak: 0.75 }],
        ['v10', V10_SYNTH],
      ] as const) {
        const res = imageToMono(r.bmp, params);
        // valida o caminho real: WAV exportado -> decodificado -> analisado
        const wav = encodeWav([res.mono, res.mono], SR);
        const back = decodeWav(wav).channels[0];
        const cmp = compareImages(r.bmp, rowFilterbank(back, SR, MAPPING_PRESETS.referencia, frameTela, 1024, 60));
        row[nome] = {
          corrEspectrogramaVsOriginal: +specCorr(orig, back).toFixed(3),
          ssimTextoReconstrucaoVsBmp_eixoReferencia: +cmp.ssimText.toFixed(3),
          banda: bandStr(back),
          pico: +res.peak.toFixed(3),
          rmsAtivo: +res.activeRms.toFixed(4),
        };
      }
      report.push(row);
      const g = (k: string) => (row[k] as { corrEspectrogramaVsOriginal: number }).corrEspectrogramaVsOriginal;
      expect(g('referencia')).toBeGreaterThan(0.95);
      expect(g('referencia')).toBeGreaterThan(g('v03'));
      expect(g('referencia')).toBeGreaterThan(g('v10'));
    }
    const dir = join(__dirname, '..', 'relatorios', 'gerados');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'calibracao.json'), JSON.stringify(report, null, 2));
  }, 300_000);
});

function bandStr(x: Float32Array): string {
  const b = energyBand(x, SR);
  return `${Math.round(b.loHz)}–${Math.round(b.hiHz)} Hz`;
}
