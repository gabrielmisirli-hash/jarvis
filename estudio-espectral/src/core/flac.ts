/**
 * Codificador FLAC próprio (sem perdas), em streaming, 16 bits.
 * Subquadros CONSTANT / FIXED (ordens 0–4) / VERBATIM, resíduo Rice com partições,
 * estéreo independente ou esquerdo/lateral (ótimo para a camada espectral, onde L = R).
 * STREAMINFO com total de amostras conhecido; MD5 zerado (permitido pela especificação: "desconhecido").
 */

class BitWriter {
  buf = new Uint8Array(1 << 16);
  len = 0; // bytes completos
  acc = 0; // bits pendentes (até 32)
  nacc = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap);
    b.set(this.buf.subarray(0, this.len));
    this.buf = b;
  }
  /** escreve até 24 bits por chamada */
  bits(v: number, n: number) {
    if (n > 24) { this.bits(Math.floor(v / 2 ** 24) & ((1 << (n - 24)) - 1), n - 24); v = v & 0xffffff; n = 24; }
    this.acc = (this.acc << n) | (v & ((1 << n) - 1));
    this.nacc += n;
    this.ensure(4);
    while (this.nacc >= 8) {
      this.nacc -= 8;
      this.buf[this.len++] = (this.acc >>> this.nacc) & 0xff;
    }
    this.acc &= (1 << this.nacc) - 1;
  }
  signed(v: number, n: number) {
    this.bits(v < 0 ? v + (1 << n) : v, n);
  }
  unary(q: number) {
    while (q >= 24) { this.bits(0, 24); q -= 24; }
    this.bits(1, q + 1);
  }
  align() {
    if (this.nacc) this.bits(0, 8 - this.nacc);
  }
  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  CRC8[i] = c;
  let d = i << 8;
  for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff;
  CRC16[i] = d;
}
const crc8 = (b: Uint8Array, a: number, e: number) => { let c = 0; for (let i = a; i < e; i++) c = CRC8[c ^ b[i]]; return c; };
const crc16 = (b: Uint8Array, a: number, e: number) => { let c = 0; for (let i = a; i < e; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]]; return c; };

/** Número do quadro codificado como no UTF-8 estendido (até 36 bits). */
function utf8Num(w: BitWriter, v: number) {
  if (v < 0x80) return w.bits(v, 8);
  const bytes: number[] = [];
  let n = 1;
  while (v >= 2 ** (6 * n + (6 - n))) n++;
  for (let i = 0; i < n; i++) { bytes.unshift(0x80 | (v & 0x3f)); v = Math.floor(v / 64); }
  const lead = (0xff << (7 - n)) & 0xff;
  w.bits(lead | v, 8);
  for (const b of bytes) w.bits(b, 8);
}

function residualCost(res: Int32Array, from: number, to: number): { bits: number; k: number } {
  let sum = 0;
  for (let i = from; i < to; i++) { const r = res[i]; sum += r >= 0 ? 2 * r : -2 * r - 1; }
  const n = to - from;
  if (n <= 0) return { bits: 4, k: 0 };
  let k = 0;
  const mean = sum / n;
  while (k < 14 && (1 << (k + 1)) <= mean) k++;
  // custo exato com esse k
  let bits = 4;
  for (let i = from; i < to; i++) { const r = res[i]; const u = r >= 0 ? 2 * r : -2 * r - 1; bits += (u >>> k) + 1 + k; }
  return { bits, k };
}

function writeSubframe(w: BitWriter, x: Int32Array, bps: number) {
  const n = x.length;
  let constant = true;
  for (let i = 1; i < n; i++) if (x[i] !== x[0]) { constant = false; break; }
  if (constant) { w.bits(0, 8); w.signed(x[0], bps); return; }
  // escolhe a ordem fixa com menor soma de |resíduo|
  const res = [0, 1, 2, 3, 4].map(() => new Int32Array(n));
  for (let i = 0; i < n; i++) {
    const a = x[i], b = i > 0 ? x[i - 1] : 0, c = i > 1 ? x[i - 2] : 0, d = i > 2 ? x[i - 3] : 0, e = i > 3 ? x[i - 4] : 0;
    res[0][i] = a;
    res[1][i] = a - b;
    res[2][i] = a - 2 * b + c;
    res[3][i] = a - 3 * b + 3 * c - d;
    res[4][i] = a - 4 * b + 6 * c - 4 * d + e;
  }
  let best = { order: -1, bits: n * bps, parts: 0, ks: [] as number[] };
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    for (let po = 0; po <= 6; po++) {
      const parts = 1 << po;
      if (n % parts || n / parts <= order) break;
      const size = n / parts;
      let bits = order * bps + 6, ok = true;
      const ks: number[] = [];
      for (let p = 0; p < parts; p++) {
        const c = residualCost(res[order], p === 0 ? order : p * size, (p + 1) * size);
        if (c.k > 14) { ok = false; break; }
        bits += c.bits;
        ks.push(c.k);
      }
      if (ok && bits < best.bits) best = { order, bits, parts: po, ks };
    }
  }
  if (best.order < 0) {
    w.bits(0b00000010, 8); // VERBATIM
    for (let i = 0; i < n; i++) w.signed(x[i], bps);
    return;
  }
  w.bits(0x10 | (best.order << 1), 8); // FIXED: 0 001xxx 0
  for (let i = 0; i < best.order; i++) w.signed(x[i], bps);
  w.bits(0, 2); // Rice, parâmetros de 4 bits
  w.bits(best.parts, 4);
  const parts = 1 << best.parts, size = n / parts, r = res[best.order];
  for (let p = 0; p < parts; p++) {
    const k = best.ks[p];
    w.bits(k, 4);
    for (let i = p === 0 ? best.order : p * size; i < (p + 1) * size; i++) {
      const v = r[i];
      const u = v >= 0 ? 2 * v : -2 * v - 1;
      w.unary(u >>> k);
      if (k) w.bits(u & ((1 << k) - 1), k);
    }
  }
}

