import { useEffect, useMemo, useRef, useState } from 'react';
import { PHRASE_SECONDS, SR } from '../core/constants';
import { inkBox } from '../core/image';
import { MAPPING_PRESETS, type MappingConfig, type MappingPreset, type RowFrame, rowFrame, rowToHz } from '../core/mapping';
import type { ImageComparison } from '../core/metrics';
import type { PhraseItem } from '../core/project';
import { DEFAULT_SYNTH } from '../core/synth';
import type { Palette, StftParams, ViewParams, WindowKind } from '../core/spectrum';
import { engine } from '../browser/engine';
import { decodeAudioFile, saveFile } from '../browser/media';
import { encodeWav } from '../core/wav';
import type { AnalyzeRes } from '../workers/protocol';
import { Check, Note, Num, PixelCanvas, RgbaCanvas, Section, Select } from './common';
import { useStudio } from './state';

type ViewMode = 'referencia' | 'autozoom' | 'detalhado' | 'fixo4000' | 'personalizado';
type Source = 'isolada' | 'mistura' | 'externo';

interface Custom {
  scale: 'log' | 'linear';
  fLo: number;
  fHi: number;
  rangeDb: number;
  gamma: number;
  palette: Palette;
  stft: StftParams;
}

const W_PX = 1600;

/**
 * A visualização deriva do MESMO mapeamento usado na síntese. Os modos só mudam
 * o enquadramento de exibição; nenhum altera as frequências contidas no WAV.
 */
export function viewFor(mode: ViewMode, ph: PhraseItem, mapping: MappingConfig, frame: RowFrame, c: Custom): { view: ViewParams; stft: StftParams; desc: string } {
  const gray = { width: ph.width, height: ph.height, data: Float32Array.from(ph.pixels, (v) => v / 255) };
  const box = inkBox(gray);
  const T = PHRASE_SECONDS;
  const colToT = (x: number) => (x / ph.width) * T;
  const hz = (row: number) => rowToHz(mapping, frame, row);
  const base = { rangeDb: c.rangeDb, gamma: c.gamma, palette: c.palette };
  if (mode === 'referencia') {
    // tela inteira, mesma proporção do BMP: compara pixel a pixel com a imagem original
    const h = Math.round((W_PX * ph.height) / ph.width) * 2;
    return {
      view: { t0: 0, t1: T, fLo: hz(ph.height - 0.5), fHi: hz(-0.5), scale: mapping.scale, width: W_PX, height: h, ...base },
      stft: { nfft: 0, hop: 64, window: 'hann' },
      desc: `Tela inteira (${Math.round(hz(ph.height - 0.5))}–${Math.round(hz(-0.5))} Hz, escala ${mapping.scale === 'log' ? 'logarítmica' : 'linear'} igual à da síntese), frase inteira, altura 2× a proporção do BMP.`,
    };
  }
  if (mode === 'fixo4000') {
    return {
      view: { t0: 0, t1: T, fLo: 0, fHi: 4000, scale: 'linear', width: W_PX, height: 420, ...base },
      stft: { nfft: 1024, hop: 64, window: 'hann' },
      desc: '0–4000 Hz linear, frase inteira — a vista típica de aplicativos de espectrograma. Letras em mapeamento logarítmico aparecem comprimidas embaixo e esticadas em cima.',
    };
  }
  if (mode === 'personalizado') {
    return { view: { t0: 0, t1: T, fLo: c.fLo, fHi: c.fHi, scale: c.scale, width: W_PX, height: 480, ...base }, stft: c.stft, desc: 'Parâmetros manuais.' };
  }
  const mRows = mode === 'autozoom' ? 5 : 2;
  const mCols = mode === 'autozoom' ? 40 : 12;
  const stretch = mode === 'autozoom' ? 3 : 5;
  const top = box.empty ? 0 : Math.max(-0.5, box.top - mRows), bot = box.empty ? ph.height - 1 : Math.min(ph.height - 0.5, box.bottom + mRows);
  const left = box.empty ? 0 : Math.max(0, box.left - mCols), right = box.empty ? ph.width : Math.min(ph.width, box.right + 1 + mCols);
  const h = Math.round(((W_PX * (bot - top)) / (right - left)) * stretch);
  return {
    view: { t0: colToT(left), t1: colToT(right), fLo: hz(bot), fHi: hz(top), scale: mapping.scale, width: W_PX, height: Math.max(120, Math.min(900, h)), ...base },
    stft: { nfft: 0, hop: 32, window: 'hann' },
    desc: `${mode === 'autozoom' ? 'Autozoom moderado' : 'Detalhado'}: recorte do texto com margem (${mRows} linhas, ${mCols} colunas), sem cortar caracteres; altura ${stretch}× a proporção do BMP.`,
  };
}

