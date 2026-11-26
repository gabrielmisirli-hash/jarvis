import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, fnv1a, type PhraseItem, type Project, uid } from '../core/project';
import { engine } from '../browser/engine';
import { db, type MusicRec } from '../browser/storage';
import type { SynthRes } from '../workers/protocol';
import { decodeAudioFile } from '../browser/media';

export function newProject(name = 'Meu projeto'): Project {
  const now = new Date().toISOString();
  return { id: uid(), name, tags: [], phrases: [], settings: structuredClone(DEFAULT_SETTINGS), approvedHash: null, createdAt: now, updatedAt: now };
}

function deepMerge<T>(d: T, s: unknown): T {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return (s === undefined || s === null ? d : s) as T;
  const out: Record<string, unknown> = {};
  const src = (s ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(d as object)) out[k] = deepMerge((d as Record<string, unknown>)[k], src[k]);
  return out as T;
}

/** Migra projetos salvos com campos faltando (compatibilidade entre versões do app). */
function hydrate(p: Project): Project {
  return { ...p, settings: deepMerge(structuredClone(DEFAULT_SETTINGS), p.settings) };
}

interface Ctx {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  replaceProject: (p: Project) => void;
  status: string;
  setStatus: (s: string) => void;
  synthOf: (ph: PhraseItem) => Promise<SynthRes>;
  musicList: MusicRec[];
  refreshMusic: () => Promise<void>;
  loadMusic: (id: string) => Promise<{ left: Float32Array; right: Float32Array; peak: number; seconds: number } | null>;
}

const C = createContext<Ctx | null>(null);
export const useStudio = () => {
  const c = useContext(C);
  if (!c) throw new Error('StudioProvider ausente');
  return c;
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project>(() => newProject());
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('Pronto. Tudo é processado neste dispositivo.');
  const [musicList, setMusicList] = useState<MusicRec[]>([]);
  const synthCache = useRef(new Map<string, Promise<SynthRes>>());
  const musicCache = useRef(new Map<string, Promise<{ left: Float32Array; right: Float32Array; peak: number; seconds: number }>>());

  useEffect(() => {
    void (async () => {
      const cur = (await db.kv.get('projetoAtual'))?.value as string | undefined;
      const p = cur ? await db.projects.get(cur) : undefined;
      if (p) setProject(hydrate(p));
      setLoaded(true);
      setMusicList(await db.music.orderBy('addedAt').reverse().toArray());
    })();
  }, []);

  // salvamento automático (debounce)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void db.projects.put(project).then(() => db.kv.put({ key: 'projetoAtual', value: project.id }));
    }, 400);
    return () => clearTimeout(t);
  }, [project, loaded]);

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => ({ ...fn(p), updatedAt: new Date().toISOString() }));
  }, []);

  const replaceProject = useCallback((p: Project) => setProject(hydrate(p)), []);

  const synthOf = useCallback(
    (ph: PhraseItem) => {
      const key = fnv1a([ph.pixels, `${ph.width}x${ph.height}`, JSON.stringify(project.settings.synth)]);
      let pr = synthCache.current.get(key);
      if (!pr) {
        pr = engine.synth({ pixels: ph.pixels.slice(), width: ph.width, height: ph.height, synth: project.settings.synth });
        pr.catch(() => synthCache.current.delete(key));
        if (synthCache.current.size > 200) synthCache.current.clear();
        synthCache.current.set(key, pr);
      }
      return pr;
    },
    [project.settings.synth],
  );

  const refreshMusic = useCallback(async () => {
    setMusicList(await db.music.orderBy('addedAt').reverse().toArray());
  }, []);

  const loadMusic = useCallback(async (id: string) => {
    let pr = musicCache.current.get(id);
    if (!pr) {
      const rec = await db.music.get(id);
      if (!rec) return null;
      pr = decodeAudioFile(rec.blob);
      musicCache.current.set(id, pr);
    }
    return pr;
  }, []);

  return <C.Provider value={{ project, update, replaceProject, status, setStatus, synthOf, musicList, refreshMusic, loadMusic }}>{children}</C.Provider>;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener('online', a);
    addEventListener('offline', b);
    return () => { removeEventListener('online', a); removeEventListener('offline', b); };
  }, []);
  return on;
}
