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

export function mapsLink(lat, lon) {
  const ll = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  return `https://maps.apple.com/?ll=${ll}&q=${ll}`;
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

/** Link sms: no formato aceito pelo iPhone (um ou vários destinatários). */
export function smsHref(numbers, body) {
  const list = numbers.map(cleanPhone).filter(Boolean);
  const text = encodeURIComponent(body);
  if (list.length === 0) return `sms:&body=${text}`;
  if (list.length === 1) return `sms:${list[0]}&body=${text}`;
  return `sms:/open?addresses=${list.join(',')}&body=${text}`;
}

export function telHref(phone) {
  return `tel:${cleanPhone(phone)}`;
}
