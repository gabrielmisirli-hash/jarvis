import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PHRASE_SAMPLES, SR } from '../src/core/constants';
import { NoiseGen } from '../src/core/generators';
import { decodeBmp, encodeBmp24, rgbaToGray, type GrayImage } from '../src/core/image';
import { DEFAULT_MAPPING, MAPPING_PRESETS, hzToRow, rowFrame, rowToHz } from '../src/core/mapping';
import { compareImages } from '../src/core/metrics';
import { DEFAULT_MIX, SessionRenderer, type MixSettings } from '../src/core/mixer';
import { namePrefix, nextVersionName, parseCsv, parseTxt, parseXlsx, sequenceHash, DEFAULT_SETTINGS, type PhraseItem } from '../src/core/project';
import { planSequence } from '../src/core/sequence';
import { rowFilterbank, stft } from '../src/core/spectrum';
import { imageToMono } from '../src/core/synth';
import { decodeWav, encodeWav, validateWav } from '../src/core/wav';
import { syntheticBmp } from './helpers';

const mix = (over: Partial<MixSettings> = {}): MixSettings => ({ ...structuredClone(DEFAULT_MIX), ...over });

describe('BMP', () => {
  it('decodifica BMP OS/2 1.x (cabeçalho de 12 bytes) idêntico ao Pillow', () => {
    // BMP OS/2 24 bits 3x2 montado à mão
    const W = 3, H = 2, stride = 12;
    const u8 = new Uint8Array(26 + stride * H);
    const dv = new DataView(u8.buffer);
    u8[0] = 0x42; u8[1] = 0x4d; dv.setUint32(2, u8.length, true); dv.setUint32(10, 26, true);
    dv.setUint32(14, 12, true); dv.setUint16(18, W, true); dv.setInt16(20, H, true); dv.setUint16(22, 1, true); dv.setUint16(24, 24, true);
    // linha de baixo (y=1): pixel 0 = vermelho; linha de cima (y=0): pixel 2 = branco
    u8[26 + 2] = 255; // B,G,R -> R=255
    u8[26 + stride + 6] = 255; u8[26 + stride + 7] = 255; u8[26 + stride + 8] = 255;
    const img = decodeBmp(u8);
    expect([img.width, img.height]).toEqual([3, 2]);
    expect(Array.from(img.data.slice(8, 12))).toEqual([255, 255, 255, 255]); // (2,0)
    expect(Array.from(img.data.slice(12, 16))).toEqual([255, 0, 0, 255]); // (0,1)
    const g = rgbaToGray(img);
    expect(Math.round(g.data[3] * 255)).toBe(76); // luma PIL de vermelho puro
  });

  it('ida e volta encodeBmp24 preserva pixels', () => {
    const src = syntheticBmp();
    const back = rgbaToGray(decodeBmp(encodeBmp24(src)));
    for (let i = 0; i < src.data.length; i++) expect(back.data[i]).toBeCloseTo(src.data[i], 5);
  });

  const novos = join(__dirname, '..', 'fixtures', 'novos_BMPs');
  it.skipIf(!existsSync(novos))('decodifica todos os BMPs originais do usuário (1024x60)', () => {
    for (const f of readdirSync(novos).filter((x) => x.endsWith('.bmp'))) {
      const img = decodeBmp(new Uint8Array(readFileSync(join(novos, f))));
      expect([img.width, img.height]).toEqual([1024, 60]);
    }
  });
});

describe('mapeamento único síntese/visualização', () => {
  it('referência: topo 8000 Hz, base 50 Hz, linha 44 ≈ 181,6 Hz', () => {
    const fr = rowFrame(DEFAULT_MAPPING, 60);
    expect(rowToHz(DEFAULT_MAPPING, fr, 0)).toBeCloseTo(8000, 6);
    expect(rowToHz(DEFAULT_MAPPING, fr, 59)).toBeCloseTo(50, 6);
    expect(rowToHz(DEFAULT_MAPPING, fr, 44)).toBeCloseTo(181.66, 1);
    expect(hzToRow(DEFAULT_MAPPING, fr, rowToHz(DEFAULT_MAPPING, fr, 23.3))).toBeCloseTo(23.3, 9);
  });
  it('v0.3 preservada: linha 44 -> 200 Hz, linha 16 -> 2200 Hz', () => {
    const fr = rowFrame(MAPPING_PRESETS.v03, 60);
    expect(rowToHz(MAPPING_PRESETS.v03, fr, 44)).toBeCloseTo(200, 6);
    expect(rowToHz(MAPPING_PRESETS.v03, fr, 16)).toBeCloseTo(2200, 6);
  });
});

