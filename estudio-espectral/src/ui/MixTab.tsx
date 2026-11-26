import { useRef, useState } from 'react';
import { SCHUMANN_NOMINAL_HZ, SOLFEGGIO_HZ } from '../core/constants';
import { NOISES, type NoiseKind } from '../core/generators';
import type { LayerCtl, MixSettings } from '../core/mixer';
import { uid } from '../core/project';
import { decodeAudioFile, player } from '../browser/media';
import { db } from '../browser/storage';
import { engine } from '../browser/engine';
import { decodeWav } from '../core/wav';
import { ACOUSTIC_NOTES } from '../content/methods';
import { Check, Note, Num, Section, Select, Slider, fmtTime } from './common';
import { useStudio } from './state';

const BANDS = [
  { value: 0, label: 'Desligado' },
  { value: 2, label: 'Delta (2 Hz)' },
  { value: 6, label: 'Teta (6 Hz)' },
  { value: SCHUMANN_NOMINAL_HZ, label: '7,83 Hz (Schumann — valor nominal)' },
  { value: 10, label: 'Alfa (10 Hz)' },
  { value: 18, label: 'Beta (18 Hz)' },
  { value: 40, label: 'Gama (40 Hz)' },
];

function LayerRow({ name, ctl, onChange }: { name: string; ctl: LayerCtl; onChange: (c: LayerCtl) => void }) {
  return (
    <div className="layer">
      <Slider label={`Ganho — ${name}`} value={ctl.gain} onChange={(v) => onChange({ ...ctl, gain: v })} />
      <Check label="Solo" checked={ctl.solo} onChange={(v) => onChange({ ...ctl, solo: v })} />
      <Check label="Mudo" checked={ctl.mute} onChange={(v) => onChange({ ...ctl, mute: v })} />
    </div>
  );
}

