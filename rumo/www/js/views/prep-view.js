// Preparo: prontidão, plano, ficha, checklists, calculadoras, mapa, kit em papel, backup e ajustes.

import { h, clear, toast, confirmSheet, backLink, downloadFile, errorMessage, shareText } from '../ui.js';
import { getState, update, exportBackup, importBackup } from '../state.js';
import { readiness } from '../lib/readiness.js';
import { CHECKLISTS, checklistProgress } from '../content/checklists.js';
import { getInstalledPack, getPois } from '../mappack.js';
import { deleteAllData } from '../db.js';
import { renderPlan, renderMedical } from './prep-plan.js';
import { renderChecklistMenu, renderChecklist, renderCalcs, renderMapPack } from './prep-lists.js';
import { renderPrintKit, kitAsText } from './print-kit.js';

let root = null;

async function readinessState() {
  const s = getState();
  const pack = await getInstalledPack();
  const pois = await getPois();
  const bag = CHECKLISTS.find((l) => l.id === 'mochila');
  return {
    swReady: Boolean(navigator.serviceWorker?.controller),
    mapDate: pack?.complete ? pack.createdAt : null,
    poisCount: pois.length,
    persisted: navigator.storage?.persisted ? await navigator.storage.persisted() : false,
    contacts: s.plan.contacts.length,
    meetingPoints: s.plan.meetingPoints.length,
    medicalPeople: s.medical.people.length,
    bagProgress: checklistProgress(bag, s.checklists.mochila).ratio,
    lastBackup: s.meta.lastBackup,
    lastDrill: s.meta.lastDrill,
  };
}

const MENU = [
  ['prontidao', '✅', 'Pronto para ficar offline?', 'O que ainda falta'],
  ['plano', '👨‍👩‍👧', 'Plano familiar', 'Contatos e pontos de encontro'],
  ['ficha', '🧑‍⚕️', 'Ficha médica', 'Sangue, alergias, remédios'],
  ['checklists', '🎒', 'Checklists', 'Mochila, casa, carro, documentos'],
  ['mapa', '🗺️', 'Mapa offline', 'Baixar e atualizar'],
  ['calc', '🧮', 'Calculadoras', 'Água, comida, bateria'],
  ['kit', '🖨️', 'Kit em papel', 'Imprimir contatos, encontros e ficha'],
  ['backup', '💾', 'Backup', 'Guardar e restaurar seus dados'],
  ['ajustes', '⚙️', 'Ajustes', 'Tema, bússola, dados'],
];

async function renderMenu() {
  const r = readiness(await readinessState());
  root.append(
    h('a', { class: 'card', href: '#preparo/prontidao', style: 'display:block;text-decoration:none;color:inherit' },
      h('div', { class: 'row' }, h('div', { class: 'big-number', text: `${r.score}%` }), h('div', { class: 'grow' }, h('b', { text: 'Prontidão' }), h('div', { class: 'small muted', text: `${r.done} de ${r.total} itens prontos` }))),
      h('div', { class: 'progress', style: 'margin-top:8px' }, h('i', { style: `width:${r.score}%` })),
    ),
    h('div', { class: 'card' }, MENU.map(([id, emoji, title, sub]) => h('a', { class: 'list-item chev', href: `#preparo/${id}` },
      h('span', { class: 'emoji', text: emoji }), h('span', { class: 'grow' }, h('div', { text: title }), h('div', { class: 'meta', text: sub }))))),
  );
}

async function renderReadiness() {
  const r = readiness(await readinessState());
  root.append(
    backLink('#preparo'),
    h('h1', { text: `Prontidão: ${r.score}%` }),
    h('div', { class: 'card' }, r.items.map((i) => h('div', { class: 'list-item' },
      h('span', { class: 'emoji', text: i.ok ? '✅' : '⬜' }),
      h('span', { class: 'grow' }, h('div', { text: i.label }), i.ok ? null : h('div', { class: 'meta', text: i.hint }))))),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-block', type: 'button', text: '🔒 Proteger dados contra limpeza automática', on: { click: async () => {
        const ok = navigator.storage?.persist ? await navigator.storage.persist() : false;
        toast(ok ? 'Dados protegidos' : 'O sistema não confirmou. Instale o app na Tela de Início e tente de novo.', ok ? 'info' : 'error', 5000);
        refresh();
      } } }),
      h('button', { class: 'btn btn-block', type: 'button', text: '🏃 Marcar simulado feito hoje', on: { click: async () => {
        await update('meta', (m) => ({ ...m, lastDrill: new Date().toISOString() }));
        toast('Simulado registrado');
        refresh();
      } } }),
    ),
    h('div', { class: 'card', style: 'margin-top:12px' }, h('h3', { text: 'Simulado sugerido (15 min)' }), h('ol', { class: 'steps' },
      ['Ative o modo avião e abra o mapa: ache o hospital mais próximo.', 'Siga com a bússola até o ponto de encontro 1.', 'Mande o SMS "Estou bem" com posição para a família.', 'Confira a mochila e a validade de água, comida e remédios.', 'Cada pessoa da família diz de cor os pontos de encontro.'].map((t) => h('li', { text: t })))),
  );
}

