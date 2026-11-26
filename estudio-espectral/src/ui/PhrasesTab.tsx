import { useEffect, useRef, useState } from 'react';
import { BMP_HEIGHT, BMP_WIDTH, PHRASE_SECONDS } from '../core/constants';
import { imageWarnings } from '../core/image';
import { DEFAULT_TEXT_RENDER, isApproved, parseCsv, parseTxt, parseXlsx, sequenceHash, type PhraseItem, type TextRenderOptions, uid } from '../core/project';
import { FONTS, importImage, player, textToPixels } from '../browser/media';
import { Check, Note, Num, PixelCanvas, Section, Select } from './common';
import { useStudio } from './state';

/** Rótulo a partir do nome do arquivo — NÃO é reconhecimento do texto da imagem. */
function labelFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+\s*-\s*/, '').replace(/\(\d+\)$/, '').trim();
}

export async function phraseFromText(text: string, opts: TextRenderOptions): Promise<PhraseItem> {
  const pixels = await textToPixels(text, opts, BMP_WIDTH, BMP_HEIGHT);
  return { id: uid(), text, source: 'texto', pixels, width: BMP_WIDTH, height: BMP_HEIGHT, textRender: { ...opts } };
}

export function PhrasesTab() {
  const { project, update, setStatus, synthOf } = useStudio();
  const [bulk, setBulk] = useState('');
  const [opts, setOpts] = useState<TextRenderOptions>(DEFAULT_TEXT_RENDER);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const bmpInput = useRef<HTMLInputElement>(null);
  const listInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const phrases = project.phrases;
  const approved = isApproved(project);

  const setPhrases = (fn: (l: PhraseItem[]) => PhraseItem[]) => update((p) => ({ ...p, phrases: fn(p.phrases) }));

  async function addLines(lines: string[]) {
    setBusy(true);
    try {
      const items: PhraseItem[] = [];
      for (const l of lines) items.push(await phraseFromText(l, opts));
      setPhrases((l) => [...l, ...items]);
      setStatus(`${items.length} frase(s) convertidas em BMP 1024x60. Revise e aprove.`);
    } finally {
      setBusy(false);
    }
  }

  async function onBmps(files: FileList | null) {
    if (!files?.length) return;
    const items: PhraseItem[] = [];
    const errors: string[] = [];
    for (const f of Array.from(files).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))) {
      try {
        const img = await importImage(f);
        items.push({ id: uid(), text: labelFromFile(f.name), source: 'bmp-original', fileName: f.name, ...img });
      } catch (e) {
        errors.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setPhrases((l) => [...l, ...items]);
    setStatus(`${items.length} imagem(ns) importada(s) com os pixels originais.` + (errors.length ? ' Erros: ' + errors.join('; ') : ''));
  }

  async function onReplace(files: FileList | null) {
    const id = replaceTarget.current;
    if (!files?.length || !id) return;
    const img = await importImage(files[0]);
    setPhrases((l) => l.map((p) => (p.id === id ? { ...p, source: 'bmp-original', fileName: files[0].name, textRender: undefined, ...img } : p)));
  }

  async function onList(files: FileList | null) {
    if (!files?.length) return;
    const f = files[0];
    let rows: string[];
    if (/\.xlsx$/i.test(f.name)) rows = parseXlsx(new Uint8Array(await f.arrayBuffer()));
    else if (/\.csv$/i.test(f.name)) rows = parseCsv(await f.text());
    else rows = parseTxt(await f.text());
    if (!rows.length) return setStatus('Nenhuma frase encontrada (use a primeira coluna, uma frase por linha).');
    await addLines(rows);
  }

  async function rerender(p: PhraseItem) {
    const np = await phraseFromText(p.text, p.textRender ?? opts);
    setPhrases((l) => l.map((x) => (x.id === p.id ? { ...np, id: p.id } : x)));
  }

  async function listen(p: PhraseItem) {
    if (playing === p.id) { player.stop(); setPlaying(null); return; }
    const r = await synthOf(p);
    player.onEnd = () => setPlaying(null);
    await player.play(r.mono, r.mono);
    setPlaying(p.id);
  }

  const move = (i: number, d: number) =>
    setPhrases((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = l.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <>
      <Section title="1. Sequência de frases" aside={<span className={approved ? 'badge ok' : 'badge warn'}>{approved ? 'Aprovada' : 'Não aprovada'}</span>}>
        <p className="muted">
          Cada linha = um BMP 1024×60 = um trecho de {PHRASE_SECONDS.toFixed(4).replace('.', ',')} s (110700 amostras a 22050 Hz). A ordem abaixo é a ordem do áudio.
        </p>
        <div className="row wrap gap">
          <button onClick={() => bmpInput.current?.click()}>Importar BMP(s) originais</button>
          <button onClick={() => listInput.current?.click()}>Importar CSV / XLSX / TXT</button>
          <input ref={bmpInput} type="file" accept=".bmp,image/bmp,image/png,image/jpeg" multiple hidden onChange={(e) => { void onBmps(e.target.files); e.target.value = ''; }} />
          <input ref={listInput} type="file" accept=".csv,.txt,.xlsx" hidden onChange={(e) => { void onList(e.target.files); e.target.value = ''; }} />
          <input ref={replaceInput} type="file" accept=".bmp,image/bmp,image/png" hidden onChange={(e) => { void onReplace(e.target.files); e.target.value = ''; }} />
        </div>
        <Note>Prioridade para o BMP original: os pixels importados alimentam a síntese diretamente, sem trocar fonte nem redigitar. O texto mostrado ao lado de um BMP importado é só um rótulo (vem do nome do arquivo ou do que você digitar) — o aplicativo não “lê” a frase dentro da imagem.</Note>

        <ol className="phrases">
          {phrases.map((p, i) => {
            const warns = imageWarnings({ width: p.width, height: p.height, data: Float32Array.from(p.pixels, (v) => v / 255) });
            return (
              <li key={p.id} className="phrase">
                <div className="ph-top">
                  <span className="idx">{i + 1}</span>
                  <span className={`badge ${p.source === 'bmp-original' ? 'orig' : ''}`}>{p.source === 'bmp-original' ? 'BMP original' : 'Texto → BMP'}</span>
                  <input className="grow" aria-label={`Texto da frase ${i + 1}`} value={p.text} onChange={(e) => setPhrases((l) => l.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))} />
                </div>
                <PixelCanvas pixels={p.pixels} width={p.width} height={p.height} />
                {p.fileName && <small className="muted">Arquivo: {p.fileName} ({p.width}×{p.height})</small>}
                {warns.map((w) => <Note key={w} kind="warn">{w}</Note>)}
                <div className="row wrap gap small">
                  <button onClick={() => void listen(p)}>{playing === p.id ? '■ Parar' : '▶ Ouvir frase'}</button>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === phrases.length - 1} aria-label="Descer">▼</button>
                  {p.source === 'texto' && <button onClick={() => void rerender(p)}>Gerar BMP do texto editado</button>}
                  <button onClick={() => { replaceTarget.current = p.id; replaceInput.current?.click(); }}>Trocar por BMP</button>
                  <button className="danger" onClick={() => setPhrases((l) => l.filter((x) => x.id !== p.id))}>Excluir</button>
                </div>
              </li>
            );
          })}
        </ol>
        {!phrases.length && <Note>Nenhuma frase ainda. Importe BMPs, digite abaixo ou use a Biblioteca.</Note>}

        <div className="row wrap gap">
          <button
            className="primary"
            disabled={!phrases.length}
            onClick={() => {
              update((p) => ({ ...p, approvedHash: sequenceHash(p.phrases, p.settings.synth.mapping) }));
              setStatus(`${phrases.length} frase(s) aprovada(s). Qualquer edição exigirá nova aprovação.`);
            }}
          >
            Aprovar sequência ({phrases.length})
          </button>
          {phrases.length > 0 && <button className="danger" onClick={() => confirm('Remover todas as frases?') && setPhrases(() => [])}>Limpar</button>}
        </div>
      </Section>

      <Section title="Converter texto em BMP (opção separada)">
        <textarea rows={4} placeholder={'Uma frase por linha.\nEx.: Cada respiração me leva a uma paz mais profunda.'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
        <div className="grid4">
          <Select label="Fonte" value={opts.font} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => setOpts({ ...opts, font: v })} />
          <Num label="Altura das maiúsculas" unit="px" value={opts.capHeightPx} min={8} max={50} onChange={(v) => setOpts({ ...opts, capHeightPx: v })} />
          <Num label="Linha de base" unit="linha" value={opts.baselineRow} min={10} max={59} onChange={(v) => setOpts({ ...opts, baselineRow: v })} />
          <Num label="Margem lateral" unit="px" value={opts.marginPx} min={0} max={200} onChange={(v) => setOpts({ ...opts, marginPx: v })} />
        </div>
        <Check label="Converter para MAIÚSCULAS (como nos BMPs de referência)" checked={opts.uppercase} onChange={(v) => setOpts({ ...opts, uppercase: v })} />
        <TextPreview text={bulk.split('\n').find((l) => l.trim()) ?? 'Você está seguro e protegido'} opts={opts} />
        <p className="muted">Padrão medido nas referências: base na linha 44 e maiúsculas de ~28 px (linhas 16–44), centralizado. Frases longas são reduzidas para caber na largura.</p>
        <button className="primary" disabled={busy || !bulk.trim()} onClick={() => { void addLines(bulk.split('\n').map((s) => s.trim()).filter(Boolean)); setBulk(''); }}>
          Adicionar à sequência
        </button>
      </Section>
    </>
  );
}

function TextPreview({ text, opts }: { text: string; opts: TextRenderOptions }) {
  const [px, setPx] = useState<Uint8Array | null>(null);
  const key = JSON.stringify([text, opts]);
  useEffect(() => {
    let alive = true;
    void textToPixels(text, opts).then((p) => alive && setPx(p));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return px ? <PixelCanvas pixels={px} width={BMP_WIDTH} height={BMP_HEIGHT} /> : null;
}
