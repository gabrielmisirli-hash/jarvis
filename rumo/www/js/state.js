// Estado do app em memória + persistência no IndexedDB. Atualizações sempre criam objetos novos
// e só entram na memória depois de salvas (se salvar falhar, nada muda e o erro sobe).

import { kvGet, kvSet } from './db.js';
import { STATE_KEYS, parseBackup, makeBackup } from './lib/backup.js';

const DEFAULTS = Object.freeze({
  settings: { theme: 'dark', mapFlavor: 'dark', critical: false, compassCorrection: null },
  plan: { contacts: [], meetingPoints: [], notes: '' },
  medical: { people: [] },
  checklists: {},
  waypoints: [],
  tracks: [],
  meta: { lastBackup: null, lastDrill: null },
  target: null,
  trackDraft: null,
});

const KEYS = [...STATE_KEYS, 'trackDraft'];
let state = { ...DEFAULTS };
let loaded = false;
const listeners = new Set();

export async function loadState() {
  const values = await Promise.all(KEYS.map((k) => kvGet(k)));
  state = Object.fromEntries(
    KEYS.map((k, i) => {
      const v = values[i];
      const def = DEFAULTS[k];
      if (v === undefined || v === null) return [k, def];
      const isPlain = def && typeof def === 'object' && !Array.isArray(def);
      return [k, isPlain ? { ...def, ...v } : v];
    }),
  );
  loaded = true;
  return state;
}

export const getState = () => state;

function assertWritable(key) {
  if (!KEYS.includes(key)) throw new Error(`Chave desconhecida: ${key}`);
  // Sem carregar os dados salvos, gravar agora sobrescreveria o que existe com valores vazios.
  if (!loaded) throw new Error('Os dados salvos não carregaram. Feche e abra o app antes de alterar algo.');
}

function commit(key, next) {
  state = { ...state, [key]: next };
  listeners.forEach((l) => l(key, state));
}

/** Atualiza uma chave com uma função pura (antigo -> novo), salva e só então aplica. */
export async function update(key, fn) {
  assertWritable(key);
  const next = fn(state[key]);
  await kvSet(key, next);
  commit(key, next);
  return next;
}

/** Atualiza só na memória (para dados muito frequentes, como pontos da trilha). Salve depois com persist(). */
export function updateInMemory(key, fn) {
  assertWritable(key);
  const next = fn(state[key]);
  commit(key, next);
  return next;
}

export async function persist(key) {
  assertWritable(key);
  await kvSet(key, state[key]);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function exportBackup() {
  return makeBackup(state);
}

export async function importBackup(raw) {
  const clean = parseBackup(raw);
  for (const key of STATE_KEYS) await update(key, () => clean[key]);
  return clean;
}
