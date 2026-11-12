// Bússola: direção, seta até o destino escolhido, dados do GPS e luz do dia restante.

import { h, clear, toast, errorMessage, sheet } from '../ui.js';
import { getState, update, subscribe } from '../state.js';
import { watchPosition, getPosition } from '../location.js';
import { startCompass, subscribeHeading, isStarted, isSupported } from '../compass-sensor.js';
import { getInstalledPack } from '../mappack.js';
import { normalizeDeg, signedDelta, cardinal, bearingDeg, distanceMeters, formatDistance, formatDecimal, compassCorrection } from '../lib/geo.js';
import { sunTimes, daylightLeftMinutes } from '../lib/sun.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ON_COURSE_DEG = 10;
let refs = {};
let fix = null;
let heading = null;
let rawHeading = null;
let declination = 0;
let stopWatch = null;
let stopHeading = null;

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  children.forEach((c) => el.append(c));
  return el;
}

function buildRose() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const major = i % 9 === 0;
    return svg('line', { x1: 100, y1: 8, x2: 100, y2: major ? 22 : 15, stroke: 'currentColor', 'stroke-width': major ? 2.5 : 1, opacity: major ? 1 : 0.5, transform: `rotate(${i * 5} 100 100)` });
  });
  const letter = (t, deg, color) => svg('text', { x: 100, y: 40, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: color, transform: `rotate(${deg} 100 100)` }, document.createTextNode(t));
  const rose = svg('g', { class: 'rose' }, ...ticks, letter('N', 0, '#ff453a'), letter('L', 90, 'currentColor'), letter('S', 180, 'currentColor'), letter('O', 270, 'currentColor'));
  const arrow = svg('g', { class: 'target-arrow', opacity: 0 }, svg('path', { d: 'M100 46 L114 92 L100 84 L86 92 Z', fill: '#ffb020', stroke: '#000', 'stroke-width': 1.5 }));
  const pointer = svg('path', { d: 'M100 2 L108 16 L92 16 Z', fill: 'currentColor' });
  const root = svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'Bússola' },
    svg('circle', { cx: 100, cy: 100, r: 96, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: 0.35 }), rose, arrow, pointer,
    svg('circle', { cx: 100, cy: 100, r: 4, fill: 'currentColor' }));
  return { root, rose, arrow };
}

const correction = () => getState().settings.compassCorrection ?? declination;

function renderHeading() {
  if (heading === null) {
    refs.headingNum.textContent = '—';
    refs.headingSub.textContent = isSupported() ? 'Toque em "Ativar bússola"' : 'Sensor de bússola indisponível';
    return;
  }
  const h0 = Math.round(heading);
  refs.headingNum.textContent = `${h0}° ${cardinal(h0)}`;
  const c = Math.round(correction());
  refs.headingSub.textContent = c ? `Norte verdadeiro (correção ${c > 0 ? '+' : ''}${c}°)` : 'Norte magnético (sem correção)';
  refs.rose.setAttribute('transform', `rotate(${-heading} 100 100)`);
  renderTarget();
}

