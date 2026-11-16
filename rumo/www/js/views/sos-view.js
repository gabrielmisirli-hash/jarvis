// SOS: pedir socorro por SMS com posição, piscar SOS, apito, coordenadas gigantes, Morse e ligações.

import { h, sheet, toast, shareText, field, errorMessage } from '../ui.js';
import { kvGet, kvSet, kvDel } from '../db.js';
import { parseCoords, formatDecimal } from '../lib/geo.js';
import { getState } from '../state.js';
import { getPosition, getLastFix } from '../location.js';
import { buildMessage, smsHref, telHref, whatsappHref, devicePlatform, mapsLink } from '../lib/messages.js';
import { toMorse, SOS } from '../lib/morse.js';
import { showBigCoords, flashMorse } from '../overlays.js';
import { startWhistle, stopSound, playMorse, isPlaying, onSoundChange } from '../audio.js';

const FRESH_FIX_MS = 2 * 60 * 1000;
const EMERGENCY_NUMBERS = [
  { n: '193', label: 'Bombeiros' },
  { n: '192', label: 'SAMU' },
  { n: '190', label: 'Polícia Militar' },
  { n: '199', label: 'Defesa Civil' },
];

function ageText(time) {
  const s = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}

function recipientsOf(onlySos) {
  const contacts = getState().plan.contacts.filter((c) => c.phone);
  const chosen = onlySos ? contacts.filter((c) => c.sos) : contacts;
  return chosen.length ? chosen : contacts;
}

// Local fixo: computadores (e tablets parados) não têm GPS, e a posição estimada pela internet
// pode errar por quilômetros. Quem cadastra o local fixo manda sempre esse local no SOS.
// Fica só neste aparelho (não vai no backup): cada computador está num lugar.
const FIXED_KEY = 'fixedPlace';
let fixedPlace = null;
let fixedCard = null;

function renderFixedCard() {
  if (!fixedCard) return;
  const desktop = devicePlatform() === 'desktop';
  fixedCard.className = `card${!fixedPlace && desktop ? ' card-warn' : ''}`;
  fixedCard.replaceChildren(
    h('h3', { text: '📍 Local fixo deste aparelho' }),
    fixedPlace
      ? h('p', { class: 'small', text: `${fixedPlace.label}${fixedPlace.address ? `: ${fixedPlace.address}` : ''} (${formatDecimal(fixedPlace.lat, fixedPlace.lon)}). O SOS deste aparelho sempre manda este local.` })
      : h('p', { class: 'small', text: desktop
        ? 'Este computador não tem GPS: a posição estimada pela internet pode errar por quilômetros. Cadastre o local onde ele fica para o SOS sair com as coordenadas certas.'
        : 'Para computadores e tablets que ficam sempre no mesmo lugar. No celular, deixe vazio: o GPS é melhor.' }),
    h('button', { class: 'btn btn-block', type: 'button', text: fixedPlace ? 'Alterar local fixo' : 'Cadastrar local fixo', on: { click: openFixedPlaceSheet } }),
  );
}

function openFixedPlaceSheet() {
  const label = h('input', { type: 'text', maxlength: 40, value: fixedPlace?.label || 'Trabalho' });
  const address = h('textarea', { maxlength: 160, placeholder: 'Ex.: Av. Brasil 4365, prédio X, 2º andar, sala 205' });
  address.value = fixedPlace?.address || '';
  const coords = h('input', { type: 'text', inputmode: 'decimal', placeholder: '-22.87644, -43.24371', value: fixedPlace ? formatDecimal(fixedPlace.lat, fixedPlace.lon) : '' });
  const check = h('a', { class: 'small', target: '_blank', rel: 'noopener', text: '' });
  const showCheck = () => {
    const c = parseCoords(coords.value);
    check.hidden = !c;
    if (c) { check.href = mapsLink(c.lat, c.lon); check.textContent = 'Conferir no mapa ↗'; }
  };
  coords.addEventListener('input', showCheck);
  showCheck();
  const detect = h('button', { class: 'btn btn-block', type: 'button', text: 'Usar a posição detectada agora', on: { click: async () => {
    try {
      const fix = await getPosition();
      coords.value = formatDecimal(fix.lat, fix.lon);
      showCheck();
      toast(fix.accuracy > 100 ? `Precisão de só ±${Math.round(fix.accuracy)} m: confira no mapa e corrija se precisar.` : 'Posição preenchida. Confira no mapa.', fix.accuracy > 100 ? 'error' : 'info', 6000);
    } catch (err) {
      toast(errorMessage(err), 'error', 5000);
    }
  } } });
  const ref = sheet('Local fixo deste aparelho', h('div', { class: 'stack' },
    field('Nome', label),
    field('Endereço e referência (vai na mensagem)', address),
    field('Coordenadas', coords),
    check,
    h('p', { class: 'small muted', text: 'Como pegar as coordenadas certas: no Google Maps, clique com o botão direito no prédio (no celular, toque e segure). Os números aparecem; copie e cole aqui.' }),
    detect,
    h('button', { class: 'btn btn-block btn-primary', type: 'button', text: 'Salvar', on: { click: async () => {
      const c = parseCoords(coords.value);
      if (!c) { toast('Coordenadas não reconhecidas. Cole no formato -22.87644, -43.24371.', 'error', 5000); return; }
      fixedPlace = { label: label.value.trim() || 'Local fixo', address: address.value.trim(), lat: c.lat, lon: c.lon, savedAt: Date.now() };
      await kvSet(FIXED_KEY, fixedPlace);
      renderFixedCard();
      ref.close();
      toast('Local fixo salvo neste aparelho');
    } } }),
    fixedPlace ? h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Remover local fixo (voltar a usar o GPS)', on: { click: async () => {
      await kvDel(FIXED_KEY);
      fixedPlace = null;
      renderFixedCard();
      ref.close();
      toast('Local fixo removido');
    } } }) : null,
  ));
}

