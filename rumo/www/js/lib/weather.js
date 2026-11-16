// Previsão do tempo e avaliação de risco. Puro (sem DOM): roda no app e no vigia (Cloudflare Worker).
//
// Escala de cores do INMET para chuva e vento:
//   amarelo  (perigo potencial): chuva 20–30 mm/h, rajadas 40–60 km/h
//   laranja  (perigo):           chuva 30–60 mm/h, rajadas 60–100 km/h
//   vermelho (grande perigo):    chuva > 60 mm/h,  rajadas > 100 km/h
// Trovoada conta como amarelo; trovoada com granizo, como laranja.
// Os dados vêm do Open-Meteo, hora a hora. Um temporal que se forma em minutos pode não aparecer:
// os alertas oficiais (Defesa Civil no celular, SMS 40199) continuam sendo a fonte principal.

export const LEVELS = Object.freeze([
  { id: 'nenhum', label: 'Sem alerta' },
  { id: 'amarelo', label: 'Atenção' },
  { id: 'laranja', label: 'Perigo' },
  { id: 'vermelho', label: 'Grande perigo' },
]);

const RAIN_STEPS = [[60, 3], [30, 2], [20, 1]]; // mm/h
const GUST_STEPS = [[100, 3], [60, 2], [40, 1]]; // km/h
const THUNDER = new Set([95, 96, 99]);
const HAIL = new Set([96, 99]);

/** Quantas horas à frente o alerta olha (inclui a hora atual). */
export const ALERT_WINDOW_HOURS = 3;

const WMO = {
  0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Poucas nuvens'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Nevoeiro'], 48: ['🌫️', 'Nevoeiro'],
  51: ['🌦️', 'Garoa fraca'], 53: ['🌦️', 'Garoa'], 55: ['🌧️', 'Garoa forte'], 56: ['🌧️', 'Garoa gelada'], 57: ['🌧️', 'Garoa gelada'],
  61: ['🌦️', 'Chuva fraca'], 63: ['🌧️', 'Chuva moderada'], 65: ['🌧️', 'Chuva forte'], 66: ['🌧️', 'Chuva gelada'], 67: ['🌧️', 'Chuva gelada'],
  71: ['🌨️', 'Neve'], 73: ['🌨️', 'Neve'], 75: ['🌨️', 'Neve'], 77: ['🌨️', 'Neve'],
  80: ['🌦️', 'Pancadas fracas'], 81: ['🌧️', 'Pancadas de chuva'], 82: ['🌧️', 'Pancadas fortes'], 85: ['🌨️', 'Neve'], 86: ['🌨️', 'Neve'],
  95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada com granizo'], 99: ['⛈️', 'Trovoada com granizo'],
};

export function describeCode(code) {
  const [icon, text] = WMO[code] || ['🌡️', 'Tempo'];
  return { icon, text };
}

/** Arredonda a ~1 km: basta para a previsão e não guarda a posição exata. */
export const roundCoord = (v) => Math.round(v * 100) / 100;

export function forecastUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: roundCoord(lat).toFixed(2),
    longitude: roundCoord(lon).toFixed(2),
    current: 'temperature_2m,precipitation,weather_code,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_gusts_10m',
    forecast_hours: '24',
    past_hours: '1',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

// O Open-Meteo devolve hora local sem fuso ("2026-11-16T15:00") e o deslocamento em segundos.
const localToMs = (iso, offsetSec) => Date.parse(`${iso}:00Z`) - offsetSec * 1000;

