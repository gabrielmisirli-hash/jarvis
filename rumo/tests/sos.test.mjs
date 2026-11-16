// Testes da mensagem de socorro e do local fixo: node --test rumo/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoords } from '../www/js/lib/geo.js';
import { buildMessage, smsHref, whatsappHref } from '../www/js/lib/messages.js';

test('lê coordenadas coladas do Google Maps, de links e com vírgula decimal', () => {
  const want = { lat: -22.87644, lon: -43.24371 };
  assert.deepEqual(parseCoords('-22.87644, -43.24371'), want);
  assert.deepEqual(parseCoords('https://maps.google.com/?q=-22.87644,-43.24371'), want);
  assert.deepEqual(parseCoords('https://www.google.com/maps/@-22.87644,-43.24371,17z'), want);
  assert.deepEqual(parseCoords('-22,87644 -43,24371'), want);
  assert.equal(parseCoords('Av. Brasil 4365'), null);
  assert.equal(parseCoords('91.0, 10.0'), null, 'latitude impossível');
});

const when = new Date(2026, 10, 16, 14, 30);
const fixed = { label: 'Trabalho', address: 'Av. Brasil 4365, sala 205', lat: -22.87644, lon: -43.24371 };

test('com local fixo, a mensagem leva o endereço e as coordenadas cadastradas, não o GPS', () => {
  const msg = buildMessage({ template: 'sos', position: { lat: -22.9, lon: -43.1, accuracy: 3000 }, when, extra: '3 pessoas', fixed });
  assert.equal(msg, "SOS! Preciso de ajuda. 3 pessoas. Estou em Trabalho: Av. Brasil 4365, sala 205. Coordenadas: -22.87644, -43.24371 (22°52'35,2\" S 43°14'37,4\" O) às 14:30 de 16/11. https://maps.google.com/?q=-22.87644,-43.24371");
  assert.match(decodeURIComponent(whatsappHref(msg)), /Estou em Trabalho/);
  assert.match(decodeURIComponent(smsHref(['21999991111'], msg, 'android')), /^sms:21999991111\?body=SOS!/);
});

test('sem local fixo, continua usando o GPS (ou avisa que está sem)', () => {
  assert.match(buildMessage({ template: 'ok', position: { lat: -22.9, lon: -43.17, accuracy: 12 }, when }), /^Estou bem\. Posição: -22\.90000, -43\.17000 ±12 m/);
  assert.equal(buildMessage({ template: 'ok', position: null, when, extra: 'Tudo certo!' }), 'Estou bem. Tudo certo! (sem GPS agora) 14:30 de 16/11.');
});