describe('síntese e reconstrução', () => {
  const img = syntheticBmp();
  const res = imageToMono(img);
  it('110700 amostras, RMS ativo 0,107, sem clipping', () => {
    expect(res.mono.length).toBe(PHRASE_SAMPLES);
    expect(res.activeRms).toBeGreaterThan(0.09);
    expect(res.peak).toBeLessThanOrEqual(0.97 + 1e-6);
  });
  it('reconstrução a partir do WAV exportado se parece com o BMP (SSIM na região do texto)', () => {
    const wav = encodeWav([res.mono, res.mono], SR);
    const back = decodeWav(wav).channels[0];
    const rec = rowFilterbank(back, SR, DEFAULT_MAPPING, rowFrame(DEFAULT_MAPPING, 60), 1024, 60);
    const cmp = compareImages(img, rec);
    expect(cmp.ssimText).toBeGreaterThan(0.5);
    expect(cmp.correlation).toBeGreaterThan(0.75);
  });
  it('é determinística (mesma semente = mesmo áudio)', () => {
    const b = imageToMono(img);
    expect(b.mono).toEqual(res.mono);
  });
});

describe('sequência', () => {
  it('pausa 1000 ms: inícios em 0, 6,0204 e 12,0408 s; depois loop', () => {
    const p = planSequence([PHRASE_SAMPLES, PHRASE_SAMPLES, PHRASE_SAMPLES], 22050, 30 * SR);
    expect(p.occurrences.slice(0, 4).map((o) => +(o.start / SR).toFixed(4))).toEqual([0, 6.0204, 12.0408, 18.0612]);
    expect(p.occurrences[3].index).toBe(0);
  });
  it('pausa 500 ms: inícios em 0, 5,5204 e 11,0408 s', () => {
    const p = planSequence([PHRASE_SAMPLES, PHRASE_SAMPLES, PHRASE_SAMPLES], 11025, 20 * SR);
    expect(p.occurrences.slice(0, 3).map((o) => +(o.start / SR).toFixed(4))).toEqual([0, 5.5204, 11.0408]);
  });
  it('final: modo "completas" não corta letras; modo "cortar" trunca exatamente no fim', () => {
    const a = planSequence([PHRASE_SAMPLES], 22050, 15 * SR, 'completas');
    expect(a.occurrences.every((o) => !o.truncated)).toBe(true);
    const b = planSequence([PHRASE_SAMPLES], 22050, 15 * SR, 'cortar');
    expect(b.occurrences.at(-1)!.end).toBe(15 * SR);
    expect(b.occurrences.at(-1)!.truncated).toBe(true);
  });
});

function renderAll(r: SessionRenderer, total: number, block = 4096) {
  const L = new Float32Array(total), R = new Float32Array(total), S = new Float32Array(total);
  for (let s = 0; s < total; s += block) {
    const n = Math.min(block, total - s);
    const o = r.renderBlock(s, n);
    L.set(o.left, s); R.set(o.right, s); S.set(o.spectral, s);
  }
  return { L, R, S };
}

