// Pacote de mapa offline: baixa em partes (com verificação SHA-256), guarda no IndexedDB
// e só troca o mapa antigo depois que o novo chegou inteiro.

import { kvGet, kvSet, kvDel, blobGet, blobSet, blobDel, blobKeys } from './db.js';

export const DEFAULT_PACK = 'rio';
const PACK_KEY = 'mapPack';
const POIS_KEY = 'pois';
const PMTILES_MAGIC = 'PMTiles';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function validateManifest(m) {
  const ok = m && m.format === 1 && typeof m.name === 'string' && Array.isArray(m.parts) && m.parts.length > 0
    && m.parts.every((p) => typeof p.file === 'string' && /^part-\d{3}\.bin$/.test(p.file) && Number.isFinite(p.size) && /^[0-9a-f]{64}$/.test(p.sha256));
  if (!ok) throw new Error('Manifesto do mapa inválido');
  return m;
}

function validatePois(data) {
  if (!data || data.format !== 1 || !Array.isArray(data.items)) throw new Error('Lista de pontos inválida');
  return data.items
    .filter((it) => Array.isArray(it) && typeof it[0] === 'string' && Number.isFinite(it[2]) && Number.isFinite(it[3]))
    .map(([kind, name, lat, lon, phone]) => ({ kind, name: String(name || ''), lat, lon, phone: String(phone || '') }));
}

export async function fetchManifest(name = DEFAULT_PACK) {
  const res = await fetch(`maps/${name}/manifest.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Mapa não encontrado no servidor (HTTP ${res.status})`);
  return validateManifest(await res.json());
}

export const getInstalledPack = () => kvGet(PACK_KEY);

export async function getPois() {
  return (await kvGet(POIS_KEY)) || [];
}

async function ensureSpace(bytes) {
  if (!navigator.storage?.estimate) return;
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  if (quota && quota - usage < bytes * 1.1) {
    throw new Error(`Espaço insuficiente: precisa de ${Math.ceil(bytes / 1048576)} MB livres`);
  }
}

async function downloadPart(name, part) {
  const res = await fetch(`maps/${name}/${part.file}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao baixar ${part.file} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength !== part.size) throw new Error(`${part.file} veio incompleto`);
  const digest = hex(await crypto.subtle.digest('SHA-256', buf));
  if (digest !== part.sha256) throw new Error(`${part.file} veio corrompido`);
  return new Blob([buf]);
}

/** Remove todos os pedaços de mapa, menos os do pacote `keepPrefix` (inclui sobras de downloads interrompidos). */
async function deleteMapBlobsExcept(keepPrefix) {
  const keys = await blobKeys();
  const stale = keys.filter((k) => String(k).startsWith('map:') && !(keepPrefix && String(k).startsWith(`${keepPrefix}:`)));
  await Promise.all(stale.map((k) => blobDel(k)));
}

async function bytesStored(prefix, count) {
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => blobGet(`${prefix}:${i}`)));
  return parts.reduce((sum, p) => sum + (p?.size || 0), 0);
}

/** Baixa (ou atualiza) o pacote. onProgress(0..1, texto). */
export async function downloadPack(name = DEFAULT_PACK, onProgress = () => {}) {
  const manifest = await fetchManifest(name);
  const installed = await getInstalledPack();
  if (installed?.createdAt === manifest.createdAt && installed?.complete) return { pack: installed, updated: false };
  const prefix = `map:${name}:${manifest.createdAt}`;
  await ensureSpace(manifest.size - (await bytesStored(prefix, manifest.parts.length))); // retomada: só o que falta
  let done = 0;
  try {
    for (const [i, part] of manifest.parts.entries()) {
      onProgress(done / manifest.size, `Baixando parte ${i + 1} de ${manifest.parts.length}`);
      const existing = await blobGet(`${prefix}:${i}`);
      if (!existing || existing.size !== part.size) await blobSet(`${prefix}:${i}`, await downloadPart(name, part));
      done += part.size;
    }
    onProgress(0.98, 'Baixando hospitais, água e abrigos');
    const poisRes = await fetch(`maps/${name}/pois.json`, { cache: 'no-store' });
    const pois = poisRes.ok ? validatePois(await poisRes.json()) : null;
    const pack = {
      name, label: manifest.label, bbox: manifest.bbox, center: manifest.center, maxZoom: manifest.maxZoom,
      declination: manifest.declination, attribution: manifest.attribution, createdAt: manifest.createdAt,
      size: manifest.size, parts: manifest.parts.length, prefix, installedAt: new Date().toISOString(), complete: true,
    };
    if (pois) await kvSet(POIS_KEY, pois);
    await kvSet(PACK_KEY, pack);
    await deleteMapBlobsExcept(prefix);
    onProgress(1, 'Pronto');
    return { pack, updated: true };
  } catch (err) {
    // O mapa antigo continua valendo; as partes novas ficam para retomar depois.
    throw new Error(`Download interrompido: ${err.message}. O mapa anterior continua funcionando.`);
  }
}

/** Importa um arquivo .pmtiles (por exemplo, recebido por AirDrop ou salvo no app Arquivos). */
export async function importPmtiles(file) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const magic = new TextDecoder().decode(head.subarray(0, 7));
  if (magic !== PMTILES_MAGIC || head[7] !== 3) throw new Error('Arquivo não é um mapa PMTiles v3');
  await ensureSpace(file.size);
  const installed = await getInstalledPack();
  const prefix = `map:importado:${Date.now()}`;
  try {
    await blobSet(`${prefix}:0`, file.slice(0, file.size));
  } catch (err) {
    await blobDel(`${prefix}:0`).catch(() => undefined);
    throw err;
  }
  const pack = {
    name: 'importado', label: file.name.replace(/\.pmtiles$/i, ''), bbox: null, center: null, maxZoom: null,
    declination: installed?.declination ?? 0, attribution: '© OpenStreetMap', createdAt: new Date(file.lastModified || Date.now()).toISOString(),
    size: file.size, parts: 1, prefix, installedAt: new Date().toISOString(), complete: true,
  };
  await kvSet(PACK_KEY, pack);
  await deleteMapBlobsExcept(prefix);
  return pack;
}

export async function loadPackBlob(pack) {
  const parts = await Promise.all(Array.from({ length: pack.parts }, (_, i) => blobGet(`${pack.prefix}:${i}`)));
  if (parts.some((p) => !p)) throw new Error('Mapa incompleto no aparelho. Baixe de novo em Preparo › Mapa offline.');
  return new Blob(parts);
}

export async function removePack() {
  await kvDel(PACK_KEY);
  await deleteMapBlobsExcept(null);
}
