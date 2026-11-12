// Mensagens prontas com localização e links de SMS (funcionam sem internet: SMS usa a rede de voz).

import { formatDecimal, toDMS } from './geo.js';

export const TEMPLATES = Object.freeze({
  sos: 'SOS! Preciso de ajuda.',
  ok: 'Estou bem.',
  indo: 'Estou indo para o ponto de encontro.',
  aqui: 'Estou neste local. Venha me encontrar.',
});

const pad = (n) => String(n).padStart(2, '0');

export function formatStamp(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())} de ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Link de mapa que abre em iPhone, Android e computador (quem recebe pode ter qualquer aparelho). */
export function mapsLink(lat, lon) {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/** Monta o texto completo: aviso + posição em dois formatos + horário + link. */
export function buildMessage({ template, position, when = new Date(), extra = '' }) {
  const head = TEMPLATES[template] || template;
  const note = extra.trim() ? ` ${extra.trim()}` : '';
  if (!position) return `${head}${note} (sem GPS agora) ${formatStamp(when)}.`;
  const { lat, lon, accuracy } = position;
  const acc = Number.isFinite(accuracy) ? ` ±${Math.round(accuracy)} m` : '';
  return `${head}${note} Posição: ${formatDecimal(lat, lon)}${acc} (${toDMS(lat, true)} ${toDMS(lon, false)}) às ${formatStamp(when)}. ${mapsLink(lat, lon)}`;
}

/** Primeiro número de um campo que pode ter vários ("2112345678; 2198765432"), só com dígitos e "+". */
export function cleanPhone(phone) {
  const first = String(phone || '').split(/[;,/]/)[0];
  return first.replace(/[^\d+]/g, '');
}

/** 'ios', 'android' ou 'desktop': cada um entende o link de SMS de um jeito. */
export function devicePlatform(ua = globalThis.navigator?.userAgent ?? '', touchPoints = globalThis.navigator?.maxTouchPoints ?? 0) {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && touchPoints > 1) return 'ios'; // iPad com iPadOS se apresenta como Mac
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Link sms: com a mensagem pronta.
 * iPhone: "&body=" e "/open?addresses=" para vários números (formato que o iOS aceita).
 * Android e o resto: padrão RFC 5724, "?body=" e números separados por vírgula.
 */
export function smsHref(numbers, body, platform = devicePlatform()) {
  const list = numbers.map(cleanPhone).filter(Boolean);
  const text = encodeURIComponent(body);
  if (platform === 'ios') {
    if (list.length === 0) return `sms:&body=${text}`;
    if (list.length === 1) return `sms:${list[0]}&body=${text}`;
    return `sms:/open?addresses=${list.join(',')}&body=${text}`;
  }
  return `sms:${list.join(',')}?body=${text}`;
}

/**
 * Número no formato que o WhatsApp exige: só dígitos, com o código do país.
 * Número brasileiro salvo sem o 55 (DDD + número, com ou sem o 0 da frente) ganha o 55.
 */
export function whatsappNumber(phone) {
  const raw = cleanPhone(phone);
  if (!raw) return '';
  if (raw.startsWith('+')) return raw.slice(1).replace(/\D/g, '');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Link do WhatsApp com a mensagem pronta. Sem número, o WhatsApp pede para escolher o contato ou o grupo. */
export function whatsappHref(body, phone = '') {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

export function telHref(phone) {
  return `tel:${cleanPhone(phone)}`;
}