describe('mixagem estéreo', () => {
  const phrase = imageToMono(syntheticBmp()).mono;
  it('fades aplicados aos DOIS canais (regressão do bug (1323,2) x (1323,))', () => {
    const plan = planSequence([phrase.length], 22050, 8 * SR, 'cortar');
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: mix(), music: null });
    const { L, R } = renderAll(r, plan.totalSamples, 1323);
    for (let i = 0; i < L.length; i++) if (L[i] !== R[i]) throw new Error('L != R em ' + i);
    expect(Math.abs(L[L.length - 1])).toBeLessThan(1e-3);
  });

  it('camada isolada permanece intacta com fundo ligado', () => {
    const plan = planSequence([phrase.length], 22050, 12 * SR);
    const m = mix();
    m.noise.kind = 'rosa'; m.noise.gain = 0.5; m.music.trackId = null;
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: m, music: null });
    const { S } = renderAll(r, plan.totalSamples);
    for (let i = 0; i < phrase.length; i++) expect(S[i]).toBe(phrase[i]);
  });

  it('binaural 200/210 Hz: canais efetivamente diferentes', () => {
    const plan = planSequence([phrase.length], 0, 6 * SR);
    const m = mix();
    m.spectral.mute = true; m.binaural.beatHz = 10; m.binaural.carrierHz = 200; m.binaural.gain = 1;
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: m, music: null });
    const { L, R } = renderAll(r, plan.totalSamples);
    const peakHz = (x: Float32Array) => {
      const s = stft(x.subarray(SR, SR + 16384), SR, { nfft: 16384, hop: 16384, window: 'hann' });
      let best = 0;
      for (let b = 1; b < s.bins; b++) if (s.db[s.bins + b] > s.db[s.bins + best]) best = b;
      return (best * SR) / 16384;
    };
    expect(Math.abs(peakHz(L) - 200)).toBeLessThan(1.5); // resolução do bin: 1,35 Hz
    expect(Math.abs(peakHz(R) - 210)).toBeLessThan(1.5);
  });

  it('isocrônico 7,83 Hz: envelope medido pulsa a 7,83 Hz', () => {
    const plan = planSequence([phrase.length], 0, 10 * SR);
    const m = mix();
    m.spectral.mute = true; m.iso.rateHz = 7.83; m.iso.carrierHz = 528; m.iso.gain = 1;
    m.master.fadeInMs = 0; m.master.fadeOutMs = 0;
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: m, music: null });
    const { L } = renderAll(r, plan.totalSamples);
    // envelope por potência + média móvel de 20 ms, depois cruzamentos ascendentes com histerese
    const env = new Float32Array(L.length);
    let acc = 0; const w = 441;
    for (let i = 0; i < L.length; i++) { acc += L[i] * L[i]; if (i >= w) acc -= L[i - w] * L[i - w]; env[i] = acc / w; }
    let mean = 0; for (const v of env) mean += v; mean /= env.length;
    let ups = 0, first = -1, last = -1;
    let armed = true;
    for (let i = 1; i < env.length; i++) {
      if (armed && env[i] >= mean * 1.2) { armed = false; ups++; if (first < 0) first = i; last = i; }
      else if (!armed && env[i] < mean * 0.8) armed = true;
    }
    const rate = (ups - 1) / ((last - first) / SR);
    expect(rate).toBeCloseTo(7.83, 1);
  });

  it('ganho mestre fixo impede saturação com todas as camadas no máximo', () => {
    const plan = planSequence([phrase.length], 22050, 15 * SR);
    const m = mix();
    for (const k of ['spectral', 'noise', 'tone', 'binaural', 'iso'] as const) m[k].gain = 1;
    m.noise.kind = 'gaussiano'; m.tone.freqHz = 528; m.binaural.beatHz = 6; m.iso.rateHz = 7.83;
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: m, music: null });
    const { L, R } = renderAll(r, plan.totalSamples);
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    expect(pk).toBeLessThanOrEqual(0.93 + 1e-6);
    expect(r.masterGain).toBeLessThan(1);
  });

  it('música mais curta que a sessão repete com crossfade, sem descontinuidades', () => {
    const len = 3 * SR; // 3 s de música: senoide 440 Hz com fase arbitrária no fim (pior caso para cliques)
    const l = new Float32Array(len), rr = new Float32Array(len);
    for (let i = 0; i < len; i++) l[i] = rr[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR + 0.3);
    const plan = planSequence([phrase.length], 22050, 12 * SR);
    const m = mix();
    m.spectral.mute = true; m.music.gain = 1; m.music.trackId = 'x'; m.music.crossfadeMs = 200;
    const r = new SessionRenderer({ phrases: [phrase], plan, mix: m, music: { left: l, right: rr, peak: 0.5 } });
    const { L } = renderAll(r, plan.totalSamples);
    // maior salto amostra-a-amostra deve ser compatível com uma senoide de 440 Hz (sem degraus)
    let maxStep = 0;
    for (let i = SR; i < L.length - SR; i++) maxStep = Math.max(maxStep, Math.abs(L[i] - L[i - 1]));
    expect(maxStep).toBeLessThan(0.5 * 2 * Math.PI * 440 / SR * 1.6);
  });
});

