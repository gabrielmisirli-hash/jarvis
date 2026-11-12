// Validação do backup importado (dados vindos de arquivo são externos: nunca confiar).

export const BACKUP_FORMAT = 'rumo-backup';
export const BACKUP_VERSION = 1;
export const STATE_KEYS = Object.freeze(['settings', 'plan', 'medical', 'checklists', 'waypoints', 'tracks', 'meta', 'target']);

const MAX_TEXT = 2000;
const MAX_ITEMS = 5000;
const MAX_TRACK_POINTS = 200000; // trilhas longas (dias de caminhada) não podem ser cortadas

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v) => v === true;
const list = (v, max = MAX_ITEMS) => (Array.isArray(v) ? v.slice(0, max) : []);
const id = (v) => text(v, 64) || `id-${Math.random().toString(36).slice(2, 10)}`;
const coord = (lat, lon) => {
  const la = num(lat);
  const lo = num(lon);
  return la !== null && lo !== null && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? { lat: la, lon: lo } : null;
};

function cleanContact(c) {
  return { id: id(c.id), name: text(c.name, 80), phone: text(c.phone, 40), relation: text(c.relation, 60), outOfTown: bool(c.outOfTown), sos: bool(c.sos) };
}

function cleanMeeting(m) {
  const pos = coord(m.lat, m.lon);
  return { id: id(m.id), name: text(m.name, 80), description: text(m.description), ...(pos || {}) };
}

function cleanPerson(p) {
  return {
    id: id(p.id), name: text(p.name, 80), birth: text(p.birth, 20), blood: text(p.blood, 8), allergies: text(p.allergies),
    conditions: text(p.conditions), meds: text(p.meds), notes: text(p.notes),
  };
}

function cleanWaypoint(w) {
  const pos = coord(w.lat, w.lon);
  return pos ? { id: id(w.id), name: text(w.name, 80), type: text(w.type, 20) || 'outro', note: text(w.note), createdAt: text(w.createdAt, 40), ...pos } : null;
}

function cleanTrack(t) {
  const points = list(t.points, MAX_TRACK_POINTS).filter((p) => Array.isArray(p) && coord(p[1], p[0])).map((p) => [p[0], p[1], num(p[2]) || 0]);
  return points.length ? { id: id(t.id), name: text(t.name, 80), startedAt: text(t.startedAt, 40), endedAt: text(t.endedAt, 40), distance: num(t.distance) || 0, points } : null;
}

function cleanChecklists(c) {
  if (!isObj(c)) return {};
  return Object.fromEntries(Object.entries(c).slice(0, 50).map(([k, v]) => [text(k, 40), isObj(v) ? Object.fromEntries(Object.entries(v).slice(0, 500).map(([ik, iv]) => [text(ik, 60), bool(iv)])) : {}]));
}

/** Converte o JSON importado em estado seguro. Lança erro se não for um backup do app. */
export function parseBackup(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('Arquivo não é um backup válido (JSON inválido)');
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new Error('Arquivo não é um backup do Rumo');
  if (data.version > BACKUP_VERSION) throw new Error('Backup de uma versão mais nova do app');
  const s = isObj(data.state) ? data.state : {};
  const plan = isObj(s.plan) ? s.plan : {};
  const medical = isObj(s.medical) ? s.medical : {};
  const settings = isObj(s.settings) ? s.settings : {};
  const meta = isObj(s.meta) ? s.meta : {};
  const target = isObj(s.target) ? coord(s.target.lat, s.target.lon) : null;
  return {
    settings: {
      theme: ['dark', 'light'].includes(settings.theme) ? settings.theme : 'dark',
      mapFlavor: ['dark', 'light'].includes(settings.mapFlavor) ? settings.mapFlavor : 'dark',
      critical: bool(settings.critical),
      compassCorrection: num(settings.compassCorrection),
    },
    plan: {
      contacts: list(plan.contacts).filter(isObj).map(cleanContact),
      meetingPoints: list(plan.meetingPoints).filter(isObj).map(cleanMeeting),
      notes: text(plan.notes, 5000),
    },
    medical: { people: list(medical.people).filter(isObj).map(cleanPerson) },
    checklists: cleanChecklists(s.checklists),
    waypoints: list(s.waypoints).filter(isObj).map(cleanWaypoint).filter(Boolean),
    tracks: list(s.tracks).filter(isObj).map(cleanTrack).filter(Boolean),
    meta: { lastBackup: text(meta.lastBackup, 40) || null, lastDrill: text(meta.lastDrill, 40) || null },
    target: target ? { ...target, name: text(s.target.name, 80) } : null,
  };
}

export function makeBackup(state, now = new Date()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), state: Object.fromEntries(STATE_KEYS.map((k) => [k, state[k]])) };
}
