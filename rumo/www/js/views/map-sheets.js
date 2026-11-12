// Folhas (painéis) abertas a partir do mapa.

import { h, clear, sheet, toast, copyText, shareText, confirmSheet, field } from '../ui.js';
import { getState, update, newId } from '../state.js';
import { distanceMeters, bearingDeg, cardinal, formatDistance, formatDecimal, toDMS } from '../lib/geo.js';
import { telHref, formatStamp } from '../lib/messages.js';
import { POI_KINDS, WAYPOINT_TYPES, kindInfo, waypointInfo } from '../content/kinds.js';
import { showBigCoords } from '../overlays.js';

const NEAREST_LIMIT = 40;
const DEFAULT_KINDS = ['hospital', 'clinica'];

const originOf = (fix, center) => (fix ? { lat: fix.lat, lon: fix.lon } : center ? { lat: center.lat, lon: center.lng } : null);

function relation(origin, p) {
  if (!origin) return '';
  return `${formatDistance(distanceMeters(origin, p))} ${cardinal(bearingDeg(origin, p))}`;
}

export async function setTarget(name, lat, lon) {
  await update('target', () => ({ name, lat, lon }));
  toast(`Destino: ${name || 'ponto escolhido'}`);
  location.hash = '#bussola';
}

export function openCoordsSheet(fix, center) {
  const p = fix || (center ? { lat: center.lat, lon: center.lng, accuracy: null, time: Date.now() } : null);
  if (!p) return toast('Sem posição ainda', 'error');
  const dec = formatDecimal(p.lat, p.lon);
  const dms = `${toDMS(p.lat, true)} ${toDMS(p.lon, false)}`;
  const ref = sheet(fix ? 'Minha posição' : 'Centro do mapa', h('div', { class: 'stack' },
    h('div', { class: 'card' },
      h('div', { class: 'big-number mono', style: 'font-size:1.5rem', text: dec }),
      h('div', { class: 'mono', text: dms }),
      fix ? h('div', { class: 'muted small', text: `Precisão ±${Math.round(fix.accuracy)} m${Number.isFinite(fix.altitude) ? ` · altitude ${Math.round(fix.altitude)} m` : ''} · ${formatStamp(new Date(fix.time))}` }) : h('div', { class: 'muted small', text: 'Posição da mira no centro do mapa' }),
    ),
    h('div', { class: 'grid-2' },
      h('button', { class: 'btn', type: 'button', text: 'Copiar', on: { click: () => copyText(`${dec} (${dms})`) } }),
      h('button', { class: 'btn', type: 'button', text: 'Compartilhar', on: { click: () => shareText(`Posição: ${dec} (${dms})`) } }),
    ),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Tela cheia (para mostrar/ditar)', on: { click: () => { ref.close(); showBigCoords(p); } } }),
  ));
}

export function openMarkSheet(fix, center) {
  let type = 'encontro';
  let useGps = Boolean(fix);
  const name = h('input', { type: 'text', placeholder: 'Ex.: Casa da avó, Praça do bairro', maxlength: 80 });
  const note = h('textarea', { placeholder: 'Observação (opcional)', maxlength: 500 });
  const typeChips = h('div', { class: 'chips' });
  const posChips = h('div', { class: 'chips' });
  const renderChips = () => {
    clear(typeChips).append(...Object.entries(WAYPOINT_TYPES).map(([k, v]) => h('button', {
      class: 'chip-toggle', type: 'button', 'aria-pressed': String(k === type), text: `${v.emoji} ${v.label}`, on: { click: () => { type = k; renderChips(); } },
    })));
    clear(posChips).append(
      h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': String(useGps), disabled: !fix, text: '📡 Minha posição (GPS)', on: { click: () => { useGps = true; renderChips(); } } }),
      h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': String(!useGps), text: '✛ Mira no centro do mapa', on: { click: () => { useGps = false; renderChips(); } } }),
    );
  };
  renderChips();
  const save = async () => {
    const pos = useGps && fix ? { lat: fix.lat, lon: fix.lon } : center ? { lat: center.lat, lon: center.lng } : null;
    if (!pos) return toast('Sem posição para marcar', 'error');
    const label = name.value.trim() || waypointInfo(type).label;
    const wp = { id: newId(), name: label, type, note: note.value.trim(), createdAt: new Date().toISOString(), lat: Math.round(pos.lat * 1e6) / 1e6, lon: Math.round(pos.lon * 1e6) / 1e6 };
    await update('waypoints', (ws) => [...ws, wp]);
    ref.close();
    toast(`Ponto "${label}" salvo`);
  };
  const ref = sheet('Marcar ponto', h('div', { class: 'stack' },
    field('Nome', name), h('div', { class: 'section-title', text: 'Tipo' }), typeChips,
    h('div', { class: 'section-title', text: 'Onde' }), posChips, field('Observação', note),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Salvar ponto', on: { click: save } }),
  ));
  setTimeout(() => name.focus(), 50);
}

