import { useEffect, useRef, useState } from 'react';
import { db, exportBackup, importBackup, requestPersistence, storageStatus, type SnapshotRec, type StorageStatus } from '../browser/storage';
import { saveFile } from '../browser/media';
import { Note, Section, fmtBytes } from './common';
import { newProject, useStudio } from './state';
import type { Project } from '../core/project';

export function HistoryTab() {
  const { project, replaceProject, setStatus } = useStudio();
  const [snaps, setSnaps] = useState<SnapshotRec[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [st, setSt] = useState<StorageStatus | null>(null);
  const [filter, setFilter] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setSnaps(await db.snapshots.orderBy('createdAt').reverse().toArray());
    setProjects(await db.projects.orderBy('updatedAt').reverse().toArray());
    setSt(await storageStatus());
  };
  useEffect(() => void refresh(), []);

  const shown = snaps.filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase())));

  return (
    <>
      <Section title="Projetos">
        <div className="row wrap gap">
          <button onClick={() => { replaceProject(newProject()); setStatus('Novo projeto criado.'); }}>Novo projeto</button>
          <label className="fld grow"><span>Tags do projeto atual (vírgulas)</span>
            <input defaultValue={project.tags.join(', ')} onBlur={(e) => replaceProject({ ...project, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
          </label>
        </div>
        <ul className="list">
          {projects.map((p) => (
            <li key={p.id} className={p.id === project.id ? 'current' : ''}>
              <b>{p.name}</b> <small className="muted">{p.phrases.length} frases · {new Date(p.updatedAt).toLocaleString('pt-BR')}</small>{' '}
              {p.id !== project.id && <button onClick={() => { replaceProject({ ...p, approvedHash: null }); setStatus('Projeto aberto. Revise e aprove antes de gerar.'); }}>Abrir</button>}
              {p.id !== project.id && <button className="link" onClick={async () => { if (confirm(`Excluir o projeto "${p.name}"? (o histórico de criações é mantido)`)) { await db.projects.delete(p.id); await refresh(); } }}>excluir</button>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Histórico de criações (instantâneos imutáveis)">
        <input placeholder="Filtrar por nome ou tag" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="list">
          {shown.map((s) => (
            <li key={s.id}>
              <code>{s.name}</code> <small className="muted">{new Date(s.createdAt).toLocaleString('pt-BR')} · {s.project.phrases.length} frases · {Math.round(s.summary.seconds)} s{s.tags.length ? ' · ' + s.tags.join(', ') : ''}</small>{' '}
              <button onClick={() => { replaceProject({ ...structuredClone(s.project), id: s.project.id, approvedHash: null }); setStatus(`Reaberto de ${s.name}. Revise e aprove novamente.`); }}>Reabrir (exige nova aprovação)</button>
            </li>
          ))}
        </ul>
        {!snaps.length && <p className="muted">Cada exportação grava aqui um instantâneo com frases, pixels e parâmetros.</p>}
      </Section>

      <Section title="Backup e armazenamento">
        <Note kind="warn">
          Os dados ficam no armazenamento do navegador deste aparelho. Ele pode ser apagado ao limpar dados do site, por falta de espaço, ou — no Safari/iOS — por inatividade prolongada de sites não instalados. Instalar o app e o “armazenamento persistente” reduzem o risco, mas NÃO garantem retenção eterna. Faça backup ZIP regularmente.
        </Note>
        {st && (
          <p className="muted">
            Persistente: {st.persisted === null ? 'não suportado' : st.persisted ? 'sim' : 'não'} · Uso: {st.usage !== null ? fmtBytes(st.usage) : '?'} de {st.quota !== null ? fmtBytes(st.quota) : '?'} · Arquivos grandes em disco (OPFS): {st.opfs ? 'disponível' : 'indisponível'}
          </p>
        )}
        <div className="row wrap gap">
          <button onClick={async () => { const r = await requestPersistence(); setStatus(r ? 'Armazenamento persistente concedido.' : 'O navegador não concedeu armazenamento persistente (comum antes de instalar o app).'); await refresh(); }}>Solicitar armazenamento persistente</button>
          <button className="primary" onClick={async () => { const b = await exportBackup(); await saveFile(b, `backup_estudio_espectral_${new Date().toISOString().slice(0, 10)}.zip`); }}>Exportar backup (ZIP)</button>
          <button onClick={() => fileIn.current?.click()}>Importar backup</button>
          <input ref={fileIn} type="file" accept=".zip,application/zip" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const r = await importBackup(f); setStatus(`Backup restaurado: ${r.projetos} projetos, ${r.historico} criações, ${r.musicas} músicas, ${r.biblioteca} frases.`); await refresh(); } catch (err) { setStatus((err as Error).message); } }} />
          <button className="danger" onClick={async () => { if (confirm('Apagar TODOS os dados locais deste app (projetos, histórico, músicas, biblioteca)? Faça backup antes.')) { await Promise.all([db.projects.clear(), db.snapshots.clear(), db.music.clear(), db.library.clear(), db.kv.clear()]); replaceProject(newProject()); await refresh(); setStatus('Dados locais apagados.'); } }}>Apagar dados locais</button>
        </div>
      </Section>
    </>
  );
}
