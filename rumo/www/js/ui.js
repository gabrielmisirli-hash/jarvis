// Utilitários de interface. Todo texto do usuário entra via textContent (nunca innerHTML) para evitar XSS.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'on') Object.entries(value).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = Boolean(value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Como el.append, mas aceita listas aninhadas e ignora null/false. */
export function mount(el, ...children) {
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function errorMessage(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Erro inesperado';
}

export function toast(message, kind = 'info', ms = 2800) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  root.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Folha inferior modal. Retorna { close }. */
export function sheet(title, content, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Fechar', on: { click: () => close() } })),
    content,
  );
  const backdrop = h('div', { class: 'sheet-backdrop', on: { click: (e) => e.target === backdrop && close() } }, panel);
  root.append(backdrop);
  document.addEventListener('keydown', onKey);
  return { close, panel };
}

export function confirmSheet(title, message, confirmLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (value) => {
      answered = true;
      resolve(value);
      ref.close();
    };
    const ref = sheet(title, h('div', { class: 'stack' },
      h('p', { text: message }),
      h('button', { class: `btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', text: confirmLabel, on: { click: () => finish(true) } }),
      h('button', { class: 'btn btn-block', type: 'button', text: 'Cancelar', on: { click: () => finish(false) } }),
    ), { onClose: () => !answered && resolve(false) });
  });
}

export function field(label, input) {
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}

export function backLink(href, label = '‹ Voltar') {
  return h('a', { class: 'btn btn-sm btn-ghost back', href, text: label });
}

// Tela acesa por "motivos" (trilha, tela cheia de SOS...): só apaga quando nenhum motivo resta.
// O iOS solta o bloqueio quando o app vai para segundo plano, então pedimos de novo ao voltar.
const wakeReasons = new Set();
let wakeLock = null;
let acquiring = null;

async function acquireWakeLock() {
  if (wakeLock || acquiring || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  acquiring = navigator.wakeLock.request('screen')
    .then((lock) => {
      if (wakeReasons.size === 0) return lock.release();
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
      return undefined;
    })
    .catch((err) => console.warn('[tela] bloqueio de tela indisponível', err)) // o app segue; só a tela pode apagar
    .finally(() => {
      acquiring = null;
    });
  await acquiring;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeReasons.size > 0) acquireWakeLock();
});

export async function keepScreenOn(reason, on) {
  if (on) wakeReasons.add(reason);
  else wakeReasons.delete(reason);
  if (wakeReasons.size > 0) {
    await acquireWakeLock();
    return;
  }
  const lock = wakeLock;
  wakeLock = null;
  await lock?.release().catch(() => undefined);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  } catch {
    toast('Não deu para copiar. Segure o texto para copiar.', 'error');
  }
}

export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  await copyText(text);
}

export function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