function renderTarget() {
  const target = getState().target;
  clear(refs.target);
  if (!target) {
    refs.arrow.setAttribute('opacity', 0);
    refs.target.append(h('p', { class: 'muted', text: 'Sem destino. Escolha um ponto no mapa (toque nele) ou em Pontos ☰ e use "Seguir com a bússola".' }));
    return;
  }
  refs.target.append(h('div', { class: 'row' }, h('b', { class: 'grow', text: `🎯 ${target.name || 'Destino'}` }),
    h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Limpar', on: { click: () => update('target', () => null) } })));
  if (!fix) {
    refs.arrow.setAttribute('opacity', 0);
    refs.target.append(h('p', { class: 'muted', text: 'Aguardando GPS para calcular distância e direção…' }));
    return;
  }
  const brg = bearingDeg(fix, target);
  const dist = distanceMeters(fix, target);
  refs.target.append(h('div', { class: 'big-number', text: formatDistance(dist) }), h('div', { class: 'muted', text: `Rumo ${Math.round(brg)}° ${cardinal(brg)}` }));
  if (heading === null) {
    refs.arrow.setAttribute('opacity', 0);
    return;
  }
  const delta = signedDelta(brg, heading);
  refs.arrow.setAttribute('opacity', 1);
  refs.arrow.setAttribute('transform', `rotate(${delta} 100 100)`);
  const turn = Math.abs(delta) <= ON_COURSE_DEG ? 'Siga em frente ⬆' : delta > 0 ? `Vire ${Math.round(delta)}° à direita ➡` : `Vire ${Math.round(-delta)}° à esquerda ⬅`;
  refs.target.append(h('div', { class: 'big-number', style: 'font-size:1.4rem;margin-top:6px', text: turn }));
}

function renderInfo() {
  clear(refs.info);
  const cell = (label, value) => h('div', { class: 'card', style: 'margin:0' }, h('div', { class: 'small muted', text: label }), h('b', { text: value }));
  if (!fix) {
    refs.info.append(cell('GPS', 'procurando…'));
    return;
  }
  const now = new Date();
  const { sunrise, sunset } = sunTimes(now, fix.lat, fix.lon);
  const fmt = (d) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
  const left = daylightLeftMinutes(now, fix.lat, fix.lon);
  refs.info.append(
    cell('Posição', formatDecimal(fix.lat, fix.lon, 5)),
    cell('Precisão', `±${Math.round(fix.accuracy)} m`),
    cell('Altitude', Number.isFinite(fix.altitude) ? `${Math.round(fix.altitude)} m` : '—'),
    cell('Velocidade', Number.isFinite(fix.speed) && fix.speed >= 0 ? `${(fix.speed * 3.6).toFixed(1).replace('.', ',')} km/h` : '—'),
    cell('Nascer / pôr do sol', `${fmt(sunrise)} / ${fmt(sunset)}`),
    cell('Luz do dia restante', left > 0 ? `${Math.floor(left / 60)} h ${left % 60} min` : 'Escuro'),
  );
}

async function activate() {
  try {
    await startCompass();
    stopHeading?.();
    stopHeading = subscribeHeading(({ heading: smoothed, raw }) => {
      rawHeading = raw;
      heading = normalizeDeg(smoothed + correction());
      renderHeading();
    });
    refs.activate.hidden = true;
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
}

function openCalibration() {
  const samples = [];
  let start = null;
  let unsub = null;
  const status = h('p', { class: 'warn', text: 'Segure o celular deitado, apontando para a frente. Fique num lugar aberto, longe de carros e metais.' });
  const startBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Começar', on: { click: begin } });
  const endBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Cheguei (andei uns 30 m)', hidden: true, on: { click: finish } });
  const ref = sheet('Calibrar andando', h('div', { class: 'stack' },
    h('p', { text: 'Ande em linha reta uns 30 metros apontando o celular para onde você anda. O app compara o caminho do GPS com a bússola e calcula a correção.' }),
    status, startBtn, endBtn,
    h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Usar declinação da região', on: { click: async () => { await update('settings', (s) => ({ ...s, compassCorrection: null })); ref.close(); toast('Correção da região aplicada'); } } }),
  ), { onClose: () => unsub?.() });

  async function begin() {
    try {
      if (!isStarted()) await activate();
      status.textContent = 'Lendo GPS…';
      start = await getPosition();
      if (start.accuracy > 25) toast(`GPS fraco (±${Math.round(start.accuracy)} m). O resultado pode variar.`);
      unsub = subscribeHeading(({ raw }) => samples.push(raw));
      status.textContent = 'Agora ande em linha reta…';
      startBtn.hidden = true;
      endBtn.hidden = false;
    } catch (err) {
      status.textContent = errorMessage(err);
    }
  }

  async function finish() {
    try {
      const end = await getPosition();
      unsub?.();
      const value = compassCorrection(start, end, samples);
      await update('settings', (s) => ({ ...s, compassCorrection: value }));
      ref.close();
      toast(`Bússola calibrada: correção ${value > 0 ? '+' : ''}${value}°`);
    } catch (err) {
      status.textContent = errorMessage(err);
    }
  }
}

export function initCompassView(section) {
  const { root, rose, arrow } = buildRose();
  refs = {
    rose, arrow,
    headingNum: h('div', { class: 'big-number' }),
    headingSub: h('div', { class: 'muted small' }),
    target: h('div', { class: 'card' }),
    info: h('div', { class: 'grid-2' }),
    activate: h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Ativar bússola', on: { click: activate } }),
  };
  section.append(
    h('div', { class: 'heading-readout' }, refs.headingNum, refs.headingSub),
    h('div', { class: 'compass' }, root),
    refs.activate,
    refs.target,
    refs.info,
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('h3', { text: 'Precisão da bússola' }),
      h('p', { class: 'small muted', text: 'Segure o celular na horizontal, longe de ímãs (capas magnéticas, MagSafe), carros e grades. No Rio a diferença entre norte magnético e verdadeiro é de cerca de 23°: o app corrige isso. Confirme uma vez com "Calibrar andando".' }),
      h('button', { class: 'btn btn-block', type: 'button', text: 'Calibrar andando', on: { click: openCalibration } }),
    ),
    h('a', { class: 'btn btn-block btn-ghost', href: '#guias/orientacao', text: 'Sem bússola? Oriente-se pelo sol e estrelas ›' }),
  );
  subscribe((key) => {
    if (key === 'target') renderTarget();
    if (key === 'settings' && rawHeading !== null) {
      heading = normalizeDeg(rawHeading + correction());
      renderHeading();
    }
  });
  renderHeading();
  renderTarget();
  renderInfo();
}

export async function showCompassView() {
  const pack = await getInstalledPack();
  declination = pack?.declination ?? 0;
  refs.activate.hidden = isStarted();
  if (isStarted() && !stopHeading) activate();
  if (!stopWatch) {
    stopWatch = watchPosition((f) => {
      fix = f;
      renderTarget();
      renderInfo();
    }, () => renderInfo());
  }
  renderHeading();
}

export function hideCompassView() {
  stopWatch?.();
  stopWatch = null;
}