export function MixTab() {
  const { project, update, musicList, refreshMusic, loadMusic, setStatus, synthOf } = useStudio();
  const mix = project.settings.mix;
  const setMix = (fn: (m: MixSettings) => MixSettings) => update((p) => ({ ...p, settings: { ...p.settings, mix: fn(structuredClone(p.settings.mix)) } }));
  const musicInput = useRef<HTMLInputElement>(null);
  const [prev, setPrev] = useState<{ mix: [Float32Array, Float32Array]; spectral: [Float32Array, Float32Array]; seconds: number; gain: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<'' | 'mix' | 'spectral'>('');

  async function importMusic(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        const dec = await decodeAudioFile(f);
        const rec = { id: uid(), name: f.name, type: f.type, size: f.size, seconds: dec.seconds, addedAt: new Date().toISOString(), blob: f as Blob, licenseNote: '' };
        await db.music.put(rec);
        setMix((m) => ({ ...m, music: { ...m.music, trackId: rec.id } }));
        setStatus(`Música adicionada à biblioteca local: ${f.name} (${fmtTime(dec.seconds)}).`);
      } catch (e) {
        setStatus(`${f.name}: ${(e as Error).message}`);
      }
    }
    await refreshMusic();
  }

  async function makePreview() {
    if (!project.phrases.length) return setStatus('Adicione frases primeiro.');
    setBusy(true);
    try {
      const monos = [] as Float32Array[];
      for (const p of project.phrases) monos.push((await synthOf(p)).mono.slice());
      const cycle = monos.reduce((a, m) => a + m.length, 0) / 22050 + (project.settings.gapMs / 1000) * monos.length;
      const music = mix.music.trackId ? await loadMusic(mix.music.trackId) : null;
      const job = engine.render({ phrases: monos, totalSeconds: cycle, gapMs: project.settings.gapMs, endMode: 'completas', mix, music, outputs: { mix: true, spectral: true }, sink: 'memory', baseName: 'previa' }, () => undefined);
      const out = await job.promise;
      const dec = async (i: number) => decodeWav(new Uint8Array(await out.files[i].blob.arrayBuffer())).channels as [Float32Array, Float32Array];
      setPrev({ mix: await dec(0), spectral: await dec(1), seconds: out.seconds, gain: out.masterGain });
      setStatus(`Prévia do primeiro ciclo pronta (${fmtTime(out.seconds)}). Ganho mestre fixo ${out.masterGain.toFixed(2)}.`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function play(which: 'mix' | 'spectral') {
    if (!prev) return;
    if (playing === which) { player.stop(); setPlaying(''); return; }
    player.onEnd = () => setPlaying('');
    await player.play(...prev[which]);
    setPlaying(which);
  }

  return (
    <>
      <Section title="Prévia rápida do primeiro ciclo">
        <p className="muted">Gera todas as frases com as pausas, uma vez, nas versões com e sem fundo.</p>
        <div className="row wrap gap">
          <button className="primary" onClick={() => void makePreview()} disabled={busy}>{busy ? 'Gerando…' : 'Gerar prévia (com e sem fundo)'}</button>
          <button onClick={() => void play('spectral')} disabled={!prev}>{playing === 'spectral' ? '■ Parar' : '▶ Sem fundo (camada espectral)'}</button>
          <button onClick={() => void play('mix')} disabled={!prev}>{playing === 'mix' ? '■ Parar' : '▶ Com fundo (mistura)'}</button>
        </div>
        <Note>Para conferir a legibilidade da mistura, use a aba Espectrograma com “Mistura real com o fundo atual”.</Note>
      </Section>

      <Section title="Camada espectral (texto)">
        <LayerRow name="texto espectral" ctl={mix.spectral} onChange={(c) => setMix((m) => ({ ...m, spectral: { ...m.spectral, ...c } }))} />
        <p className="muted">O arquivo “camada espectral” é sempre exportado sem fundo e sem este ganho (L = R).</p>
      </Section>

      <Section title="Ruído">
        <Select<NoiseKind> label="Tipo" value={mix.noise.kind} options={NOISES.map((n) => ({ value: n.id, label: n.nome }))} onChange={(v) => setMix((m) => ({ ...m, noise: { ...m.noise, kind: v } }))} />
        <p className="muted">{NOISES.find((n) => n.id === mix.noise.kind)?.definicao}</p>
        {mix.noise.kind === 'banda' && (
          <div className="grid4">
            <Num label="De" unit="Hz" value={mix.noise.bandLowHz} onChange={(v) => setMix((m) => ({ ...m, noise: { ...m.noise, bandLowHz: v } }))} />
            <Num label="Até" unit="Hz" value={mix.noise.bandHighHz} onChange={(v) => setMix((m) => ({ ...m, noise: { ...m.noise, bandHighHz: v } }))} />
          </div>
        )}
        {mix.noise.kind === 'velvet' && <Num label="Densidade" unit="impulsos/s" value={mix.noise.velvetDensity} onChange={(v) => setMix((m) => ({ ...m, noise: { ...m.noise, velvetDensity: v } }))} />}
        <Check label="Estéreo descorrelacionado (L e R independentes)" checked={mix.noise.stereo} onChange={(v) => setMix((m) => ({ ...m, noise: { ...m.noise, stereo: v } }))} />
        <LayerRow name="ruído" ctl={mix.noise} onChange={(c) => setMix((m) => ({ ...m, noise: { ...m.noise, ...c } }))} />
      </Section>

      <Section title="Tom puro (solfeggio ou personalizado)">
        <div className="grid4">
          <Select
            label="Frequência"
            value={SOLFEGGIO_HZ.includes(mix.tone.freqHz as (typeof SOLFEGGIO_HZ)[number]) || mix.tone.freqHz === 0 ? mix.tone.freqHz : -1}
            options={[{ value: 0, label: 'Desligado' }, ...SOLFEGGIO_HZ.map((f) => ({ value: f, label: `${f} Hz` })), { value: -1, label: 'Personalizado' }]}
            onChange={(v) => setMix((m) => ({ ...m, tone: { ...m.tone, freqHz: v === -1 ? 440 : v } }))}
          />
          <Num label="Hz" value={mix.tone.freqHz} step={0.1} min={0} max={10000} onChange={(v) => setMix((m) => ({ ...m, tone: { ...m.tone, freqHz: v } }))} />
        </div>
        <LayerRow name="tom" ctl={mix.tone} onChange={(c) => setMix((m) => ({ ...m, tone: { ...m.tone, ...c } }))} />
      </Section>

      <Section title="Binaural (canais separados) e isocrônico">
        <div className="grid4">
          <Select label="Batimento binaural" value={BANDS.some((b) => b.value === mix.binaural.beatHz) ? mix.binaural.beatHz : -1} options={[...BANDS, { value: -1, label: 'Personalizado' }]} onChange={(v) => setMix((m) => ({ ...m, binaural: { ...m.binaural, beatHz: v === -1 ? 5 : v } }))} />
          <Num label="Diferença L/R" unit="Hz" step={0.01} value={mix.binaural.beatHz} min={0} max={45} onChange={(v) => setMix((m) => ({ ...m, binaural: { ...m.binaural, beatHz: v } }))} />
          <Num label="Portadora (esquerdo)" unit="Hz" value={mix.binaural.carrierHz} min={20} max={1500} onChange={(v) => setMix((m) => ({ ...m, binaural: { ...m.binaural, carrierHz: v } }))} />
        </div>
        <p className="muted">Esquerdo = {mix.binaural.carrierHz} Hz, direito = {(mix.binaural.carrierHz + mix.binaural.beatHz).toFixed(2)} Hz. Requer fones de ouvido estéreo.</p>
        <LayerRow name="binaural" ctl={mix.binaural} onChange={(c) => setMix((m) => ({ ...m, binaural: { ...m.binaural, ...c } }))} />
        <div className="grid4">
          <Select label="Pulsação isocrônica" value={BANDS.some((b) => b.value === mix.iso.rateHz) ? mix.iso.rateHz : -1} options={[...BANDS, { value: -1, label: 'Personalizada' }]} onChange={(v) => setMix((m) => ({ ...m, iso: { ...m.iso, rateHz: v === -1 ? 5 : v } }))} />
          <Num label="Taxa" unit="Hz" step={0.01} value={mix.iso.rateHz} min={0} max={80} onChange={(v) => setMix((m) => ({ ...m, iso: { ...m.iso, rateHz: v } }))} />
          <Num label="Portadora" unit="Hz" value={mix.iso.carrierHz} min={20} max={5000} onChange={(v) => setMix((m) => ({ ...m, iso: { ...m.iso, carrierHz: v } }))} />
        </div>
        <LayerRow name="isocrônico" ctl={mix.iso} onChange={(c) => setMix((m) => ({ ...m, iso: { ...m.iso, ...c } }))} />
      </Section>

      <Section title="Música (biblioteca local)">
        <Note>Use apenas gravações próprias ou com licença. Composições de Mozart e Bach estão em domínio público, mas GRAVAÇÕES comerciais geralmente não. Nenhuma gravação é incluída no aplicativo.</Note>
        <div className="row wrap gap">
          <button onClick={() => musicInput.current?.click()}>Importar WAV / MP3 / FLAC / M4A / OGG</button>
          <input ref={musicInput} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" multiple hidden onChange={(e) => { void importMusic(e.target.files); e.target.value = ''; }} />
        </div>
        <Select label="Faixa" value={mix.music.trackId ?? ''} options={[{ value: '', label: 'Nenhuma' }, ...musicList.map((m) => ({ value: m.id, label: `${m.name} (${fmtTime(m.seconds)})` }))]} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, trackId: v || null } }))} />
        {mix.music.trackId && (
          <>
            <div className="grid4">
              <Num label="Início do trecho" unit="s" step={0.1} min={0} value={mix.music.trimStartS} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, trimStartS: v } }))} />
              <Num label="Fim do trecho (0 = fim)" unit="s" step={0.1} min={0} value={mix.music.trimEndS} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, trimEndS: v } }))} />
              <Num label="Crossfade na repetição" unit="ms" min={0} max={10000} value={mix.music.crossfadeMs} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, crossfadeMs: v } }))} />
              <Num label="Fade de entrada" unit="ms" min={0} value={mix.music.fadeInMs} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, fadeInMs: v } }))} />
            </div>
            <Check label="Repetir se for mais curta que a sessão (crossfade equal-power, sem cliques)" checked={mix.music.loop} onChange={(v) => setMix((m) => ({ ...m, music: { ...m.music, loop: v } }))} />
            <LayerRow name="música" ctl={mix.music} onChange={(c) => setMix((m) => ({ ...m, music: { ...m.music, ...c } }))} />
            <button className="danger" onClick={async () => { if (confirm('Remover esta música da biblioteca local?')) { await db.music.delete(mix.music.trackId!); setMix((m) => ({ ...m, music: { ...m.music, trackId: null } })); await refreshMusic(); } }}>Remover da biblioteca</button>
          </>
        )}
      </Section>

      <Section title="Proteção da legibilidade e saída">
        <Check label="Ducking: abaixar SOMENTE o fundo enquanto uma frase toca" checked={mix.ducking.enabled} onChange={(v) => setMix((m) => ({ ...m, ducking: { ...m.ducking, enabled: v } }))} />
        {mix.ducking.enabled && <Num label="Redução do fundo" unit="dB" min={0} max={40} value={mix.ducking.depthDb} onChange={(v) => setMix((m) => ({ ...m, ducking: { ...m.ducking, depthDb: v } }))} />}
        <div className="grid4">
          <Num label="Fade inicial" unit="ms" min={0} value={mix.master.fadeInMs} onChange={(v) => setMix((m) => ({ ...m, master: { ...m.master, fadeInMs: v } }))} />
          <Num label="Fade final" unit="ms" min={0} value={mix.master.fadeOutMs} onChange={(v) => setMix((m) => ({ ...m, master: { ...m.master, fadeOutMs: v } }))} />
          <Num label="Teto de pico" step={0.01} min={0.1} max={1} value={mix.master.ceiling} onChange={(v) => setMix((m) => ({ ...m, master: { ...m.master, ceiling: v } }))} />
        </div>
        <p className="muted">Sem limitador por bloco: um ganho mestre fixo é calculado antes da renderização a partir do pior caso de pico das camadas, para nunca saturar e não alterar o equilíbrio ao longo do tempo.{prev && ` Última prévia: ganho mestre ${prev.gain.toFixed(2)}.`}</p>
      </Section>

      <Section title="O que estes sons são — e o que não são">
        <ul className="notes">{ACOUSTIC_NOTES.map((n) => <li key={n}>{n}</li>)}</ul>
      </Section>
    </>
  );
}
