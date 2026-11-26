/**
 * Mapeamento linha-do-pixel -> frequência. ÚNICA fonte de verdade, usada tanto pela
 * síntese quanto pela visualização (corrige o acoplamento quebrado da v1.0, em que
 * plot_spectrogram usava 200/2200 Hz e image_to_mono usava 180/1800 Hz).
 *
 * Preset "referencia": ajustado aos 7 WAVs originais por mínimos quadrados e
 * demodulação (ver docs/CALIBRACAO_ESPECTRAL.md): a linha 0 (topo) = 8000 Hz e a
 * última linha (base) = 50 Hz, escala logarítmica sobre TODA a tela, independentemente
 * de onde está o texto. Com isso o texto 1024x60 típico (linhas 16-44) ocupa ~180-2000 Hz.
 */
export type MappingPreset = 'referencia' | 'v03' | 'v10' | 'personalizado';

export interface MappingConfig {
  preset: MappingPreset;
  scale: 'log' | 'linear';
  /** Frequência da base (última linha da tela, ou da última linha com tinta se anchor='texto'). */
  fLowHz: number;
  /** Frequência do topo (linha 0, ou primeira linha com tinta se anchor='texto'). */
  fHighHz: number;
  /** 'tela': frequência fixa por linha (referência). 'texto': estica a altura real do texto (v1.0, experimental). */
  anchor: 'tela' | 'texto';
}

export const MAPPING_PRESETS: Record<Exclude<MappingPreset, 'personalizado'>, MappingConfig> = {
  referencia: { preset: 'referencia', scale: 'log', fLowHz: 50, fHighHz: 8000, anchor: 'tela' },
  // v0.3: linha 44 -> 200 Hz, linha 16 -> 2200 Hz, extrapolado para a tela inteira (H=60).
  v03: {
    preset: 'v03',
    scale: 'log',
    fLowHz: 200 * Math.pow(11, (44 - 59) / 28),
    fHighHz: 200 * Math.pow(11, 44 / 28),
    anchor: 'tela',
  },
  // v1.0: 180-1800 Hz esticado na altura ocupada pelo texto (hipótese experimental; NÃO recomendado).
  v10: { preset: 'v10', scale: 'log', fLowHz: 180, fHighHz: 1800, anchor: 'texto' },
};

export const DEFAULT_MAPPING: MappingConfig = MAPPING_PRESETS.referencia;

/** Resolve o intervalo de linhas que representa fLow..fHigh para uma imagem. */
export interface RowFrame {
  /** linha que recebe fHigh */
  rowTop: number;
  /** linha que recebe fLow */
  rowBottom: number;
}

export function rowFrame(cfg: MappingConfig, height: number, inkTop?: number, inkBottom?: number): RowFrame {
  if (cfg.anchor === 'texto' && inkTop !== undefined && inkBottom !== undefined && inkBottom > inkTop) {
    return { rowTop: inkTop, rowBottom: inkBottom };
  }
  return { rowTop: 0, rowBottom: Math.max(1, height - 1) };
}

/** Frequência (Hz) para uma linha (aceita linha fracionária). */
export function rowToHz(cfg: MappingConfig, frame: RowFrame, row: number): number {
  const span = frame.rowBottom - frame.rowTop;
  const rel = (frame.rowBottom - row) / span; // 0 na base, 1 no topo
  if (cfg.scale === 'log') return cfg.fLowHz * Math.pow(cfg.fHighHz / cfg.fLowHz, rel);
  return cfg.fLowHz + (cfg.fHighHz - cfg.fLowHz) * rel;
}

/** Linha (fracionária) para uma frequência — inversa de rowToHz. */
export function hzToRow(cfg: MappingConfig, frame: RowFrame, hz: number): number {
  const span = frame.rowBottom - frame.rowTop;
  let rel: number;
  if (cfg.scale === 'log') rel = Math.log(hz / cfg.fLowHz) / Math.log(cfg.fHighHz / cfg.fLowHz);
  else rel = (hz - cfg.fLowHz) / (cfg.fHighHz - cfg.fLowHz);
  return frame.rowBottom - rel * span;
}

export function validateMapping(cfg: MappingConfig, sr: number): string | null {
  if (!(cfg.fLowHz > 0) || !(cfg.fHighHz > cfg.fLowHz)) return 'Frequência mínima deve ser > 0 e menor que a máxima.';
  if (cfg.fHighHz >= sr / 2) return `Frequência máxima deve ser menor que ${sr / 2} Hz (Nyquist).`;
  return null;
}
