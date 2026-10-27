// Peças visuais da área de Marketing: topo em destaque, cartões de indicador animados, painéis,
// rankings, minigráficos e estados de carregamento/vazio. As animações ficam em styles/index.css (mkt-*).
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";

// ─── Cores e formatação ───────────────────────────────────────────────────────

// Uma série = uma cor (azul da marca), validada contra o fundo claro e o escuro
const CHART = {
  light: { main: "#005cba", grid: "#eeeef0", axis: "#8a8990", track: "#f1f1f3", ring: "#ffffff" },
  dark: { main: "#3d8ef0", grid: "#2a2c31", axis: "#8f8f95", track: "rgba(255,255,255,0.06)", ring: "#1c1e22" },
};
export function useChartColors() {
  const { theme } = useTheme();
  return CHART[theme === "dark" ? "dark" : "light"];
}

const nf = new Intl.NumberFormat("pt-BR");
export const fmtInt = (n: number) => nf.format(Math.round(n));
export const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 10_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtInt(n);
};
export const fmtPct = (n: number, digits = 1) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

export const tooltipStyle = {
  contentStyle: { borderRadius: 14, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,.18)", fontSize: 12, padding: "8px 12px" },
  labelStyle: { fontWeight: 600, marginBottom: 2 },
};

// ─── Ícones ───────────────────────────────────────────────────────────────────

export function MktIcon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export const ICONS = {
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  bulb: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
  globe: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  megaphone: "M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46",
  search: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
  eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  heart: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z",
  cursor: "M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59",
  bolt: "m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  flame: "M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z",
  layers: "M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3",
  refresh: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99",
  external: "M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25",
  trend: "M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941",
  coin: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  sparkles: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
  history: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  copy: "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75",
};

// ─── Número que "conta" até o valor ────────────────────────────────────────────

