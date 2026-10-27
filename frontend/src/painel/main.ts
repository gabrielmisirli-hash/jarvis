// frontend/src/painel/main.ts
//
// The control panel at /painel: a sidebar of sections, each one a view
// rendered into #pn-view from JARVIS's own endpoints. Reads go through the
// dashboard's typed client; the few writes (preferences, routines, runs) are
// plain same-origin fetches, which web_auth admits by their Origin.
//
// Same rule as the dashboard: no innerHTML anywhere. Run prompts, session
// titles, memory files and JARVIS's replies are all text someone else wrote.
import {
  listRuns, getStats, getUsageLimits, cancelRun, listSessions, getMemory,
  getMemoryDoc, listProjectViews, getEvents,
  type RunRow, type SessionRow, type UsageWindow,
} from "../dashboard/api";
import { el } from "../dashboard/ui";
import { renderSaude } from "./saude";

type Tone = "ok" | "warn" | "bad" | "idle" | "accent";

interface Section {
  id: string;
  title: string;
  sub: string;
  icon: string;
  render: (root: HTMLElement) => Promise<void> | void;
}

// ── tiny helpers ─────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

/** Stroke icons, one path string each (24×24 viewBox). */
const ICONS: Record<string, string> = {
  chat: "M4 5h16v11H8l-4 4z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  heart: "M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z",
  gauge: "M12 14l4-4M4 18a9 9 0 1 1 16 0",
  flow: "M5 3v6M5 15v6M19 3v18M5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 12h8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  rocket: "M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M14 4c3-1.5 6-1 6-1s.5 3-1 6l-7 7-5-5zM9 15l-2-2M15 9h.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  plug: "M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5",
  speak: "M4 4h16v12H9l-5 4zM8 9h8M8 12h5",
  play: "M7 4l13 8-13 8z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
};

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name] ?? ICONS.spark);
  svg.append(path);
  return svg;
}

function iconBox(name: string): HTMLElement {
  const box = el("span", "pn-icon");
  box.append(icon(name));
  return box;
}

function panel(title: string, ...children: Node[]): HTMLElement {
  const p = el("section", "pn-panel");
  p.append(el("h2", "pn-panel-title", title), ...children);
  return p;
}

function tile(iconName: string, label: string, value: string, note: string): HTMLElement {
  const t = el("div", "pn-tile");
  const body = el("div");
  body.append(el("div", "pn-tile-label", label), el("div", "pn-tile-value", value),
              el("div", "pn-tile-note", note));
  t.append(iconBox(iconName), body);
  return t;
}

function status(tone: Tone, text: string): HTMLElement {
  const s = el("span", `pn-status tone-${tone}`);
  s.append(el("span", "pn-dot"), el("span", undefined, text));
  return s;
}

function row(title: string, sub: string, meta?: string | Node, tone?: Tone): HTMLElement {
  const r = el("div", "pn-row");
  if (tone) {
    const d = el("span", `pn-dot tone-${tone}`);
    r.append(d);
  }
  const main = el("div", "pn-row-main");
  main.append(el("div", "pn-row-title", title));
  if (sub) main.append(el("div", "pn-row-sub", sub));
  r.append(main);
  if (meta !== undefined) {
    r.append(typeof meta === "string" ? el("span", "pn-row-meta", meta) : meta);
  }
  return r;
}

function empty(text: string): HTMLElement {
  return el("div", "pn-empty", text);
}

