// Tempo: selo no topo com a situação das próximas horas, folha com a previsão
// e os avisos com o app fechado (notificações enviadas pelo vigia no Cloudflare).

import { h, clear, toast, banner, sheet, errorMessage, field } from './ui.js';
import { kvGet, kvSet } from './db.js';
import { getState } from './state.js';
import { getLastFix, getPosition } from './location.js';
import { devicePlatform } from './lib/messages.js';
import {
  forecastUrl, parseOpenMeteo, assess, alertText, describeCode, hourLabel, hourLevel, LEVELS, roundCoord, ALERT_WINDOW_HOURS,
} from './lib/weather.js';

const REFRESH_MS = 15 * 60 * 1000;
const STALE_MS = 3 * 60 * 60 * 1000;
const SYNC_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLACE = Object.freeze({ lat: -22.91, lon: -43.17, label: 'Rio de Janeiro', source: 'padrão' });
const API = 'api/alertas';

let forecast = null;
let place = null;
let chip = null;
let loading = null;
let redrawSheet = null;

// ---------- local da previsão ----------

/** Local salvo; sem ele, a última posição do GPS; sem GPS, o centro do Rio. */
function currentPlace() {
  if (place) return place;
  const fix = getLastFix();
  if (fix) return { lat: roundCoord(fix.lat), lon: roundCoord(fix.lon), label: 'sua posição', source: 'gps' };
  return DEFAULT_PLACE;
}

const samePlace = (a, b) => a && b && a.lat === b.lat && a.lon === b.lon;
const placeName = (p) => (p.source === 'gps' || p.source === 'padrão' ? '' : p.label);

async function savePlace(next) {
  await kvSet('weatherPlace', next);
  place = next;
  const push = await kvGet('weatherPush');
  if (push?.on) await syncSubscription().catch((err) => toast(`Local salvo, mas o vigia não foi avisado: ${errorMessage(err)}`, 'error', 6000));
  await refresh(true);
}

// ---------- previsão ----------

async function refresh(force = false) {
  if (loading) return loading;
  const p = currentPlace();
  const fresh = forecast && Date.now() - forecast.fetchedAt < REFRESH_MS && samePlace(forecast.place, p);
  if (!navigator.onLine || (!force && fresh)) {
    render();
    return null;
  }
  loading = (async () => {
    try {
      // Rede ruim: desiste em 20 s e tenta de novo na próxima rodada, em vez de ficar preso esperando.
      const res = await fetch(forecastUrl(p.lat, p.lon), { cache: 'no-store', signal: AbortSignal.timeout?.(20000) });
      if (!res.ok) throw new Error(`previsão indisponível (erro ${res.status})`);
      forecast = { ...parseOpenMeteo(await res.json()), place: p };
      await kvSet('weather', forecast);
    } catch (err) {
      console.warn('[tempo] não atualizou', err); // sem internet ou serviço fora: segue com a última previsão
    } finally {
      loading = null;
      render();
      await checkAlert();
    }
  })();
  return loading;
}

function nowHour() {
  if (!forecast) return null;
  const now = Date.now();
  return forecast.hours.filter((x) => x.t <= now).at(-1) || forecast.hours[0] || null;
}

function render() {
  renderChip();
  redrawSheet?.();
}

function renderChip() {
  if (!chip) return;
  const a = forecast ? assess(forecast) : { level: 0 };
  const cur = forecast?.current || nowHour();
  chip.className = `chip chip-btn weather-chip${a.level ? ` lvl-${a.level}` : ''}`;
  if (a.level) {
    chip.textContent = `⚠️ ${LEVELS[a.level].label}`;
    chip.title = alertText(a, placeName(forecast.place))?.title || '';
  } else if (cur && Number.isFinite(cur.temp)) {
    chip.textContent = `${describeCode(cur.code).icon} ${Math.round(cur.temp)}°`;
    chip.title = `${describeCode(cur.code).text}. Toque para ver a previsão.`;
  } else {
    chip.textContent = '🌡️ Tempo';
    chip.title = 'Previsão do tempo';
  }
}

/** Mostra uma faixa (e vibra no Android) uma vez por alerta novo. */
async function checkAlert() {
  if (!forecast) return;
  const a = assess(forecast);
  if (!a.level) return;
  const key = `${a.level}|${a.start}`;
  if ((await kvGet('weatherSeen').catch(() => null)) === key) return;
  await kvSet('weatherSeen', key).catch(() => {});
  const text = alertText(a, placeName(forecast.place));
  banner(`⚠️ ${text.title}. ${text.body}`, 'Ver', openWeatherSheet, { id: 'tempo' });
  navigator.vibrate?.([400, 150, 400, 150, 400]); // o iPhone não deixa sites vibrarem; lá vibra a notificação
}

// ---------- avisos com o app fechado ----------

