// Vigia do Rumo (Cloudflare Worker): guarda quem ligou os avisos de tempo e, a cada 15 minutos,
// confere a previsão de cada local e manda notificação quando há temporal, chuva forte ou ventania
// nas próximas horas. O app fala com ele por /api/alertas/* no mesmo endereço do site
// (uma Pages Function encaminha), então o endereço do app não muda.
//
// Dados guardados por inscrição (KV "ALERTAS"): o endereço de push do aparelho, as chaves dele,
// o local arredondado (~1 km) e o nome que a pessoa deu ao local. Nada além disso.

import { forecastUrl, parseOpenMeteo, assess, alertText, roundCoord } from '../../www/js/lib/weather.js';
import { sendPush, vapidPublicKey } from './webpush.js';

const SUBJECT = 'https://rumo-sobrevivencia.pages.dev';
const PUSH_HOSTS = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'notify.windows.com'];
const MAX_BODY = 4096;
const TEST_COOLDOWN_MS = 60 * 1000;
const REPEAT_MS = 3 * 60 * 60 * 1000; // o mesmo nível só se repete depois de 3 h
// O plano gratuito do Cloudflare permite 50 chamadas externas por execução; o resto fica para a próxima rodada.
const MAX_CALLS_PER_RUN = 45;
const SUMMARY_KEY = 'meta:resumo';
const DAY_MS = 24 * 60 * 60 * 1000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function hashId(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jwkFrom(env) {
  if (!env.VAPID_PRIVATE_JWK) throw new Error('chave VAPID não configurada');
  return JSON.parse(env.VAPID_PRIVATE_JWK);
}

function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('pedido grande demais');
  return JSON.parse(text || '{}');
}

// ---------- API usada pelo app ----------

async function subscribe(request, env) {
  const { subscription, lat, lon, label } = await readBody(request);
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (!validEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return json({ error: 'inscrição de notificação inválida' }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'local inválido' }, 400);
  }
  const id = await hashId(endpoint);
  const old = await env.ALERTAS.get(`sub:${id}`, 'json');
  const record = {
    endpoint,
    keys: { p256dh: keys.p256dh.slice(0, 200), auth: keys.auth.slice(0, 100) },
    lat: roundCoord(lat),
    lon: roundCoord(lon),
    label: String(label || 'local salvo').slice(0, 30),
    createdAt: old?.createdAt || Date.now(),
    lastAlert: old && old.lat === roundCoord(lat) && old.lon === roundCoord(lon) ? old.lastAlert || null : null,
    lastTest: old?.lastTest || 0,
  };
  await env.ALERTAS.put(`sub:${id}`, JSON.stringify(record));
  return json({ ok: true });
}

async function unsubscribe(request, env) {
  const { endpoint } = await readBody(request);
  if (typeof endpoint !== 'string') return json({ error: 'endereço ausente' }, 400);
  await env.ALERTAS.delete(`sub:${await hashId(endpoint)}`);
  return json({ ok: true });
}

/** Quantos aparelhos usam os avisos, sem dado pessoal. Lê o resumo da última rodada (barato). */
async function usageSummary(env) {
  let s = await env.ALERTAS.get(SUMMARY_KEY, 'json');
  if (!s) { // antes da primeira rodada: conta na hora
    const records = await listRecords(env.ALERTAS);
    const now = Date.now();
    s = {
      subscribers: records.length,
      places: new Set(records.map(({ record }) => `${record.lat},${record.lon}`)).size,
      newLast24h: records.filter(({ record }) => now - (record.createdAt || 0) < DAY_MS).length,
      at: null,
    };
  }
  return json({
    aparelhosComAvisos: s.subscribers,
    locaisDiferentes: s.places,
    novosNasUltimas24h: s.newLast24h ?? null,
    ultimaVerificacao: s.at ? new Date(s.at).toISOString() : null,
    avisosEnviadosNaUltimaVerificacao: s.sent ?? null,
  });
}

async function sendTest(request, env) {
  const { endpoint } = await readBody(request);
  if (typeof endpoint !== 'string') return json({ error: 'endereço ausente' }, 400);
  const key = `sub:${await hashId(endpoint)}`;
  const record = await env.ALERTAS.get(key, 'json');
  if (!record) return json({ error: 'este aparelho não está inscrito. Desligue e ligue os avisos de novo.' }, 404);
  if (Date.now() - (record.lastTest || 0) < TEST_COOLDOWN_MS) return json({ error: 'espere um minuto entre os testes' }, 429);
  const status = await sendPush(record, {
    title: 'Rumo: teste de aviso',
    body: `Os avisos de tempo estão ligados para ${record.label}. Quando houver temporal, chuva forte ou ventania previstos, a notificação chega assim.`,
    tag: 'rumo-teste',
  }, { jwk: jwkFrom(env), subject: SUBJECT, ttl: 600 });
  if (status === 404 || status === 410) {
    await env.ALERTAS.delete(key);
    return json({ error: 'a inscrição deste aparelho expirou. Desligue e ligue os avisos de novo.' }, 410);
  }
  await env.ALERTAS.put(key, JSON.stringify({ ...record, lastTest: Date.now() }));
  if (status >= 400) return json({ error: `o serviço de notificações recusou (erro ${status})` }, 502);
  return json({ ok: true, status });
}