function button(label: string, onClick: () => void, variant = ""): HTMLButtonElement {
  const b = el("button", `pn-btn ${variant}`.trim(), label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function bar(pct: number, tone: Tone): HTMLElement {
  const b = el("div", `pn-bar tone-${tone}`);
  const fill = el("span");
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  b.append(fill);
  return b;
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  return send<T>("GET", url);
}

function fmtAgo(epochSec: number | null): string {
  if (!epochSec) return "—";
  const secs = Math.max(0, Date.now() / 1000 - epochSec);
  if (secs < 60) return "agora";
  if (secs < 3600) return `há ${Math.round(secs / 60)} min`;
  if (secs < 86400) return `há ${Math.round(secs / 3600)} h`;
  return `há ${Math.round(secs / 86400)} d`;
}

function fmtUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
}

function fmtCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const RUN_STATUS: Record<RunRow["status"], [Tone, string]> = {
  queued: ["accent", "Na fila"],
  running: ["accent", "Executando"],
  succeeded: ["ok", "Concluída"],
  failed: ["bad", "Falhou"],
  timed_out: ["warn", "Tempo esgotado"],
  cancelled: ["idle", "Cancelada"],
};

const SESSION_STATE: Record<string, [Tone, string]> = {
  needs_you: ["warn", "Precisa de você"],
  working: ["accent", "Trabalhando"],
  idle: ["ok", "Ociosa"],
  shell: ["idle", "Terminal"],
  fresh: ["idle", "Nova"],
  gone: ["idle", "Encerrada"],
  unknown: ["idle", "Desconhecido"],
};

function windowLabel(w: UsageWindow): string {
  if (w.key.includes("five") || w.key.includes("5h")) return "Janela de 5 horas";
  if (w.key.includes("seven") || w.key.includes("7d")) return "Janela de 7 dias";
  return w.label;
}

function usageTone(pct: number): Tone {
  return pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok";
}

// ── Chat: a text channel onto the same /ws/voice the orb uses ─────────────

const chat = {
  ws: null as WebSocket | null,
  log: null as HTMLElement | null,
  bubbles: new Map<number, HTMLElement>(),
  history: [] as { who: "me" | "jarvis" | "sys"; text: string; utt?: number }[],
  thinking: false,
  onStatus: null as ((s: string) => void) | null,
};

function chatAppend(who: "me" | "jarvis" | "sys", text: string, utt?: number): void {
  const last = chat.history[chat.history.length - 1];
  // Chunks of one utterance land in one bubble.
  if (who === "jarvis" && utt !== undefined && last?.who === "jarvis" && last.utt === utt) {
    last.text = `${last.text} ${text}`;
    chat.bubbles.get(utt)?.replaceChildren(document.createTextNode(last.text));
    return;
  }
  chat.history.push({ who, text, utt });
  if (chat.history.length > 200) chat.history.shift();
  if (chat.log) {
    const b = el("div", `pn-msg ${who}`, text);
    if (utt !== undefined) chat.bubbles.set(utt, b);
    chat.log.append(b);
    chat.log.scrollTop = chat.log.scrollHeight;
  }
}

function chatConnect(): void {
  if (chat.ws && chat.ws.readyState <= WebSocket.OPEN) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/voice`);
  chat.ws = ws;
  ws.addEventListener("open", () => chatAppend("sys", "Conectado ao JARVIS."));
  ws.addEventListener("close", () => {
    chatAppend("sys", "Conexão encerrada. Tentando de novo em 5 s…");
    setTimeout(chatConnect, 5000);
  });
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const type = msg.type;
    if (type === "audio") {
      const utt = Number(msg.utt);
      if (msg.text) chatAppend("jarvis", String(msg.text), utt);
      // This page does not play audio (the orb does). Acknowledge each chunk
      // so the speech scheduler is never left waiting on a tab that will
      // never play it.
      ws.send(JSON.stringify({ type: "played", utt, idx: Number(msg.idx) }));
    } else if (type === "text") {
      chatAppend("jarvis", String(msg.text ?? ""));
    } else if (type === "status") {
      chat.thinking = msg.state === "thinking";
      chat.onStatus?.(String(msg.state));
    } else if (type === "notice" && msg.text) {
      chatAppend("sys", String(msg.text));
    }
  });
}

function chatSend(text: string): boolean {
  const t = text.trim();
  if (!t || !chat.ws || chat.ws.readyState !== WebSocket.OPEN) return false;
  chat.ws.send(JSON.stringify({ type: "transcript", isFinal: true, text: t }));
  chatAppend("me", t);
  return true;
}

function renderChat(root: HTMLElement): void {
  chatConnect();
  const wrap = el("div", "pn-panel pn-chat");
  const log = el("div", "pn-chat-log");
  chat.log = log;
  chat.bubbles.clear();
  for (const m of chat.history) {
    const b = el("div", `pn-msg ${m.who}`, m.text);
    if (m.utt !== undefined) chat.bubbles.set(m.utt, b);
    log.append(b);
  }
  if (!chat.history.length) {
    log.append(el("div", "pn-msg sys",
      "Escreva para o JARVIS. As respostas também são faladas no orbe, se ele estiver aberto."));
  }
  const state = el("div", "pn-hint", "");
  chat.onStatus = (s) => {
    state.textContent = s === "thinking" ? "JARVIS está pensando…"
      : s === "speaking" ? "JARVIS está respondendo…" : "";
  };
  const form = el("form", "pn-chat-form");
  const input = el("input", "pn-input");
  input.placeholder = "Converse, pesquise e execute…";
  input.maxLength = 2000;
  form.append(input, el("button", "pn-btn", "Enviar"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (chatSend(input.value)) input.value = "";
  });
  wrap.append(log, state, form);
  root.append(wrap);
  log.scrollTop = log.scrollHeight;
  input.focus();
}

// ── Jarvis: is everything alive ───────────────────────────────────────────

interface SettingsStatus {
  claude_code_installed: boolean;
  uptime_seconds: number;
  env_keys_set: { fish_audio: boolean; fish_voice_id: boolean; edge_voice?: string; user_name: string };
}

async function renderJarvis(root: HTMLElement): Promise<void> {
  const [health, st, limits, sessions, runs] = await Promise.allSettled([
    getJson<{ status: string; version: string }>("/api/health"),
    getJson<SettingsStatus>("/api/settings/status"),
    getUsageLimits(),
    listSessions(),
    listRuns(50),
  ]);
  const tiles = el("div", "pn-tiles");
  tiles.append(
    tile("pulse", "Servidor",
      health.status === "fulfilled" ? "Online" : "Offline",
      health.status === "fulfilled" ? `versão ${health.value.version}` : "não respondeu"),
    tile("clock", "Tempo ativo",
      st.status === "fulfilled" ? fmtUptime(st.value.uptime_seconds) : "—", "desde o último início"),
    tile("chat", "Sessões ativas",
      sessions.status === "fulfilled"
        ? String(sessions.value.sessions.filter((s) => s.state !== "gone").length) : "—",
      "conversas do Claude Code"),
    tile("flow", "Execuções ativas",
      runs.status === "fulfilled"
        ? String(runs.value.filter((r) => r.status === "running" || r.status === "queued").length) : "—",
      "runs em andamento"),
  );
  root.append(tiles);

  const two = el("div", "pn-two");
  const comp = el("div");
  if (st.status === "fulfilled") {
    const s = st.value;
    comp.append(
      row("Cérebro (Claude Code)", "Assinatura do Claude, sem chave de API",
        status(s.claude_code_installed ? "ok" : "bad", s.claude_code_installed ? "Instalado" : "Ausente")),
      s.env_keys_set.edge_voice
        ? row("Voz (Edge, grátis)", s.env_keys_set.edge_voice, status("ok", "Configurada"))
        : row("Voz (Fish Audio)", s.env_keys_set.fish_voice_id ? "Voz personalizada definida" : "Voz padrão",
            status(s.env_keys_set.fish_audio ? "ok" : "warn", s.env_keys_set.fish_audio ? "Configurada" : "Sem chave")),
      row("Monitor de sessões", "Observa todas as sessões do Claude Code",
        status(sessions.status === "fulfilled" ? "ok" : "bad",
          sessions.status === "fulfilled" ? "Operacional" : "Indisponível")),
    );
  } else {
    comp.append(empty("Não foi possível ler o status do servidor."));
  }
  two.append(panel("Componentes", comp));

  const use = el("div");
  if (limits.status === "fulfilled" && limits.value.measured) {
    for (const w of limits.value.windows) {
      const box = el("div", "pn-row");
      const main = el("div", "pn-row-main");
      const pct = w.utilization ?? 0;
      main.append(el("div", "pn-row-title", windowLabel(w)),
        w.utilization === null ? el("div", "pn-row-sub", "ainda não medido") : bar(pct, usageTone(pct)));
      box.append(main, el("span", "pn-row-meta",
        w.utilization === null ? "—" : `${Math.round(pct)}%`));
      use.append(box);
    }
  } else {
    use.append(empty("Sem leitura ainda — ela chega quando o JARVIS responde a primeira vez."));
  }
  two.append(panel("Limites da assinatura", use));
  root.append(two);

  const act = el("div", "pn-actions");
  const note = el("span", "pn-hint");
  act.append(
    button("Testar voz", async () => {
      note.textContent = "Sintetizando…";
      try {
        const r = await send<{ audio: string | null; error?: string }>("POST", "/api/tts-test");
        if (!r.audio) throw new Error(r.error ?? "falhou");
        await new Audio(`data:audio/mpeg;base64,${r.audio}`).play();
        note.textContent = "Voz OK.";
      } catch (e) { note.textContent = `Falhou: ${(e as Error).message}`; }
    }, "pn-btn--ghost"),
    button("Reiniciar servidor", async () => {
      if (!confirm("Reiniciar o servidor do JARVIS agora?")) return;
      await send("POST", "/api/restart").catch(() => undefined);
      note.textContent = "Reiniciando… a página reconecta sozinha.";
    }, "pn-btn--danger"),
    note,
  );
  root.append(panel("Ações", act));
}

// ── Briefing: what happened, what is waiting ──────────────────────────────

async function renderBriefing(root: HTMLElement): Promise<void> {
  const ask = el("div", "pn-actions");
  ask.append(
    button("Pedir briefing ao JARVIS", () => {
      go("chat");
      setTimeout(() => chatSend(
        "Me dê o briefing do dia: clima, alertas e o que está pendente nas minhas sessões."), 600);
    }),
    el("span", "pn-hint", "O clima e os alertas do INMET vêm direto pelo JARVIS."),
  );
  root.append(ask);

  const [stats, sessions, memory] = await Promise.allSettled([
    getStats("day"), listSessions(), getMemory(),
  ]);
  const tiles = el("div", "pn-tiles");
  if (stats.status === "fulfilled") {
    const s = stats.value;
    tiles.append(
      tile("flow", "Execuções hoje", String(s.total_runs),
        `${s.by_status.succeeded ?? 0} concluídas · ${(s.by_status.failed ?? 0) + (s.by_status.timed_out ?? 0)} com falha`),
      tile("gauge", "Tokens hoje", fmtCount(s.total_input_tokens + s.total_output_tokens), "entrada + saída"),
    );
  }
  if (sessions.status === "fulfilled") {
    const waiting = sessions.value.sessions.filter((x) => x.state === "needs_you").length;
    tiles.append(tile("chat", "Aguardando você", String(waiting), "sessões pedindo resposta"));
  }
  root.append(tiles);

  const two = el("div", "pn-two");
  const pend = el("div");
  if (sessions.status === "fulfilled") {
    const need = sessions.value.sessions.filter((x) => x.state === "needs_you" || x.needs_a_human_hand);
    if (!need.length) pend.append(empty("Nada esperando por você."));
    for (const s of need) pend.append(sessionRow(s));
  } else pend.append(empty("Sessões indisponíveis."));
  two.append(panel("Pendências", pend));

  const handover = el("div");
  if (memory.status === "fulfilled" && memory.value.latest_journal_slug) {
    try {
      const doc = await getMemoryDoc("journal", memory.value.latest_journal_slug);
      handover.append(el("pre", "pn-pre", doc.text));
    } catch { handover.append(empty("Não foi possível ler a última passagem de turno.")); }
  } else handover.append(empty("Nenhuma passagem de turno registrada ainda."));
  two.append(panel("Última passagem de turno", handover));
  root.append(two);
}

function sessionRow(s: SessionRow): HTMLElement {
  const [tone, label] = SESSION_STATE[s.state] ?? SESSION_STATE.unknown;
  return row(s.title || s.voice_name || s.project, s.needs || s.summary || s.cwd,
    status(tone, label));
}

// ── Fontes de Dados: what JARVIS can reach ────────────────────────────────

interface Connections {
  path: string;
  servers: { name: string; state: "connected" | "failed" | "declared"; tools: number }[];
  problems: string[];
}

/** Services people usually hook up. Each is a third-party MCP server the
 * user declares in connections.json; `match` finds it there by name. */
const CATALOG: { name: string; desc: string; logo: string; match: string[]; advanced?: boolean }[] = [
  { name: "Google Agenda", desc: "Compromissos e lembretes", logo: "31", match: ["calendar", "agenda", "gcal"] },
  { name: "Gmail", desc: "Ler e resumir e-mails", logo: "M", match: ["gmail", "mail"] },
  { name: "Google Drive", desc: "Documentos e planilhas", logo: "▲", match: ["drive", "gdrive"], advanced: true },
  { name: "Notion", desc: "Páginas e bancos de dados", logo: "N", match: ["notion"] },
  { name: "Obsidian", desc: "Cofre em Markdown", logo: "◆", match: ["obsidian"] },
  { name: "Home Assistant", desc: "Luzes, interruptores e sensores", logo: "⌂", match: ["home-assistant", "homeassistant", "hass"] },
  { name: "eWeLink", desc: "Tomadas e interruptores Sonoff", logo: "e", match: ["ewelink", "sonoff"] },
  { name: "brapi", desc: "Cotações e indicadores da B3", logo: "b", match: ["brapi", "b3"] },
  { name: "Alpha Vantage", desc: "Mercados internacionais", logo: "α", match: ["alpha", "alphavantage"] },
  { name: "Strava", desc: "Treinos e atividades", logo: "S", match: ["strava"], advanced: true },
  { name: "WHOOP", desc: "Sono, recuperação e esforço", logo: "W", match: ["whoop"], advanced: true },
  { name: "GitHub", desc: "Issues, PRs e repositórios", logo: "G", match: ["github"] },
];

function sourceCard(name: string, desc: string, logo: string | SVGSVGElement,
                    state: [Tone, string] | null, opts: { advanced?: boolean } = {}): HTMLElement {
  const c = el("div", `pn-card${state ? "" : " off"}`);
  const head = el("div", "pn-card-head");
  const lg = el("span", "pn-card-logo");
  if (typeof logo === "string") lg.textContent = logo; else lg.append(logo);
  head.append(lg, el("span", "pn-card-name", name));
  if (opts.advanced) head.append(el("span", "pn-tag", "Avançado"));
  c.append(head, el("div", "pn-card-desc", desc));
  const foot = el("div", "pn-card-foot");
  foot.append(state ? status(state[0], state[1]) : status("idle", "Não conectada"));
  c.append(foot);
  return c;
}

async function renderFontes(root: HTMLElement): Promise<void> {
  const [conn, st, memory, sessions, projects, limits] = await Promise.allSettled([
    getJson<Connections>("/api/connections"),
    getJson<SettingsStatus>("/api/settings/status"),
    getMemory(), listSessions(), listProjectViews(), getUsageLimits(),
  ]);

  const native: HTMLElement[] = [];
  const ok = (b: boolean, yes: string, no = "Precisa de atenção"): [Tone, string] =>
    b ? ["ok", yes] : ["warn", no];
  if (st.status === "fulfilled") {
    native.push(sourceCard("Claude Code", "O cérebro do JARVIS, pela sua assinatura", icon("spark"),
      ok(st.value.claude_code_installed, "Conectado · operacional", "Não instalado")));
    const edge = st.value.env_keys_set.edge_voice;
    native.push(edge
      ? sourceCard("Voz Edge", `A voz do JARVIS · ${edge}`, icon("speak"), ["ok", "Conectada · grátis"])
      : sourceCard("Fish Audio", "A voz do JARVIS", icon("speak"),
          ok(st.value.env_keys_set.fish_audio, "Conectada · operacional", "Sem chave")));
  }
  if (memory.status === "fulfilled") {
    const m = memory.value;
    native.push(sourceCard("Memória", `${m.memories.length} memórias · ${m.journal.length} registros no diário`,
      icon("db"), ["ok", "Conectada · Markdown local"]));
  }
  if (sessions.status === "fulfilled") {
    native.push(sourceCard("Sessões do Claude Code",
      `${sessions.value.sessions.filter((s) => s.state !== "gone").length} sessões visíveis`,
      icon("chat"), ["ok", "Conectada · operacional"]));
  }
  if (projects.status === "fulfilled") {
    native.push(sourceCard("Projetos", `${projects.value.length} projetos acompanhados`,
      icon("flow"), ["ok", "Conectada · operacional"]));
  }
  native.push(sourceCard("Clima e alertas", "Open-Meteo + INMET / Defesa Civil", icon("sun"),
    ["ok", "Conectada · sem chave"]));
  if (limits.status === "fulfilled") {
    native.push(sourceCard("Uso da assinatura", "Janelas de 5 h e 7 dias", icon("gauge"),
      limits.value.measured ? ["ok", "Conectada · medida"] : ["warn", "Aguardando 1ª leitura"]));
  }

  const servers = conn.status === "fulfilled" ? conn.value.servers : [];
  const used = new Set<string>();
  const catalog = CATALOG.map((item) => {
    const s = servers.find((x) => item.match.some((m) => x.name.toLowerCase().includes(m)));
    if (s) used.add(s.name);
    const state: [Tone, string] | null = !s ? null
      : s.state === "connected" ? ["ok", `Conectado · ${s.tools} ferramentas`]
      : s.state === "failed" ? ["bad", "Não iniciou"] : ["warn", "Declarado · reinicie o JARVIS"];
    return { el: sourceCard(item.name, item.desc, item.logo, state, item), on: !!state };
  });
  const extra = servers.filter((s) => !used.has(s.name)).map((s) => sourceCard(
    s.name, "Servidor MCP declarado por você", icon("plug"),
    s.state === "connected" ? ["ok", `Conectado · ${s.tools} ferramentas`]
      : s.state === "failed" ? ["bad", "Não iniciou"] : ["warn", "Declarado · reinicie o JARVIS"]));

  const active = native.length + servers.filter((s) => s.state === "connected").length;
  const attention = servers.filter((s) => s.state !== "connected").length
    + (conn.status === "fulfilled" ? conn.value.problems.length : 0);
  const tiles = el("div", "pn-tiles");
  tiles.append(
    tile("pulse", "Saúde das conexões", String(active), attention ? `${attention} pedem atenção` : "tudo em ordem"),
    tile("plug", "Servidores MCP", String(servers.length), "declarados em connections.json"),
    tile("db", "Fontes nativas", String(native.length), "embutidas no JARVIS"),
  );
  root.append(tiles);

  const nat = el("div", "pn-cards");
  nat.append(...native);
  root.append(panel("Nativas do JARVIS", nat));

  const cat = el("div", "pn-cards");
  cat.append(...extra, ...catalog.filter((c) => c.on).map((c) => c.el),
             ...catalog.filter((c) => !c.on).map((c) => c.el));
  const how = el("p", "pn-hint");
  how.textContent = conn.status === "fulfilled"
    ? `Para conectar um serviço, cole a entrada "mcpServers" dele em ${conn.value.path} e reinicie o JARVIS. Tokens ficam só nesse arquivo — este painel nunca os lê.`
    : "Não foi possível ler as conexões declaradas.";
  const probs = el("div");
  if (conn.status === "fulfilled") {
    for (const p of conn.value.problems) probs.append(row("Problema no arquivo de conexões", p, undefined, "bad"));
  }
  const box = panel("Serviços externos (MCP)", how, probs, cat);
  how.style.marginBottom = "14px";
  root.append(box);
}

// ── Monitoramento: sessions and runs, live-ish ────────────────────────────

async function renderMonitor(root: HTMLElement): Promise<void> {
  const [sessions, runs] = await Promise.allSettled([listSessions(), listRuns(30)]);
  const two = el("div", "pn-two");
  const ses = el("div");
  if (sessions.status === "fulfilled") {
    const live = sessions.value.sessions.filter((s) => s.state !== "gone");
    if (!live.length) ses.append(empty("Nenhuma sessão do Claude Code aberta."));
    for (const s of live) ses.append(sessionRow(s));
  } else ses.append(empty("Sessões indisponíveis."));
  two.append(panel("Sessões do Claude Code", ses));

  const act = el("div");
  if (runs.status === "fulfilled") {
    const active = runs.value.filter((r) => r.status === "running" || r.status === "queued");
    if (!active.length) act.append(empty("Nenhuma execução em andamento."));
    for (const r of active) {
      const [tone, label] = RUN_STATUS[r.status];
      const actions = el("span", "pn-actions");
      actions.append(status(tone, label),
        button("Cancelar", async () => { await cancelRun(r.id); refresh(); }, "pn-btn--danger pn-btn--sm"));
      act.append(row(r.project_name, r.prompt, actions));
    }
  } else act.append(empty("Execuções indisponíveis."));
  two.append(panel("Execuções ativas", act));
  root.append(two, el("p", "pn-hint", "Atualiza sozinho a cada 10 segundos."));
}

// ── Consumo: the subscription, not money ──────────────────────────────────

interface UsagePeriods {
  today: { input_tokens: number; output_tokens: number; tts_calls: number };
  week: { input_tokens: number; output_tokens: number; tts_calls: number };
  month: { input_tokens: number; output_tokens: number; tts_calls: number };
}

async function renderConsumo(root: HTMLElement): Promise<void> {
  const [usage, limits, week] = await Promise.allSettled([
    getJson<UsagePeriods>("/api/usage"), getUsageLimits(), getStats("week"),
  ]);
  const tiles = el("div", "pn-tiles");
  if (usage.status === "fulfilled") {
    const u = usage.value;
    for (const [label, p] of [["Hoje", u.today], ["7 dias", u.week], ["30 dias", u.month]] as const) {
      tiles.append(tile("gauge", `Tokens · ${label}`, fmtCount(p.input_tokens + p.output_tokens),
        `${p.tts_calls} falas sintetizadas`));
    }
  }
  if (week.status === "fulfilled") {
    tiles.append(tile("flow", "Execuções · 7 dias", String(week.value.total_runs),
      `${fmtCount(week.value.total_input_tokens + week.value.total_output_tokens)} tokens`));
  }
  root.append(tiles);
  const lim = el("div");
  if (limits.status === "fulfilled" && limits.value.measured) {
    for (const w of limits.value.windows) {
      const pct = w.utilization ?? 0;
      const box = el("div", "pn-row");
      const main = el("div", "pn-row-main");
      main.append(el("div", "pn-row-title", windowLabel(w)),
        el("div", "pn-row-sub", w.resets_at
          ? `renova ${new Date(w.resets_at * 1000).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
          : "sem horário de renovação"),
        bar(pct, usageTone(pct)));
      box.append(main, el("span", "pn-row-meta", w.utilization === null ? "—" : `${Math.round(pct)}%`));
      lim.append(box);
    }
  } else lim.append(empty("Sem leitura ainda."));
  root.append(panel("Limites da assinatura", lim),
    el("p", "pn-hint", "O JARVIS roda na sua assinatura do Claude: não há gasto em dinheiro para mostrar, só o quanto da janela já foi usado."));
}

