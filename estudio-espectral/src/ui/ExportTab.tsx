import { useEffect, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import { MAX_GAP_MS, MAX_TOTAL_SECONDS, PHRASE_SAMPLES, SR } from '../core/constants';
import { encodeBmp24 } from '../core/image';
import { isApproved, namePrefix, nextVersionName, uid } from '../core/project';
import { cycleSamples, planSequence } from '../core/sequence';
import { FORMAT_INFO, mp3Bitrates, normalizeFormat, type Container } from '../core/encoders';
import { checkFile, lossyLegibility } from '../browser/validate';
import { engine } from '../browser/engine';
import { saveFile } from '../browser/media';
import { db } from '../browser/storage';
import type { RenderFile, RenderRes, SynthRes } from '../workers/protocol';
import { Check, Note, Num, Progress, Section, Select, fmtBytes, fmtTime } from './common';
import { useStudio } from './state';

interface Result {
  name: string;
  files: RenderFile[];
  extras: { name: string; blob: Blob }[];
  checks: string[];
  render: RenderRes;
}

export function ExportTab() {
  const { project, update, setStatus, synthOf, loadMusic } = useStudio();
  const s = project.settings;
  const set = (patch: Partial<typeof s>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  const [outs, setOuts] = useState({ mix: true, spectral: true, pack: true });
  const [progress, setProgress] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [existing, setExisting] = useState<string[]>([]);
  const approved = isApproved(project);
  const hasMusic = !!s.mix.music.trackId;
  const prefix = namePrefix(project.name, s, new Date(), hasMusic);
  const nextName = nextVersionName(prefix, existing);

  useEffect(() => {
    void db.snapshots.toArray().then((l) => setExisting(l.map((x) => x.name)));
  }, [result]);

  const n = project.phrases.length;
  const plan = n ? planSequence(project.phrases.map(() => PHRASE_SAMPLES), Math.round((s.gapMs / 1000) * SR), Math.round(s.totalSeconds * SR), s.endMode) : null;
  const fmt = normalizeFormat(s.output);
  const setFmt = (patch: Partial<typeof fmt>) => set({ output: normalizeFormat({ ...fmt, ...patch }) });
  const wavBytes = Math.round(s.totalSeconds * fmt.sampleRate) * 4 + 44;
  const bytes = fmt.container === 'wav' ? wavBytes : fmt.container === 'flac' ? wavBytes * 0.5 : (s.totalSeconds * fmt.mp3Kbps * 1000) / 8;

  async function generate() {
    if (!approved) return setStatus('Aprove a sequência (aba Frases) antes de gerar.');
    if (!(s.totalSeconds >= 5 && s.totalSeconds <= MAX_TOTAL_SECONDS)) return setStatus('Duração deve ficar entre 5 s e 4 h.');
    if (!(s.gapMs >= 0 && s.gapMs <= MAX_GAP_MS)) return setStatus('Pausa deve ficar entre 0 e 30000 ms.');
    setResult(null);
    setProgress(0);
    const name = nextName;
    try {
      const synths: SynthRes[] = [];
      for (const p of project.phrases) synths.push(await synthOf(p));
      const music = s.mix.music.trackId ? await loadMusic(s.mix.music.trackId) : null;
      const job = engine.render(
        { phrases: synths.map((r) => r.mono.slice()), totalSeconds: s.totalSeconds, gapMs: s.gapMs, endMode: s.endMode, mix: s.mix, music, outputs: { mix: outs.mix, spectral: outs.spectral }, sink: 'auto', baseName: name, format: fmt },
        (f) => setProgress(f),
      );
      setJobId(job.id);
      const r = await job.promise;
      // validação do que foi realmente gravado
      const checks: string[] = [];
      for (const f of r.files) checks.push(await checkFile(f, s.totalSeconds));
      if (fmt.container === 'mp3' && r.files.length) {
        const f = r.files.find((x) => x.kind === 'spectral') ?? r.files[0];
        try {
          const leg = await lossyLegibility(f, project.phrases[0], synths[0].mono, s.synth.mapping, synths[0].frame);
          if (leg) checks.push(`Legibilidade medida após MP3 (frase 1, decodificada de volta): SSIM ${leg.ssim.toFixed(3)} — antes da compressão ${leg.ssimRef.toFixed(3)}.`);
        } catch (e) {
          checks.push(`Não foi possível medir a legibilidade do MP3 neste navegador: ${(e as Error).message}`);
        }
      }
      if (r.clippedSamples) checks.push(`Atenção: ${r.clippedSamples} amostras saturadas.`);
      const extras: { name: string; blob: Blob }[] = [];
      const meta = {
        aplicativo: 'Estúdio Espectral PWA 2.0',
        nome: name,
        criado_em_local: new Date().toString(),
        frases: project.phrases.map((p, i) => ({ n: i + 1, texto: p.text, origem: p.source, arquivo: p.fileName ?? null, largura: p.width, altura: p.height })),
        duracao_segundos: s.totalSeconds,
        pausa_ms: s.gapMs,
        final: s.endMode,
        amostragem_hz: fmt.sampleRate,
        formato: fmt,
        amostras_por_frase: PHRASE_SAMPLES,
        estereo: true,
        sintese: s.synth,
        mixagem: s.mix,
        ganho_mestre: r.masterGain,
        mapa: r.occurrences.map((o) => ({ inicio_s: +(o.start / SR).toFixed(6), fim_s: +(o.end / SR).toFixed(6), frase: o.index + 1, truncada: o.truncated })),
      };
      if (outs.pack) {
        const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
        project.phrases.forEach((p, i) => {
          const k = String(i + 1).padStart(2, '0');
          files[`frases/frase_${k}.bmp`] = encodeBmp24({ width: p.width, height: p.height, data: Float32Array.from(p.pixels, (v) => v / 255) });
          files[`frases/frase_${k}.wav`] = [synths[i].wav.slice(), { level: 0 }];
        });
        files['sequencia.json'] = strToU8(JSON.stringify(meta, null, 2));
        files['projeto.json'] = strToU8(JSON.stringify({ ...project, phrases: project.phrases.map((p) => ({ ...p, pixels: `frases/frase_${String(project.phrases.indexOf(p) + 1).padStart(2, '0')}.bmp` })) }, null, 2));
        extras.push({ name: `${name}_frases_e_metadados.zip`, blob: new Blob([zipSync(files)], { type: 'application/zip' }) });
      }
      await db.snapshots.put({
        id: uid(),
        projectId: project.id,
        name,
        createdAt: new Date().toISOString(),
        tags: [...project.tags],
        project: structuredClone(project),
        summary: { seconds: r.seconds, occurrences: r.occurrences.length, files: [...r.files.map((f) => f.name), ...extras.map((e) => e.name)], masterGain: r.masterGain },
      });
      setResult({ name, files: r.files, extras, checks, render: r });
      setStatus(`Concluído: ${name} — ${r.occurrences.length} ocorrências em ${fmtTime(r.seconds)}. Salvo no histórico.`);
    } catch (e) {
      const err = e as Error & { cancelled?: boolean };
      setStatus(err.message);
    } finally {
      setProgress(null);
      setJobId(null);
    }
  }

  return (
    <>
      <Section title="Tempo e sequência">
        <div className="grid4">
          <Num label="Duração total" unit="s" value={s.totalSeconds} min={5} max={MAX_TOTAL_SECONDS} onChange={(v) => set({ totalSeconds: v })} title="900 s = 15 min" />
          <Num label="Pausa entre frases" unit="ms" value={s.gapMs} min={0} max={MAX_GAP_MS} step={50} onChange={(v) => set({ gapMs: Math.round(v) })} />
          <Select label="Final da sessão" value={s.endMode} options={[{ value: 'completas', label: 'Só frases completas (fundo até o fim)' }, { value: 'cortar', label: 'Cortar a última frase com fade' }]} onChange={(v) => set({ endMode: v })} />
        </div>
        <div className="row wrap gap small">
          {[0, 250, 500, 1000, 2000].map((ms) => <button key={ms} onClick={() => set({ gapMs: ms })} className={s.gapMs === ms ? 'on' : ''}>{ms} ms</button>)}
          {[300, 900, 1800, 3600].map((sec) => <button key={sec} onClick={() => set({ totalSeconds: sec })} className={s.totalSeconds === sec ? 'on' : ''}>{sec / 60} min</button>)}
        </div>
        {plan && (
          <p className="muted">
            Ciclo de {n} frase(s): {fmtTime(cycleSamples(project.phrases.map(() => PHRASE_SAMPLES), Math.round((s.gapMs / 1000) * SR)) / SR)}. Total: {plan.occurrences.length} ocorrências; inícios {plan.occurrences.slice(0, 4).map((o) => (o.start / SR).toFixed(4).replace('.', ',') + ' s').join(', ')}{plan.occurrences.length > 4 ? '…' : ''}.
            {plan.tailSamples > 0 && s.endMode === 'completas' && ` Últimos ${(plan.tailSamples / SR).toFixed(1)} s só com fundo.`}
          </p>
        )}
      </Section>

      <Section title="Exportar" aside={<span className={approved ? 'badge ok' : 'badge warn'}>{approved ? 'Sequência aprovada' : 'Aprovação pendente'}</span>}>
        <label className="fld">
          <span>Nome do projeto</span>
          <input value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <p>Próximo nome: <code>{nextName}</code> <small className="muted">(data local do aparelho; nunca sobrescreve: V1, V2…)</small></p>
        <div className="grid4">
          <Select<Container> label="Formato de saída" value={fmt.container} options={(Object.keys(FORMAT_INFO) as Container[]).map((c) => ({ value: c, label: FORMAT_INFO[c].label }))} onChange={(v) => setFmt({ container: v })} />
          <Select label="Taxa de amostragem" value={fmt.sampleRate} options={[{ value: 22050, label: '22050 Hz (original da síntese)' }, { value: 44100, label: '44100 Hz (padrão de CD)' }]} onChange={(v) => setFmt({ sampleRate: v as 22050 | 44100 })} />
          {fmt.container === 'mp3' && <Select label="Qualidade MP3" value={fmt.mp3Kbps} options={mp3Bitrates(fmt.sampleRate).map((k) => ({ value: k, label: `${k} kbps` }))} onChange={(v) => setFmt({ mp3Kbps: v })} />}
        </div>
        {fmt.container === 'mp3' && <p className="muted">Ao terminar, o app decodifica o MP3 de volta e mede a legibilidade da frase 1. Em 22050 Hz o MP3 vai até 160 kbps; em 44100 Hz até 320 kbps.</p>}
        <Check label={`Mistura final (${FORMAT_INFO[fmt.container].ext.toUpperCase()}, estéreo)`} checked={outs.mix} onChange={(v) => setOuts({ ...outs, mix: v })} />
        <Check label={`Camada espectral isolada (${FORMAT_INFO[fmt.container].ext.toUpperCase()}, sem fundo, L = R)`} checked={outs.spectral} onChange={(v) => setOuts({ ...outs, spectral: v })} />
        <Check label="ZIP com BMPs, WAVs por frase, sequencia.json e projeto.json" checked={outs.pack} onChange={(v) => setOuts({ ...outs, pack: v })} />
        <p className="muted">Tamanho estimado de cada arquivo: {fmtBytes(bytes)}. Renderização em blocos de 1 s (memória constante); grava em disco (OPFS) quando o navegador permite.</p>
        {!approved && <Note kind="warn">A sequência atual não está aprovada. Vá à aba Frases e aprove.</Note>}
        <div className="row gap">
          <button className="primary" onClick={() => void generate()} disabled={progress !== null || !n}>Gerar {FORMAT_INFO[fmt.container].ext.toUpperCase()}</button>
          {jobId !== null && <button className="danger" onClick={() => engine.cancel(jobId)}>Cancelar</button>}
        </div>
        {progress !== null && <Progress value={progress} />}
      </Section>

      {result && (
        <Section title={`Resultado: ${result.name}`}>
          <ul className="checks">{result.checks.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="muted">Ganho mestre aplicado: {result.render.masterGain.toFixed(3)} · {result.render.occurrences.length} ocorrências.</p>
          <div className="row wrap gap">
            {[...result.files.map((f) => ({ name: f.name, blob: f.blob })), ...result.extras].map((f) => (
              <button key={f.name} onClick={() => void saveFile(f.blob, f.name)}>⬇ {f.name} ({fmtBytes(f.blob.size)})</button>
            ))}
          </div>
          <Note>O navegador não escolhe pastas do Windows/iOS automaticamente: o arquivo vai para Downloads (ou para o menu Compartilhar → Salvar em Arquivos, no iPhone).</Note>
        </Section>
      )}
    </>
  );
}
