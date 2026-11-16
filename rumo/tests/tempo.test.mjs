// Testes do alerta de tempo e do vigia: node --test rumo/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { hourLevel, assess, alertText, parseOpenMeteo } from '../www/js/lib/weather.js';
import { encryptPayload, sendPush, fromB64url, b64url, vapidPublicKey } from '../vigia/src/webpush.js';
import { handleRequest, runCheck, shouldNotify } from '../vigia/src/index.js';

const { subtle } = webcrypto;
const H = 3600000;
const OFFSET = -10800; // Rio
const BASE = Date.parse('2026-11-16T16:00:00Z'); // 13h no Rio

// ---------- regras ----------

test('escala do INMET: chuva, vento e trovoada', () => {
  assert.deepEqual([19.9, 20, 30, 60].map((p) => hourLevel({ precipitation: p, gust: 0, code: 0 }).level), [0, 1, 2, 3]);
  assert.deepEqual([39, 40, 60, 100].map((g) => hourLevel({ precipitation: 0, gust: g, code: 0 }).level), [0, 1, 2, 3]);
  assert.equal(hourLevel({ precipitation: 0, gust: 0, code: 95 }).level, 1);
  assert.equal(hourLevel({ precipitation: 0, gust: 0, code: 96 }).level, 2);
});

const hour = (i, precipitation, gust, code) => ({ t: BASE + i * H, precipitation, gust, code, temp: 25, probability: 90 });

test('avalia só as próximas 3 horas e acha início, fim e picos', () => {
  const now = BASE + 10 * 60000;
  const a = assess({ offset: OFFSET, hours: [hour(0, 0, 20, 3), hour(1, 12, 45, 95), hour(2, 35, 72, 95), hour(3, 8, 30, 61)] }, now);
  assert.equal(a.level, 2);
  assert.equal(a.start, BASE + H);
  assert.equal(a.end, BASE + 3 * H);
  assert.equal(a.peakRain, 35);
  assert.equal(a.peakGust, 72);
  assert.equal(assess({ offset: OFFSET, hours: [hour(4, 80, 0, 95)] }, now).level, 0, 'temporal daqui a 4 h fica fora da janela');
  const text = alertText(a, 'Casa', now);
  assert.equal(text.title, 'Perigo: temporal com raios previsto');
  assert.match(text.body, /entre 14h e 16h perto de Casa: chuva de até 35 mm\/h, rajadas de até 72 km\/h/);
});

test('lê a resposta do Open-Meteo no fuso do local', () => {
  const f = parseOpenMeteo({
    utc_offset_seconds: OFFSET, latitude: -22.9, longitude: -43.2,
    current: { time: '2026-11-16T13:45', temperature_2m: 25.3, precipitation: 0.2, weather_code: 53, wind_gusts_10m: 34.2 },
    hourly: { time: ['2026-11-16T13:00'], precipitation: [1], precipitation_probability: [90], weather_code: [55], wind_gusts_10m: [36], temperature_2m: [25] },
  });
  assert.equal(f.hours[0].t, BASE);
  assert.equal(f.current.temp, 25.3);
  assert.throws(() => parseOpenMeteo({}), /incompleta/);
});

// ---------- web push ----------

