// Tela do mapa: mapa offline (PMTiles guardado no aparelho), posição, pontos vitais, pontos do usuário e trilha.

import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { layers, namedFlavor } from '../../vendor/basemaps.mjs';
import { h, clear, toast, errorMessage, keepScreenOn } from '../ui.js';
import { getState, update, updateInMemory, persist, subscribe, newId } from '../state.js';
import { watchPosition, getPosition, getLastFix } from '../location.js';
import { getInstalledPack, loadPackBlob, getPois } from '../mappack.js';
import { formatDecimal, shouldAppendTrackPoint, trackDistance, formatDistance, distanceMeters } from '../lib/geo.js';
import { POI_KINDS, WAYPOINT_TYPES } from '../content/kinds.js';
import * as sheets from './map-sheets.js';

const FALLBACK_CENTER = [-43.1729, -22.9068];
const TOUCH_RADIUS_PX = 16;
const DRAFT_SAVE_EVERY_POINTS = 10;
const DRAFT_SAVE_EVERY_MS = 30000;
let lastDraftSave = 0;
const EMPTY = { type: 'FeatureCollection', features: [] };
const protocol = window.pmtiles ? new window.pmtiles.Protocol() : null;
if (protocol) maplibregl.addProtocol('pmtiles', protocol.tile);

class BlobSource {
  constructor(blob, key) {
    this.blob = blob;
    this.key = key;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset, length) {
    return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
  }
}

let map = null;
let root = null;
let refs = {};
let fix = null;
let follow = true;
let archiveKey = null;
let pois = [];
let stopWatch = null;
let visible = false;

const appBase = () => new URL('.', location.href).href;
const flavor = () => (getState().settings.mapFlavor === 'light' && !getState().settings.critical ? 'light' : 'dark');
const fc = (features) => ({ type: 'FeatureCollection', features });
const point = (lon, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });

function buildStyle() {
  const f = flavor();
  const base = appBase();
  const style = { version: 8, glyphs: `${base}map-assets/fonts/{fontstack}/{range}.pbf`, sprite: `${base}map-assets/sprites/${f}`, sources: {}, layers: [] };
  if (archiveKey) {
    style.sources.protomaps = { type: 'vector', url: `pmtiles://${archiveKey}`, attribution: '© OpenStreetMap · Protomaps' };
    style.layers = layers('protomaps', namedFlavor(f), { lang: 'pt' });
  } else {
    style.layers = [{ id: 'fundo', type: 'background', paint: { 'background-color': f === 'dark' ? '#1b1f22' : '#eef0f1' } }];
  }
  return style;
}

function colorMatch(dict, prop) {
  return ['match', ['get', prop], ...Object.entries(dict).flatMap(([k, v]) => [k, v.color]), '#999999'];
}

function circlePolygon(lat, lon, radius, steps = 48) {
  const coords = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    return [lon + (radius / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(t), lat + (radius / 111320) * Math.cos(t)];
  });
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

const poisData = () => fc(pois.map((p) => point(p.lon, p.lat, { kind: p.kind, name: p.name, phone: p.phone })));
const waypointsData = () => fc(getState().waypoints.map((w) => point(w.lon, w.lat, { id: w.id, type: w.type, name: w.name })));
const line = (pts, props) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map((p) => [p[0], p[1]]) }, properties: props });
const tracksData = () => fc(getState().tracks.filter((t) => t.points.length > 1).map((t) => line(t.points, { id: t.id })));
const draftData = () => {
  const d = getState().trackDraft;
  return d && d.points.length > 1 ? fc([line(d.points, {})]) : EMPTY;
};
const meData = () => (fix ? fc([point(fix.lon, fix.lat, {})]) : EMPTY);
const meAccData = () => (fix ? fc([circlePolygon(fix.lat, fix.lon, Math.max(5, fix.accuracy || 0))]) : EMPTY);

function setData(id, data) {
  map?.getSource(id)?.setData(data);
}

function addOverlays() {
  const sources = { pois: poisData(), waypoints: waypointsData(), tracks: tracksData(), draft: draftData(), 'me-acc': meAccData(), me: meData() };
  for (const [id, data] of Object.entries(sources)) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data });
  const text = { 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true };
  const halo = { 'text-color': flavor() === 'dark' ? '#ffffff' : '#111111', 'text-halo-color': flavor() === 'dark' ? '#000000' : '#ffffff', 'text-halo-width': 1.5 };
  const defs = [
    { id: 'tracks-line', type: 'line', source: 'tracks', paint: { 'line-color': '#ffb020', 'line-width': 3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.8 } },
    { id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#ff453a', 'line-width': 4 } },
    { id: 'pois-circle', type: 'circle', source: 'pois', minzoom: 11, paint: { 'circle-color': colorMatch(POI_KINDS, 'kind'), 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8], 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } },
    { id: 'pois-label', type: 'symbol', source: 'pois', minzoom: 15, layout: { 'text-field': ['get', 'name'], ...text, 'text-size': 11 }, paint: halo },
    { id: 'wp-circle', type: 'circle', source: 'waypoints', paint: { 'circle-color': colorMatch(WAYPOINT_TYPES, 'type'), 'circle-radius': 9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } },
    { id: 'wp-label', type: 'symbol', source: 'waypoints', minzoom: 9, layout: { 'text-field': ['get', 'name'], ...text }, paint: halo },
    { id: 'me-acc', type: 'fill', source: 'me-acc', paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.15 } },
    { id: 'me-dot', type: 'circle', source: 'me', paint: { 'circle-color': '#0a84ff', 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  ];
  for (const def of defs) if (!map.getLayer(def.id)) map.addLayer(def);
}