export async function handleRequest(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  try {
    if (request.method === 'GET' && path.endsWith('/api/alertas/chave')) return json({ publicKey: vapidPublicKey(jwkFrom(env)) });
    if (request.method === 'GET' && path.endsWith('/api/alertas/resumo')) return await usageSummary(env);
    if (request.method === 'POST' && path.endsWith('/api/alertas/inscrever')) return await subscribe(request, env);
    if (request.method === 'POST' && path.endsWith('/api/alertas/cancelar')) return await unsubscribe(request, env);
    if (request.method === 'POST' && path.endsWith('/api/alertas/teste')) return await sendTest(request, env);
    return json({ error: 'não encontrado' }, 404);
  } catch (err) {
    console.error('[vigia] erro na API', err);
    return json({ error: err instanceof SyntaxError ? 'pedido inválido' : 'erro no serviço de avisos' }, err instanceof SyntaxError ? 400 : 500);
  }
}

// ---------- rodada a cada 15 minutos ----------

/** Decide se este alerta merece notificação, sem repetir o mesmo aviso. */
export function shouldNotify(lastAlert, a, now) {
  if (!a.level) return false;
  if (!lastAlert) return true;
  if (a.level > lastAlert.level) return true;
  return now - lastAlert.at >= REPEAT_MS && `${a.level}|${a.start}` !== lastAlert.key;
}

async function listRecords(kv) {
  const records = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: 'sub:', cursor });
    for (const { name } of page.keys) {
      const record = await kv.get(name, 'json');
      if (record) records.push({ key: name, record });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return records;
}

export async function runCheck(env, { now = Date.now(), fetchFn = fetch } = {}) {
  const jwk = jwkFrom(env);
  const records = await listRecords(env.ALERTAS);
  const groups = new Map();
  for (const item of records) {
    const where = `${item.record.lat},${item.record.lon}`;
    if (!groups.has(where)) groups.set(where, []);
    groups.get(where).push(item);
  }
  let calls = 0;
  const summary = { subscribers: records.length, places: groups.size, sent: 0, cleared: 0, removed: 0, failed: 0, deferred: 0 };
  for (const items of groups.values()) {
    if (calls >= MAX_CALLS_PER_RUN) { summary.deferred += items.length; continue; }
    const { lat, lon } = items[0].record;
    let forecast;
    try {
      calls += 1;
      const res = await fetchFn(forecastUrl(lat, lon));
      if (!res.ok) throw new Error(`Open-Meteo respondeu ${res.status}`);
      forecast = parseOpenMeteo(await res.json(), now);
    } catch (err) {
      console.error('[vigia] previsão falhou', lat, lon, err);
      summary.failed += items.length;
      continue;
    }
    const a = assess(forecast, now);
    for (const { key, record } of items) {
      if (!a.level) {
        if (record.lastAlert) { // o perigo passou: libera o próximo aviso
          await env.ALERTAS.put(key, JSON.stringify({ ...record, lastAlert: null }));
          summary.cleared += 1;
        }
        continue;
      }
      if (!shouldNotify(record.lastAlert, a, now)) continue;
      if (calls >= MAX_CALLS_PER_RUN) { summary.deferred += 1; continue; }
      const text = alertText(a, record.label, now);
      calls += 1;
      let status;
      try {
        status = await sendPush(record, { ...text, tag: 'rumo-tempo', urgent: a.level >= 2, url: './#tempo' }, { jwk, subject: SUBJECT, ttl: 3600, fetchFn });
      } catch (err) {
        console.error('[vigia] envio falhou', err);
        summary.failed += 1;
        continue;
      }
      if (status === 404 || status === 410) {
        await env.ALERTAS.delete(key);
        summary.removed += 1;
      } else if (status >= 400) {
        console.error('[vigia] push recusado', status);
        summary.failed += 1;
      } else {
        await env.ALERTAS.put(key, JSON.stringify({ ...record, lastAlert: { key: `${a.level}|${a.start}`, level: a.level, at: now } }));
        summary.sent += 1;
      }
    }
  }
  summary.newLast24h = records.filter(({ record }) => now - (record.createdAt || 0) < DAY_MS).length;
  summary.at = now;
  // Resumo só com números, para o dono do app ver se alguém está usando. Sem locais nem nomes.
  await env.ALERTAS.put(SUMMARY_KEY, JSON.stringify(summary));
  console.log('[vigia] rodada', JSON.stringify(summary));
  return summary;
}

export default {
  fetch: handleRequest,
  scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env));
  },
};
