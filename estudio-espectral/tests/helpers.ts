import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBmp, rgbaToGray, type GrayImage } from '../src/core/image';
import { decodeWav } from '../src/core/wav';

/** Pares originais BMP/WAV ficam FORA do git (repositório público). Ver fixtures/LEIA-ME no README. */
export const REF_DIR = process.env.ESTUDIO_REF_DIR ?? join(__dirname, '..', 'fixtures', 'referencias_BMP_WAV');
export const hasRefs = existsSync(REF_DIR) && readdirSync(REF_DIR).some((f) => f.endsWith('.wav'));

export interface RefPair {
  name: string;
  bmp: GrayImage;
  wav: Float32Array[];
  sampleRate: number;
  raw: Uint8Array;
}

export function loadRefs(): RefPair[] {
  if (!hasRefs) return [];
  return readdirSync(REF_DIR)
    .filter((f) => f.endsWith('.wav'))
    .sort()
    .map((f) => {
      const raw = new Uint8Array(readFileSync(join(REF_DIR, f)));
      const { info, channels } = decodeWav(raw);
      const bmp = rgbaToGray(decodeBmp(new Uint8Array(readFileSync(join(REF_DIR, f.replace(/\.wav$/, '.bmp'))))));
      return { name: f.replace(/\.wav$/, ''), bmp, wav: channels, sampleRate: info.sampleRate, raw };
    });
}

/** Imagem sintética 1024x60 com "letras" em blocos — independe de fontes. */
export function syntheticBmp(): GrayImage {
  const W = 1024, H = 60, d = new Float32Array(W * H);
  for (let x = 100; x < 900; x++) {
    const inLetter = Math.floor((x - 100) / 40) % 2 === 0;
    for (let y = 16; y <= 44; y++) {
      const stroke = (x - 100) % 40 < 6 || y === 16 || y === 44 || y === 30;
      if (inLetter && stroke) d[y * W + x] = 1;
    }
  }
  return { width: W, height: H, data: d };
}
