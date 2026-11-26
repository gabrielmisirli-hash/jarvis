/**
 * Constantes do formato de referência (verificadas nos 7 pares BMP/WAV originais):
 * 22050 Hz, PCM 16 bits, estéreo com L == R, 110700 amostras por frase.
 */
export const SR = 22050;
export const PHRASE_SAMPLES = 110700;
/** 110700 / 22050 = 246/49 = 5,020408163265306 s */
export const PHRASE_SECONDS = PHRASE_SAMPLES / SR;
export const DEFAULT_GAP_MS = 1000;
export const DEFAULT_TOTAL_SECONDS = 900;
export const BMP_WIDTH = 1024;
export const BMP_HEIGHT = 60;
export const SOLFEGGIO_HZ = [174, 285, 396, 417, 528, 639, 741, 852, 963] as const;
/** Valor nominal associado à ressonância Schumann. Pulsos acústicos NÃO reproduzem o campo eletromagnético. */
export const SCHUMANN_NOMINAL_HZ = 7.83;
export const MAX_TOTAL_SECONDS = 4 * 3600;
export const MAX_GAP_MS = 30000;
