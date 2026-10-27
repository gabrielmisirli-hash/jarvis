// frontend/src/painel/saude.ts
//
// The painel's Saúde view: the health watch (E800 via HealthWear → Apple
// Health → an iPhone Shortcut → health.py's listener). Kept out of main.ts
// so it can grow without crowding the shell; main.ts lends it its helpers.
//
// Same rule as the rest of the painel: no innerHTML. Every number here was
// sent by a phone.
import { el } from "../dashboard/ui";

type Tone = "ok" | "warn" | "bad" | "idle" | "accent";

export interface Helpers {
  panel: (title: string, ...children: Node[]) => HTMLElement;
  tile: (icon: string, label: string, value: string, note: string) => HTMLElement;
  row: (title: string, sub: string, meta?: string | Node, tone?: Tone) => HTMLElement;
  status: (tone: Tone, text: string) => HTMLElement;
  empty: (text: string) => HTMLElement;
  button: (label: string, onClick: () => void, variant?: string) => HTMLButtonElement;
  bar: (pct: number, tone: Tone) => HTMLElement;
  send: <T>(method: string, url: string, body?: unknown) => Promise<T>;
}

type Range = { min: number; max: number; avg: number };
interface Saude {
  enabled: boolean;
  port: number | null;
  addresses: string[];
  metrics: Record<string, { label: string; unit: string; kind: "sum" | "range" | "last" }>;
  latest: Record<string, { at: string; value: number }>;
  days: ({ day: string } & Record<string, number | Range | string>)[];
  last_received: string | null;
}

const STEP_GOAL = 8000;

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 1 });
}

function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "agora";
  if (secs < 3600) return `há ${Math.round(secs / 60)} min`;
  if (secs < 86400) return `há ${Math.round(secs / 3600)} h`;
  return `há ${Math.round(secs / 86400)} d`;
}

function weekday(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
}

export async function renderSaude(root: HTMLElement, h: Helpers): Promise<void> {
  const s = await h.send<Saude>("GET", "/api/saude");
  const today = s.days[s.days.length - 1] ?? { day: "" };
  const num = (k: string) => (typeof today[k] === "number" ? (today[k] as number) : null);
  const hr = today.heart_rate as Range | undefined;
  const last = (k: string) => s.latest[k]?.value;

  const tiles = el("div", "pn-tiles");
  const steps = num("steps");
  tiles.append(
    h.tile("pulse", "Passos hoje", steps === null ? "—" : fmt(steps),
      steps === null ? "sem dados hoje" : `${Math.round((steps / STEP_GOAL) * 100)}% da meta de ${fmt(STEP_GOAL)}`),
    h.tile("pulse", "Frequência cardíaca", hr ? `${fmt(hr.avg)} bpm` : "—",
      hr ? `mín ${fmt(hr.min)} · máx ${fmt(hr.max)}` : "sem leituras hoje"),
    h.tile("clock", "Sono", last("sleep_hours") === undefined ? "—" : `${fmt(last("sleep_hours")!)} h`,
      "última noite registrada"),
    h.tile("gauge", "SpO₂", last("spo2") === undefined ? "—" : `${fmt(last("spo2")!)}%`,
      last("systolic") !== undefined && last("diastolic") !== undefined
        ? `pressão ${fmt(last("systolic")!)}/${fmt(last("diastolic")!)} mmHg` : "oxigenação"),
  );
  root.append(tiles);

  // The week, one row per day, newest first.
  const week = el("div");
  const filled = s.days.filter((d) => Object.keys(d).length > 1);
  if (!filled.length) week.append(h.empty("Nenhum dado do relógio chegou ainda. Configure o Atalho abaixo."));
  for (const d of [...filled].reverse()) {
    const parts: string[] = [];
    for (const [k, m] of Object.entries(s.metrics)) {
      const v = d[k];
      if (v === undefined || k === "steps") continue;
      parts.push(typeof v === "object"
        ? `${m.label} ${fmt(v.min)}–${fmt(v.max)} ${m.unit}`
        : `${m.label} ${fmt(v as number)} ${m.unit}`.trim());
    }
    const st = typeof d.steps === "number" ? d.steps : 0;
    const r = h.row(weekday(d.day), parts.join(" · ") || "só passos", `${fmt(st)} passos`);
    r.querySelector(".pn-row-main")?.append(h.bar((st / STEP_GOAL) * 100, st >= STEP_GOAL ? "ok" : "accent"));
    week.append(r);
  }
  root.append(h.panel("Últimos 7 dias", week));

  // Connection and setup.
  const conn = el("div");
  conn.append(h.row("Relógio", "E800 D48A · firmware 1.04 · app HealthWear", h.status("accent", "Via Apple Health")));
  conn.append(h.row("Receptor do iPhone",
    s.enabled ? `Porta ${s.port} · ${s.addresses.join(", ") || "IP não detectado"}`
      : "Desligado: defina JARVIS_HEALTH_PORT=8342 no .env e reinicie o JARVIS",
    s.enabled ? h.status("ok", "Ligado") : h.status("idle", "Desligado")));
  conn.append(h.row("Última sincronização", s.last_received ? new Date(s.last_received).toLocaleString("pt-BR") : "nenhuma",
    h.status(s.last_received ? "ok" : "warn", ago(s.last_received))));

  const tokenBox = el("div", "pn-pre");
  tokenBox.textContent = "Token oculto.";
  const msg = el("span", "pn-hint");
  const actions = el("div", "pn-actions");
  const reveal = async (rotate: boolean) => {
    try {
      const r = await h.send<{ token: string }>("POST", "/api/saude/token", { rotate });
      tokenBox.textContent = r.token;
      msg.textContent = rotate ? "Token novo. Atualize-o no Atalho do iPhone." : "";
    } catch (e) { msg.textContent = `Erro: ${(e as Error).message}`; }
  };
  actions.append(
    h.button("Mostrar token", () => reveal(false), "pn-btn--ghost pn-btn--sm"),
    h.button("Gerar novo token", () => { if (confirm("O Atalho atual deixará de funcionar. Continuar?")) reveal(true); },
      "pn-btn--danger pn-btn--sm"),
    msg);
  root.append(h.panel("Conexão", conn, actions, tokenBox));

  const url = `http://${s.addresses[0] ?? "IP-DO-PC"}:${s.port ?? 8342}/health/ingest`;
  const guide = el("ol", "pn-hint");
  for (const step of [
    "No app HealthWear: Perfil → Apple Health → permita gravar passos, frequência cardíaca, sono, SpO₂ e pressão.",
    "No iPhone, abra Atalhos → novo atalho. Para cada métrica: “Buscar Amostras de Saúde” (ex.: Passos, últimas 24 h).",
    "“Repetir com cada” amostra → “Formatar Data” (Data de início, ISO 8601) → Texto: [Data formatada];[Valor].",
    `“Obter Conteúdo do URL”: POST ${url}, cabeçalho Authorization = Bearer <token>, corpo JSON {"metric": "steps", "lines": [Texto Repetido]}.`,
    "Métricas aceitas: steps, distance_km, active_energy, heart_rate, resting_heart_rate, spo2, sleep_hours, systolic, diastolic.",
    "Em Automação: rode o atalho a cada hora ou ao carregar o iPhone. iPhone e PC precisam estar na mesma rede Wi‑Fi.",
  ]) guide.append(el("li", undefined, step));
  root.append(h.panel("Configurar o Atalho do iPhone", guide),
    el("p", "pn-hint", "Relógio de consumo, não aparelho médico: o JARVIS relata os números e nunca dá diagnóstico."));
}
