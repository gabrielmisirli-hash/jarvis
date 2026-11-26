import type { OutputFormat } from '../core/encoders';
import type { ImageComparison } from '../core/metrics';
import type { MappingConfig, RowFrame } from '../core/mapping';
import type { MixSettings } from '../core/mixer';
import type { EndMode } from '../core/sequence';
import type { StftParams, ViewParams } from '../core/spectrum';
import type { SynthParams } from '../core/synth';

export interface SynthReq {
  type: 'synth';
  id: number;
  pixels: Uint8Array;
  width: number;
  height: number;
  synth: SynthParams;
}
export interface SynthRes {
  type: 'synth-done';
  id: number;
  mono: Float32Array;
  /** WAV estéreo (L=R) da frase isolada, já codificado */
  wav: Uint8Array;
  frame: RowFrame;
  minHz: number;
  maxHz: number;
  peak: number;
  activeRms: number;
  rowsUsed: number;
}

export interface AnalyzeReq {
  type: 'analyze';
  id: number;
  /** WAV a analisar: a imagem é reconstruída do som, nunca dos pixels */
  wav: Uint8Array;
  /** trecho (s) dentro do WAV */
  startS: number;
  durationS: number;
  stft: StftParams;
  view: ViewParams;
  mapping: MappingConfig;
  frame: RowFrame;
  /** BMP original para as métricas (opcional) */
  bmp?: { pixels: Uint8Array; width: number; height: number };
}
export interface AnalyzeRes {
  type: 'analyze-done';
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** reconstrução por banco de filtros (W x H do BMP), 0..255 */
  recon?: Uint8Array;
  metrics?: ImageComparison;
  bandLoHz: number;
  bandHiHz: number;
  wavCheck: { sampleRate: number; channels: number; frames: number; channelsIdentical: boolean | null };
}

export interface RenderReq {
  type: 'render';
  id: number;
  phrases: Float32Array[];
  totalSeconds: number;
  gapMs: number;
  endMode: EndMode;
  mix: MixSettings;
  music: { left: Float32Array; right: Float32Array; peak: number } | null;
  outputs: { mix: boolean; spectral: boolean };
  backgroundOff?: boolean;
  /** 'opfs' grava em disco (Origin Private File System) quando disponível; 'memory' monta Blob */
  sink: 'auto' | 'memory';
  baseName: string;
  /** formato dos arquivos gerados (padrão: WAV 22050 Hz) */
  format?: OutputFormat;
}
export interface RenderFile {
  name: string;
  kind: 'mix' | 'spectral';
  blob: Blob;
  storage: 'opfs' | 'memory';
  /** amostras por canal na taxa de saída */
  frames: number;
  format: OutputFormat;
}
export interface RenderProgress {
  type: 'progress';
  id: number;
  fraction: number;
}
export interface RenderRes {
  type: 'render-done';
  id: number;
  files: RenderFile[];
  occurrences: { start: number; end: number; index: number; truncated: boolean }[];
  masterGain: number;
  clippedSamples: number;
  seconds: number;
}
export interface CancelReq {
  type: 'cancel';
  id: number;
}
export interface ErrorRes {
  type: 'error';
  id: number;
  message: string;
  cancelled?: boolean;
}

export type WorkerReq = SynthReq | AnalyzeReq | RenderReq | CancelReq;
export type WorkerRes = SynthRes | AnalyzeRes | RenderRes | RenderProgress | ErrorRes;