export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; }
    const start = performance.now(), base = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = base + (target - base) * eased;
      setValue(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function CountUp({ value, format = fmtInt }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

/** Brilho que acompanha o mouse (classe mkt-spot) */
const onSpotMove = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

// ─── Página: topo em destaque + conteúdo que sobe sobre ele ───────────────────

export function MktPage({ hero, children }: { hero: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f9] dark:bg-[#111214]">
      {hero}
      <div className="relative -mt-14 space-y-5 px-4 pb-10 sm:px-6">{children}</div>
    </div>
  );
}

export function MktHero({ icon, eyebrow, badge, title, subtitle, actions, children }: {
  icon: string; eyebrow: string; badge?: React.ReactNode; title: string; subtitle?: string;
  actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#081427] via-[#0d2547] to-[#0f3a73] px-4 pb-20 pt-6 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)", backgroundSize: "32px 32px", maskImage: "linear-gradient(to bottom, black, transparent)" }} />
      <div className="mkt-blob pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#3d8ef0]/35 blur-3xl" />
      <div className="mkt-blob-2 pointer-events-none absolute -bottom-36 left-1/4 h-72 w-72 rounded-full bg-[#8b5cf6]/25 blur-3xl" />
      <div className="mkt-blob pointer-events-none absolute -bottom-24 right-1/4 h-56 w-56 rounded-full bg-[#14b8a6]/15 blur-3xl" />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="mkt-rise min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/70">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15"><MktIcon d={icon} className="h-3.5 w-3.5" /></span>
            {eyebrow}
            {badge}
          </div>
          <h1 className="mt-2 bg-gradient-to-r from-white via-white to-[#b9d6ff] bg-clip-text text-[26px] font-bold tracking-tight text-transparent sm:text-[30px]">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-2xl text-[13.5px] text-white/65">{subtitle}</p>}
        </div>
        {actions && <div className="mkt-rise flex flex-wrap items-center gap-2" style={{ "--d": "80ms" } as React.CSSProperties}>{actions}</div>}
      </div>
      {children && <div className="mkt-rise relative mt-5" style={{ "--d": "120ms" } as React.CSSProperties}>{children}</div>}
    </header>
  );
}

/** Botões tipo "abas" sobre o topo escuro */
export function HeroSegmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          // bg-[#ffffff] (e não bg-white): o tema escuro troca globalmente "bg-white" por cinza-escuro
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${value === o.value ? "bg-[#ffffff] text-[#0d2547] shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botões tipo "abas" sobre fundo claro */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-[#f3f3f5] p-0.5 dark:bg-white/5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${value === o.value ? "bg-white text-[#111214] shadow-sm dark:bg-white/15 dark:text-white" : "text-[#77767b] hover:text-[#111214] dark:hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Indicadores ──────────────────────────────────────────────────────────────

export function DeltaPill({ current, previous }: { current: number; previous: number | undefined }) {
  if (!previous) return <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[10.5px] font-medium text-[#77767b] dark:bg-white/5">sem comparação</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span title="Comparado com os 28 dias anteriores"
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${up
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
        : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Minigráfico de tendência que se desenha ao aparecer */
export function Sparkline({ values, color, height = 34 }: { values: number[]; color: string; height?: number }) {
  const id = useRef(`spk-${Math.random().toString(36).slice(2, 8)}`).current;
  if (values.length < 2) return null;
  const w = 120, h = height, max = Math.max(...values, 1), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} className="mkt-rise" />
      <path d={line} pathLength={1} className="mkt-draw" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const ACCENTS: Record<string, string> = {
  blue: "from-[#005cba] to-[#3d8ef0]",
  violet: "from-[#6d28d9] to-[#a78bfa]",
  teal: "from-[#0f766e] to-[#2dd4bf]",
  amber: "from-[#b45309] to-[#fbbf24]",
  rose: "from-[#be123c] to-[#fb7185]",
  slate: "from-[#334155] to-[#94a3b8]",
};

export function KpiCard({ icon, label, value, format = fmtInt, previous, hint, spark, accent = "blue", delay = 0, sub }: {
  icon: string; label: string; value: number | null; format?: (n: number) => string; previous?: number;
  hint?: string; spark?: number[]; accent?: keyof typeof ACCENTS | string; delay?: number; sub?: React.ReactNode;
}) {
  const colors = useChartColors();
  return (
    <div title={hint} onMouseMove={onSpotMove} style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className="mkt-rise mkt-spot group overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_-10px_rgba(0,92,186,0.28)] dark:border-white/[0.07] dark:bg-[#1c1e22] dark:hover:shadow-[0_14px_34px_-10px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg] ${ACCENTS[accent] ?? ACCENTS.blue}`}>
          <MktIcon d={icon} />
        </span>
        {previous !== undefined && value != null && <DeltaPill current={value} previous={previous} />}
      </div>
      <p className="mt-3 text-[11.5px] font-medium text-[#77767b]">{label}</p>
      <p className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight text-[#111214] tabular-nums dark:text-white">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {sub && <div className="mt-0.5 text-[11.5px] text-[#77767b]">{sub}</div>}
      {spark && spark.length > 1 && <div className="-mx-1 mt-1.5"><Sparkline values={spark} color={colors.main} /></div>}
    </div>
  );
}

/** Indicador compacto (linha secundária) */
export function MiniStat({ icon, label, value, detail, delay = 0 }: { icon: string; label: string; value: string; detail?: React.ReactNode; delay?: number }) {
  return (
    <div onMouseMove={onSpotMove} style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className="mkt-rise mkt-spot flex items-center gap-3 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 dark:border-white/[0.07] dark:bg-[#1c1e22]">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#005cba]/10 text-[#005cba] dark:bg-[#3d8ef0]/15 dark:text-[#7fb4f5]"><MktIcon d={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-[#77767b]">{label}</p>
        <p className="truncate text-[17px] font-bold tabular-nums text-[#111214] dark:text-white" title={value}>{value}</p>
      </div>
      {detail}
    </div>
  );
}

/** Destaque automático ("Melhor dia para postar", "Oportunidade"...) */
export function InsightCard({ emoji, title, value, detail, delay = 0 }: { emoji: string; title: string; value: string; detail?: string; delay?: number }) {
  return (
    <div onMouseMove={onSpotMove} style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className="mkt-rise mkt-spot flex items-start gap-3 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-[#1c1e22]">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#005cba]/10 to-[#8b5cf6]/10 text-[19px] dark:from-[#3d8ef0]/15 dark:to-[#8b5cf6]/15" aria-hidden>{emoji}</span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#77767b]">{title}</p>
        <p className="truncate text-[14px] font-semibold text-[#111214] dark:text-white" title={value}>{value}</p>
        {detail && <p className="line-clamp-2 text-[11.5px] text-[#77767b]" title={detail}>{detail}</p>}
      </div>
    </div>
  );
}

// ─── Painel e ranking ─────────────────────────────────────────────────────────

export function Panel({ title, subtitle, action, children, className = "", delay = 0 }: {
  title: React.ReactNode; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <section style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={`mkt-rise rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-[#1c1e22] ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-[#111214] dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-[#77767b]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Ranking com barra proporcional (uma série → uma cor); as barras crescem ao aparecer */
export function RankBars({ rows, unit, valueFormat = fmtInt, showShare = true, empty = "Sem dados." }: {
  rows: { label: string; value: number; hint?: string }[]; unit: string; valueFormat?: (n: number) => string; showShare?: boolean; empty?: string;
}) {
  const colors = useChartColors();
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(t); }, []);
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-[#77767b]">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} title={r.hint ?? `${r.label}: ${valueFormat(r.value)} ${unit}${showShare ? ` (${fmtPct(r.value / total)})` : ""}`} className="group">
          <div className="mb-1.5 flex items-center gap-2.5 text-[13px]">
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold ${i === 0
              ? "bg-[#111214] text-white dark:bg-white dark:text-[#111214]" : "bg-[#f3f3f5] text-[#77767b] dark:bg-white/5"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[#1a1c1d] dark:text-[#e0e0e2]">{r.label}</span>
            <span className="flex-shrink-0 font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{valueFormat(r.value)}</span>
            {showShare && <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-[#77767b]">{fmtPct(r.value / total, 0)}</span>}
          </div>
          <div className="ml-[30px] h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.track }}>
            <div className="h-1.5 rounded-full transition-[width] duration-700 ease-out group-hover:brightness-110"
              style={{ width: grown ? `${Math.max(2, (r.value / max) * 100)}%` : "0%", backgroundColor: colors.main, transitionDelay: `${i * 60}ms` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Carregando / vazio / erro ────────────────────────────────────────────────

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`mkt-shimmer rounded-2xl ${className}`} />;
}

export function LoadingBlocks() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-[150px]" />)}
      </div>
      <Shimmer className="h-[320px]" />
    </div>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: string; title: string; text?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mkt-rise flex flex-col items-center rounded-2xl border border-dashed border-[rgba(0,0,0,0.12)] bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-[#1c1e22]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#005cba]/15 to-[#8b5cf6]/15 text-[#005cba] dark:text-[#7fb4f5]">
        <MktIcon d={icon} className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-[17px] font-semibold text-[#111214] dark:text-white">{title}</h3>
      {text && <p className="mt-1.5 max-w-lg text-[13px] text-[#77767b]">{text}</p>}
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="mkt-rise rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{message}</div>;
}

/**
 * No topo das páginas de pesquisa: a pesquisa aberta (quem fez, quando, se veio do histórico)
 * e as pesquisas recentes em fichas — o histórico completo fica ao lado só em telas largas.
 */
export function HeroResearchBar({ current, history, onOpen, showCost }: {
  current: { id: string; query: string; createdAt: string; userName: string; cached: boolean; costMicro?: number; detail?: string } | null;
  history: { id: string; query: string; detail: string }[];
  onOpen: (id: string) => void;
  showCost: boolean;
}) {
  const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const recent = history.filter((h) => h.id !== current?.id).slice(0, 6);
  if (!current && !recent.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-3 text-[12px]">
      {current && (
        <span className="flex flex-wrap items-center gap-1.5 text-white/60">
          <span className="font-semibold text-white">“{current.query}”</span>
          {current.detail && <span>· {current.detail}</span>}
          <span>· {when(current.createdAt)} por {current.userName}</span>
          {current.cached && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 font-medium text-emerald-300">resultado de hoje, sem custo</span>}
          {showCost && !current.cached && current.costMicro != null && <span className="rounded-full bg-white/10 px-2 py-0.5">custou {fmtUsd(current.costMicro)}</span>}
        </span>
      )}
      {recent.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 2xl:hidden">
          <span className="text-white/45">Recentes:</span>
          {recent.map((h) => (
            <button key={h.id} type="button" onClick={() => onOpen(h.id)} title={h.detail}
              className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-white/75 ring-1 ring-white/10 transition-colors hover:bg-white/15 hover:text-white">
              <MktIcon d={ICONS.history} className="h-3 w-3" />{h.query}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** Custo em dólar do treg (só chega para administrador) */
export function fmtUsd(micro?: number) {
  if (micro == null) return null;
  return `US$ ${(micro / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}