// ── Rotinas: phrase or event → steps ──────────────────────────────────────

interface Step { kind: "say" | "wait" | "ask" | "run"; text?: string; seconds?: number; project?: string }
interface Routine {
  id?: string; name: string; enabled: boolean; phrases: string[]; events: string[];
  window: { days: number[]; start: string; end: string } | null; steps: Step[];
}

const STEP_LABEL: Record<Step["kind"], [string, string]> = {
  wait: ["clock", "Esperar"],
  say: ["speak", "Falar"],
  ask: ["spark", "Comando do JARVIS"],
  run: ["play", "Executar no projeto"],
};
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

async function renderRotinas(root: HTMLElement): Promise<void> {
  let list: Routine[] = [];
  try {
    list = (await getJson<{ routines: Routine[] }>("/api/routines")).routines;
  } catch (e) {
    root.append(empty(`Rotinas indisponíveis: ${(e as Error).message}`));
    return;
  }
  const head = el("div", "pn-actions");
  head.append(button("+ Nova rotina", () => openEditor(root, null)),
    el("span", "pn-hint", "Uma frase dita (ou um evento) dispara passos em ordem, sem passar pelo cérebro."));
  root.append(head);
  if (!list.length) {
    root.append(empty("Nenhuma rotina ainda. Ex.: diga “Jarvis, cheguei” e ele te dá boas-vindas."));
    return;
  }
  const cards = el("div", "pn-cards");
  for (const r of list) {
    const c = sourceCard(r.name,
      [r.phrases.map((p) => `“${p}”`).join(", "), r.events.includes("greeting") ? "ao dar bom dia" : ""]
        .filter(Boolean).join(" · ") || "—",
      icon("flow"), r.enabled ? ["ok", `${r.steps.length} passos`] : ["idle", "Desativada"]);
    if (!r.enabled) c.classList.add("off");
    const foot = c.querySelector(".pn-card-foot")!;
    foot.prepend(
      button("Executar", async () => {
        await send("POST", `/api/routines/${r.id}/run`).catch((e) => alert(e.message));
      }, "pn-btn--ghost pn-btn--sm"),
      button("Editar", () => openEditor(root, r), "pn-btn--ghost pn-btn--sm"),
    );
    cards.append(c);
  }
  root.append(cards);
}