export function openFeatureSheet(feature, fix) {
  const [lon, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const isWaypoint = feature.layer?.id === 'wp-circle';
  const info = isWaypoint ? waypointInfo(props.type) : kindInfo(props.kind);
  const title = props.name || info.label;
  const origin = originOf(fix, null);
  const wp = isWaypoint ? getState().waypoints.find((w) => w.id === props.id) : null;
  const ref = sheet(`${info.emoji} ${title}`, h('div', { class: 'stack' },
    h('div', { class: 'muted', text: [info.label, origin ? relation(origin, { lat, lon }) : null].filter(Boolean).join(' · ') }),
    wp?.note ? h('p', { text: wp.note }) : null,
    h('div', { class: 'mono small', text: `${formatDecimal(lat, lon)} · ${toDMS(lat, true)} ${toDMS(lon, false)}` }),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '🧭 Seguir com a bússola', on: { click: () => { ref.close(); setTarget(title, lat, lon); } } }),
    props.phone ? h('a', { class: 'btn btn-block', href: telHref(props.phone), text: `📞 Ligar ${props.phone}` }) : null,
    h('button', { class: 'btn btn-block', type: 'button', text: 'Copiar coordenadas', on: { click: () => copyText(formatDecimal(lat, lon)) } }),
    isWaypoint ? h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Excluir ponto', on: { click: async () => {
      if (!(await confirmSheet('Excluir ponto?', `"${title}" será removido.`, 'Excluir', true))) return;
      await update('waypoints', (ws) => ws.filter((w) => w.id !== props.id));
      ref.close();
    } } }) : null,
  ));
}

export function openPointsSheet(fix, center, pois, flyTo) {
  const origin = originOf(fix, center);
  let tab = 'vitais';
  let kinds = new Set(DEFAULT_KINDS);
  const body = h('div');
  const row = (emoji, title, meta, onClick) => h('button', { class: 'list-item', type: 'button', on: { click: onClick } },
    h('span', { class: 'emoji', text: emoji }), h('span', { class: 'grow' }, h('div', { text: title }), h('div', { class: 'meta', text: meta })));
  const byDistance = (items) => (origin ? [...items].sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b)) : items);
  const render = () => {
    clear(body);
    body.append(h('div', { class: 'chips' },
      h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': String(tab === 'vitais'), text: 'Vitais perto', on: { click: () => { tab = 'vitais'; render(); } } }),
      h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': String(tab === 'meus'), text: `Meus pontos (${getState().waypoints.length})`, on: { click: () => { tab = 'meus'; render(); } } }),
    ));
    if (!origin) body.append(h('p', { class: 'warn', text: 'Sem GPS: distâncias contadas a partir do centro do mapa.' }));
    if (tab === 'vitais') {
      body.append(h('div', { class: 'chips' }, ...Object.entries(POI_KINDS).map(([k, v]) => h('button', {
        class: 'chip-toggle', type: 'button', 'aria-pressed': String(kinds.has(k)), text: `${v.emoji} ${v.label}`,
        on: { click: () => { kinds = new Set(kinds.has(k) ? [...kinds].filter((x) => x !== k) : [...kinds, k]); render(); } },
      }))));
      if (pois.length === 0) return body.append(h('p', { class: 'muted', text: 'Nenhum ponto vital carregado. Baixe o mapa em Preparo › Mapa offline.' }));
      const items = byDistance(pois.filter((p) => kinds.has(p.kind))).slice(0, NEAREST_LIMIT);
      body.append(h('div', { class: 'list' }, items.map((p) => {
        const info = kindInfo(p.kind);
        return row(info.emoji, p.name || info.label, [info.label, relation(origin, p)].filter(Boolean).join(' · '), () => { ref.close(); openPoiActions(p, origin, flyTo); });
      })));
      return;
    }
    const ws = byDistance(getState().waypoints);
    if (ws.length === 0) return body.append(h('p', { class: 'muted', text: 'Nenhum ponto marcado. Use ＋ no mapa para marcar casa, encontro, água…' }));
    body.append(h('div', { class: 'list' }, ws.map((w) => {
      const info = waypointInfo(w.type);
      return row(info.emoji, w.name, [info.label, relation(origin, w)].filter(Boolean).join(' · '), () => { ref.close(); openPoiActions({ ...w, kind: null }, origin, flyTo, info); });
    })));
  };
  const ref = sheet('Pontos', body);
  render();
}