async function exportData() {
  const backup = exportBackup();
  const name = `rumo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Backup Rumo' });
    else downloadFile(name, blob);
    await update('meta', (m) => ({ ...m, lastBackup: new Date().toISOString() }));
    toast('Backup gerado. Guarde fora do celular (e-mail, nuvem, pen drive).');
  } catch (err) {
    if (err?.name !== 'AbortError') toast(errorMessage(err), 'error');
  }
}

function renderBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (!(await confirmSheet('Restaurar backup?', 'Plano, ficha, checklists, pontos e trilhas atuais serão substituídos pelos do arquivo.', 'Restaurar', true))) return;
      await importBackup(text);
      toast('Backup restaurado');
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error', 5000);
    }
  });
  const last = getState().meta.lastBackup;
  root.append(
    backLink('#preparo'),
    h('h1', { text: 'Backup' }),
    h('p', { class: 'muted', text: 'Seus dados ficam só neste aparelho. Exporte um arquivo e guarde em outro lugar; ele também serve para passar o plano para outro celular da família.' }),
    h('p', { text: `Último backup: ${last ? new Date(last).toLocaleString('pt-BR') : 'nunca'}` }),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Exportar backup', on: { click: exportData } }),
      h('button', { class: 'btn btn-block', type: 'button', text: 'Restaurar de arquivo', on: { click: () => input.click() } }),
      input,
    ),
    h('p', { class: 'small muted', style: 'margin-top:10px', text: 'O arquivo contém dados pessoais e de saúde. Guarde em local seguro.' }),
  );
}

function renderSettings() {
  const s = getState().settings;
  const toggle = (label, active, onClick) => h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': String(active), text: label, on: { click: onClick } });
  const set = async (patch) => {
    await update('settings', (old) => ({ ...old, ...patch }));
    refresh();
  };
  const corr = h('input', { type: 'number', step: 1, min: -60, max: 60, value: s.compassCorrection ?? '' , placeholder: 'Automático (região)' });
  corr.addEventListener('change', () => {
    const v = corr.value === '' ? null : Math.max(-60, Math.min(60, Math.round(Number(corr.value))));
    set({ compassCorrection: Number.isFinite(v) ? v : null });
  });
  root.append(
    backLink('#preparo'),
    h('h1', { text: 'Ajustes' }),
    h('div', { class: 'card' }, h('h3', { text: 'Tema do app' }), h('div', { class: 'chips' },
      toggle('Escuro (economiza bateria)', s.theme === 'dark', () => set({ theme: 'dark' })),
      toggle('Claro (sol forte)', s.theme === 'light', () => set({ theme: 'light' })))),
    h('div', { class: 'card' }, h('h3', { text: 'Cores do mapa' }), h('div', { class: 'chips' },
      toggle('Escuro', s.mapFlavor === 'dark', () => set({ mapFlavor: 'dark' })),
      toggle('Claro', s.mapFlavor === 'light', () => set({ mapFlavor: 'light' })))),
    h('div', { class: 'card' }, h('h3', { text: 'Modo bateria crítica' }),
      h('p', { class: 'small muted', text: 'Tela preta com vermelho, sem animações e GPS só quando você pedir. Também liga pelo botão 🔋 no topo.' }),
      toggle(s.critical ? 'Ligado' : 'Desligado', s.critical, () => set({ critical: !s.critical }))),
    h('div', { class: 'card' }, h('h3', { text: 'Correção da bússola (graus)' }),
      h('p', { class: 'small muted', text: 'Vazio = usa a declinação da região do mapa (Rio ≈ −23°). Prefira "Calibrar andando" na aba Bússola.' }), corr),
    h('div', { class: 'card' }, h('h3', { text: 'Apagar tudo' }),
      h('p', { class: 'small muted', text: 'Remove plano, ficha, pontos, trilhas e o mapa deste aparelho.' }),
      h('button', { class: 'btn btn-danger btn-block', type: 'button', text: 'Apagar todos os dados', on: { click: async () => {
        if (!(await confirmSheet('Apagar todos os dados?', 'Isto não pode ser desfeito. Faça um backup antes, se quiser guardar algo.', 'Apagar tudo', true))) return;
        try {
          await deleteAllData();
          toast('Dados apagados. Reabrindo…');
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          toast(errorMessage(err), 'error', 6000);
        }
      } } })),
    h('p', { class: 'disclaimer', text: 'Rumo é um app de referência. Não substitui treinamento, orientação médica nem as instruções oficiais da Defesa Civil.' }),
  );
}

function renderKit() {
  root.append(
    backLink('#preparo'),
    h('h1', { text: 'Kit em papel' }),
    h('p', { class: 'muted', text: 'O celular pode quebrar, molhar ou ser roubado. Imprima contatos, pontos de encontro e ficha médica, plastifique e guarde na mochila e na carteira.' }),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '🖨️ Imprimir ou salvar PDF', on: { click: () => { renderPrintKit(); window.print(); } } }),
      h('button', { class: 'btn btn-block', type: 'button', text: 'Compartilhar como texto', on: { click: () => shareText(kitAsText()) } }),
    ),
    h('p', { class: 'small muted', style: 'margin-top:10px', text: 'No iPhone, na tela de impressão, use "Salvar em Arquivos" para guardar o PDF.' }),
  );
}

const ROUTES = {
  prontidao: renderReadiness,
  plano: () => renderPlan(root),
  ficha: () => renderMedical(root),
  checklists: (rest) => (rest ? renderChecklist(root, rest) : renderChecklistMenu(root)),
  calc: () => renderCalcs(root),
  mapa: () => renderMapPack(root),
  kit: renderKit,
  backup: renderBackup,
  ajustes: renderSettings,
};

let current = '';
function refresh() {
  showPrepView(current);
}

export function initPrepView(section) {
  root = section;
}

export async function showPrepView(sub = '') {
  current = sub;
  clear(root);
  root.scrollTop = 0;
  const [page, rest] = sub.split('/');
  const route = ROUTES[page];
  try {
    if (route) await route(rest);
    else await renderMenu();
  } catch (err) {
    root.append(h('p', { class: 'warn', text: errorMessage(err) }));
  }
}