async function openEditor(root: HTMLElement, existing: Routine | null): Promise<void> {
  editing = true;
  const r: Routine = existing ? structuredClone(existing)
    : { name: "", enabled: true, phrases: [], events: [], window: null, steps: [] };
  let projectNames: string[] = [];
  try { projectNames = (await getJson<{ projects: { name: string }[] }>("/api/projects")).projects.map((p) => p.name); }
  catch { /* the run step just offers nothing to pick */ }

  root.replaceChildren();
  const form = el("form", "pn-form");

  // Nome + ativa
  const name = el("input", "pn-input");
  name.placeholder = "Ex.: Cheguei em casa";
  name.value = r.name; name.maxLength = 80;
  const enabled = el("input"); enabled.type = "checkbox"; enabled.checked = r.enabled;
  const enabledLbl = el("label", "pn-hint"); enabledLbl.append(enabled, document.createTextNode(" Rotina ativa"));
  form.append(panel("Nome da rotina", name, enabledLbl));

  // Frases
  const phrases = el("input", "pn-input");
  phrases.placeholder = "Ex.: cheguei, voltei";
  phrases.value = r.phrases.join(", ");
  form.append(panel("Frases que disparam",
    el("p", "pn-hint", "Separe por vírgula. O JARVIS compara a fala inteira para evitar acionamentos por engano."),
    phrases,
    el("p", "pn-hint", "Exemplo: “Jarvis, cheguei” dispara; “cheguei a pensar que…” não.")));

  // Eventos
  const greet = el("input"); greet.type = "checkbox"; greet.checked = r.events.includes("greeting");
  const greetCard = el("label", "pn-row clickable");
  const gt = el("div", "pn-row-main");
  gt.append(el("div", "pn-row-title", "Bom dia"),
    el("div", "pn-row-sub", "Quando o JARVIS cumprimenta você ao abrir o orbe."));
  greetCard.append(greet, gt);
  form.append(panel("Eventos do JARVIS",
    el("p", "pn-hint", "A rotina também pode começar sozinha quando o JARVIS reconhece um momento."),
    greetCard));

  // Quando vale
  const limit = el("input"); limit.type = "checkbox"; limit.checked = r.window !== null;
  const limitLbl = el("label", "pn-hint"); limitLbl.append(limit, document.createTextNode(" Limitar horários e dias"));
  const win = el("div", "pn-actions");
  const dayBoxes = DAYS.map((d, i) => {
    const cb = el("input"); cb.type = "checkbox";
    cb.checked = r.window ? r.window.days.includes(i) : true;
    const l = el("label", "pn-hint"); l.append(cb, document.createTextNode(` ${d}`));
    win.append(l);
    return cb;
  });
  const start = el("input", "pn-input"); start.type = "time"; start.value = r.window?.start ?? "07:00";
  const end = el("input", "pn-input"); end.type = "time"; end.value = r.window?.end ?? "22:00";
  win.append(el("span", "pn-hint", "das"), start, el("span", "pn-hint", "às"), end);
  win.hidden = !limit.checked;
  limit.addEventListener("change", () => { win.hidden = !limit.checked; });
  form.append(panel("Quando vale",
    el("p", "pn-hint", "Opcional: fora desse período, a rotina não será executada."), limitLbl, win));

  // Passos
  const stepsBox = el("div");
  const drawSteps = () => {
    stepsBox.replaceChildren();
    if (!r.steps.length) stepsBox.append(empty("Adicione pelo menos um passo."));
    r.steps.forEach((s, i) => {
      const line = el("div", "pn-row");
      line.append(iconBox(STEP_LABEL[s.kind][0]));
      const main = el("div", "pn-row-main pn-actions");
      main.append(el("strong", undefined, `${i + 1}. ${STEP_LABEL[s.kind][1]}`));
      if (s.kind === "wait") {
        const n = el("input", "pn-input"); n.type = "number"; n.min = "1"; n.max = "600";
        n.value = String(s.seconds ?? 5); n.style.width = "90px";
        n.addEventListener("input", () => { s.seconds = Number(n.value); });
        main.append(n, el("span", "pn-hint", "segundos"));
      } else {
        if (s.kind === "run") {
          const sel = el("select", "pn-select");
          for (const p of projectNames) { const o = el("option", undefined, p); o.value = p; sel.append(o); }
          if (s.project && !projectNames.includes(s.project)) {
            const o = el("option", undefined, `${s.project} (não encontrado)`); o.value = s.project; sel.append(o);
          }
          sel.value = s.project ?? projectNames[0] ?? "";
          s.project = sel.value;
          sel.addEventListener("change", () => { s.project = sel.value; });
          main.append(sel);
        }
        const t = el("input", "pn-input"); t.style.flex = "1"; t.maxLength = 500;
        t.placeholder = s.kind === "say" ? "O que o JARVIS fala"
          : s.kind === "ask" ? "Ex.: como está o clima?" : "O que o Claude Code deve fazer";
        t.value = s.text ?? "";
        t.addEventListener("input", () => { s.text = t.value; });
        main.append(t);
      }
      const ctl = el("span", "pn-actions");
      ctl.append(
        button("↑", () => { if (i) { [r.steps[i - 1], r.steps[i]] = [r.steps[i], r.steps[i - 1]]; drawSteps(); } }, "pn-btn--ghost pn-btn--sm"),
        button("↓", () => { if (i < r.steps.length - 1) { [r.steps[i + 1], r.steps[i]] = [r.steps[i], r.steps[i + 1]]; drawSteps(); } }, "pn-btn--ghost pn-btn--sm"),
        button("✕", () => { r.steps.splice(i, 1); drawSteps(); }, "pn-btn--danger pn-btn--sm"),
      );
      line.append(main, ctl);
      stepsBox.append(line);
    });
  };
  const adders = el("div", "pn-actions");
  for (const kind of ["wait", "say", "ask", "run"] as const) {
    const b = button(STEP_LABEL[kind][1], () => {
      r.steps.push(kind === "wait" ? { kind, seconds: 5 } : { kind, text: "" });
      drawSteps();
    }, "pn-btn--ghost");
    b.prepend(icon(STEP_LABEL[kind][0]));
    b.querySelector("svg")!.setAttribute("width", "16");
    adders.append(b);
  }
  drawSteps();
  form.append(panel("Passos da rotina",
    el("p", "pn-hint", "As ações são executadas de cima para baixo. “Comando do JARVIS” manda o texto ao cérebro como se você tivesse falado."),
    el("div", "pn-tile-label", "Adicionar passo"), adders, stepsBox));

  const err = el("span", "pn-error");
  const actions = el("div", "pn-actions");
  actions.append(button("Cancelar", () => { editing = false; refresh(); }, "pn-btn--ghost"));
  if (r.id) {
    actions.append(button("Excluir", async () => {
      if (!confirm(`Excluir a rotina "${r.name}"?`)) return;
      await send("DELETE", `/api/routines/${r.id}`).catch(() => undefined);
      editing = false; refresh();
    }, "pn-btn--danger"));
  }
  const save = el("button", "pn-btn", "Salvar");
  save.type = "submit";
  actions.append(save, err);
  form.append(actions, el("p", "pn-hint", "As alterações entram em vigor assim que salvar."));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const days = dayBoxes.flatMap((cb, i) => (cb.checked ? [i] : []));
    const payload: Routine = {
      ...(r.id ? { id: r.id } : {}),
      name: name.value.trim(),
      enabled: enabled.checked,
      phrases: phrases.value.split(",").map((p) => p.trim()).filter(Boolean),
      events: greet.checked ? ["greeting"] : [],
      window: limit.checked ? { days, start: start.value, end: end.value } : null,
      steps: r.steps,
    };
    try {
      await send("POST", "/api/routines", payload);
      editing = false; refresh();
    } catch (ex) { err.textContent = (ex as Error).message; }
  });
  root.append(form);
}