/**
 * Folha com a mensagem pronta e um link de SMS que o usuário toca na hora.
 * O link já nasce com a última posição conhecida e é atualizado quando chega uma leitura nova do GPS:
 * nunca fica esperando o GPS para abrir o SMS.
 */
function openMessageSheet({ template, title, intro, onlySos = false, withExtra = false, danger = false }) {
  const fixed = fixedPlace;
  let position = fixed ? null : getLastFix();
  const extra = withExtra ? h('input', { type: 'text', placeholder: 'Ex.: perna machucada, 3 pessoas, sem água', maxlength: 120 }) : null;
  const gpsStatus = h('div', { class: 'small muted' });
  const preview = h('div', { class: 'card small', style: 'white-space:pre-wrap;word-break:break-word;margin:0' });
  // No computador não há SMS: o WhatsApp vira o botão principal.
  const onDesktop = devicePlatform() === 'desktop';
  const mainClass = `btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`;
  const smsLink = h('a', { class: onDesktop ? 'btn btn-block' : mainClass, text: onDesktop ? 'Abrir SMS (funciona no celular)' : 'Abrir SMS agora' });
  const waLink = h('a', { class: onDesktop ? mainClass : 'btn btn-block', target: '_blank', rel: 'noopener', text: 'Enviar pelo WhatsApp' });
  const contacts = recipientsOf(onlySos);
  const render = () => {
    const body = buildMessage({ template, position, extra: extra?.value || '', fixed });
    preview.textContent = body;
    smsLink.href = smsHref(contacts.map((c) => c.phone), body);
    waLink.href = whatsappHref(body);
    gpsStatus.textContent = fixed
      ? `📍 Local fixo deste aparelho: ${fixed.label}${fixed.address ? ` (${fixed.address})` : ''}.`
      : position
      ? `📡 Posição ±${Math.round(position.accuracy)} m, lida ${ageText(position.time)}${Date.now() - position.time > FRESH_FIX_MS ? ' (buscando uma mais nova…)' : ''}`
      : '📡 Buscando GPS… Pode enviar já: a mensagem vai sem posição.';
  };
  extra?.addEventListener('input', render);
  render();
  if (!fixed) getPosition()
    .then((f) => {
      position = f;
      render();
    })
    .catch((err) => {
      gpsStatus.textContent = `📡 ${err.message} Pode enviar assim mesmo.`;
    });
  sheet(title, h('div', { class: 'stack' },
    intro ? h('p', { text: intro }) : null,
    extra ? field('Detalhe (opcional)', extra) : null,
    h('div', { class: 'small', text: contacts.length ? `Para: ${contacts.map((c) => c.name).join(', ')}` : 'Sem contatos cadastrados: você escolhe no app Mensagens. Cadastre em Preparo › Plano familiar.' }),
    gpsStatus,
    !fixed && onDesktop ? h('button', { class: 'btn btn-sm', type: 'button', text: '📍 Computador sem GPS: cadastrar o local fixo', on: { click: openFixedPlaceSheet } }) : null,
    preview,
    ...(onDesktop ? [waLink, smsLink] : [smsLink, waLink]),
    h('p', { class: 'small muted', text: 'WhatsApp: escolha o contato ou o grupo da família; precisa de internet. O SMS sai do celular mesmo sem internet.' }),
    h('button', { class: 'btn btn-block', type: 'button', text: 'Compartilhar por outro app', on: { click: () => shareText(preview.textContent) } }),
  ));
}