async function makeBrowserKeys() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  return { pair, keys: { p256dh: b64url(raw), auth: b64url(auth) } };
}

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Decifra como o navegador (RFC 8291, lado de quem recebe). */
async function decryptLikeBrowser(body, browser) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = fromB64url(browser.keys.p256dh);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, browser.pair.privateKey, 256));
  const te = new TextEncoder();
  const info = new Uint8Array([...te.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(fromB64url(browser.keys.auth), ecdh, info, 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain.at(-1), 2, 'delimitador de último registro');
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function makeVapid() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const { kty, crv, x, y, d } = await subtle.exportKey('jwk', pair.privateKey);
  return { kty, crv, x, y, d };
}

test('mensagem cifrada é decifrada pelo navegador', async () => {
  const browser = await makeBrowserKeys();
  const body = await encryptPayload(browser.keys, '{"title":"Perigo","body":"Temporal às 15h"}');
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  assert.equal(await decryptLikeBrowser(body, browser), '{"title":"Perigo","body":"Temporal às 15h"}');
});

test('envio tem cabeçalhos certos e assinatura VAPID válida', async () => {
  const browser = await makeBrowserKeys();
  const jwk = await makeVapid();
  let sent;
  const status = await sendPush({ endpoint: 'https://web.push.apple.com/abc', keys: browser.keys }, { title: 'Oi' }, {
    jwk, subject: 'https://rumo-sobrevivencia.pages.dev', fetchFn: async (url, init) => { sent = { url, init }; return { status: 201 }; },
  });
  assert.equal(status, 201);
  assert.equal(sent.init.headers['Content-Encoding'], 'aes128gcm');
  const [, jwt, k] = sent.init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, vapidPublicKey(jwk));
  const [h64, c64, s64] = jwt.split('.');
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c64)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://rumo-sobrevivencia.pages.dev');
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(nodeVerify('sha256', Buffer.from(`${h64}.${c64}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromB64url(s64))));
  assert.equal(JSON.parse(await decryptLikeBrowser(new Uint8Array(sent.init.body), browser)).title, 'Oi');
});

// ---------- API e rodada do vigia ----------

function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(k, type) { const v = map.get(k); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

const post = (path, body) => new Request(`https://rumo-sobrevivencia.pages.dev/api/alertas/${path}`, { method: 'POST', body: JSON.stringify(body) });

test('API: chave, inscrição válida e inválida, cancelar', async () => {
  const jwk = await makeVapid();
  const env = { ALERTAS: fakeKv(), VAPID_PRIVATE_JWK: JSON.stringify(jwk) };
  const key = await (await handleRequest(new Request('https://x/api/alertas/chave'), env)).json();
  assert.equal(key.publicKey, vapidPublicKey(jwk));
  const browser = await makeBrowserKeys();
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: browser.keys };
  assert.equal((await handleRequest(post('inscrever', { subscription: sub, lat: -22.9123, lon: -43.1789, label: 'Casa' }), env)).status, 200);
  const saved = [...env.ALERTAS.map.values()].map((v) => JSON.parse(v))[0];
  assert.deepEqual([saved.lat, saved.lon, saved.label], [-22.91, -43.18, 'Casa'], 'local arredondado a ~1 km');
  assert.equal((await handleRequest(post('inscrever', { subscription: { ...sub, endpoint: 'https://evil.example/x' }, lat: 0, lon: 0 }), env)).status, 400);
  assert.equal((await handleRequest(post('inscrever', { subscription: sub, lat: 200, lon: 0 }), env)).status, 400);
  assert.equal((await handleRequest(new Request('https://x/api/alertas/inscrever', { method: 'POST', body: '{oops' }), env)).status, 400);
  assert.equal((await handleRequest(post('cancelar', { endpoint: sub.endpoint }), env)).status, 200);
  assert.equal(env.ALERTAS.map.size, 0);
});

function omResponse(hours) {
  const local = (ms) => new Date(ms + OFFSET * 1000).toISOString().slice(0, 16);
  return {
    utc_offset_seconds: OFFSET, latitude: -22.91, longitude: -43.17,
    hourly: {
      time: hours.map((x) => local(x.t)), precipitation: hours.map((x) => x.precipitation), precipitation_probability: hours.map(() => 90),
      weather_code: hours.map((x) => x.code), wind_gusts_10m: hours.map((x) => x.gust), temperature_2m: hours.map(() => 25),
    },
  };
}

test('rodada: avisa uma vez, sobe de nível, libera quando passa e apaga inscrição morta', async () => {
  const jwk = await makeVapid();
  const env = { ALERTAS: fakeKv(), VAPID_PRIVATE_JWK: JSON.stringify(jwk) };
  const browser = await makeBrowserKeys();
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: browser.keys };
  await handleRequest(post('inscrever', { subscription: sub, lat: -22.91, lon: -43.17, label: 'Casa' }), env);

  let weather = [hour(0, 0, 10, 3), hour(1, 25, 45, 95), hour(2, 5, 20, 61)];
  let pushStatus = 201;
  const pushes = [];
  const fetchFn = async (url, init) => {
    if (String(url).startsWith('https://api.open-meteo.com/')) return { ok: true, status: 200, json: async () => omResponse(weather) };
    pushes.push(JSON.parse(await decryptLikeBrowser(new Uint8Array(init.body), browser)));
    return { status: pushStatus };
  };
  const now = BASE + 10 * 60000;

  let s = await runCheck(env, { now, fetchFn });
  assert.equal(s.sent, 1);
  assert.equal(pushes[0].title, 'Atenção: temporal com raios previsto');
  assert.match(pushes[0].body, /entre 14h e 15h perto de Casa/);

  s = await runCheck(env, { now: now + 15 * 60000, fetchFn });
  assert.equal(s.sent, 0, 'mesmo alerta não repete');

  weather = [hour(0, 0, 10, 3), hour(1, 45, 80, 96), hour(2, 5, 20, 61)];
  s = await runCheck(env, { now: now + 30 * 60000, fetchFn });
  assert.equal(s.sent, 1, 'nível subiu: avisa de novo');
  assert.match(pushes[1].title, /^Perigo: temporal com granizo/);

  weather = [hour(0, 0, 10, 1), hour(1, 0, 10, 1)];
  s = await runCheck(env, { now: now + 45 * 60000, fetchFn });
  assert.equal(s.cleared, 1, 'perigo passou: libera o próximo aviso');

  weather = [hour(0, 0, 10, 3), hour(1, 25, 45, 95)];
  pushStatus = 410;
  s = await runCheck(env, { now: now + 60 * 60000, fetchFn });
  assert.equal(s.removed, 1, 'aparelho desinstalou: inscrição apagada');
  assert.equal([...env.ALERTAS.map.keys()].filter((k) => k.startsWith('sub:')).length, 0);
});

test('não repete o mesmo nível antes de 3 horas', () => {
  const a = { level: 1, start: BASE + 5 * H };
  assert.equal(shouldNotify({ key: `1|${BASE + H}`, level: 1, at: BASE }, a, BASE + 2 * H), false);
  assert.equal(shouldNotify({ key: `1|${BASE + H}`, level: 1, at: BASE }, a, BASE + 3 * H), true);
});

test('resumo de uso: só números, antes e depois da rodada', async () => {
  const jwk = await makeVapid();
  const env = { ALERTAS: fakeKv(), VAPID_PRIVATE_JWK: JSON.stringify(jwk) };
  for (const [i, lat] of [[1, -22.91], [2, -22.91], [3, -22.95]]) {
    const browser = await makeBrowserKeys();
    await handleRequest(post('inscrever', { subscription: { endpoint: `https://web.push.apple.com/x${i}`, keys: browser.keys }, lat, lon: -43.17, label: `Casa ${i}` }), env);
  }
  const before = await (await handleRequest(new Request('https://x/api/alertas/resumo'), env)).json();
  assert.deepEqual([before.aparelhosComAvisos, before.locaisDiferentes, before.novosNasUltimas24h, before.ultimaVerificacao], [3, 2, 3, null]);
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => omResponse([hour(0, 0, 5, 1)]) });
  await runCheck(env, { now: Date.now(), fetchFn });
  const after = await (await handleRequest(new Request('https://x/api/alertas/resumo'), env)).json();
  assert.equal(after.aparelhosComAvisos, 3);
  assert.equal(after.locaisDiferentes, 2);
  assert.ok(after.ultimaVerificacao);
  assert.ok(!JSON.stringify(after).includes('Casa'), 'resumo não expõe nomes nem locais');
  assert.ok(!JSON.stringify(after).includes('-22.9'), 'resumo não expõe coordenadas');
});