// ── Logs: every run, and what it did ──────────────────────────────────────

async function renderLogs(root: HTMLElement): Promise<void> {
  const runs = await listRuns(50).catch(() => null);
  if (!runs) { root.append(empty("Execuções indisponíveis.")); return; }
  const list = el("div");
  const detail = el("div");
  if (!runs.length) list.append(empty("Nenhuma execução registrada."));
  for (const r of runs) {
    const [tone, label] = RUN_STATUS[r.status];
    const line = row(`${r.project_name} · ${r.origin}`, r.prompt,
      `${fmtAgo(r.created_at)} · ${label}`, tone);
    line.classList.add("clickable");
    line.addEventListener("click", async () => {
      detail.replaceChildren(el("p", "pn-hint", "Carregando eventos…"));
      try {
        const { events } = await getEvents(r.id, 0, 200);
        const text = events.map((ev) => `[${new Date(ev.ts * 1000).toLocaleTimeString("pt-BR")}] ${ev.kind}  ${ev.payload.slice(0, 400)}`).join("\n");
        detail.replaceChildren(
          el("div", "pn-row-title", r.prompt),
          el("p", "pn-hint", r.summary || r.error || r.result_text.slice(0, 600) || "—"),
          el("pre", "pn-pre", text || "Sem eventos."));
      } catch { detail.replaceChildren(empty("Não foi possível ler os eventos.")); }
    });
    list.append(line);
  }
  const two = el("div", "pn-two");
  detail.append(el("p", "pn-hint", "Clique numa execução para ver seus eventos."));
  two.append(panel("Execuções recentes", list), panel("Detalhes", detail));
  root.append(two);
}

