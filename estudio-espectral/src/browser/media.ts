/** Integração com o navegador: texto->BMP (Canvas), importação de imagem/áudio, download, reprodução. */
import '@fontsource/arimo/400.css';
import '@fontsource/roboto-condensed/400.css';
import { SR } from '../core/constants';
import { decodeBmp, lumaPIL } from '../core/image';
import type { TextRenderOptions } from '../core/project';

export const FONTS: { id: string; label: string; css: string }[] = [
  { id: 'Arimo', label: 'Arimo (métrica do Arial — mais próxima das referências)', css: '"Arimo"' },
  { id: 'Roboto Condensed', label: 'Roboto Condensed (estreita, como Arial Narrow)', css: '"Roboto Condensed"' },
  { id: 'sans-serif', label: 'Sans-serif do sistema (varia por aparelho)', css: 'sans-serif' },
];

/** Renderiza texto em 1024x60, fundo preto, texto branco, base na linha indicada (padrão: geometria das referências). */
export async function textToPixels(text: string, o: TextRenderOptions, width = 1024, height = 60): Promise<Uint8Array> {
  const font = FONTS.find((f) => f.id === o.font) ?? FONTS[0];
  if (font.id !== 'sans-serif' && document.fonts) {
    await document.fonts.load(`100px ${font.css}`, text).catch(() => undefined);
  }
  const content = o.uppercase ? text.toLocaleUpperCase('pt-BR') : text;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  // tamanho tal que a altura da maiúscula "H" = capHeightPx
  g.font = `100px ${font.css}`;
  const capAt100 = g.measureText('H').actualBoundingBoxAscent || 72;
  let size = (100 * o.capHeightPx) / capAt100;
  g.font = `${size}px ${font.css}`;
  const maxW = width - 2 * o.marginPx;
  const w0 = g.measureText(content).width;
  if (w0 > maxW) {
    size *= maxW / w0;
    g.font = `${size}px ${font.css}`;
  }
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'center';
  g.fillText(content, width / 2, o.baselineRow + 1);
  const d = g.getImageData(0, 0, width, height).data;
  const px = new Uint8Array(width * height);
  for (let i = 0; i < px.length; i++) px[i] = lumaPIL(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  return px;
}

/** Importa imagem: BMP via decodificador próprio (pixels intactos); PNG/JPG via navegador. */
export async function importImage(file: File): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    const rgba = decodeBmp(buf);
    const px = new Uint8Array(rgba.width * rgba.height);
    for (let i = 0; i < px.length; i++) px[i] = lumaPIL(rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]);
    return { pixels: px, width: rgba.width, height: rgba.height };
  }
  const bmp = await createImageBitmap(new Blob([buf]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const px = new Uint8Array(c.width * c.height);
  for (let i = 0; i < px.length; i++) px[i] = lumaPIL(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  return { pixels: px, width: c.width, height: c.height };
}

export function pixelsToCanvas(canvas: HTMLCanvasElement, pixels: Uint8Array, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = pixels[i];
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Decodifica áudio importado já em 22050 Hz estéreo. MP3/M4A/FLAC/OGG dependem do decodificador do navegador. */
export async function decodeAudioFile(file: Blob): Promise<{ left: Float32Array; right: Float32Array; peak: number; seconds: number }> {
  const data = await file.arrayBuffer();
  let buf: AudioBuffer;
  try {
    const off = new OfflineAudioContext(2, 1, SR);
    buf = await off.decodeAudioData(data.slice(0));
  } catch {
    // alguns navegadores recusam OfflineAudioContext a 22050 Hz: decodifica na taxa nativa e reamostra
    const ac = new AudioContext();
    try {
      const native = await ac.decodeAudioData(data.slice(0));
      buf = await resampleBuffer(native, SR);
    } catch {
      throw new Error('Este navegador não conseguiu decodificar o arquivo. WAV e MP3 funcionam em todos os navegadores-alvo; OGG pode falhar no Safari/iOS. Converta para WAV ou MP3.');
    } finally {
      void ac.close();
    }
  }
  const left = Float32Array.from(buf.getChannelData(0));
  const right = buf.numberOfChannels > 1 ? Float32Array.from(buf.getChannelData(1)) : Float32Array.from(left);
  let peak = 0;
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  return { left, right, peak, seconds: left.length / SR };
}

async function resampleBuffer(b: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const frames = Math.ceil((b.length * rate) / b.sampleRate);
  const off = new OfflineAudioContext(Math.min(2, b.numberOfChannels), frames, rate);
  const src = off.createBufferSource();
  src.buffer = b;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

/** Salva um arquivo: download direto; no iOS, oferece o menu Compartilhar quando suportado. */
export async function saveFile(blob: Blob, name: string): Promise<'download' | 'share'> {
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && 'canShare' in navigator) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'share';
      } catch {
        /* usuário cancelou: cai para download */
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'download';
}

/** Reprodutor simples (Web Audio) para as prévias. */
class Player {
  private ac: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  onEnd: (() => void) | null = null;
  async play(left: Float32Array, right: Float32Array, sampleRate = SR) {
    this.stop();
    this.ac ??= new AudioContext();
    if (this.ac.state === 'suspended') await this.ac.resume();
    const b = this.ac.createBuffer(2, left.length, sampleRate);
    b.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    b.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    const s = this.ac.createBufferSource();
    s.buffer = b;
    s.connect(this.ac.destination);
    s.onended = () => { if (this.src === s) { this.src = null; this.onEnd?.(); } };
    s.start();
    this.src = s;
  }
  stop() {
    if (this.src) {
      const s = this.src;
      this.src = null;
      try { s.stop(); } catch { /* já parado */ }
    }
  }
  get playing() {
    return this.src !== null;
  }
}
export const player = new Player();