function pushSupport() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return devicePlatform() === 'ios' && !standalone
      ? 'No iPhone, os avisos só funcionam com o app instalado: Safari → Compartilhar ⬆ → Adicionar à Tela de Início, e abra pelo ícone (iOS 16.4 ou mais novo).'
      : 'Este navegador não recebe notificações. No celular, use o app instalado na tela inicial.';
  }
  if (Notification.permission === 'denied') {
    return 'As notificações do Rumo estão bloqueadas. Libere em Ajustes → Notificações → Rumo (iPhone) ou nas configurações do site (Android).';
  }
  return null;
}

function b64urlToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function sameKey(sub, keyBytes) {
  const current = sub.options?.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === keyBytes.length && a.every((v, i) => v === keyBytes[i]);
}

async function post(path, body) {
  const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `o serviço de avisos respondeu com erro ${res.status}`);
  return data;
}

/** Envia (ou reenvia) a inscrição e o local ao vigia. */
async function syncSubscription() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error('este aparelho não está inscrito');
  const p = currentPlace();
  await post('inscrever', { subscription: sub.toJSON(), lat: p.lat, lon: p.lon, label: placeName(p) || 'local salvo' });
  await kvSet('weatherPush', { on: true, endpoint: sub.endpoint, syncedAt: Date.now() });
}

async function enablePush() {
  // No iPhone, o pedido de permissão tem de vir logo depois do toque, antes de qualquer outra espera.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('sem permissão para notificações. Libere nos ajustes do celular e tente de novo.');
  const res = await fetch(`${API}/chave`, { cache: 'no-store' });
  if (!res.ok) throw new Error('o serviço de avisos não respondeu. Tente de novo com internet.');
  const keyBytes = b64urlToBytes((await res.json()).publicKey);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, keyBytes)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
  await syncSubscription();
}

async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await post('cancelar', { endpoint: sub.endpoint }).catch((err) => console.warn('[tempo] cancelar', err));
    await sub.unsubscribe();
  }
  await kvSet('weatherPush', { on: false });
}

async function testPush() {
  const push = await kvGet('weatherPush');
  if (!push?.endpoint) throw new Error('ligue os avisos primeiro');
  await post('teste', { endpoint: push.endpoint });
}

/** Ao abrir o app, reenvia a inscrição uma vez por dia (se o vigia perdeu, ele recupera). */
async function keepSubscriptionAlive() {
  const push = await kvGet('weatherPush').catch(() => null);
  if (!push?.on || !navigator.onLine || pushSupport()) return;
  if (Date.now() - (push.syncedAt || 0) < SYNC_MS) return;
  await syncSubscription().catch((err) => console.warn('[tempo] reinscrição', err));
}

// ---------- folha ----------

function action(label, fn, cls = 'btn btn-block') {
  const btn = h('button', { class: cls, type: 'button', text: label });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(`Não deu certo: ${errorMessage(err)}`, 'error', 6000);
    } finally {
      btn.disabled = false;
      redrawSheet?.();
    }
  });
  return btn;
}

function alertCard(a, close) {
  const text = alertText(a, placeName(forecast.place));
  const guide = (id, label) => h('a', { class: 'btn btn-sm', href: `#guias/${id}`, text: label, on: { click: close } });
  return h('div', { class: `card wx-alert lvl-${a.level}` },
    h('h3', { text: `⚠️ ${text.title}` }),
    h('p', { text: text.body }),
    h('div', { class: 'row wrap' }, guide('tempestade', 'Guia: vendaval e raios'), guide('enchente', 'Guia: enchente')),
  );
}

function nowCard() {
  const cur = forecast.current || nowHour();
  const d = describeCode(cur.code);
  return h('div', { class: 'card wx-now' },
    h('span', { class: 'wx-big', text: d.icon }),
    h('div', { class: 'grow' },
      h('div', { class: 'wx-temp', text: Number.isFinite(cur.temp) ? `${Math.round(cur.temp)}°` : '—' }),
      h('div', { text: d.text }),
      h('div', { class: 'small muted', text: `Rajadas de ${Math.round(cur.gust)} km/h${cur.precipitation ? ` · ${cur.precipitation} mm de chuva` : ''}` })));
}

function hoursList() {
  const start = (nowHour()?.t) ?? 0;
  const next = forecast.hours.filter((x) => x.t >= start).slice(0, 12);
  return h('div', { class: 'card wx-hours' },
    h('h3', { text: 'Próximas horas' }),
    next.map((x) => {
      const lvl = hourLevel(x).level;
      return h('div', { class: `wx-hour${lvl ? ` lvl-${lvl}` : ''}` },
        h('span', { class: 'wx-h', text: hourLabel(x.t, forecast.offset) }),
        h('span', { text: describeCode(x.code).icon, title: describeCode(x.code).text }),
        h('span', { class: 'wx-t', text: Number.isFinite(x.temp) ? `${Math.round(x.temp)}°` : '' }),
        h('span', { class: 'wx-rain', text: `${x.precipitation} mm${x.probability !== null ? ` · ${x.probability}%` : ''}` }),
        h('span', { class: 'wx-gust', text: `${Math.round(x.gust)} km/h` }));
    }));
}