// ── Configurações ─────────────────────────────────────────────────────────

async function renderConfig(root: HTMLElement): Promise<void> {
  const prefs = await getJson<{ user_name: string; honorific: string }>("/api/settings/preferences")
    .catch(() => ({ user_name: "", honorific: "sir" }));
  const form = el("form", "pn-form");
  const field = (label: string, input: HTMLElement) => {
    const f = el("div", "pn-field");
    f.append(el("label", undefined, label), input);
    return f;
  };
  const nameIn = el("input", "pn-input"); nameIn.value = prefs.user_name; nameIn.maxLength = 60;
  const honIn = el("input", "pn-input"); honIn.value = prefs.honorific; honIn.maxLength = 30;
  const msg = el("span", "pn-hint");
  const save = el("button", "pn-btn", "Salvar preferências"); save.type = "submit";
  const act = el("div", "pn-actions"); act.append(save, msg);
  form.append(field("Seu nome", nameIn), field("Como o JARVIS te chama (ex.: senhor, chefe)", honIn), act);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await send("POST", "/api/settings/preferences", { user_name: nameIn.value, honorific: honIn.value });
      msg.textContent = "Salvo. Vale a partir do próximo reinício.";
    } catch (ex) { msg.textContent = `Erro: ${(ex as Error).message}`; }
  });
  root.append(panel("Preferências", form));

  const keyForm = el("form", "pn-form");
  const keyIn = el("input", "pn-input"); keyIn.type = "password"; keyIn.placeholder = "Nova chave da Fish Audio";
  keyIn.autocomplete = "off";
  const kmsg = el("span", "pn-hint");
  const kact = el("div", "pn-actions");
  kact.append(
    button("Testar", async () => {
      kmsg.textContent = "Testando…";
      const r = await send<{ valid: boolean; error?: string }>("POST", "/api/settings/test-fish",
        { key_value: keyIn.value || null }).catch((ex) => ({ valid: false, error: (ex as Error).message }));
      kmsg.textContent = r.valid ? "Chave válida." : `Inválida: ${r.error ?? ""}`;
    }, "pn-btn--ghost"),
    (() => { const b = el("button", "pn-btn", "Salvar chave"); b.type = "submit"; return b; })(),
    kmsg);
  keyForm.append(field("Fish Audio (voz)", keyIn), kact);
  keyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!keyIn.value) return;
    try {
      await send("POST", "/api/settings/keys", { key_name: "FISH_API_KEY", key_value: keyIn.value });
      keyIn.value = ""; kmsg.textContent = "Salva no .env. Reinicie o servidor para aplicar.";
    } catch (ex) { kmsg.textContent = `Erro: ${(ex as Error).message}`; }
  });
  root.append(panel("Voz e chaves", keyForm,
    el("p", "pn-hint", "Segurança: o painel só fala com o servidor local; o cérebro usa sua assinatura do Claude e não precisa de chave de API.")));
}