async function prepareArchive() {
  const pack = await getInstalledPack();
  pois = await getPois();
  if (!pack?.complete || !protocol) {
    archiveKey = null;
    return null;
  }
  const key = `mapa-${Date.parse(pack.installedAt) || Date.now()}`;
  if (key !== archiveKey) {
    const archive = new window.pmtiles.PMTiles(new BlobSource(await loadPackBlob(pack), key));
    protocol.add(archive);
    archiveKey = key;
  }
  return pack;
}

function initialCenter(pack) {
  if (fix) return [fix.lon, fix.lat];
  if (pack?.center) return pack.center;
  return FALLBACK_CENTER;
}

async function createMap() {
  let pack = null;
  try {
    pack = await prepareArchive();
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
  map = new maplibregl.Map({
    container: refs.map,
    style: buildStyle(),
    center: initialCenter(pack),
    zoom: pack ? 12 : 10,
    maxZoom: 19,
    attributionControl: false,
    pitchWithRotate: false,
    dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  map.on('style.load', addOverlays);
  map.on('dragstart', () => setFollow(false));
  map.on('click', onMapClick);
  map.on('error', (e) => {
    // Sem internet, fontes de caracteres raros podem faltar: o mapa segue funcionando.
    console.warn('[mapa]', e?.error?.message || e);
  });
  renderEmptyState(pack);
}

/** Recarrega o mapa (depois de baixar/importar pacote ou trocar tema). */
export async function reloadMap() {
  if (!map) return;
  try {
    const pack = await prepareArchive();
    map.setStyle(buildStyle());
    if (pack?.center) map.jumpTo({ center: pack.center, zoom: 12 });
    renderEmptyState(pack);
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
}

function onMapClick(e) {
  const r = TOUCH_RADIUS_PX;
  const ids = ['wp-circle', 'pois-circle'].filter((id) => map.getLayer(id));
  const box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
  const feature = map.queryRenderedFeatures(box, { layers: ids })[0];
  if (feature) sheets.openFeatureSheet(feature, fix);
}

function setFollow(on) {
  follow = on;
  refs.locate?.classList.toggle('active', on);
}

function onFix(next) {
  fix = next;
  setData('me', meData());
  setData('me-acc', meAccData());
  renderCoords();
  if (follow && map) map.easeTo({ center: [fix.lon, fix.lat], duration: 400, zoom: Math.max(map.getZoom(), 14) });
  appendToTrack(fix);
}

/** Ponto novo vai para a memória a cada leitura; o disco é atualizado a cada 10 pontos ou 30 s. */
async function appendToTrack(f) {
  const draft = getState().trackDraft;
  if (!draft) return;
  const last = draft.points[draft.points.length - 1];
  const lastObj = last ? { lon: last[0], lat: last[1] } : null;
  if (!shouldAppendTrackPoint(lastObj, f)) return;
  const pt = [Math.round(f.lon * 1e6) / 1e6, Math.round(f.lat * 1e6) / 1e6, f.time];
  const step = lastObj ? distanceMeters(lastObj, f) : 0;
  const next = updateInMemory('trackDraft', (d) => (d ? { ...d, points: [...d.points, pt], distance: (d.distance || 0) + step } : d));
  const due = next.points.length % DRAFT_SAVE_EVERY_POINTS === 0 || Date.now() - lastDraftSave > DRAFT_SAVE_EVERY_MS;
  if (due) await saveDraft();
}

async function saveDraft() {
  if (!getState().trackDraft) return;
  lastDraftSave = Date.now();
  try {
    await persist('trackDraft');
  } catch (err) {
    toast(`Trilha não foi salva: ${errorMessage(err)}`, 'error', 5000);
  }
}

function startGps() {
  if (!stopWatch) stopWatch = watchPosition(onFix, (msg) => renderCoords(msg));
}

function stopGps() {
  if (stopWatch && !getState().trackDraft) {
    stopWatch();
    stopWatch = null;
  }
}

async function locate() {
  setFollow(true);
  if (fix && map) map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 15), duration: 400 });
  try {
    onFix(await getPosition());
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
}

function renderCoords(errorText) {
  if (!refs.coords) return;
  const f = fix || getLastFix();
  clear(refs.coords);
  if (f) {
    refs.coords.append(h('b', { class: 'mono', text: formatDecimal(f.lat, f.lon) }), h('span', { class: 'muted', text: `±${Math.round(f.accuracy)} m · toque para opções` }));
  } else {
    refs.coords.append(h('b', { text: errorText ? 'Sem GPS' : 'Procurando GPS…' }), h('span', { class: 'muted small', text: errorText || 'Fique em local aberto' }));
  }
}

function renderRecBar() {
  const draft = getState().trackDraft;
  refs.rec.classList.toggle('rec', Boolean(draft));
  refs.rec.textContent = draft ? '⏹' : '⏺';
  clear(refs.recBar).hidden = !draft;
  if (!draft) return;
  refs.recBar.append(
    h('div', { class: 'card' }, h('b', { text: '● Gravando trilha' }), h('div', { class: 'small muted', text: `${formatDistance(draft.distance || 0)} · ${draft.points.length} pontos · mantenha o app aberto` })),
    h('button', { class: 'btn btn-danger', type: 'button', text: 'Parar', on: { click: () => toggleRecording() } }),
  );
}

async function toggleRecording() {
  const draft = getState().trackDraft;
  if (draft) {
    sheets.openStopTrackSheet(draft, async (name) => {
      const current = getState().trackDraft || draft; // inclui pontos chegados com a folha aberta
      const distance = trackDistance(current.points.map((p) => ({ lon: p[0], lat: p[1] })));
      if (current.points.length > 1) {
        const track = { id: current.id, name, startedAt: current.startedAt, endedAt: new Date().toISOString(), distance, points: current.points };
        await update('tracks', (ts) => [track, ...ts]);
      }
      await update('trackDraft', () => null);
      keepScreenOn('trilha', false);
      if (!visible) stopGps();
    }, async () => {
      await update('trackDraft', () => null);
      keepScreenOn('trilha', false);
    });
    return;
  }
  await update('trackDraft', () => ({ id: newId(), startedAt: new Date().toISOString(), points: [], distance: 0 }));
  lastDraftSave = Date.now();
  keepScreenOn('trilha', true);
  startGps();
  toast('Gravando a trilha. Deixe o app aberto e a tela acesa.');
}

function renderEmptyState(pack) {
  clear(refs.empty).hidden = Boolean(pack);
  if (pack) return;
  refs.empty.append(h('div', { class: 'card' },
    h('h3', { text: 'Mapa offline ainda não instalado' }),
    h('p', { class: 'small muted', text: 'Baixe agora, com internet, para ter ruas, hospitais e água mesmo sem sinal. Seus pontos e o GPS já funcionam.' }),
    h('a', { class: 'btn btn-primary btn-block', href: '#preparo/mapa', text: 'Baixar mapa da região' }),
  ));
}

export function initMapView(section) {
  root = section;
  refs = {
    map: h('div', { id: 'map' }),
    coords: h('button', { class: 'coord-chip', type: 'button', on: { click: () => sheets.openCoordsSheet(fix, map?.getCenter()) } }),
    locate: h('button', { class: 'fab active', type: 'button', 'aria-label': 'Minha posição', text: '◎', on: { click: locate } }),
    rec: h('button', { class: 'fab', type: 'button', 'aria-label': 'Gravar trilha', text: '⏺', on: { click: () => toggleRecording() } }),
    empty: h('div', { class: 'map-empty' }),
    recBar: h('div', { class: 'rec-bar', hidden: true }),
  };
  const fab = (label, text, onClick) => h('button', { class: 'fab', type: 'button', 'aria-label': label, text, on: { click: onClick } });
  root.append(h('div', { class: 'map-wrap' },
    refs.map,
    h('div', { class: 'crosshair' }),
    h('div', { class: 'map-top' }, refs.coords),
    h('div', { class: 'map-fabs' },
      refs.locate,
      fab('Marcar ponto', '＋', () => sheets.openMarkSheet(fix, map?.getCenter())),
      fab('Pontos próximos', '☰', () => sheets.openPointsSheet(fix, map?.getCenter(), pois, flyTo)),
      refs.rec,
      fab('Trilhas salvas', '〰', () => sheets.openTracksSheet(flyToBounds)),
    ),
    refs.empty,
    refs.recBar,
  ));
  renderCoords();
  renderRecBar();
  subscribe((key) => {
    if (key === 'waypoints') setData('waypoints', waypointsData());
    if (key === 'tracks') setData('tracks', tracksData());
    if (key === 'trackDraft') {
      setData('draft', draftData());
      renderRecBar();
    }
  });
  // Ao sair do app (ou trocar de app), salva a trilha em andamento na hora.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraft();
  });
  if (getState().trackDraft) {
    startGps();
    keepScreenOn('trilha', true);
  }
}

export function flyTo(lon, lat, zoom = 16) {
  setFollow(false);
  location.hash = '#mapa';
  setTimeout(() => map?.flyTo({ center: [lon, lat], zoom, duration: 800 }), 60);
}

function flyToBounds(points) {
  if (!map || points.length === 0) return;
  setFollow(false);
  const bounds = points.reduce((b, p) => b.extend([p[0], p[1]]), new maplibregl.LngLatBounds([points[0][0], points[0][1]], [points[0][0], points[0][1]]));
  map.fitBounds(bounds, { padding: 60, maxZoom: 17 });
}

export async function showMapView() {
  visible = true;
  if (!map) await createMap();
  else map.resize();
  startGps();
}

export function hideMapView() {
  visible = false;
  stopGps();
}
