/** Modelo do projeto, nomeação de arquivos, aprovação e importação de frases (CSV/TXT/XLSX). */
import { unzipSync, strFromU8 } from 'fflate';
import { DEFAULT_GAP_MS, DEFAULT_TOTAL_SECONDS } from './constants';
import type { MappingConfig } from './mapping';
import type { MixSettings } from './mixer';
import { DEFAULT_MIX } from './mixer';
import type { EndMode } from './sequence';
import type { SynthParams } from './synth';
import { DEFAULT_SYNTH } from './synth';

export type PhraseSource = 'bmp-original' | 'texto';

export interface TextRenderOptions {
  font: string;
  uppercase: boolean;
  capHeightPx: number;
  baselineRow: number;
  marginPx: number;
}

export const DEFAULT_TEXT_RENDER: TextRenderOptions = { font: 'Arimo', uppercase: true, capHeightPx: 28, baselineRow: 44, marginPx: 12 };

export interface PhraseItem {
  id: string;
  /** texto informado pelo usuário (no caso de BMP importado: rótulo/transcrição manual, NÃO OCR) */
  text: string;
  source: PhraseSource;
  /** nome do arquivo original quando importado */
  fileName?: string;
  /** pixels 0..255 em tons de cinza (W*H) — fonte de verdade da síntese */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** parâmetros usados quando gerado a partir de texto */
  textRender?: TextRenderOptions;
}

export interface ProjectSettings {
  totalSeconds: number;
  gapMs: number;
  endMode: EndMode;
  synth: SynthParams;
  mix: MixSettings;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  totalSeconds: DEFAULT_TOTAL_SECONDS,
  gapMs: DEFAULT_GAP_MS,
  endMode: 'completas',
  synth: DEFAULT_SYNTH,
  mix: DEFAULT_MIX,
};

export interface Project {
  id: string;
  name: string;
  tags: string[];
  phrases: PhraseItem[];
  settings: ProjectSettings;
  /** hash da sequência aprovada; null = não aprovada */
  approvedHash: string | null;
  createdAt: string;
  updatedAt: string;
}

/** FNV-1a 32 bits (rápido, suficiente para detectar alteração — não é criptográfico). */
export function fnv1a(parts: (string | Uint8Array)[]): string {
  let h = 0x811c9dc5;
  const mix = (b: number) => { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; };
  for (const p of parts) {
    if (typeof p === 'string') for (let i = 0; i < p.length; i++) { const c = p.charCodeAt(i); mix(c & 0xff); mix(c >> 8); }
    else for (let i = 0; i < p.length; i++) mix(p[i]);
    mix(0x1f);
  }
  return h.toString(16).padStart(8, '0');
}

/** Hash do que será sintetizado: ordem, textos, pixels e mapeamento. Qualquer edição invalida a aprovação. */
export function sequenceHash(phrases: PhraseItem[], mapping: MappingConfig): string {
  const parts: (string | Uint8Array)[] = [JSON.stringify(mapping)];
  for (const p of phrases) parts.push(p.id, p.text, `${p.width}x${p.height}`, p.pixels);
  return fnv1a(parts);
}

export function isApproved(p: Project): boolean {
  return p.approvedHash !== null && p.approvedHash === sequenceHash(p.phrases, p.settings.synth.mapping);
}

function sanitize(raw: string, max = 42): string {
  return (
    raw
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, max) || 'Criacao'
  );
}

function fmtNum(v: number): string {
  return String(+v.toFixed(2)).replace('.', '_');
}

/**
 * Prefixo sem versão: AA_MM_DD-Nome_frase_Solf528_Iso7_83 (DATA LOCAL do dispositivo).
 * Exemplo do pedido: 26_11_25-Nome_frase_Solf528_Iso7_83_V1.
 */
export function namePrefix(name: string, s: ProjectSettings, now: Date = new Date(), hasMusic = false): string {
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const tags = ['frase'];
  const m = s.mix;
  if (m.tone.freqHz > 0 && m.tone.gain > 0 && !m.tone.mute) tags.push('Solf' + fmtNum(m.tone.freqHz));
  if (m.iso.rateHz > 0 && m.iso.gain > 0 && !m.iso.mute) tags.push('Iso' + fmtNum(m.iso.rateHz));
  if (m.binaural.beatHz > 0 && m.binaural.gain > 0 && !m.binaural.mute) tags.push('Bina' + fmtNum(m.binaural.beatHz));
  if (hasMusic && m.music.gain > 0 && !m.music.mute) tags.push('Musica');
  if (m.noise.kind !== 'nenhum' && m.noise.kind !== 'silencio' && m.noise.gain > 0 && !m.noise.mute) tags.push('Ruido' + sanitize(m.noise.kind, 10));
  return `${yy}_${mm}_${dd}-${sanitize(name)}_${tags.join('_')}`;
}

/** Próximo nome livre: nunca sobrescreve (V1, V2, ...). */
export function nextVersionName(prefix: string, existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let v = 1; v < 100000; v++) {
    const n = `${prefix}_V${v}`;
    if (!used.has(n)) return n;
  }
  throw new Error('Número máximo de versões alcançado.');
}

// ---------- importação de frases ----------

const HEADER_WORDS = new Set(['frase', 'frases', 'texto', 'afirmação', 'afirmacao', 'phrase', 'text']);

function stripHeader(rows: string[]): string[] {
  if (rows.length && HEADER_WORDS.has(rows[0].trim().toLocaleLowerCase('pt-BR'))) return rows.slice(1);
  return rows;
}

/** CSV com detecção de delimitador (, ; tab) e aspas; usa a primeira coluna. */
export function parseCsv(text: string): string[] {
  text = text.replace(/^﻿/, '');
  const sample = text.slice(0, 4096);
  const counts = [',', ';', '\t'].map((d) => [d, sample.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 1 ? counts[0][0] : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return stripHeader(rows.map((r) => (r[0] ?? '').trim()).filter(Boolean));
}

export function parseTxt(text: string): string[] {
  return stripHeader(text.replace(/^﻿/, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** XLSX mínimo (sem SheetJS): lê a primeira coluna da primeira planilha. */
export function parseXlsx(buf: Uint8Array): string[] {
  const files = unzipSync(buf);
  const shared: string[] = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) {
    const xml = strFromU8(ss);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1]));
      shared.push(texts.join(''));
    }
  }
  const sheetName = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('Planilha não encontrada no arquivo XLSX.');
  const xml = strFromU8(files[sheetName]);
  const rows: string[] = [];
  for (const r of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells = [...r.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
    let first = '';
    for (const c of cells) {
      const attrs = c[1], body = c[2] ?? '';
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let v = '';
      if (t === 's') v = shared[+(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? -1)] ?? '';
      else if (t === 'inlineStr') v = xmlUnescape([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
      else v = xmlUnescape(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      if (v.trim()) { first = v.trim(); break; }
    }
    if (first) rows.push(first);
  }
  return stripHeader(rows);
}

export function toCsv(lines: string[]): string {
  return '﻿frase\r\n' + lines.map((l) => '"' + l.replace(/"/g, '""') + '"').join('\r\n') + '\r\n';
}

export function uid(): string {
  const a = new Uint8Array(8);
  (globalThis.crypto ?? { getRandomValues: (x: Uint8Array) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