/** Converte a resposta do Open-Meteo num formato simples. Lança erro se faltar algo essencial. */
export function parseOpenMeteo(json, fetchedAt = Date.now()) {
  const offset = Number(json?.utc_offset_seconds);
  const hourly = json?.hourly;
  if (!Number.isFinite(offset) || !Array.isArray(hourly?.time)) throw new Error('Resposta da previsão do tempo incompleta');
  const num = (arr, i) => (Array.isArray(arr) && Number.isFinite(arr[i]) ? arr[i] : null);
  const hours = hourly.time.map((t, i) => ({
    t: localToMs(t, offset),
    temp: num(hourly.temperature_2m, i),
    precipitation: num(hourly.precipitation, i) ?? 0,
    probability: num(hourly.precipitation_probability, i),
    code: num(hourly.weather_code, i) ?? 0,
    gust: num(hourly.wind_gusts_10m, i) ?? 0,
  }));
  const c = json.current || {};
  const current = c.time ? {
    t: localToMs(c.time, offset),
    temp: Number.isFinite(c.temperature_2m) ? c.temperature_2m : null,
    precipitation: Number.isFinite(c.precipitation) ? c.precipitation : 0,
    code: Number.isFinite(c.weather_code) ? c.weather_code : 0,
    gust: Number.isFinite(c.wind_gusts_10m) ? c.wind_gusts_10m : 0,
  } : null;
  return { fetchedAt, offset, lat: json.latitude, lon: json.longitude, current, hours };
}

const step = (value, steps) => (steps.find(([limit]) => value >= limit) || [0, 0])[1];

/** Nível (0–3) de uma hora e os motivos. */
export function hourLevel(hour) {
  const reasons = [];
  let level = 0;
  const rain = step(hour.precipitation, RAIN_STEPS);
  if (rain) { level = Math.max(level, rain); reasons.push('chuva'); }
  const gust = step(hour.gust, GUST_STEPS);
  if (gust) { level = Math.max(level, gust); reasons.push('vento'); }
  if (THUNDER.has(hour.code)) {
    level = Math.max(level, HAIL.has(hour.code) ? 2 : 1);
    reasons.push(HAIL.has(hour.code) ? 'granizo' : 'trovoada');
  }
  return { level, reasons };
}

/**
 * Avalia as próximas horas (a atual incluída). Devolve o pior nível, quando começa e termina,
 * os picos e as horas sinalizadas.
 */
export function assess(forecast, now = Date.now(), windowHours = ALERT_WINDOW_HOURS) {
  const HOUR = 3600000;
  const from = now - HOUR; // a hora em andamento ainda conta
  const to = now + windowHours * HOUR;
  const hours = forecast.hours.filter((h) => h.t > from && h.t < to);
  let level = 0;
  let start = null;
  let end = null;
  let peakRain = 0;
  let peakGust = 0;
  let thunder = false;
  let hail = false;
  for (const h of hours) {
    const r = hourLevel(h);
    if (!r.level) continue;
    level = Math.max(level, r.level);
    start = start ?? h.t;
    end = h.t + HOUR;
    peakRain = Math.max(peakRain, h.precipitation);
    peakGust = Math.max(peakGust, h.gust);
    thunder ||= THUNDER.has(h.code);
    hail ||= HAIL.has(h.code);
  }
  return { level, start, end, peakRain, peakGust, thunder, hail, offset: forecast.offset };
}

/** "15h" no horário do local da previsão (não do aparelho). */
export function hourLabel(ms, offsetSec) {
  const d = new Date(ms + offsetSec * 1000);
  return `${d.getUTCHours()}h`;
}

/** Título e texto do alerta, curtos para caber numa notificação. */
export function alertText(a, placeLabel = '', now = Date.now()) {
  if (!a.level) return null;
  const level = LEVELS[a.level].label;
  const [what, fem] = a.hail ? ['Temporal com granizo', false] : a.thunder ? ['Temporal com raios', false]
    : a.peakRain >= 20 ? ['Chuva forte', true] : ['Ventania', true];
  const startsNow = a.start <= now;
  const when = startsNow
    ? `agora, até ${hourLabel(a.end, a.offset)}`
    : `entre ${hourLabel(a.start, a.offset)} e ${hourLabel(a.end, a.offset)}`;
  const details = [];
  if (a.peakRain >= 5) details.push(`${what === 'Chuva forte' ? '' : 'chuva de '}até ${Math.round(a.peakRain)} mm/h`);
  if (a.peakGust >= 40) details.push(`rajadas de até ${Math.round(a.peakGust)} km/h`);
  const where = placeLabel ? ` perto de ${placeLabel}` : '';
  return {
    title: `${level}: ${what.toLowerCase()} ${startsNow ? 'agora' : fem ? 'prevista' : 'previsto'}`,
    body: `${what} ${when}${where}${details.length ? `: ${details.join(', ')}` : ''}. Evite áreas de alagamento, encostas e árvores.`,
  };
}
