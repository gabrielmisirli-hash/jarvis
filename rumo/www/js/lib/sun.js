// Nascer e pôr do sol (algoritmo astronômico simplificado, erro típico < 2 min).
// Serve para planejar quanto tempo de luz resta, sem internet.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;
const J0 = 0.0009;
const SUNRISE_ALTITUDE = -0.833 * RAD; // refração + raio do disco solar

const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date) => toJulian(date) - J2000;
const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
const declination = (l) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht, lw, n) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, m, l) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

function eclipticLongitude(m) {
  const center = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + center + RAD * 102.9372 + Math.PI;
}

/** Retorna { sunrise, sunset } como Date, ou null nos dois se o sol não nasce/não se põe (regiões polares). */
export function sunTimes(date, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitJ(ds, m, l);
  const cosH = (Math.sin(SUNRISE_ALTITUDE) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return { sunrise: null, sunset: null };
  const w = Math.acos(cosH);
  const jSet = solarTransitJ(approxTransit(w, lw, n), m, l);
  const jRise = jNoon - (jSet - jNoon);
  return { sunrise: fromJulian(jRise), sunset: fromJulian(jSet) };
}

/** Minutos de luz restantes a partir de `now` (0 se já anoiteceu ou ainda não amanheceu). */
export function daylightLeftMinutes(now, lat, lon) {
  const { sunrise, sunset } = sunTimes(now, lat, lon);
  if (!sunset || now < sunrise || now > sunset) return 0;
  return Math.round((sunset - now) / 60000);
}
