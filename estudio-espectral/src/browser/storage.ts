/**
 * Armazenamento local (IndexedDB via Dexie) + backup ZIP.
 * IMPORTANTE: o navegador pode apagar estes dados (limpeza manual, pressão de
 * armazenamento, política do Safari para sites não usados). O backup ZIP é a
 * garantia real; "armazenamento persistente" reduz, mas não elimina, o risco.
 */
import Dexie, { type Table } from 'dexie';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodeBmp24 } from '../core/image';
import type { Project } from '../core/project';

export interface SnapshotRec {
  id: string;
  projectId: string;
  name: string; // AA_MM_DD-Nome_..._Vn
  createdAt: string;
  tags: string[];
  /** projeto congelado (imutável) */
  project: Project;
  /** resumo da exportação */
  summary: { seconds: number; occurrences: number; files: string[]; masterGain: number };
}

export interface MusicRec {
  id: string;
  name: string;
  type: string;
  size: number;
  seconds: number;
  addedAt: string;
  blob: Blob;
  licenseNote: string;
}

export interface LibraryRec {
  id: string;
  text: string;
  category: string;
  group: string;
  origin: 'usuario' | 'importado' | 'assistente';
  createdAt: string;
}

export interface KV {
  key: string;
  value: unknown;
}

class StudioDB extends Dexie {
  projects!: Table<Project, string>;
  snapshots!: Table<SnapshotRec, string>;
  music!: Table<MusicRec, string>;
  library!: Table<LibraryRec, string>;
  kv!: Table<KV, string>;
  constructor() {
    super('estudio-espectral');
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      snapshots: 'id, projectId, name, createdAt, *tags',
      music: 'id, name, addedAt',
      library: 'id, category, group, origin',
      kv: 'key',
    });
  }
}

export const db = new StudioDB();

// Uint8Array não sobrevive bem a JSON: converte para base64 no backup
function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function projToJson(p: Project) {
  return { ...p, phrases: p.phrases.map((f) => ({ ...f, pixels: b64(f.pixels) })) };
}
function projFromJson(p: ReturnType<typeof projToJson>): Project {
  return { ...p, phrases: p.phrases.map((f) => ({ ...f, pixels: unb64(f.pixels as unknown as string) })) } as Project;
}

export interface StorageStatus {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  opfs: boolean;
}

export async function storageStatus(): Promise<StorageStatus> {
  const s = navigator.storage;
  const est = s?.estimate ? await s.estimate().catch(() => null) : null;
  return {
    persisted: s?.persisted ? await s.persisted().catch(() => null) : null,
    usage: est?.usage ?? null,
    quota: est?.quota ?? null,
    opfs: typeof s?.getDirectory === 'function',
  };
}

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist().catch(() => null);
}

/** Backup completo em ZIP: JSON + BMPs legíveis + músicas originais. */
export async function exportBackup(): Promise<Blob> {
  const [projects, snapshots, music, library, kv] = await Promise.all([db.projects.toArray(), db.snapshots.toArray(), db.music.toArray(), db.library.toArray(), db.kv.toArray()]);
  const files: Record<string, Uint8Array> = {};
  files['backup.json'] = strToU8(
    JSON.stringify(
      {
        formato: 'estudio-espectral-backup',
        versao: 1,
        criadoEm: new Date().toISOString(),
        projetos: projects.map(projToJson),
        historico: snapshots.map((s) => ({ ...s, project: projToJson(s.project) })),
        biblioteca: library,
        musicas: music.map(({ blob: _b, ...m }) => m),
        configuracoes: kv,
      },
      null,
      1,
    ),
  );
  for (const p of projects) {
    p.phrases.forEach((f, i) => {
      const gray = { width: f.width, height: f.height, data: Float32Array.from(f.pixels, (v) => v / 255) };
      files[`projetos/${safe(p.name)}_${p.id}/frase_${String(i + 1).padStart(2, '0')}.bmp`] = encodeBmp24(gray);
    });
  }
  for (const m of music) files[`musicas/${m.id}_${safe(m.name)}`] = new Uint8Array(await m.blob.arrayBuffer());
  files['LEIA-ME.txt'] = strToU8(
    'Backup do Estúdio Espectral. Restaure pelo menu Histórico e backup > Importar backup.\n' +
      'Os BMPs em projetos/ são os pixels exatos usados na síntese.\n',
  );
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

export async function importBackup(file: Blob): Promise<{ projetos: number; historico: number; musicas: number; biblioteca: number }> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = files['backup.json'];
  if (!raw) throw new Error('Arquivo não é um backup do Estúdio Espectral (backup.json ausente).');
  const data = JSON.parse(strFromU8(raw));
  if (data.formato !== 'estudio-espectral-backup') throw new Error('Formato de backup desconhecido.');
  const musicFiles = Object.keys(files).filter((k) => k.startsWith('musicas/'));
  await db.transaction('rw', [db.projects, db.snapshots, db.music, db.library, db.kv], async () => {
    for (const p of data.projetos) await db.projects.put(projFromJson(p));
    for (const s of data.historico) await db.snapshots.put({ ...s, project: projFromJson(s.project) });
    for (const l of data.biblioteca) await db.library.put(l);
    for (const k of data.configuracoes ?? []) await db.kv.put(k);
    for (const m of data.musicas) {
      const key = musicFiles.find((k) => k.startsWith(`musicas/${m.id}_`));
      if (key) await db.music.put({ ...m, blob: new Blob([files[key]], { type: m.type }) });
    }
  });
  return { projetos: data.projetos.length, historico: data.historico.length, musicas: data.musicas.length, biblioteca: data.biblioteca.length };
}

export function safe(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'item';
}
