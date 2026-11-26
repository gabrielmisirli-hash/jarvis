import { useEffect, useRef, useState } from 'react';
import { BMP_HEIGHT, BMP_WIDTH } from '../core/constants';
import { DEFAULT_TEXT_RENDER, type PhraseItem, parseCsv, parseTxt, parseXlsx, toCsv, uid } from '../core/project';
import { CATEGORIES, SUGGESTIONS, USER_APP_GROUPS, USER_BMP_ORIGINALS, toSecondPerson, type Category } from '../content/library';
import { METHODS } from '../content/methods';
import { saveFile, textToPixels } from '../browser/media';
import { db, type LibraryRec } from '../browser/storage';
import { Note, Section, Select } from './common';
import { useStudio } from './state';

export function LibraryTab() {
  const { update, setStatus } = useStudio();
  const [picked, setPicked] = useState<string[]>([]);
  const [mine, setMine] = useState<LibraryRec[]>([]);
  const [cat, setCat] = useState<Category>('Foco');
  const [newText, setNewText] = useState('');
  const [group, setGroup] = useState('Meu grupo');
  const fileIn = useRef<HTMLInputElement>(null);

  const refresh = async () => setMine(await db.library.toArray());
  useEffect(() => void refresh(), []);

  const toggle = (t: string) => setPicked((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  async function addToSequence(lines: string[]) {
    const items: PhraseItem[] = [];
    for (const text of lines) {
      const pixels = await textToPixels(text, DEFAULT_TEXT_RENDER, BMP_WIDTH, BMP_HEIGHT);
      items.push({ id: uid(), text, source: 'texto' as const, pixels, width: BMP_WIDTH, height: BMP_HEIGHT, textRender: { ...DEFAULT_TEXT_RENDER } });
    }
    update((p) => ({ ...p, phrases: [...p.phrases, ...items] }));
    setStatus(`${items.length} frase(s) acrescentadas à sequência (texto → BMP). Revise e aprove na aba Frases.`);
    setPicked([]);
  }

  async function saveMine(lines: string[], origin: LibraryRec['origin']) {
    const now = new Date().toISOString();
    await db.library.bulkPut(lines.map((text) => ({ id: uid(), text, category: cat, group, origin, createdAt: now })));
    await refresh();
    setStatus(`${lines.length} frase(s) salvas na sua biblioteca local (${cat} / ${group}).`);
  }

  async function importFile(f: File) {
    const rows = /\.xlsx$/i.test(f.name) ? parseXlsx(new Uint8Array(await f.arrayBuffer())) : /\.csv$/i.test(f.name) ? parseCsv(await f.text()) : parseTxt(await f.text());
    await saveMine(rows, 'importado');
  }

  const Pick = ({ t, note }: { t: string; note?: string }) => (
    <li>
      <label className="chk">
        <input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} /> {t}
      </label>
      {note && <small className="muted"> — {note}</small>}
    </li>
  );

  const groups = [...new Set(mine.map((m) => m.group))];

  return (
    <>
      <div className="sticky-actions">
        <span>{picked.length} selecionada(s)</span>
        <button className="primary" disabled={!picked.length} onClick={() => void addToSequence(picked)}>Acrescentar à sequência</button>
        <button disabled={!picked.length} onClick={() => void saveMine(picked, 'usuario')}>Salvar na minha biblioteca</button>
      </div>

      <Section title="Originais do usuário (preservados literalmente)">
        <Note>Transcrição manual do texto visível nos seus BMPs — o aplicativo não faz OCR. Para fidelidade máxima, importe o BMP original na aba Frases: os pixels serão usados diretamente.</Note>
        <ul className="pick">{USER_BMP_ORIGINALS.map((e) => <Pick key={e.text} t={e.text} note={`${e.category}${e.note ? '. ' + e.note : ''}`} />)}</ul>
        {USER_APP_GROUPS.map((g) => (
          <details key={g.name}>
            <summary>{g.name} — grupo da v1.0</summary>
            <ul className="pick">{g.lines.map((t) => <Pick key={t} t={t} />)}</ul>
          </details>
        ))}
      </Section>

      <Section title="Minha biblioteca local">
        <div className="grid4">
          <Select<Category> label="Categoria" value={cat} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={setCat} />
          <label className="fld"><span>Grupo</span><input value={group} onChange={(e) => setGroup(e.target.value)} list="grupos" /></label>
          <datalist id="grupos">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </div>
        <div className="row gap">
          <input className="grow" placeholder="Nova frase em português" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <button disabled={!newText.trim()} onClick={() => { void saveMine([newText.trim()], 'usuario'); setNewText(''); }}>Adicionar</button>
        </div>
        <div className="row wrap gap small">
          <button onClick={() => fileIn.current?.click()}>Importar CSV / XLSX / TXT</button>
          <button disabled={!mine.length} onClick={() => void saveFile(new Blob([toCsv(mine.map((m) => m.text))], { type: 'text/csv' }), 'minha_biblioteca.csv')}>Exportar CSV</button>
          <input ref={fileIn} type="file" accept=".csv,.txt,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </div>
        {groups.map((g) => (
          <details key={g} open>
            <summary>{g}</summary>
            <ul className="pick">
              {mine.filter((m) => m.group === g).map((m) => (
                <li key={m.id}>
                  <label className="chk"><input type="checkbox" checked={picked.includes(m.text)} onChange={() => toggle(m.text)} /> {m.text}</label>
                  <small className="muted"> {m.category} · {m.origin}</small>{' '}
                  <button className="link" onClick={async () => { await db.library.delete(m.id); await refresh(); }}>excluir</button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!mine.length && <p className="muted">Vazia. Frases aprovadas na biblioteca nunca são alteradas pelo assistente.</p>}
      </Section>

      <Assistant onPick={(lines) => setPicked((l) => [...new Set([...l, ...lines])])} />

      <Section title="Sugestões por categoria (exemplos locais)">
        <Select<Category> label="Categoria" value={cat} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={setCat} />
        <ul className="pick">{SUGGESTIONS[cat].map((t) => <Pick key={t} t={t} />)}</ul>
      </Section>
    </>
  );
}

function Assistant({ onPick }: { onPick: (l: string[]) => void }) {
  const [mid, setMid] = useState(METHODS[0].id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [person, setPerson] = useState<'Eu' | 'Você'>('Eu');
  const m = METHODS.find((x) => x.id === mid)!;
  const base = m.build(vals);
  const conv = base.map((l) => (person === 'Você' ? toSecondPerson(l) : { text: l, complete: true }));
  const lines = conv.map((c) => c.text);
  const script = m.script?.(vals);
  return (
    <Section title="Assistente de frases (offline)">
      <Note>Modelos locais para inspirar a escrita. Nada entra no áudio sem sua revisão e aprovação.</Note>
      <div className="grid4">
        <Select label="Método" value={mid} options={METHODS.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { setMid(v); setVals({}); }} />
        <Select label="Pessoa" value={person} options={[{ value: 'Eu', label: 'Eu (1ª pessoa)' }, { value: 'Você', label: 'Você (2ª pessoa)' }]} onChange={setPerson} />
      </div>
      <p>{m.summary}</p>
      <div className="grid4">
        {m.fields.map((f) => (
          <label key={f.key} className="fld"><span>{f.label}</span><input placeholder={f.placeholder} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} /></label>
        ))}
      </div>
      <ol className="gen">{lines.map((l) => <li key={l}>{l}</li>)}</ol>
      {conv.some((c) => !c.complete) && <Note kind="warn">Conversão para “Você” incompleta (verbo fora do dicionário). Revise o texto antes de usar.</Note>}
      <button onClick={() => onPick(lines)}>Selecionar estas frases</button>
      {script && (
        <details open>
          <summary>Roteiro AUDÍVEL para ler ou gravar (não é texto espectral)</summary>
          <ol>{script.map((s) => <li key={s}>{s}</li>)}</ol>
          <button onClick={() => void navigator.clipboard?.writeText(script.join('\n\n'))}>Copiar roteiro</button>
        </details>
      )}
      <details>
        <summary>Evidência: <b>{m.evidence}</b></summary>
        <p>{m.evidenceNote}</p>
        <p><b>Limitações:</b> {m.limitations}</p>
        <ul className="refs">{m.citations.map((c) => <li key={c.ref}>{c.ref}{c.note && ` — ${c.note}`}</li>)}</ul>
      </details>
    </Section>
  );
}