describe('ruídos (definições reais)', () => {
  const slope = (kind: 'rosa' | 'marrom' | 'branco' | 'violeta' | 'azul') => {
    const g = new NoiseGen({ kind, sampleRate: SR, seed: 3 });
    const x = new Float32Array(SR * 20);
    for (let i = 0; i < x.length; i++) x[i] = g.next();
    const s = stft(x, SR, { nfft: 4096, hop: 2048, window: 'hann' });
    const band = (lo: number, hi: number) => {
      let e = 0, c = 0;
      for (let f = 0; f < s.frames; f++) for (let b = Math.round((lo * 4096) / SR); b <= Math.round((hi * 4096) / SR); b++) { e += Math.pow(10, s.db[f * s.bins + b] / 10); c++; }
      return 10 * Math.log10(e / c);
    };
    return (band(1600, 3200) - band(200, 400)) / 3; // dB por oitava
  };
  it('branco ≈ 0, rosa ≈ -3, marrom ≈ -6, azul ≈ +3, violeta ≈ +6 dB/oitava', () => {
    expect(slope('branco')).toBeCloseTo(0, 0);
    expect(Math.abs(slope('rosa') + 3)).toBeLessThan(1);
    expect(Math.abs(slope('marrom') + 6)).toBeLessThan(1);
    expect(Math.abs(slope('azul') - 3)).toBeLessThan(1.2);
    expect(Math.abs(slope('violeta') - 6)).toBeLessThan(1);
  });
});

describe('WAV', () => {
  it('validação: cabeçalho, duração, estéreo, L=R', () => {
    const x = imageToMono(syntheticBmp()).mono;
    const v = validateWav(encodeWav([x, x], SR), { sampleRate: SR, channels: 2, frames: PHRASE_SAMPLES, expectIdenticalChannels: true });
    expect(v.ok).toBe(true);
    expect(v.durationSeconds).toBeCloseTo(5.020408, 5);
  });
});

describe('projeto, nomes e importação', () => {
  it('nome com data local e versão incremental sem sobrescrever', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.mix.tone.freqHz = 528; s.mix.iso.rateHz = 7.83;
    const p = namePrefix('Nome', s, new Date(2026, 10, 25));
    expect(p).toBe('26_11_25-Nome_frase_Solf528_Iso7_83');
    expect(nextVersionName(p, [])).toBe(p + '_V1');
    expect(nextVersionName(p, [p + '_V1', p + '_V2'])).toBe(p + '_V3');
  });
  it('CSV com ; e acentos, TXT e XLSX', () => {
    expect(parseCsv('﻿frase;nota\r\n"Eu respiro; com calma";x\r\nAção é possível;y\r\n')).toEqual(['Eu respiro; com calma', 'Ação é possível']);
    expect(parseTxt('Frase\nSou capaz\n\nCada respiração\n')).toEqual(['Sou capaz', 'Cada respiração']);
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Minha determinação</t></is></c></row><row r="3"><c r="A3" t="s"><v>1</v></c></row></sheetData></worksheet>';
    const shared = '<sst><si><t>frase</t></si><si><r><t>Você está </t></r><r><t>seguro &amp; protegido</t></r></si></sst>';
    const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(sheet), 'xl/sharedStrings.xml': strToU8(shared) });
    expect(parseXlsx(xlsx)).toEqual(['Minha determinação', 'Você está seguro & protegido']);
  });
  it('aprovação é invalidada por qualquer alteração de pixel, texto ou ordem', () => {
    const img = syntheticBmp();
    const px = new Uint8Array(img.data.length).map((_, i) => Math.round(img.data[i] * 255));
    const a: PhraseItem = { id: 'a', text: 'A', source: 'texto', pixels: px, width: 1024, height: 60 };
    const b: PhraseItem = { ...a, id: 'b', text: 'B' };
    const h = sequenceHash([a, b], DEFAULT_MAPPING);
    expect(sequenceHash([b, a], DEFAULT_MAPPING)).not.toBe(h);
    const px2 = px.slice(); px2[500] ^= 1;
    expect(sequenceHash([{ ...a, pixels: px2 }, b], DEFAULT_MAPPING)).not.toBe(h);
  });
});

export type { GrayImage };
