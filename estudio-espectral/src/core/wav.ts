/** WAV PCM: cabeçalho, codificação em blocos (streaming) e decodificação para validação. */

export function wavHeader(totalFrames: number, sampleRate: number, channels: number, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const dataBytes = totalFrames * blockAlign;
  if (dataBytes + 36 > 0xffffffff) throw new Error('Arquivo excede o limite de 4 GB do formato WAV.');
  const h = new Uint8Array(44);
  const dv = new DataView(h.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) h[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, dataBytes, true);
  return h;
}

/** Converte float [-1,1] -> PCM16 intercalado. Conta amostras saturadas. */
export function encodePcm16(channels: Float32Array[], stats?: { clipped: number }): Uint8Array {
  const nCh = channels.length;
  const n = channels[0].length;
  const out = new Uint8Array(n * nCh * 2);
  const dv = new DataView(out.buffer);
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      let v = channels[c][i];
      if (v > 1) { v = 1; clipped++; } else if (v < -1) { v = -1; clipped++; }
      const s = v < 0 ? Math.max(-32768, Math.round(v * 32768)) : Math.min(32767, Math.round(v * 32767));
      dv.setInt16((i * nCh + c) * 2, s, true);
    }
  }
  if (stats) stats.clipped += clipped;
  return out;
}

export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const body = encodePcm16(channels);
  const head = wavHeader(channels[0].length, sampleRate, channels.length);
  const all = new Uint8Array(head.length + body.length);
  all.set(head, 0);
  all.set(body, head.length);
  return all;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: 'pcm' | 'float';
  frames: number;
  dataOffset: number;
  dataBytes: number;
}

export function parseWavHeader(u8: Uint8Array): WavInfo {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o: number) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Não é um arquivo WAV (RIFF/WAVE).');
  let off = 12;
  let fmt: Omit<WavInfo, 'frames' | 'dataOffset' | 'dataBytes'> | null = null;
  while (off + 8 <= u8.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      let code = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const sampleRate = dv.getUint32(body + 4, true);
      const bitsPerSample = dv.getUint16(body + 14, true);
      if (code === 0xfffe && size >= 40) code = dv.getUint16(body + 24, true);
      if (code !== 1 && code !== 3) throw new Error(`Formato WAV não suportado (código ${code}).`);
      fmt = { sampleRate, channels, bitsPerSample, format: code === 3 ? 'float' : 'pcm' };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV inválido: bloco data antes de fmt.');
      const dataBytes = Math.min(size, u8.length - body);
      const frames = Math.floor(dataBytes / ((fmt.channels * fmt.bitsPerSample) / 8));
      return { ...fmt, frames, dataOffset: body, dataBytes };
    }
    off = body + size + (size & 1);
  }
  throw new Error('WAV inválido: bloco data ausente.');
}

/** Decodifica WAV (PCM 8/16/24/32 ou float32) em canais float. */
export function decodeWav(u8: Uint8Array): { info: WavInfo; channels: Float32Array[] } {
  const info = parseWavHeader(u8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const { channels: nCh, frames, bitsPerSample: bits, dataOffset } = info;
  const bps = bits / 8;
  const chans = Array.from({ length: nCh }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const o = dataOffset + (i * nCh + c) * bps;
      let v: number;
      if (info.format === 'float') v = bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
      else if (bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (bits === 24) {
        let x = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16);
        if (x & 0x800000) x |= ~0xffffff;
        v = x / 8388608;
      } else if (bits === 32) v = dv.getInt32(o, true) / 2147483648;
      else v = (u8[o] - 128) / 128;
      chans[c][i] = v;
    }
  }
  return { info, channels: chans };
}

export interface WavValidation {
  ok: boolean;
  problems: string[];
  info: WavInfo | null;
  durationSeconds: number;
  channelsIdentical: boolean | null;
  peak: number;
  rms: number;
  silent: boolean;
}

/** Valida cabeçalho, duração, estéreo, tamanho e conteúdo de um WAV exportado. */
export function validateWav(
  u8: Uint8Array,
  expect: { sampleRate?: number; channels?: number; frames?: number; expectIdenticalChannels?: boolean },
): WavValidation {
  const problems: string[] = [];
  let info: WavInfo | null = null;
  try {
    info = parseWavHeader(u8);
  } catch (e) {
    return { ok: false, problems: [(e as Error).message], info: null, durationSeconds: 0, channelsIdentical: null, peak: 0, rms: 0, silent: true };
  }
  if (expect.sampleRate && info.sampleRate !== expect.sampleRate) problems.push(`Taxa ${info.sampleRate} Hz ≠ ${expect.sampleRate} Hz.`);
  if (expect.channels && info.channels !== expect.channels) problems.push(`Canais ${info.channels} ≠ ${expect.channels}.`);
  if (expect.frames !== undefined && info.frames !== expect.frames) problems.push(`Amostras ${info.frames} ≠ ${expect.frames}.`);
  if (info.dataOffset + info.dataBytes !== u8.length) problems.push('Tamanho do arquivo não corresponde ao cabeçalho.');
  const { channels } = decodeWav(u8);
  let peak = 0, s = 0, identical = true;
  for (let i = 0; i < info.frames; i++) {
    const l = channels[0][i];
    peak = Math.max(peak, Math.abs(l));
    s += l * l;
    if (channels.length > 1 && channels[1][i] !== l) identical = false;
  }
  const r = Math.sqrt(s / Math.max(1, info.frames));
  const silent = peak < 1e-4;
  if (silent) problems.push('Áudio silencioso.');
  if (expect.expectIdenticalChannels && channels.length > 1 && !identical) problems.push('Canais L e R deveriam ser idênticos na camada espectral.');
  return {
    ok: problems.length === 0,
    problems,
    info,
    durationSeconds: info.frames / info.sampleRate,
    channelsIdentical: channels.length > 1 ? identical : null,
    peak,
    rms: r,
    silent,
  };
}
