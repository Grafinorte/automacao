import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { analyticsApi, type GaReport, type GaSite, type GaTotals } from "../api/analytics";
import { ApiError } from "../api/client";
import { useTheme } from "../context/ThemeContext";

// Paleta validada (dataviz): azul, laranja, verde-água — passos próprios para o tema escuro
const PALETTE = {
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", grid: "#eeeef0", axis: "#8a8990", track: "#f1f1f3" },
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70", grid: "#2a2c31", axis: "#8f8f95", track: "rgba(255,255,255,0.06)" },
};

const PERIODS = [7, 30, 90];

const CHANNEL_LABELS: Record<string, string> = {
  "Organic Search": "Busca orgânica (Google)",
  Direct: "Acesso direto",
  "Paid Search": "Busca paga (anúncios)",
  "Organic Social": "Redes sociais",
  "Paid Social": "Redes sociais (anúncios)",
  Referral: "Outros sites",
  Email: "E-mail",
  Display: "Display",
  "Organic Video": "Vídeo (YouTube etc.)",
  "Paid Video": "Vídeo (anúncios)",
  "Cross-network": "Campanhas multicanal",
  "Organic Shopping": "Shopping orgânico",
  "Paid Shopping": "Shopping (anúncios)",
  "Organic Maps": "Mapas",
  SMS: "SMS",
  Unassigned: "Não identificado",
};
const DEVICE_LABELS: Record<string, string> = { mobile: "Celular", desktop: "Computador", tablet: "Tablet", "smart tv": "Smart TV" };
const DEVICE_ICONS: Record<string, string> = { mobile: "📱", desktop: "💻", tablet: "📲", "smart tv": "📺" };

