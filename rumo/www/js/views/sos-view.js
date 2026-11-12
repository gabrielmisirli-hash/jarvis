// SOS: pedir socorro por SMS com posição, piscar SOS, apito, coordenadas gigantes, Morse e ligações.

import { h, sheet, toast, shareText, field } from '../ui.js';
import { getState } from '../state.js';
import { getPosition, getLastFix } from '../location.js';
import { buildMessage, smsHref, telHref, whatsappHref, devicePlatform } from '../lib/messages.js';
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

/**
 * Folha com a mensagem pronta e um link de SMS que o usuário toca na hora.
 * O link já nasce com a última posição conhecida e é atualizado quando chega uma leitura nova do GPS:
 * nunca fica esperando o GPS para abrir o SMS.
 */
function openMessageSheet({ template, title, intro, onlySos = false, withExtra = false, danger = false }) {
  let position = getLastFix();
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
    const body = buildMessage({ template, position, extra: extra?.value || '' });
    preview.textContent = body;
    smsLink.href = smsHref(contacts.map((c) => c.phone), body);
    waLink.href = whatsappHref(body);
    gpsStatus.textContent = position
      ? `📡 Posição ±${Math.round(position.accuracy)} m, lida ${ageText(position.time)}${Date.now() - position.time > FRESH_FIX_MS ? ' (buscando uma mais nova…)' : ''}`
      : '📡 Buscando GPS… Pode enviar já: a mensagem vai sem posição.';
  };
  extra?.addEventListener('input', render);
  render();
  getPosition()
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
    gpsStatus, preview,
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
  return () => {
    const all = getState().plan.contacts;
    const sos = all.filter((c) => c.sos).length;
    contactsInfo.textContent = all.length ? `${all.length} contato(s) no plano, ${sos} recebe(m) SOS.` : 'Nenhum contato cadastrado ainda: vá em Preparo › Plano familiar.';
  };
}

export function showSosView(render) {
  render?.();
  // Aquece o GPS ao abrir a aba, para o SMS de socorro já sair com posição.
  if (!getState().settings.critical) getPosition().catch(() => undefined);
}