export function SpectroTab() {
  const { project, update, synthOf, loadMusic } = useStudio();
  const phrases = project.phrases;
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<ViewMode>('referencia');
  const [source, setSource] = useState<Source>('isolada');
  const [extWav, setExtWav] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [custom, setCustom] = useState<Custom>({ scale: 'log', fLo: 100, fHi: 4000, rangeDb: 60, gamma: 1, palette: 'cinza', stft: { nfft: 0, hop: 64, window: 'hann' } });
  const [overrideStft, setOverrideStft] = useState(false);
  const [res, setRes] = useState<AnalyzeRes | null>(null);
  const [synthInfo, setSynthInfo] = useState<string>('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const extInput = useRef<HTMLInputElement>(null);
  const ph = phrases[Math.min(sel, phrases.length - 1)];
  const mapping = project.settings.synth.mapping;

  const frame = useMemo(() => {
    if (!ph) return null;
    const box = inkBox({ width: ph.width, height: ph.height, data: Float32Array.from(ph.pixels, (v) => v / 255) }, project.settings.synth.threshold);
    return rowFrame(mapping, ph.height, box.empty ? undefined : box.top, box.empty ? undefined : box.bottom);
  }, [ph, mapping, project.settings.synth.threshold]);

  const vf = ph && frame ? viewFor(mode, ph, mapping, frame, custom) : null;
  const stftP = overrideStft ? custom.stft : vf?.stft;

  useEffect(() => {
    if (!ph || !frame || !vf || !stftP) return;
    let alive = true;
    setBusy(true);
    setErr('');
    void (async () => {
      try {
        let wav: Uint8Array;
        let startS = 0;
        if (source === 'externo') {
          if (!extWav) { setRes(null); return; }
          wav = extWav.data;
        } else {
          const r = await synthOf(ph);
          setSynthInfo(`Síntese: ${r.rowsUsed} linhas ativas, ${Math.round(r.minHz)}–${Math.round(r.maxHz)} Hz, pico ${r.peak.toFixed(3)}, RMS ativo ${r.activeRms.toFixed(3)}.`);
          wav = r.wav;
          if (source === 'mistura') {
            const mix = project.settings.mix;
            const music = mix.music.trackId ? await loadMusic(mix.music.trackId) : null;
            const job = engine.render(
              { phrases: [r.mono], totalSeconds: PHRASE_SECONDS + 1, gapMs: 0, endMode: 'completas', mix: { ...mix, master: { ...mix.master, fadeInMs: 0 } }, music, outputs: { mix: true, spectral: false }, sink: 'memory', baseName: 'analise' },
              () => undefined,
            );
            const out = await job.promise;
            wav = new Uint8Array(await out.files[0].blob.arrayBuffer());
            startS = 0;
          }
        }
        const a = await engine.analyze({ wav: wav.slice(), startS, durationS: PHRASE_SECONDS, stft: stftP, view: vf.view, mapping, frame, bmp: { pixels: ph.pixels.slice(), width: ph.width, height: ph.height } });
        if (alive) setRes(a);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ph, frame, JSON.stringify(vf), JSON.stringify(stftP), source, extWav, project.settings.mix, synthOf]);

  const setMapping = (m: MappingConfig) => update((p) => ({ ...p, settings: { ...p.settings, synth: { ...p.settings.synth, mapping: m } } }));
  const synth = project.settings.synth;
  const setSynth = (patch: Partial<typeof synth>) => update((p) => ({ ...p, settings: { ...p.settings, synth: { ...p.settings.synth, ...patch } } }));

  async function exportPng() {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('#comparacao canvas'));
    if (!canvases.length) return;
    const W = 1600, pad = 28;
    const heights = canvases.map((c) => Math.round((c.height * W) / c.width));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = heights.reduce((a, b) => a + b + pad, pad);
    const g = out.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, out.width, out.height);
    g.imageSmoothingEnabled = false;
    let y = pad;
    const labels = ['A — BMP original (pixels; NÃO faz parte do WAV)', 'C — espectrograma reconstruído do WAV', "C' — reconstrução por banco de filtros nas frequências das linhas (do WAV)"];
    canvases.forEach((c, i) => {
      g.fillStyle = '#000';
      g.font = '16px sans-serif';
      g.fillText(labels[i] ?? '', 8, y - 8);
      g.drawImage(c, 0, y, W, heights[i]);
      y += heights[i] + pad;
    });
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), 'image/png'));
    await saveFile(blob, `frase_${String(sel + 1).padStart(2, '0')}_comparacao_${mode}.png`);
  }

  if (!ph) return <Section title="Espectrograma por frase"><Note>Adicione frases primeiro.</Note></Section>;

  return (
    <>
      <Section title="Espectrograma por frase (reconstruído a partir do WAV)">
        <Note>
          Três coisas diferentes: <b>A</b> = pixels do BMP; <b>B</b> = o som exportado; <b>C</b> = imagem calculada a partir de B. Abaixo, C é sempre calculado do WAV (decodificado de volta), nunca dos pixels.
        </Note>
        <div className="grid4">
          <Select label="Frase" value={sel} options={phrases.map((p, i) => ({ value: i, label: `${i + 1}. ${p.text.slice(0, 50)}` }))} onChange={setSel} />
          <Select
            label="Fonte do áudio (B)"
            value={source}
            options={[
              { value: 'isolada', label: 'WAV da frase isolada' },
              { value: 'mistura', label: 'Mistura real com o fundo atual' },
              { value: 'externo', label: 'Arquivo externo (WAV, MP3, FLAC… ex.: original ou exportado)' },
            ]}
            onChange={setSource}
          />
          <Select
            label="Modo de visualização"
            value={mode}
            options={[
              { value: 'referencia', label: 'Referência (tela inteira, proporção do BMP)' },
              { value: 'autozoom', label: 'Autozoom moderado' },
              { value: 'detalhado', label: 'Detalhado' },
              { value: 'fixo4000', label: '0–4000 Hz fixo (linear)' },
              { value: 'personalizado', label: 'Personalizado' },
            ]}
            onChange={setMode}
          />
          <Select label="Paleta" value={custom.palette} options={[{ value: 'cinza', label: 'Cinza (como o BMP)' }, { value: 'magma', label: 'Magma' }, { value: 'viridis', label: 'Viridis' }, { value: 'cinza-invertido', label: 'Cinza invertido' }]} onChange={(v) => setCustom({ ...custom, palette: v })} />
        </div>
        {source === 'externo' && (
          <div className="row gap">
            <button onClick={() => extInput.current?.click()}>Escolher arquivo de áudio…</button>
            <span className="muted">{extWav?.name ?? 'nenhum'}</span>
            <input ref={extInput} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const raw = new Uint8Array(await f.arrayBuffer());
              const isWav = raw[0] === 0x52 && raw[1] === 0x49 && raw[8] === 0x57;
              try {
                // WAV é lido byte a byte; outros formatos passam pelo decodificador do navegador (reamostrado a 22050 Hz)
                const data = isWav ? raw : await decodeAudioFile(f).then((d) => encodeWav([d.left, d.right], SR));
                setExtWav({ name: f.name, data });
              } catch (err) {
                setErr((err as Error).message);
              }
            }} />
          </div>
        )}
        <div className="grid4">
          <Num label="Faixa dinâmica" unit="dB" value={custom.rangeDb} min={20} max={120} onChange={(v) => setCustom({ ...custom, rangeDb: v })} />
          <Num label="Contraste (gama)" value={custom.gamma} step={0.1} min={0.2} max={4} onChange={(v) => setCustom({ ...custom, gamma: v })} />
          {mode === 'personalizado' && (
            <>
              <Select label="Escala" value={custom.scale} options={[{ value: 'log', label: 'Logarítmica' }, { value: 'linear', label: 'Linear' }]} onChange={(v) => setCustom({ ...custom, scale: v })} />
              <Num label="Exibir de" unit="Hz" value={custom.fLo} min={1} onChange={(v) => setCustom({ ...custom, fLo: v })} />
              <Num label="Exibir até" unit="Hz" value={custom.fHi} max={SR / 2} onChange={(v) => setCustom({ ...custom, fHi: v })} />
            </>
          )}
        </div>
        <Check label="Ajustar FFT manualmente" checked={overrideStft || mode === 'personalizado'} onChange={setOverrideStft} />
        {(overrideStft || mode === 'personalizado') && (
          <div className="grid4">
            <Select label="Tamanho FFT" value={custom.stft.nfft} options={[{ value: 0, label: 'Multirresolução (janela por frequência)' }, ...[256, 512, 1024, 2048, 4096, 8192].map((n) => ({ value: n, label: `${n} (${((n / SR) * 1000).toFixed(0)} ms, ${(SR / n).toFixed(1)} Hz/bin)` }))]} onChange={(v) => setCustom({ ...custom, stft: { ...custom.stft, nfft: v } })} />
            <Select label="Salto (hop)" value={custom.stft.hop} options={[16, 32, 64, 128, 256, 512].map((n) => ({ value: n, label: `${n} amostras` }))} onChange={(v) => setCustom({ ...custom, stft: { ...custom.stft, hop: v } })} />
            <Select<WindowKind> label="Janela" value={custom.stft.window} options={[{ value: 'hann', label: 'Hann' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' }]} onChange={(v) => setCustom({ ...custom, stft: { ...custom.stft, window: v } })} />
          </div>
        )}
        {vf && <p className="muted">{vf.desc} FFT {stftP?.nfft === 0 ? 'multirresolução 256–4096 (Q aproximadamente constante)' : stftP?.nfft}, hop {stftP?.hop}, janela {stftP?.window}. O eixo de exibição não altera o som.</p>}
        {err && <Note kind="warn">{err}</Note>}

        <div id="comparacao" className={busy ? 'busy' : ''}>
          <h3>A — BMP original (pixels)</h3>
          <PixelCanvas pixels={ph.pixels} width={ph.width} height={ph.height} className="cmp" />
          {res ? (
            <>
              <h3>C — espectrograma do WAV {source === 'mistura' ? '(mistura com fundo)' : source === 'externo' ? `(${extWav?.name})` : '(frase isolada)'}</h3>
              <RgbaCanvas rgba={res.rgba} width={res.width} height={res.height} className="cmp" label="Espectrograma reconstruído" />
              {res.recon && (
                <>
                  <h3>C′ — reconstrução por banco de filtros nas frequências das linhas (do WAV, para métricas)</h3>
                  <PixelCanvas pixels={res.recon} width={ph.width} height={ph.height} className="cmp" />
                </>
              )}
            </>
          ) : (
            <Note>{busy ? 'Calculando…' : 'Sem análise.'}</Note>
          )}
        </div>
        {res && <Metrics res={res} metrics={res.metrics} />}
        {synthInfo && source !== 'externo' && <p className="muted">{synthInfo}</p>}
        {source === 'mistura' && res?.metrics && <MixWarning res={res} />}
        <button onClick={() => void exportPng()} disabled={!res}>Salvar comparação (PNG)</button>
      </Section>

      <Section title="Parâmetros de síntese (avançado)" aside={<button onClick={() => update((p) => ({ ...p, settings: { ...p.settings, synth: structuredClone(DEFAULT_SYNTH) } }))}>Restaurar preset de referência</button>}>
        <Note>O preset de referência é imutável no código: este botão sempre o restaura. Mudar o mapeamento invalida a aprovação.</Note>
        <div className="grid4">
          <Select<MappingPreset>
            label="Mapeamento linha → frequência"
            value={mapping.preset}
            options={[
              { value: 'referencia', label: 'Referência (calibrado nos WAVs originais)' },
              { value: 'v03', label: 'v0.3 (200 Hz@44 – 2200 Hz@16)' },
              { value: 'v10', label: 'v1.0 (180–1800 Hz na altura do texto) — experimental' },
              { value: 'personalizado', label: 'Personalizado' },
            ]}
            onChange={(v) => setMapping(v === 'personalizado' ? { ...mapping, preset: 'personalizado' } : structuredClone(MAPPING_PRESETS[v]))}
          />
          {mapping.preset === 'personalizado' && (
            <>
              <Select label="Escala de síntese" value={mapping.scale} options={[{ value: 'log', label: 'Logarítmica' }, { value: 'linear', label: 'Linear' }]} onChange={(v) => setMapping({ ...mapping, scale: v })} />
              <Num label="Freq. mínima de síntese" unit="Hz" value={mapping.fLowHz} min={20} onChange={(v) => setMapping({ ...mapping, fLowHz: v })} />
              <Num label="Freq. máxima de síntese" unit="Hz" value={mapping.fHighHz} max={10900} onChange={(v) => setMapping({ ...mapping, fHighHz: v })} />
              <Select label="Ancoragem" value={mapping.anchor} options={[{ value: 'tela', label: 'Tela inteira (linha fixa)' }, { value: 'texto', label: 'Altura do texto (estica)' }]} onChange={(v) => setMapping({ ...mapping, anchor: v })} />
            </>
          )}
        </div>
        <div className="grid4">
          <Num label="Suavização temporal (σ)" unit="ms" step={0.5} min={0} max={20} value={synth.sigmaMs} onChange={(v) => setSynth({ sigmaMs: v })} />
          <Select label="Fase" value={synth.phaseMode} options={[{ value: 'traco', label: 'Nova a cada traço (como os originais)' }, { value: 'fixa', label: 'Fixa por linha (v1.0)' }]} onChange={(v) => setSynth({ phaseMode: v })} />
          <Select label="Normalização" value={synth.normalize} options={[{ value: 'rms', label: 'RMS ativo 0,107 (como os originais)' }, { value: 'pico', label: 'Pico (v1.0)' }]} onChange={(v) => setSynth({ normalize: v })} />
          <Num label="Semente" value={synth.seed} onChange={(v) => setSynth({ seed: Math.round(v) })} />
        </div>
        {frame && <p className="muted">Com o mapeamento atual, esta frase ocupa {Math.round(rowToHz(mapping, frame, frame.rowBottom))}–{Math.round(rowToHz(mapping, frame, frame.rowTop))} Hz nas linhas de referência; linha 44 = {Math.round(rowToHz(mapping, frame, 44))} Hz, linha 16 = {Math.round(rowToHz(mapping, frame, 16))} Hz.</p>}
      </Section>
    </>
  );
}

function Metrics({ res, metrics }: { res: AnalyzeRes; metrics?: ImageComparison }) {
  const w = res.wavCheck;
  return (
    <div className="metrics">
      <span>WAV: {w.sampleRate} Hz · {w.channels} canal(is) · {w.frames} amostras ({(w.frames / w.sampleRate).toFixed(4)} s){w.channelsIdentical !== null && ` · L ${w.channelsIdentical ? '=' : '≠'} R`}</span>
      <span>Energia 5–95%: {Math.round(res.bandLoHz)}–{Math.round(res.bandHiHz)} Hz</span>
      {metrics && (
        <span title="SSIM entre o BMP e a reconstrução C′ (1 = idêntico). Comparar com o valor do WAV original de referência (~0,68–0,72).">
          SSIM (região do texto): <b>{metrics.ssimText.toFixed(3)}</b> · correlação {metrics.correlation.toFixed(3)}
        </span>
      )}
    </div>
  );
}

function MixWarning({ res }: { res: AnalyzeRes }) {
  const s = res.metrics!.ssimText;
  if (s >= 0.55) return <Note kind="ok">Legibilidade na mistura medida (SSIM {s.toFixed(2)}) próxima da camada isolada.</Note>;
  return <Note kind="warn">A mistura prejudica a leitura (SSIM {s.toFixed(2)}). Reduza o fundo, use ruído fora da banda do texto ou ative o ducking (atua só no fundo). A camada espectral isolada continua intacta.</Note>;
}
