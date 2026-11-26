/**
 * Imagens em tons de cinza e codec BMP próprio (sem dependências), determinístico
 * em todos os navegadores. Suporta o cabeçalho OS/2 1.x (BITMAPCOREHEADER, 12 bytes),
 * usado pelos BMPs originais do usuário, e BITMAPINFOHEADER (40/52/56/108/124 bytes).
 */
export interface GrayImage {
  width: number;
  height: number;
  /** linha a linha, de cima para baixo; valores 0..1 */
  data: Float32Array;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // RGBA
}

/** Mesma fórmula do Pillow para modo 'L' (ITU-R 601-2), com arredondamento inteiro idêntico. */
export function lumaPIL(r: number, g: number, b: number): number {
  return (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;
}

export function rgbaToGray(img: RgbaImage): GrayImage {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = lumaPIL(data[p], data[p + 1], data[p + 2]) / 255;
  }
  return { width, height, data: out };
}

export function grayToRgba(img: GrayImage): RgbaImage {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.data.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, img.data[i])) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

export class BmpError extends Error {}

function maskShift(mask: number): { shift: number; bits: number } {
  if (!mask) return { shift: 0, bits: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  let bits = 0;
  while (((mask >>> (shift + bits)) & 1) === 1) bits++;
  return { shift, bits };
}

/** Decodifica BMP para RGBA sem reamostragem nem alteração de pixels. */
export function decodeBmp(buf: ArrayBuffer | Uint8Array): RgbaImage {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 26 || u8[0] !== 0x42 || u8[1] !== 0x4d) throw new BmpError('Arquivo não é um BMP válido (assinatura BM ausente).');
  const dataOffset = dv.getUint32(10, true);
  const hdrSize = dv.getUint32(14, true);
  let width: number, height: number, bpp: number, compression = 0, colorsUsed = 0;
  let paletteEntrySize = 4;
  let rMask = 0, gMask = 0, bMask = 0, aMask = 0;
  if (hdrSize === 12) {
    // OS/2 1.x BITMAPCOREHEADER
    width = dv.getUint16(18, true);
    height = dv.getInt16(20, true);
    bpp = dv.getUint16(24, true);
    paletteEntrySize = 3;
  } else if (hdrSize >= 40) {
    width = dv.getInt32(18, true);
    height = dv.getInt32(22, true);
    bpp = dv.getUint16(28, true);
    compression = dv.getUint32(30, true);
    colorsUsed = dv.getUint32(46, true);
    if (compression === 3 || compression === 6) {
      // BI_BITFIELDS: máscaras no cabeçalho (>=52) ou logo após o de 40 bytes
      const mOff = 14 + 40;
      rMask = dv.getUint32(mOff, true);
      gMask = dv.getUint32(mOff + 4, true);
      bMask = dv.getUint32(mOff + 8, true);
      if (hdrSize >= 56 || compression === 6) aMask = dv.getUint32(mOff + 12, true);
    }
  } else {
    throw new BmpError(`Cabeçalho BMP não suportado (${hdrSize} bytes).`);
  }
  if (compression !== 0 && compression !== 3 && compression !== 6) {
    throw new BmpError('BMP comprimido (RLE/JPEG/PNG) não suportado. Salve como BMP sem compressão.');
  }
  const topDown = height < 0;
  height = Math.abs(height);
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) throw new BmpError('Dimensões BMP inválidas.');
  if (![1, 4, 8, 16, 24, 32].includes(bpp)) throw new BmpError(`Profundidade de cor não suportada: ${bpp} bits.`);

  let palette: Uint8Array | null = null;
  if (bpp <= 8) {
    const n = colorsUsed || 1 << bpp;
    const palOff = 14 + hdrSize + (compression === 3 && hdrSize === 40 ? 12 : 0);
    palette = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = palOff + i * paletteEntrySize;
      palette[i * 3] = u8[o + 2];
      palette[i * 3 + 1] = u8[o + 1];
      palette[i * 3 + 2] = u8[o];
    }
  }
  if (bpp === 16 && compression === 0) {
    rMask = 0x7c00; gMask = 0x03e0; bMask = 0x001f;
  }
  const rs = maskShift(rMask), gs = maskShift(gMask), bs = maskShift(bMask), as = maskShift(aMask);
  const scale = (v: number, s: { shift: number; bits: number }) =>
    s.bits ? Math.round((((v >>> s.shift) & ((1 << s.bits) - 1)) * 255) / ((1 << s.bits) - 1)) : 0;

  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (dataOffset + stride * height > u8.length) throw new BmpError('BMP truncado: dados de pixel incompletos.');
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const rowOff = dataOffset + srcRow * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (bpp === 24) {
        const p = rowOff + x * 3;
        b = u8[p]; g = u8[p + 1]; r = u8[p + 2];
      } else if (bpp === 32) {
        const p = rowOff + x * 4;
        if (compression === 0) {
          b = u8[p]; g = u8[p + 1]; r = u8[p + 2];
        } else {
          const v = dv.getUint32(p, true);
          r = scale(v, rs); g = scale(v, gs); b = scale(v, bs);
          if (as.bits) a = scale(v, as);
        }
      } else if (bpp === 16) {
        const v = dv.getUint16(rowOff + x * 2, true);
        r = scale(v, rs); g = scale(v, gs); b = scale(v, bs);
      } else {
        let idx: number;
        if (bpp === 8) idx = u8[rowOff + x];
        else if (bpp === 4) idx = (u8[rowOff + (x >> 1)] >> ((1 - (x & 1)) * 4)) & 0xf;
        else idx = (u8[rowOff + (x >> 3)] >> (7 - (x & 7))) & 1;
        const pal = palette!;
        r = pal[idx * 3] ?? 0; g = pal[idx * 3 + 1] ?? 0; b = pal[idx * 3 + 2] ?? 0;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return { width, height, data: out };
}