function openPoiActions(p, origin, flyTo, infoOverride) {
  const info = infoOverride || kindInfo(p.kind);
  const title = p.name || info.label;
  const ref = sheet(`${info.emoji} ${title}`, h('div', { class: 'stack' },
    h('div', { class: 'muted', text: [info.label, relation(origin, p)].filter(Boolean).join(' · ') }),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '🧭 Seguir com a bússola', on: { click: () => { ref.close(); setTarget(title, p.lat, p.lon); } } }),
    h('button', { class: 'btn btn-block', type: 'button', text: '🗺️ Ver no mapa', on: { click: () => { ref.close(); flyTo(p.lon, p.lat); } } }),
    p.phone ? h('a', { class: 'btn btn-block', href: telHref(p.phone), text: `📞 Ligar ${p.phone}` }) : null,
  ));
}

export function openTracksSheet(fitPoints) {
  const body = h('div');
  const render = () => {
    clear(body);
    const tracks = getState().tracks;
    if (tracks.length === 0) return body.append(h('p', { class: 'muted', text: 'Nenhuma trilha salva. Toque em ⏺ no mapa para gravar o caminho e conseguir voltar por ele.' }));
    body.append(h('div', { class: 'list' }, tracks.map((t) => h('div', { class: 'card' },
      h('b', { text: t.name }),
      h('div', { class: 'small muted', text: `${formatDistance(t.distance)} · ${t.startedAt ? new Date(t.startedAt).toLocaleString('pt-BR') : ''}` }),
      h('div', { class: 'row wrap', style: 'margin-top:8px' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: '↩ Voltar ao início', on: { click: () => { ref.close(); const [lon, lat] = t.points[0]; setTarget(`Início: ${t.name}`, lat, lon); } } }),
        h('button', { class: 'btn btn-sm', type: 'button', text: 'Ver', on: { click: () => { ref.close(); location.hash = '#mapa'; fitPoints(t.points); } } }),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Excluir', on: { click: async () => {
          if (!(await confirmSheet('Excluir trilha?', `"${t.name}" será removida.`, 'Excluir', true))) return;
          await update('tracks', (ts) => ts.filter((x) => x.id !== t.id));
          render();
        } } }),
      ),
    ))));
  };
  const ref = sheet('Trilhas', body);
  render();
}

export function openStopTrackSheet(draft, onSave, onDiscard) {
  const name = h('input', { type: 'text', value: `Trilha ${new Date(draft.startedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, maxlength: 80 });
  const ref = sheet('Parar gravação', h('div', { class: 'stack' },
    h('p', { text: `${draft.points.length} pontos gravados.` }),
    field('Nome da trilha', name),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Salvar trilha', on: { click: async () => { await onSave(name.value.trim() || 'Trilha'); ref.close(); toast('Trilha salva'); } } }),
    h('button', { class: 'btn btn-block', type: 'button', text: 'Continuar gravando', on: { click: () => ref.close() } }),
    h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Descartar', on: { click: async () => { await onDiscard(); ref.close(); } } }),
  ));
}