const nf = new Intl.NumberFormat("pt-BR");
const fmtInt = (n: number) => nf.format(Math.round(n));
const fmtPct = (n: number, digits = 1) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
const fmtDuration = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, "0")}s`);
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ─── Peças de interface ───────────────────────────────────────────────────────

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const ICONS = {
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  newUser: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z",
  sessions: "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5",
  views: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  engagement: "M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59",
  time: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  target: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
  globe: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
};

function DeltaPill({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[10.5px] font-medium text-[#77767b] dark:bg-white/5">sem comparação</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${up
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}
      title="Comparado com o período anterior de mesmo tamanho">
      {up ? "▲" : "▼"} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Minigráfico de tendência (SVG puro) para os cartões de indicador */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 120, h = 34, max = Math.max(...values, 1), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `spk-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[34px] w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({ icon, label, value, current, previous, hint, spark, color }: {
  icon: string; label: string; value: string; current: number; previous: number; hint: string; spark?: number[]; color: string;
}) {
  return (
    <div title={hint}
      className="group relative overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-white/[0.07] dark:bg-[#1c1e22] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1a`, color }}>
          <Icon d={icon} />
        </span>
        <DeltaPill current={current} previous={previous} />
      </div>
      <p className="mt-3 text-[11.5px] font-medium text-[#77767b]">{label}</p>
      <p className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight text-[#111214] tabular-nums dark:text-white">{value}</p>
      {spark && <div className="-mx-1 mt-1.5"><Sparkline values={spark} color={color} /></div>}
    </div>
  );
}

function Panel({ title, subtitle, action, children, className = "" }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-[#1c1e22] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-[#111214] dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-[#77767b]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Ranking com posição, barra proporcional e participação (uma série → uma cor) */
function RankList({ rows, color, unit, track }: { rows: { label: string; value: number }[]; color: string; unit: string; track: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-[#77767b]">Sem dados no período.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} title={`${r.label}: ${fmtInt(r.value)} ${unit} (${fmtPct(r.value / total)})`} className="group">
          <div className="mb-1.5 flex items-center gap-2.5 text-[13px]">
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold ${i === 0
              ? "bg-[#111214] text-white dark:bg-white dark:text-[#111214]" : "bg-[#f3f3f5] text-[#77767b] dark:bg-white/5"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[#1a1c1d] dark:text-[#e0e0e2]">{r.label}</span>
            <span className="flex-shrink-0 font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{fmtInt(r.value)}</span>
            <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-[#77767b]">{fmtPct(r.value / total)}</span>
          </div>
          <div className="ml-[30px] h-1.5 rounded-full" style={{ backgroundColor: track }}>
            <div className="h-1.5 rounded-full transition-all duration-500 group-hover:brightness-110" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Divisão por dispositivo: uma barra 100% com vão de 2px entre as partes + legenda com valores */
function DeviceSplit({ rows, colors }: { rows: { name: string; users: number }[]; colors: string[] }) {
  const total = rows.reduce((s, r) => s + r.users, 0);
  if (!total) return <p className="py-6 text-center text-[13px] text-[#77767b]">Sem dados no período.</p>;
  const top = rows.slice(0, 3);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {top.map((r, i) => (
          <div key={r.name} title={`${DEVICE_LABELS[r.name] ?? r.name}: ${fmtPct(r.users / total)}`}
            className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(r.users / total) * 100}%`, backgroundColor: colors[i] }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {top.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: colors[i] }} />
            <span className="text-[15px] leading-none" aria-hidden>{DEVICE_ICONS[r.name] ?? "•"}</span>
            <span className="flex-1 text-[#1a1c1d] dark:text-[#e0e0e2]">{DEVICE_LABELS[r.name] ?? r.name}</span>
            <span className="font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{fmtPct(r.users / total, 0)}</span>
            <span className="w-14 text-right text-[11px] tabular-nums text-[#77767b]">{fmtInt(r.users)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Insight({ emoji, title, value, detail }: { emoji: string; title: string; value: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white/70 p-3.5 backdrop-blur dark:border-white/[0.07] dark:bg-white/[0.03]">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#f6f6f8] text-[18px] dark:bg-white/5" aria-hidden>{emoji}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#77767b]">{title}</p>
        <p className="truncate text-[14px] font-semibold text-[#111214] dark:text-white" title={value}>{value}</p>
        {detail && <p className="truncate text-[11.5px] text-[#77767b]" title={detail}>{detail}</p>}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[150px] rounded-2xl bg-[#f1f1f3] dark:bg-white/5" />)}
      </div>
      <div className="h-[340px] rounded-2xl bg-[#f1f1f3] dark:bg-white/5" />
    </div>
  );
}

function SetupHelp({ sites }: { sites: GaSite[] }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:border-amber-900/40 dark:from-amber-900/15 dark:to-orange-900/10">
      <h2 className="text-[16px] font-semibold text-amber-900 dark:text-amber-200">Google Analytics ainda não conectado</h2>
      <p className="mt-1 text-[13px] text-amber-800 dark:text-amber-300">
        Sem conexão: {sites.filter((s) => !s.configured).map((s) => `${s.group} — ${s.label}`).join(", ") || "—"}. Para conectar, o administrador precisa:
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-amber-900 dark:text-amber-200">
        <li>No Google Cloud, criar uma <b>conta de serviço</b>, ativar a <b>Google Analytics Data API</b> e baixar a chave (.json).</li>
        <li>No Google Analytics: <b>Administrador → Gerenciamento de acesso à conta</b> → adicionar o e-mail da conta de serviço como <b>Leitor</b>.</li>
        <li>Copiar o <b>ID da propriedade</b> de cada site (o número no lado direito da lista de propriedades).</li>
        <li>No servidor, preencher <code>GA_SERVICE_ACCOUNT_FILE</code> e a lista <code>GA_SITES</code> e reiniciar o sistema.</li>
      </ol>
    </div>
  );
}

function EmptyData({ days, label }: { days: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[rgba(0,0,0,0.12)] bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-[#1c1e22]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2a78d6]/15 to-[#1baf7a]/15 text-[#2a78d6]">
        <Icon d={ICONS.globe} className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-[17px] font-semibold text-[#111214] dark:text-white">Nenhuma visita registrada em {label} nos últimos {days} dias</h3>
      <p className="mt-1.5 max-w-lg text-[13px] text-[#77767b]">
        A conexão com o Google Analytics está funcionando — só não chegaram dados. Normalmente é a <b>tag do Analytics</b> que ainda não está no site.
      </p>
      <div className="mt-5 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
        {[
          ["1", "Abra o Google Analytics", "Na propriedade deste site, vá em Relatórios → Tempo real."],
          ["2", "Acesse o site", "Em outra aba ou no celular, abra a página e navegue um pouco."],
          ["3", "Confira", "Se não aparecer “1 usuário agora”, falta instalar o código G-XXXX desta propriedade."],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-xl bg-[#f6f6f8] p-3.5 dark:bg-white/[0.04]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#111214] text-[11px] font-bold text-white dark:bg-white dark:text-[#111214]">{n}</span>
            <p className="mt-2 text-[13px] font-semibold text-[#111214] dark:text-white">{t}</p>
            <p className="mt-0.5 text-[12px] text-[#77767b]">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function MarketingSitePage() {
  const { theme } = useTheme();
  const c = PALETTE[theme === "dark" ? "dark" : "light"];
  const [sites, setSites] = useState<GaSite[] | null>(null);
  const [site, setSite] = useState("");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<GaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    analyticsApi.sites().then((s) => {
      setSites(s);
      const first = s.find((x) => x.configured) ?? s[0];
      if (first) setSite(first.key);
    }).catch(() => setSites([]));
  }, []);

  const active = sites?.find((s) => s.key === site);
  const groups = [...new Set((sites ?? []).map((s) => s.group))];
  const groupSites = (sites ?? []).filter((s) => s.group === active?.group);

  function selectGroup(g: string) {
    const inGroup = (sites ?? []).filter((s) => s.group === g);
    setSite((inGroup.find((s) => s.configured) ?? inGroup[0])?.key ?? site);
  }

  useEffect(() => {
    if (!active?.configured) { setReport(null); return; }
    setLoading(true); setError(null);
    analyticsApi.report(site, days)
      .then(setReport)
      .catch((e) => { setReport(null); setError(e instanceof ApiError ? e.message : "Não foi possível carregar os dados do Google Analytics."); })
      .finally(() => setLoading(false));
  }, [site, days, active?.configured]);

  const cur = report?.totals.current;
  const prev = report?.totals.previous;
  const hasData = !!cur && (cur.sessions > 0 || cur.activeUsers > 0);

  const insights = useMemo(() => {
    if (!report || !cur) return [];
    const list: { emoji: string; title: string; value: string; detail?: string }[] = [];
    const best = [...report.daily].sort((a, b) => b.users - a.users)[0];
    if (best) {
      const wd = WEEKDAYS[new Date(`${best.date}T12:00:00`).getDay()];
      list.push({ emoji: "🏆", title: "Melhor dia", value: `${fmtDay(best.date)} (${wd})`, detail: `${fmtInt(best.users)} usuários` });
    }
    const chTotal = report.channels.reduce((s, r) => s + r.sessions, 0);
    if (report.channels[0] && chTotal) {
      list.push({ emoji: "🧭", title: "Principal canal", value: CHANNEL_LABELS[report.channels[0].name] ?? report.channels[0].name, detail: `${fmtPct(report.channels[0].sessions / chTotal, 0)} das visitas` });
    }
    const devTotal = report.devices.reduce((s, r) => s + r.users, 0);
    const mobile = report.devices.find((d) => d.name === "mobile");
    if (devTotal) list.push({ emoji: "📱", title: "Acessos pelo celular", value: fmtPct((mobile?.users ?? 0) / devTotal, 0), detail: "dos usuários" });
    if (cur.sessions) list.push({ emoji: "🎯", title: "Taxa de conversão", value: fmtPct(cur.keyEvents / cur.sessions), detail: `${fmtInt(cur.keyEvents)} conversões em ${fmtInt(cur.sessions)} visitas` });
    return list;
  }, [report, cur]);

  const kpis: { key: keyof GaTotals; label: string; icon: string; fmt: (n: number) => string; hint: string; spark?: number[]; color: string }[] = report ? [
    { key: "activeUsers", label: "Usuários", icon: ICONS.users, fmt: fmtInt, hint: "Pessoas que visitaram o site no período", spark: report.daily.map((d) => d.users), color: c.s1 },
    { key: "sessions", label: "Sessões (visitas)", icon: ICONS.sessions, fmt: fmtInt, hint: "Número de visitas — uma pessoa pode fazer várias", spark: report.daily.map((d) => d.sessions), color: c.s2 },
    { key: "screenPageViews", label: "Páginas vistas", icon: ICONS.views, fmt: fmtInt, hint: "Total de páginas abertas", color: c.s1 },
    { key: "keyEvents", label: "Conversões", icon: ICONS.target, fmt: fmtInt, hint: "Eventos-chave configurados no GA (ex.: formulário enviado, clique no WhatsApp)", color: c.s3 },
    { key: "newUsers", label: "Novos usuários", icon: ICONS.newUser, fmt: fmtInt, hint: "Pessoas que visitaram pela primeira vez", color: c.s1 },
    { key: "engagementRate", label: "Taxa de engajamento", icon: ICONS.engagement, fmt: (n) => fmtPct(n), hint: "Visitas que duraram mais de 10s, viram 2+ páginas ou converteram", color: c.s3 },
    { key: "averageSessionDuration", label: "Tempo médio por visita", icon: ICONS.time, fmt: fmtDuration, hint: "Duração média das visitas", color: c.s2 },
  ] : [];

  const pill = (activeBtn: boolean) =>
    // bg-[#ffffff] (e não bg-white): o tema escuro troca globalmente "bg-white" por cinza-escuro
    `rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${activeBtn ? "bg-[#ffffff] text-[#111214] shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`;

  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f9] dark:bg-[#111214]">
      {/* ── Topo em destaque ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[#0b1b33] via-[#0f2a52] to-[#123b6e] px-6 pb-20 pt-6 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#3987e5]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#1baf7a]/20 blur-3xl" />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-medium text-white/70">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10"><Icon d={ICONS.globe} className="h-3.5 w-3.5" /></span>
              Google Analytics
              {report && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">atualizado às {new Date(report.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-tight">{active ? active.label : "Sites e landing pages"}</h1>
            <p className="text-[13.5px] text-white/65">{active ? `${active.group} · últimos ${days} dias` : "Visitas dos sites da Grafinorte e da Pluspack"}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur">
              {groups.map((g) => <button key={g} type="button" onClick={() => selectGroup(g)} className={pill(active?.group === g)}>{g}</button>)}
            </div>
            {groupSites.length > 1 && (
              <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site ou landing page"
                className="rounded-xl bg-white/10 px-3 py-2 text-[13px] font-medium text-white outline-none ring-1 ring-white/15 backdrop-blur focus:ring-white/40 [&>option]:text-[#111214]">
                {groupSites.map((s) => <option key={s.key} value={s.key}>{s.label}{s.configured ? "" : " (não conectado)"}</option>)}
              </select>
            )}
            <div className="flex rounded-xl bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur">
              {PERIODS.map((p) => <button key={p} type="button" onClick={() => setDays(p)} className={pill(days === p)}>{p} dias</button>)}
            </div>
          </div>
        </div>
      </header>

      {/* ── Conteúdo (sobe sobre o topo) ── */}
      <div className="relative -mt-14 space-y-5 px-6 pb-10">
        {sites && active && !active.configured && <SetupHelp sites={sites} />}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        {loading && !report && <Skeleton />}

        {report && cur && prev && !hasData && <EmptyData days={days} label={report.label} />}

        {report && cur && prev && hasData && (
          <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {report.combinedOf && (
              <p className="rounded-2xl border border-blue-100 bg-white px-4 py-2.5 text-[12.5px] text-[#46464a] shadow-sm dark:border-blue-900/40 dark:bg-[#1c1e22] dark:text-[#a0a0a4]">
                <span className="mr-1">➕</span> Soma de: <b className="text-[#111214] dark:text-white">{report.combinedOf.join(", ")}</b>.
                Visitas, páginas e conversões somam exatamente; em <b>Usuários</b>, quem visitou mais de uma LP conta mais de uma vez.
              </p>
            )}

            {/* Indicadores principais (com tendência) + secundários */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpis.slice(0, 4).map((k) => (
                <KpiCard key={k.key} icon={k.icon} label={k.label} value={k.fmt(cur[k.key])} current={cur[k.key]} previous={prev[k.key]} hint={k.hint} spark={k.spark} color={k.color} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {kpis.slice(4).map((k) => (
                <div key={k.key} title={k.hint} className="flex items-center gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-[#1c1e22]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${k.color}1a`, color: k.color }}><Icon d={k.icon} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] text-[#77767b]">{k.label}</p>
                    <p className="text-[18px] font-bold tabular-nums text-[#111214] dark:text-white">{k.fmt(cur[k.key])}</p>
                  </div>
                  <DeltaPill current={cur[k.key]} previous={prev[k.key]} />
                </div>
              ))}
            </div>

            {/* Destaques automáticos */}
            {insights.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {insights.map((i) => <Insight key={i.title} {...i} />)}
              </div>
            )}

            {/* Tendência diária */}
            <Panel title="Visitas por dia" subtitle={`Usuários e sessões nos últimos ${days} dias`}
              action={
                <div className="flex rounded-lg bg-[#f3f3f5] p-0.5 dark:bg-white/5">
                  {(["chart", "table"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setView(v)}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${view === v ? "bg-white text-[#111214] shadow-sm dark:bg-white/15 dark:text-white" : "text-[#77767b]"}`}>
                      {v === "chart" ? "Gráfico" : "Tabela"}
                    </button>
                  ))}
                </div>
              }>
              {view === "chart" ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.daily} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
                      <defs>
                        <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.s1} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} minTickGap={28} />
                      <YAxis tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={fmtInt} width={44} />
                      <Tooltip
                        labelFormatter={(d) => fmtDay(String(d))}
                        formatter={(v, name) => [fmtInt(Number(v ?? 0)), String(name)]}
                        contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,.15)", fontSize: 12, padding: "8px 12px" }}
                        cursor={{ stroke: c.axis, strokeDasharray: "3 3" }}
                      />
                      <Legend verticalAlign="top" align="right" height={30} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="users" name="Usuários" stroke={c.s1} strokeWidth={2} fill="url(#gaUsers)" activeDot={{ r: 5, strokeWidth: 2, stroke: theme === "dark" ? "#1c1e22" : "#fff" }} />
                      <Line type="monotone" dataKey="sessions" name="Sessões" stroke={c.s2} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: theme === "dark" ? "#1c1e22" : "#fff" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-white dark:bg-[#1c1e22]"><tr className="text-left text-[11px] uppercase tracking-wider text-[#77767b]"><th className="py-2">Dia</th><th className="text-right">Usuários</th><th className="text-right">Sessões</th></tr></thead>
                    <tbody>{report.daily.map((d) => (
                      <tr key={d.date} className="border-t border-[rgba(0,0,0,0.05)] dark:border-white/5"><td className="py-1.5 text-[#1a1c1d] dark:text-[#e0e0e2]">{fmtDay(d.date)}</td><td className="text-right tabular-nums">{fmtInt(d.users)}</td><td className="text-right tabular-nums">{fmtInt(d.sessions)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="De onde vêm as visitas" subtitle="Canais de tráfego, por sessões">
                <RankList color={c.s1} track={c.track} unit="sessões" rows={report.channels.map((r) => ({ label: CHANNEL_LABELS[r.name] ?? r.name, value: r.sessions }))} />
              </Panel>
              <Panel title="Origem / mídia" subtitle="Sites e campanhas que trouxeram visitas">
                <RankList color={c.s1} track={c.track} unit="sessões" rows={report.sources.map((r) => ({ label: r.name === "(direct) / (none)" ? "Acesso direto" : r.name, value: r.sessions }))} />
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Panel title="Páginas mais vistas" subtitle="Top 10 por visualizações" className="lg:col-span-2">
                {report.pages.length === 0 ? <p className="py-6 text-center text-[13px] text-[#77767b]">Sem dados no período.</p> : (
                  <table className="w-full table-fixed text-[13px]">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-[#77767b]"><th className="w-8 pb-2">#</th><th className="pb-2">Página</th><th className="w-32 pb-2 text-right">Visualizações</th><th className="w-20 pb-2 text-right">Usuários</th></tr></thead>
                    <tbody>{report.pages.map((p, i) => {
                      const maxViews = report.pages[0]?.views || 1;
                      return (
                        <tr key={(p.siteLabel ?? "") + p.path + p.title} className="border-t border-[rgba(0,0,0,0.05)] dark:border-white/5">
                          <td className="py-2.5 text-[11.5px] font-semibold text-[#77767b]">{i + 1}</td>
                          <td className="py-2.5 pr-3">
                            <p className="truncate font-medium text-[#1a1c1d] dark:text-[#e0e0e2]" title={p.title}>{p.title || p.path}</p>
                            <p className="truncate text-[11px] text-[#77767b]" title={p.path}>{p.siteLabel ? `${p.siteLabel} · ` : ""}{p.path}</p>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="hidden h-1.5 w-14 rounded-full sm:block" style={{ backgroundColor: c.track }}>
                                <div className="h-1.5 rounded-full" style={{ width: `${(p.views / maxViews) * 100}%`, backgroundColor: c.s1 }} />
                              </div>
                              <span className="font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{fmtInt(p.views)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-[#46464a] dark:text-[#a0a0a4]">{fmtInt(p.users)}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </Panel>
              <div className="space-y-5">
                <Panel title="Dispositivos" subtitle="Por onde as pessoas acessam">
                  <DeviceSplit rows={report.devices} colors={[c.s1, c.s2, c.s3]} />
                </Panel>
                <Panel title="Cidades" subtitle="Top 10 por usuários">
                  <RankList color={c.s3} track={c.track} unit="usuários" rows={report.cities.map((r) => ({ label: r.name === "(not set)" ? "Não identificada" : r.name, value: r.users }))} />
                </Panel>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
