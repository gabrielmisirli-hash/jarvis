// Guias: cenários "Faça agora", primeiros socorros e sobrevivência, com busca offline.

import { h, clear, mount, backLink } from '../ui.js';
import { SCENARIOS } from '../content/scenarios.js';
import { FIRST_AID } from '../content/first-aid.js';
import { SURVIVAL } from '../content/survival.js';
import { renderCalc } from './calcs.js';

const ALL = [
  ...SCENARIOS.map((g) => ({ ...g, cat: 'Faça agora' })),
  ...FIRST_AID.map((g) => ({ ...g, cat: 'Primeiros socorros' })),
  ...SURVIVAL.map((g) => ({ ...g, cat: 'Sobrevivência' })),
];
const BY_ID = new Map(ALL.map((g) => [g.id, g]));
const MEDICAL_IDS = new Set(FIRST_AID.map((g) => g.id));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const searchText = (g) => fold([g.title, g.summary, ...g.blocks.flatMap((b) => [b.title, b.text, ...(b.items || [])])].filter(Boolean).join(' '));
const INDEX = ALL.map((g) => ({ g, text: searchText(g) }));

let root = null;
let query = '';

function renderBlock(b) {
  if (b.type === 'steps') return h('div', { class: 'card' }, b.title ? h('h3', { text: b.title }) : null, h('ol', { class: 'steps' }, b.items.map((t) => h('li', { text: t }))));
  if (b.type === 'dont') return h('div', { class: 'danger-box' }, h('h3', { text: b.title || 'Não faça' }), h('ul', { class: 'dont' }, b.items.map((t) => h('li', { text: t }))));
  if (b.type === 'tip') return h('p', { class: 'warn', text: b.text });
  if (b.type === 'calc') return renderCalc(b.calc);
  return null;
}

function renderDetail(id) {
  const g = BY_ID.get(id);
  if (!g) return renderHome();
  mount(root,
    backLink('#guias'),
    h('div', { class: 'small muted', text: g.cat }),
    h('h1', {}, `${g.emoji} ${g.title}`),
    g.blocks.map(renderBlock),
    MEDICAL_IDS.has(id) ? h('div', { class: 'row wrap', style: 'margin:8px 0' },
      h('a', { class: 'btn btn-danger', href: 'tel:192', text: 'Ligar 192 (SAMU)' }),
      h('a', { class: 'btn', href: 'tel:193', text: 'Ligar 193' })) : null,
    h('p', { class: 'disclaimer', text: MEDICAL_IDS.has(id)
      ? 'Referência rápida baseada em orientações gerais de primeiros socorros. Não substitui curso nem atendimento médico. Sempre que possível, ligue 192 ou 193.'
      : 'Orientações gerais. Em emergência real, siga as instruções da Defesa Civil e dos Bombeiros.' }),
  );
  root.scrollTop = 0;
}

function tile(g) {
  return h('a', { class: 'tile', href: `#guias/${g.id}` }, h('span', { class: 'emoji', text: g.emoji }), h('span', { text: g.title }), h('span', { class: 'small muted', style: 'font-weight:400', text: g.summary }));
}

function listItem(g) {
  return h('a', { class: 'list-item chev', href: `#guias/${g.id}` }, h('span', { class: 'emoji', text: g.emoji }), h('span', { class: 'grow' }, h('div', { text: g.title }), h('div', { class: 'meta', text: g.summary })));
}

function renderHome() {
  const results = h('div');
  const search = h('input', { type: 'search', placeholder: 'Buscar: queimadura, água, cobra…', value: query, 'aria-label': 'Buscar nos guias' });
  const renderResults = () => {
    clear(results);
    const q = fold(query.trim());
    if (q.length >= 2) {
      const found = INDEX.filter(({ text }) => q.split(/\s+/).every((w) => text.includes(w))).map(({ g }) => g);
      results.append(h('div', { class: 'section-title', text: `${found.length} resultado(s)` }), h('div', { class: 'card' }, found.length ? found.map(listItem) : h('p', { class: 'muted', text: 'Nada encontrado.' })));
      return;
    }
    results.append(
      h('div', { class: 'section-title', text: 'Faça agora' }),
      h('div', { class: 'tile-grid' }, SCENARIOS.map(tile)),
      h('div', { class: 'section-title', text: 'Primeiros socorros' }),
      h('div', { class: 'card' }, FIRST_AID.map(listItem)),
      h('div', { class: 'section-title', text: 'Sobrevivência' }),
      h('div', { class: 'card' }, SURVIVAL.map(listItem)),
    );
  };
  search.addEventListener('input', () => {
    query = search.value;
    renderResults();
  });
  root.append(search, results);
  renderResults();
}

export function initGuidesView(section) {
  root = section;
}

export function showGuidesView(sub) {
  clear(root);
  if (sub) renderDetail(sub);
  else renderHome();
}

export const guideIds = () => [...BY_ID.keys()];