function placeCard() {
  const p = currentPlace();
  const name = h('input', { type: 'text', maxlength: 30, value: place?.label || 'Casa', 'aria-label': 'Nome do local' });
  const where = place ? `${place.label} (${place.lat.toFixed(2)}, ${place.lon.toFixed(2)})`
    : p.source === 'gps' ? `sua posição atual (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}), ainda não salva` : 'centro do Rio, ainda não salvo';
  return h('div', { class: 'card stack' },
    h('h3', { text: 'Local da previsão e dos avisos' }),
    h('div', { class: 'small', text: `Agora: ${where}.` }),
    field('Nome do local', name),
    action('📍 Usar minha posição atual', async () => {
      const fix = await getPosition();
      await savePlace({ lat: roundCoord(fix.lat), lon: roundCoord(fix.lon), label: name.value.trim() || 'Casa', source: 'salvo' });
      toast('Local salvo');
    }),
    h('p', { class: 'small muted', text: 'Salve estando em casa. O local é guardado arredondado (~1 km), não a posição exata.' }));
}

async function pushCard() {
  const card = h('div', { class: 'card stack' }, h('h3', { text: 'Avisos com o app fechado' }));
  const problem = pushSupport();
  if (problem) {
    card.append(h('p', { class: 'small', text: problem }));
    return card;
  }
  const push = await kvGet('weatherPush').catch(() => null);
  if (!place) {
    card.append(h('p', { class: 'small', text: 'Primeiro salve o local acima. É para ele que o vigia confere a previsão.' }));
    return card;
  }
  if (push?.on) {
    card.append(
      h('p', { class: 'small', text: `Ligados para ${place.label}. O vigia confere a previsão a cada 15 minutos e avisa quando houver temporal, chuva forte ou ventania previstos para as próximas ${ALERT_WINDOW_HOURS} horas.` }),
      action('Enviar aviso de teste', async () => { await testPush(); toast('Aviso de teste enviado. Deve chegar em alguns segundos.'); }, 'btn btn-block btn-primary'),
      action('Desligar avisos', async () => { await disablePush(); toast('Avisos desligados'); }),
    );
  } else {
    card.append(
      h('p', { class: 'small', text: `Receba uma notificação quando houver temporal, chuva forte ou ventania previstos para ${place.label}, mesmo com o app fechado.` }),
      action('🔔 Ligar avisos', async () => { await enablePush(); toast('Avisos ligados'); }, 'btn btn-block btn-primary'),
    );
  }
  return card;
}

export function openWeatherSheet() {
  const body = h('div', { class: 'stack' });
  let ref = null;
  const close = () => ref?.close();
  let drawing = Promise.resolve();
  const draw = () => {
    drawing = drawing.then(async () => {
      const parts = [];
      if (forecast) {
        const a = assess(forecast);
        if (a.level) parts.push(alertCard(a, close));
        parts.push(nowCard(), hoursList());
        const age = Date.now() - forecast.fetchedAt;
        const fetched = new Date(forecast.fetchedAt);
        const stamp = `${String(fetched.getHours()).padStart(2, '0')}:${String(fetched.getMinutes()).padStart(2, '0')}`;
        parts.push(h('p', { class: `small ${age > STALE_MS ? '' : 'muted'}`, text: `Previsão baixada às ${stamp}${age > STALE_MS ? '. Está desatualizada: conecte à internet para atualizar.' : '.'}` }));
      } else {
        parts.push(h('div', { class: 'card', text: navigator.onLine ? 'Buscando a previsão…' : 'Sem previsão salva. Conecte à internet uma vez para baixar.' }));
      }
      parts.push(placeCard(), await pushCard());
      parts.push(h('p', { class: 'small muted', text: 'Fonte: Open-Meteo, previsão hora a hora (escala de cores do INMET). Ela não enxerga um temporal que se forma em minutos: mantenha ligados os alertas da Defesa Civil no celular e o SMS 40199.' }));
      clear(body).append(...parts);
    }).catch((err) => console.warn('[tempo] folha', err));
  };
  redrawSheet = draw;
  ref = sheet('Tempo', body, { onClose: () => { redrawSheet = null; } });
  draw();
  refresh(Date.now() - (forecast?.fetchedAt || 0) > 60000);
}

// ---------- início ----------

export async function initWeather(statusEl) {
  chip = h('button', { class: 'chip chip-btn weather-chip', type: 'button', text: '🌡️ Tempo', on: { click: openWeatherSheet } });
  statusEl.prepend(chip);
  place = await kvGet('weatherPlace').catch(() => null);
  forecast = await kvGet('weather').catch(() => null);
  render();
  const auto = () => { if (!getState().settings.critical) refresh(); };
  auto();
  setInterval(auto, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto(); });
  window.addEventListener('online', auto);
  const fromHash = () => { if (location.hash === '#tempo') openWeatherSheet(); };
  window.addEventListener('hashchange', fromHash);
  fromHash();
  keepSubscriptionAlive();
}
