// Checklists, calculadoras e gerenciamento do mapa offline.

import { h, clear, mount, toast, confirmSheet, backLink, errorMessage } from '../ui.js';
import { getState, update } from '../state.js';
import { CHECKLISTS, checklistProgress } from '../content/checklists.js';
import { CALC_IDS, renderCalc } from './calcs.js';
import { DEFAULT_PACK, downloadPack, fetchManifest, getInstalledPack, importPmtiles, removePack, getPois } from '../mappack.js';
import { reloadMap } from './map-view.js';

const mb = (bytes) => `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
const dateBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function progressBar(ratio) {
  return h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(ratio * 100)}%` }));
}

export function renderChecklistMenu(root) {
  const state = getState().checklists;
  mount(root,
    backLink('#preparo'),
    h('h1', { text: 'Checklists' }),
    CHECKLISTS.map((list) => {
      const p = checklistProgress(list, state[list.id]);
      return h('a', { class: 'card list-item chev', href: `#preparo/checklists/${list.id}`, style: 'border:1px solid var(--border)' },
        h('span', { class: 'emoji', text: list.emoji }),
        h('span', { class: 'grow' }, h('div', { text: list.title }), h('div', { class: 'meta', text: `${p.done} de ${p.total} · ${list.summary}` }), progressBar(p.ratio)));
    }),
  );
}

export function renderChecklist(root, id) {
  const list = CHECKLISTS.find((l) => l.id === id);
  if (!list) return renderChecklistMenu(root);
  const counter = h('div', { class: 'muted' });
  const bar = h('div');
  const refresh = () => {
    const p = checklistProgress(list, getState().checklists[id]);
    counter.textContent = `${p.done} de ${p.total} itens`;
    clear(bar).append(progressBar(p.ratio));
  };
  const items = list.items.map(([itemId, label]) => {
    const checked = Boolean(getState().checklists[id]?.[itemId]);
    const box = h('input', { type: 'checkbox', checked });
    const row = h('label', { class: `check ${checked ? 'done' : ''}` }, box, h('span', { text: label }));
    box.addEventListener('change', async () => {
      row.classList.toggle('done', box.checked);
      await update('checklists', (c) => ({ ...c, [id]: { ...(c[id] || {}), [itemId]: box.checked } }));
      refresh();
    });
    return row;
  });
  root.append(
    backLink('#preparo/checklists'),
    h('h1', {}, `${list.emoji} ${list.title}`),
    counter, bar,
    h('div', { class: 'card', style: 'margin-top:12px' }, items),
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Desmarcar tudo (revisão periódica)', on: { click: async () => {
      if (!(await confirmSheet('Desmarcar tudo?', 'Use para revisar a mochila a cada 6 meses (validade de água, comida, pilhas e remédios).', 'Desmarcar'))) return;
      await update('checklists', (c) => ({ ...c, [id]: {} }));
      clear(root);
      renderChecklist(root, id);
    } } }),
  );
  refresh();
}

export function renderCalcs(root) {
  mount(root, backLink('#preparo'), h('h1', { text: 'Calculadoras' }), CALC_IDS.map((id) => renderCalc(id)));
}

export async function renderMapPack(root) {
  const status = h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Verificando…' }));
  const progressText = h('div', { class: 'small muted' });
  const progressWrap = h('div', { hidden: true }, h('div', { class: 'progress' }, h('i', { style: 'width:0%' })), progressText);
  const fileInput = h('input', { type: 'file', accept: '.pmtiles,application/octet-stream', hidden: true });
  const downloadBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Baixar / atualizar mapa', on: { click: doDownload } });
  root.append(
    backLink('#preparo'),
    h('h1', { text: 'Mapa offline' }),
    h('p', { class: 'muted', text: 'O mapa fica guardado no aparelho e funciona sem internet. Atualize de vez em quando com Wi-Fi: se o download cair, o mapa antigo continua.' }),
    status, progressWrap, downloadBtn,
    h('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:10px', text: 'Importar arquivo .pmtiles (AirDrop / Arquivos)', on: { click: () => fileInput.click() } }),
    fileInput,
    h('button', { class: 'btn btn-block btn-ghost', type: 'button', style: 'margin-top:10px', text: 'Remover mapa do aparelho', on: { click: doRemove } }),
    h('p', { class: 'disclaimer', text: 'Dados do mapa © colaboradores do OpenStreetMap (licença ODbL), em formato Protomaps.' }),
  );

  async function renderStatus() {
    const pack = await getInstalledPack();
    const pois = await getPois();
    let remote = null;
    try {
      remote = await fetchManifest(DEFAULT_PACK);
    } catch {
      remote = null; // offline ou servidor sem mapa: mostra só o que está instalado
    }
    let quota = '';
    if (navigator.storage?.estimate) {
      const { usage = 0, quota: q = 0 } = await navigator.storage.estimate();
      quota = `Espaço usado pelo app: ${mb(usage)} de ${mb(q)} disponíveis.`;
    }
    const outdated = pack && remote && pack.name === remote.name && remote.createdAt !== pack.createdAt;
    mount(clear(status),
      pack ? h('div', {},
        h('h3', {}, '✅ ', pack.label || pack.name),
        h('div', { class: 'small', text: `Versão de ${dateBr(pack.createdAt)} · ${mb(pack.size)} · ${pois.length} pontos vitais` }),
        outdated ? h('p', { class: 'warn', text: `Há versão nova (${dateBr(remote.createdAt)}). Atualize com Wi-Fi.` }) : null,
      ) : h('div', {},
        h('h3', { text: 'Nenhum mapa instalado' }),
        remote ? h('div', { class: 'small', text: `Disponível: ${remote.label} · ${mb(remote.size)}` }) : h('div', { class: 'small muted', text: 'Sem conexão com o servidor agora.' }),
      ),
      quota ? h('div', { class: 'small muted', style: 'margin-top:6px', text: quota }) : null,
    );
    downloadBtn.disabled = !remote;
  }

  async function doDownload() {
    downloadBtn.disabled = true;
    progressWrap.hidden = false;
    const bar = progressWrap.querySelector('i');
    try {
      const { updated } = await downloadPack(DEFAULT_PACK, (ratio, text) => {
        bar.style.width = `${Math.round(ratio * 100)}%`;
        progressText.textContent = text;
      });
      toast(updated ? 'Mapa pronto para uso offline' : 'O mapa já está na versão mais nova');
      if (navigator.storage?.persist) await navigator.storage.persist();
      await reloadMap();
    } catch (err) {
      toast(errorMessage(err), 'error', 6000);
    } finally {
      progressWrap.hidden = true;
      await renderStatus();
    }
  }

  async function doRemove() {
    if (!(await confirmSheet('Remover mapa?', 'Você vai precisar de internet para baixar de novo.', 'Remover', true))) return;
    await removePack();
    await reloadMap();
    await renderStatus();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await importPmtiles(file);
      toast('Mapa importado');
      await reloadMap();
    } catch (err) {
      toast(errorMessage(err), 'error', 6000);
    }
    fileInput.value = '';
    await renderStatus();
  });

  await renderStatus();
}
