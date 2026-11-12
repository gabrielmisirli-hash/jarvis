// Telas cheias de emergência: coordenadas gigantes e piscar Morse.

import { h, keepScreenOn } from './ui.js';
import { formatDecimal, toDMS } from './lib/geo.js';
import { formatStamp } from './lib/messages.js';
import { timelineMs } from './lib/morse.js';

function openOverlay(content, onClose) {
  const el = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, content, h('div', { class: 'hint', text: 'Toque na tela para sair' }));
  const close = () => {
    el.remove();
    keepScreenOn('tela-cheia', false);
    onClose?.();
  };
  el.addEventListener('click', close);
  document.body.append(el);
  keepScreenOn('tela-cheia', true);
  return { el, close };
}

/** Coordenadas em letra enorme, para mostrar a socorristas ou ditar por rádio/telefone. */
export function showBigCoords(fix) {
  if (!fix) {
    openOverlay(h('div', { class: 'huge', text: 'Sem GPS ainda. Vá para local aberto.' }));
    return;
  }
  openOverlay(h('div', { class: 'stack' },
    h('div', { class: 'small', text: 'MINHA POSIÇÃO' }),
    h('div', { class: 'huge mono', text: formatDecimal(fix.lat, fix.lon) }),
    h('div', { class: 'huge', style: 'font-size:clamp(1.3rem,6vw,2.2rem)', text: `${toDMS(fix.lat, true)}  ${toDMS(fix.lon, false)}` }),
    h('div', { text: `Precisão ±${Math.round(fix.accuracy)} m · ${formatStamp(new Date(fix.time))}` }),
  ));
}

/** Pisca a tela inteira em Morse (repete até tocar). */
export function flashMorse(morse, { unitMs = 220, label = '' } = {}) {
  const steps = timelineMs(morse, unitMs);
  const text = h('div', { class: 'huge', text: label || morse });
  let timer = null;
  let i = 0;
  const { el } = openOverlay(text, () => clearTimeout(timer));
  const tick = () => {
    const step = steps[i % steps.length];
    el.classList.toggle('flash-on', step.on);
    i += 1;
    const pauseBetweenRepeats = i % steps.length === 0 ? unitMs * 7 : 0;
    timer = setTimeout(tick, step.ms + pauseBetweenRepeats);
  };
  if (steps.length) tick();
}