// ── Primeiros Passos ──────────────────────────────────────────────────────

async function renderPrimeiros(root: HTMLElement): Promise<void> {
  const [st, limits, conn, rts] = await Promise.allSettled([
    getJson<SettingsStatus>("/api/settings/status"), getUsageLimits(),
    getJson<Connections>("/api/connections"), getJson<{ routines: Routine[] }>("/api/routines"),
  ]);
  const s = st.status === "fulfilled" ? st.value : null;
  const steps: [boolean, string, string][] = [
    [!!s?.claude_code_installed, "Instale e faça login no Claude Code",
      "npm install -g @anthropic-ai/claude-code e depois rode claude uma vez para entrar."],
    [!!(s?.env_keys_set.fish_audio || s?.env_keys_set.edge_voice), "Configure a voz",
      "Defina EDGE_TTS_VOICE no .env (grátis) ou salve uma chave da fish.audio em Configurações."],
    [!!s?.env_keys_set.user_name, "Diga seu nome", "Em Configurações, para o JARVIS saber como te chamar."],
    [limits.status === "fulfilled" && limits.value.measured, "Converse pela primeira vez",
      "Abra o orbe de voz no Chrome (o microfone só funciona lá) ou use o Chat."],
    [conn.status === "fulfilled" && conn.value.servers.length > 0, "Conecte uma fonte de dados",
      "Declare um servidor MCP (Notion, Home Assistant…) — veja Fontes de Dados."],
    [rts.status === "fulfilled" && rts.value.routines.length > 0, "Crie sua primeira rotina",
      "Ex.: “Jarvis, cheguei” → falar boas-vindas → perguntar o clima."],
  ];
  const box = el("div");
  for (const [done, title, hint] of steps) {
    const c = el("div", "pn-check");
    c.append(el("span", `pn-check-mark tone-${done ? "ok" : "idle"}`, done ? "✓" : ""));
    const t = el("div");
    t.append(el("div", "pn-row-title", title), el("div", "pn-row-sub", hint));
    c.append(t);
    box.append(c);
  }
  const done = steps.filter((x) => x[0]).length;
  root.append(tile("rocket", "Progresso", `${done}/${steps.length}`, "etapas concluídas"),
              panel("Checklist", box));
}