function openMorseSheet() {
  const input = h('textarea', { placeholder: 'Digite a mensagem (ex.: AJUDA 3 PESSOAS)', maxlength: 200 });
  const out = h('div', { class: 'card mono', style: 'word-break:break-word;min-height:56px' });
  const render = () => { out.textContent = toMorse(input.value) || '—'; };
  input.addEventListener('input', render);
  render();
  sheet('Morse', h('div', { class: 'stack' },
    input, out,
    h('div', { class: 'grid-2' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'Piscar tela', on: { click: () => { const m = toMorse(input.value); if (m) flashMorse(m, { label: input.value.toUpperCase() }); } } }),
      h('button', { class: 'btn', type: 'button', text: 'Tocar som', on: { click: () => { const m = toMorse(input.value); if (m) playMorse(m); } } }),
    ),
    h('p', { class: 'small muted', text: 'Ponto = curto, traço = longo (3×). SOS é ··· ––– ··· sem pausa entre as letras.' }),
  ));
}

async function showCoords() {
  if (fixedPlace) {
    showBigCoords({ lat: fixedPlace.lat, lon: fixedPlace.lon, accuracy: null, time: Date.now(), label: fixedPlace.label });
    return;
  }
  const last = getLastFix();
  if (last && Date.now() - last.time < FRESH_FIX_MS) {
    showBigCoords(last);
    return;
  }
  toast('Pegando posição do GPS…');
  try {
    showBigCoords(await getPosition());
  } catch (err) {
    toast(err.message, 'error', 5000);
    showBigCoords(last);
  }
}

function quickButton(emoji, label, onClick, cls = '') {
  return h('button', { class: `sos-btn ${cls}`, type: 'button', on: { click: onClick } }, h('span', { class: 'emoji', text: emoji }), h('span', { class: 'label', text: label }));
}

export function initSosView(section) {
  const whistleBtn = quickButton('📢', 'Apito', () => {
    if (isPlaying()) {
      stopSound();
      return;
    }
    startWhistle().catch((err) => toast(`Som indisponível: ${err.message}`, 'error'));
    toast('Volume no máximo. 3 toques = pedido de socorro.');
  });
  onSoundChange((kind) => { whistleBtn.querySelector('.label').textContent = kind === 'apito' ? 'Parar apito' : 'Apito'; });
  const contactsInfo = h('p', { class: 'small muted' });
  const family = (template, label) => h('button', { class: 'btn btn-block', type: 'button', text: label, on: { click: () => openMessageSheet({ template, title: label }) } });
  section.append(
    h('div', { class: 'sos-grid' },
      quickButton('🆘', 'SMS de socorro com minha posição', () => openMessageSheet({
        template: 'sos', title: 'SMS de socorro', onlySos: true, withExtra: true, danger: true,
        intro: 'Vai para os contatos marcados como "recebe SOS". SMS costuma passar quando a ligação não completa.',
      }), 'primary'),
      quickButton('🔦', 'Piscar SOS na tela', () => flashMorse(SOS, { label: 'SOS' })),
      whistleBtn,
      quickButton('📍', 'Coordenadas em tela cheia', showCoords),
      quickButton('📡', 'Morse (luz e som)', openMorseSheet),
    ),
    h('div', { class: 'section-title', text: 'Ligar' }),
    h('div', { class: 'call-grid' }, EMERGENCY_NUMBERS.map((e) => h('a', { class: 'btn call-btn', href: telHref(e.n) }, h('b', { text: e.n }), h('span', { class: 'small', text: e.label })))),
    h('div', { class: 'section-title', text: 'Avisar a família (SMS com posição)' }),
    h('div', { class: 'stack' },
      family('ok', '✅ Estou bem'),
      family('indo', '🚶 Indo para o ponto de encontro'),
      family('aqui', '📌 Estou aqui, venha me encontrar'),
    ),
    contactsInfo,
    fixedCard = h('div', { class: 'card' }),
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('h3', { text: 'Dicas rápidas' }),
      h('ul', { class: 'dont' },
        h('li', { text: 'Rede congestionada: mande SMS curto em vez de ligar. Tente de novo a cada poucos minutos.' }),
        h('li', { text: 'Lanterna de verdade: Central de Controle do iPhone. O app pisca a tela, que se vê de longe à noite.' }),
        h('li', { text: 'Para resgate aéreo: braços em "Y" = preciso de ajuda. Um braço para cima e outro para baixo = não preciso.' }),
        h('li', { text: 'O apito toca mesmo com o iPhone no silencioso (iOS 16.4 ou mais novo). Aumente o volume.' }),
      ),
    ),
  );
  renderFixedCard();
  kvGet(FIXED_KEY).then((v) => { fixedPlace = v || null; renderFixedCard(); }).catch(() => {});
  return () => {
    const all = getState().plan.contacts;
    const sos = all.filter((c) => c.sos).length;
    contactsInfo.textContent = all.length ? `${all.length} contato(s) no plano, ${sos} recebe(m) SOS.` : 'Nenhum contato cadastrado ainda: vá em Preparo › Plano familiar.';
  };
}

export function showSosView(render) {
  render?.();
  // Aquece o GPS ao abrir a aba, para o SMS de socorro já sair com posição.
  if (!getState().settings.critical && !fixedPlace) getPosition().catch(() => undefined);
}
