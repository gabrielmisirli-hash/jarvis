// Ponto de entrada: carrega dados, monta as telas, navega pelas abas e cuida da atualização offline.

import { h, clear, toast, errorMessage } from './ui.js';
import { loadState, getState, update, subscribe } from './state.js';
import { onJump, setLowPower } from './location.js';
import { initMapView, showMapView, hideMapView, reloadMap } from './views/map-view.js';
import { initCompassView, showCompassView, hideCompassView } from './views/compass-view.js';
import { initSosView, showSosView } from './views/sos-view.js';
import { initGuidesView, showGuidesView } from './views/guides-view.js';
import { initPrepView, showPrepView } from './views/prep-view.js';

const TABS = ['mapa', 'bussola', 'sos', 'guias', 'preparo'];
const DEFAULT_TAB = 'mapa';
let activeTab = null;
let sosRefresh = null;

function applyTheme() {
  const { theme, critical } = getState().settings;
  const value = critical ? 'critical' : theme;
  document.documentElement.dataset.theme = value;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', value === 'light' ? '#ffffff' : '#000000');
  const btn = document.getElementById('critical-btn');
  btn.setAttribute('aria-pressed', String(Boolean(critical)));
  setLowPower(Boolean(critical));
}

function renderNetwork() {
  const chip = document.getElementById('net-chip');
  const online = navigator.onLine;
  chip.textContent = online ? '● online' : '● offline';
  chip.className = `chip ${online ? 'on' : 'off'}`;
  chip.title = online ? 'Com internet: bom momento para atualizar o mapa' : 'Sem internet: tudo que foi baixado continua funcionando';
}

function banner(text, actionLabel, onAction) {
  const root = document.getElementById('banners');
  const el = h('div', { class: 'banner', role: 'status' },
    h('span', { class: 'grow', text }),
    actionLabel ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: actionLabel, on: { click: () => { onAction(); el.remove(); } } }) : null,
    h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Fechar aviso', text: '✕', on: { click: () => el.remove() } }));
  root.append(el);
}

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [tab, ...rest] = raw.split('/');
  return { tab: TABS.includes(tab) ? tab : DEFAULT_TAB, sub: rest.join('/') };
}

async function route() {
  const { tab, sub } = parseHash();
  if (activeTab && activeTab !== tab) {
    if (activeTab === 'mapa') hideMapView();
    if (activeTab === 'bussola') hideCompassView();
  }
  TABS.forEach((t) => { document.getElementById(`tab-${t}`).hidden = t !== tab; });
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  activeTab = tab;
  try {
    if (tab === 'mapa') await showMapView();
    if (tab === 'bussola') await showCompassView();
    if (tab === 'sos') showSosView(sosRefresh);
    if (tab === 'guias') showGuidesView(sub);
    if (tab === 'preparo') await showPrepView(sub);
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    banner('Este navegador não salva o app para uso offline. No iPhone, use o Safari.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offerUpdate = (worker) => banner('Nova versão do app pronta.', 'Atualizar', () => worker.postMessage('SKIP_WAITING'));
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        if (worker.state === 'installed' && !navigator.serviceWorker.controller) toast('App salvo para uso offline ✓');
      });
    });
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return; // 1ª instalação: não precisa recarregar
      reloading = true;
      location.reload();
    });
    if (navigator.onLine) {
      reg.update().catch((err) => console.warn('[sw] verificação de atualização falhou', err));
    }
  } catch (err) {
    banner(`Não foi possível salvar o app offline: ${errorMessage(err)}`);
  }
}

function suggestInstall() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && isIos) banner('Instale: toque em Compartilhar ⬆ e depois "Adicionar à Tela de Início". Assim os dados ficam protegidos.');
}

async function main() {
  // Qualquer falha não tratada (ex.: salvar sem espaço) aparece para o usuário em vez de sumir.
  window.addEventListener('unhandledrejection', (e) => toast(errorMessage(e.reason), 'error', 6000));
  try {
    await loadState();
  } catch (err) {
    banner(`Não foi possível abrir os dados salvos (${errorMessage(err)}). Feche e abra o app; nada será alterado até lá.`);
  }
  applyTheme();
  renderNetwork();
  window.addEventListener('online', renderNetwork);
  window.addEventListener('offline', renderNetwork);
  document.getElementById('critical-btn').addEventListener('click', async () => {
    const next = !getState().settings.critical;
    await update('settings', (s) => ({ ...s, critical: next }));
    toast(next ? 'Bateria crítica: GPS só quando você pedir' : 'Modo normal');
  });
  const lookKey = () => {
    const s = getState().settings;
    return `${s.mapFlavor}|${s.critical}`;
  };
  let lastLook = lookKey();
  subscribe((key) => {
    if (key !== 'settings') return;
    applyTheme();
    if (lookKey() !== lastLook) {
      lastLook = lookKey();
      reloadMap();
    }
  });
  onJump(({ km }) => banner(`⚠️ O GPS saltou ${km.toFixed(0)} km de repente. Pode ser interferência. Confira com o mapa, a bússola e placas.`));

  initMapView(document.getElementById('tab-mapa'));
  initCompassView(document.getElementById('tab-bussola'));
  sosRefresh = initSosView(document.getElementById('tab-sos'));
  initGuidesView(document.getElementById('tab-guias'));
  initPrepView(document.getElementById('tab-preparo'));

  window.addEventListener('hashchange', route);
  await route();
  registerServiceWorker();
  suggestInstall();
}

main().catch((err) => {
  const root = clear(document.getElementById('banners'));
  root.append(h('div', { class: 'banner', text: `Erro ao iniciar: ${errorMessage(err)}` }));
});