/** Codifica BMP 24 bits (BITMAPINFOHEADER, de baixo para cima) — compatível com qualquer visualizador. */
export function encodeBmp24(img: GrayImage | RgbaImage): Uint8Array {
  const { width, height } = img;
  const stride = Math.floor((24 * width + 31) / 32) * 4;
  const size = 54 + stride * height;
  const u8 = new Uint8Array(size);
  const dv = new DataView(u8.buffer);
  u8[0] = 0x42; u8[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, stride * height, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  const isGray = img.data instanceof Float32Array;
  for (let y = 0; y < height; y++) {
    const rowOff = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number;
      if (isGray) {
        r = g = b = Math.round(Math.min(1, Math.max(0, (img.data as Float32Array)[y * width + x])) * 255);
      } else {
        const p = (y * width + x) * 4;
        const d = img.data as Uint8Array;
        r = d[p]; g = d[p + 1]; b = d[p + 2];
      }
      const o = rowOff + x * 3;
      u8[o] = b; u8[o + 1] = g; u8[o + 2] = r;
    }
  }
  return u8;
}

export interface InkBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  empty: boolean;
}

/** Caixa delimitadora da "tinta" (pixels claros) — usada para zoom e diagnóstico. */
export function inkBox(img: GrayImage, threshold = 0.025): InkBox {
  let top = img.height, bottom = -1, left = img.width, right = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[y * img.width + x] > threshold) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { top, bottom, left, right, empty: bottom < 0 };
}

/** Estatísticas para alertar sobre imagens que fogem do preset (fundo claro, tamanho etc.). */
export function imageWarnings(img: GrayImage): string[] {
  const w: string[] = [];
  if (img.width !== 1024 || img.height !== 60) w.push(`Tamanho ${img.width}x${img.height} difere do preset 1024x60; a síntese usa os pixels como estão (sem reamostrar).`);
  let sum = 0;
  for (const v of img.data) sum += v;
  const mean = sum / img.data.length;
  if (mean > 0.5) w.push('Fundo parece claro: o preset espera fundo preto e texto branco. Considere inverter.');
  const box = inkBox(img);
  if (box.empty) w.push('Imagem sem pixels claros: o áudio será silêncio.');
  return w;
}

export function invertGray(img: GrayImage): GrayImage {
  const d = new Float32Array(img.data.length);
  for (let i = 0; i < d.length; i++) d[i] = 1 - img.data[i];
  return { width: img.width, height: img.height, data: d };
}