// ── Shell ─────────────────────────────────────────────────────────────────

const GROUPS: { label: string; items: Section[] }[] = [
  { label: "Visão geral", items: [
    { id: "chat", title: "Chat", sub: "Converse, pesquise e execute", icon: "chat", render: renderChat },
    { id: "jarvis", title: "Jarvis", sub: "Voz, cérebro e monitor inteligente", icon: "spark", render: renderJarvis },
    { id: "briefing", title: "Briefing", sub: "Resumo do dia e pendências", icon: "sun", render: renderBriefing },
  ] },
  { label: "Dados e automação", items: [
    { id: "fontes", title: "Fontes de Dados", sub: "Conexões, canais e memória", icon: "db", render: renderFontes },
    { id: "monitor", title: "Monitoramento", sub: "Sessões e execuções ao vivo", icon: "pulse", render: renderMonitor },
    { id: "consumo", title: "Consumo", sub: "Limites da assinatura e tokens", icon: "gauge", render: renderConsumo },
    { id: "rotinas", title: "Rotinas", sub: "Frases e eventos que disparam ações", icon: "flow", render: renderRotinas },
    { id: "saude", title: "Saúde", sub: "Relógio: passos, coração e sono", icon: "heart",
      render: (root) => renderSaude(root, { panel, tile, row, status, empty, button, bar, send }) },
  ] },
  { label: "Sistema", items: [
    { id: "logs", title: "Logs", sub: "Eventos e rastreamento", icon: "list", render: renderLogs },
    { id: "config", title: "Configurações", sub: "Preferências, voz e segurança", icon: "gear", render: renderConfig },
    { id: "primeiros", title: "Primeiros Passos", sub: "Nome, chaves, voz e privacidade", icon: "rocket", render: renderPrimeiros },
  ] },
];
const SECTIONS = GROUPS.flatMap((g) => g.items);
/** Views that re-read on a timer. Never the chat (it is live already), and
 * never a form someone may be typing into. */
const AUTO_REFRESH = new Set(["jarvis", "monitor", "briefing", "consumo", "fontes", "saude"]);

let current = "chat";
let editing = false;
let renderSeq = 0;
const navButtons = new Map<string, HTMLButtonElement>();

function buildNav(): void {
  const nav = document.getElementById("pn-nav")!;
  for (const g of GROUPS) {
    nav.append(el("div", "pn-group-label", g.label));
    for (const s of g.items) {
      const b = el("button", "pn-item");
      b.type = "button";
      b.title = s.title;
      const text = el("span", "pn-item-text");
      text.append(el("div", "pn-item-title", s.title), el("div", "pn-item-sub", s.sub));
      b.append(iconBox(s.icon), text);
      if (s.id === "monitor") {
        const badge = el("span", "pn-badge"); badge.id = "pn-needs"; badge.hidden = true;
        b.append(badge);
      }
      b.addEventListener("click", () => go(s.id));
      navButtons.set(s.id, b);
      nav.append(b);
    }
  }
}

function go(id: string): void {
  if (!SECTIONS.some((s) => s.id === id)) id = "chat";
  current = id;
  editing = false;
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  try { localStorage.setItem("pn-section", id); } catch { /* private window */ }
  for (const [k, b] of navButtons) b.classList.toggle("active", k === id);
  refresh();
}

async function refresh(): Promise<void> {
  const s = SECTIONS.find((x) => x.id === current)!;
  document.getElementById("pn-title")!.textContent = s.title;
  document.getElementById("pn-subtitle")!.textContent = s.sub;
  if (current !== "chat") { chat.log = null; chat.onStatus = null; }
  const seq = ++renderSeq;
  const fresh = el("div", "pn-view");
  fresh.style.display = "contents";
  try {
    await s.render(fresh);
  } catch (e) {
    fresh.append(empty(`Erro ao carregar: ${(e as Error).message}`));
  }
  // A slower render of a view the user already left must not overwrite it.
  if (seq !== renderSeq) return;
  document.getElementById("pn-view")!.replaceChildren(fresh);
}

async function pollLink(): Promise<void> {
  const link = document.getElementById("pn-link")!;
  const text = document.getElementById("pn-link-text")!;
  try {
    const [, sessions] = await Promise.all([getJson("/api/health"), listSessions()]);
    link.className = "pn-link tone-ok";
    text.textContent = "JARVIS online";
    const needs = sessions.sessions.filter((s) => s.state === "needs_you").length;
    const badge = document.getElementById("pn-needs");
    if (badge) { badge.hidden = needs === 0; badge.textContent = String(needs); }
  } catch {
    link.className = "pn-link tone-bad";
    text.textContent = "Servidor offline";
  }
}

function init(): void {
  buildNav();
  const dash = document.querySelector<HTMLAnchorElement>('a[href="/dashboard.html"]');
  // In production server.py serves the dashboard at /dashboard; Vite only
  // knows the file name.
  if (dash && location.port !== "5173") dash.href = "/dashboard";
  document.getElementById("pn-collapse")!.addEventListener("click", () => {
    document.body.classList.toggle("pn-collapsed");
  });
  let start = location.hash.slice(1);
  if (!start) { try { start = localStorage.getItem("pn-section") ?? ""; } catch { start = ""; } }
  go(start || "chat");
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));
  pollLink();
  setInterval(pollLink, 15_000);
  setInterval(() => {
    if (AUTO_REFRESH.has(current) && !editing && !document.hidden) refresh();
  }, 10_000);
}

init();
