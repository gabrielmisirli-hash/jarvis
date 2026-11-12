// Cálculos geográficos puros (sem DOM): distância, rumo, formatos de coordenada e checagem de GPS.

const EARTH_RADIUS_M = 6371008.8;
const DEFAULT_MAX_SPEED_MPS = 85; // ~300 km/h: acima disso, o salto de posição é suspeito
const CARDINALS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Diferença angular com sinal, de -180 a 180 (quanto girar de `from` até `to`). */
export function signedDelta(to, from) {
  return ((to - from + 540) % 360) - 180;
}

export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo verdadeiro (0 = norte, 90 = leste) de `a` até `b`. */
export function bearingDeg(a, b) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

export function cardinal(deg) {
  return CARDINALS[Math.round(normalizeDeg(deg) / 45) % 8];
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatDecimal(lat, lon, digits = 5) {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/** Graus, minutos e segundos — mais fácil de ditar por rádio ou telefone. */
export function toDMS(value, isLat) {
  const hemi = isLat ? (value < 0 ? 'S' : 'N') : value < 0 ? 'O' : 'L';
  const abs = Math.abs(value);
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = Math.round(((abs - d) * 60 - m) * 600) / 10;
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  const sec = s.toFixed(1).padStart(4, '0').replace('.', ',');
  return `${d}°${String(m).padStart(2, '0')}'${sec}" ${hemi}`;
}

/**
 * Posição suspeita: salto maior do que seria fisicamente possível desde a leitura anterior.
 * Em guerra/ataque o GPS pode ser bloqueado ou falsificado; nesse caso o app avisa e sugere bússola + mapa.
 */
export function isFixSuspicious(prev, curr, maxSpeedMps = DEFAULT_MAX_SPEED_MPS) {
  if (!prev || !curr) return false;
  const dt = (curr.time - prev.time) / 1000;
  if (dt <= 0) return false;
  const tolerance = (prev.accuracy || 0) + (curr.accuracy || 0);
  const moved = Math.max(0, distanceMeters(prev, curr) - tolerance);
  return moved / dt > maxSpeedMps;
}

export function trackDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

/** Só grava um ponto novo na trilha se andou o suficiente e a leitura é boa. */
export function shouldAppendTrackPoint(last, next, minMeters = 8, maxAccuracy = 60) {
  if ((next.accuracy ?? Infinity) > maxAccuracy) return false;
  if (!last) return true;
  return distanceMeters(last, next) >= minMeters;
}

export function circularMeanDeg(angles) {
  if (angles.length === 0) return NaN;
  const s = angles.reduce((acc, a) => acc + Math.sin(toRad(a)), 0);
  const c = angles.reduce((acc, a) => acc + Math.cos(toRad(a)), 0);
  return normalizeDeg(toDeg(Math.atan2(s, c)));
}

/**
 * Calibração andando: compara o rumo real percorrido (GPS) com a média da bússola no trajeto.
 * Retorna a correção em graus a somar à leitura da bússola.
 */
export function compassCorrection(start, end, headings, minMeters = 25) {
  if (distanceMeters(start, end) < minMeters) throw new Error('Ande pelo menos 25 m em linha reta');
  if (headings.length < 3) throw new Error('Poucas leituras da bússola');
  return Math.round(signedDelta(bearingDeg(start, end), circularMeanDeg(headings)));
}