export class FlacEncoder {
  private frame = 0;
  private pendL: Int16Array;
  private pendR: Int16Array;
  private pend = 0;
  constructor(private sampleRate: number, private totalFrames: number, private blockSize = 4096) {
    this.pendL = new Int16Array(blockSize);
    this.pendR = new Int16Array(blockSize);
  }

  header(): Uint8Array {
    const w = new BitWriter();
    for (const c of 'fLaC') w.bits(c.charCodeAt(0), 8);
    w.bits(0x80, 8); // último bloco de metadados, tipo 0 = STREAMINFO
    w.bits(34, 24);
    w.bits(this.blockSize, 16);
    w.bits(this.blockSize, 16);
    w.bits(0, 24);
    w.bits(0, 24);
    w.bits(this.sampleRate, 20);
    w.bits(1, 3); // 2 canais
    w.bits(15, 5); // 16 bits
    w.bits(Math.floor(this.totalFrames / 2 ** 32), 4);
    w.bits(Math.floor(this.totalFrames / 65536) % 65536, 16);
    w.bits(this.totalFrames % 65536, 16);
    for (let i = 0; i < 16; i++) w.bits(0, 8); // MD5 desconhecido
    return w.bytes();
  }

  private encodeFrame(L: Int16Array, R: Int16Array, n: number): Uint8Array {
    const w = new BitWriter();
    let same = true;
    for (let i = 0; i < n; i++) if (L[i] !== R[i]) { same = false; break; }
    w.bits(0xfff8, 16); // sync + bloco fixo
    w.bits(0b0111, 4); // tamanho do bloco: 16 bits no fim do cabeçalho
    w.bits(0b0000, 4); // taxa: do STREAMINFO
    w.bits(same ? 0b1000 : 0b0001, 4); // esquerdo/lateral ou independente
    w.bits(0b100, 3); // 16 bits
    w.bits(0, 1);
    utf8Num(w, this.frame++);
    w.bits(n - 1, 16);
    const hb = w.bytes();
    w.bits(crc8(hb, 0, hb.length), 8);
    const left = new Int32Array(n), right = new Int32Array(n);
    for (let i = 0; i < n; i++) { left[i] = L[i]; right[i] = R[i]; }
    writeSubframe(w, left, 16);
    if (same) writeSubframe(w, new Int32Array(n), 17); // lateral = L - R = 0
    else writeSubframe(w, right, 16);
    w.align();
    const body = w.bytes();
    const c = crc16(body, 0, body.length);
    const out = new Uint8Array(body.length + 2);
    out.set(body);
    out[body.length] = c >> 8;
    out[body.length + 1] = c & 0xff;
    return out;
  }

  encode(L: Int16Array, R: Int16Array): Uint8Array {
    const chunks: Uint8Array[] = [];
    let i = 0;
    while (i < L.length) {
      const take = Math.min(this.blockSize - this.pend, L.length - i);
      this.pendL.set(L.subarray(i, i + take), this.pend);
      this.pendR.set(R.subarray(i, i + take), this.pend);
      this.pend += take;
      i += take;
      if (this.pend === this.blockSize) {
        chunks.push(this.encodeFrame(this.pendL, this.pendR, this.blockSize));
        this.pend = 0;
      }
    }
    return concat(chunks);
  }

  finish(): Uint8Array {
    if (!this.pend) return new Uint8Array(0);
    const out = this.encodeFrame(this.pendL.subarray(0, this.pend), this.pendR.subarray(0, this.pend), this.pend);
    this.pend = 0;
    return out;
  }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
