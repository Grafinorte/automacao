import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { useUnreadWa } from "../hooks/useUnreadWa";
import { boardApi } from "../api/board";
import type { Board } from "../types";
import { hasModuleAccess } from "../config/modules";
import {
  TasksIcon, CrmIcon, QuoteIcon, FactoryIcon, HrIcon, FinanceIcon,
  MarketingIcon, ChatIcon, StockIcon, ProposalIcon, WhatsAppIcon,
} from "../components/icons/Icons";

// ── Weather ──────────────────────────────────────────────────────────────────

interface Weather { temp: number; code: number }

function weatherLabel(code: number): string {
  if (code === 0)   return "Céu limpo";
  if (code <= 2)    return "Poucas nuvens";
  if (code === 3)   return "Nublado";
  if (code <= 48)   return "Névoa";
  if (code <= 55)   return "Garoa";
  if (code <= 67)   return "Chuva";
  if (code <= 77)   return "Neve";
  if (code <= 82)   return "Pancadas de chuva";
  return "Trovoada";
}

function WeatherIcon({ code }: { code: number }) {
  // Clear sky — sun
  if (code === 0) return (
    <svg className="h-9 w-9 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  );
  // Mainly clear / partly cloudy — sun + cloud tint
  if (code <= 2) return (
    <svg className="h-9 w-9 text-amber-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 .75-7.414 5.25 5.25 0 0 0-10.233-2.33 3 3 0 0 0-3.758 3.848A4.5 4.5 0 0 0 2.25 15Z" />
    </svg>
  );
  // Overcast / fog — cloud gray
  if (code <= 48) return (
    <svg className="h-9 w-9 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 .75-7.414 5.25 5.25 0 0 0-10.233-2.33 3 3 0 0 0-3.758 3.848A4.5 4.5 0 0 0 2.25 15Z" />
    </svg>
  );
  // Drizzle / rain / showers — cloud blue + drops
  if (code <= 82) return (
    <svg className="h-9 w-9 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 11.25a4.5 4.5 0 0 0 4.5 4.5H16.5a3 3 0 0 0 .75-5.914 4.5 4.5 0 0 0-8.47-1.836A3 3 0 0 0 5.25 11.25h-3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 17.25 6 21M12 17.25 10.5 21M16.5 17.25 15 21" />
    </svg>
  );
  // Snow / thunderstorm — lightning bolt
  return (
    <svg className="h-9 w-9 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}

const QUOTES = [
  "A excelência não é um ato, mas um hábito.",
  "Qualidade nunca é um acidente; é sempre o resultado de esforço inteligente.",
  "O segredo do sucesso está em fazer o comum extraordinariamente bem.",
  "Detalhes fazem a perfeição, e a perfeição não é um detalhe.",
];

function getQuote() {
  return QUOTES[new Date().getDate() % QUOTES.length];
}

function getRoleLabel(role?: string) {
  const map: Record<string, string> = {
    ADMIN: "Administrador",
    COMERCIAL: "Comercial",
    ORCAMENTISTA: "Orçamentista",
    MARKETING: "Marketing",
    RH: "Recursos Humanos",
    ALMOXARIFADO: "Almoxarifado",
    PRODUCAO: "Produção",
    FINANCEIRO: "Financeiro",
  };
  return role ? (map[role] ?? role) : "";
}

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadMessages();
  const waUnread = useUnreadWa();
  const [board, setBoard] = useState<Board | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    boardApi.list()
      .then((bs) => bs.length > 0 ? boardApi.get(bs[0].id) : Promise.resolve(null))
      .then((b) => { if (b) setBoard(b); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-51.4607&current=temperature_2m,weathercode&timezone=America/Sao_Paulo"
    )
      .then((r) => r.json())
      .then((d) =>
        setWeather({ temp: Math.round(d.current.temperature_2m), code: d.current.weathercode })
      )
      .catch(() => {});
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const firstName = user?.name.split(" ")[0] ?? "";

  const can = (mod: string) => user ? hasModuleAccess(user.role, user.permissions, mod) : false;
  const canSeeQuotes    = can("orcamentos");
  const canSeeCrm       = can("comercial");
  const canSeeMarketing = can("marketing");
  const canSeeHr        = can("rh");
  const canSeeProposal  = can("proposta");
  const canSeeStock     = can("almoxarifado");

  // Pending tasks: pick up to 5 from non-done columns
  const pendingTasks = board
    ? board.columns
        .filter((col) => !col.name.match(/conclu|done|feito|entregue/i))
        .flatMap((col) => col.tasks)
        .slice(0, 5)
    : [];

  // Modules for the grid — respects per-user permissions
  const modules = [
    { to: "/tarefas",     label: "Tarefas",     icon: TasksIcon,    bg: "bg-violet-50",  color: "text-violet-600",  show: can("tarefas") },
    { to: "/whatsapp",    label: "WhatsApp",    icon: WhatsAppIcon, bg: "bg-green-50",   color: "text-green-600",   show: can("whatsapp") },
    { to: "/chat",        label: "Chat",         icon: ChatIcon,     bg: "bg-blue-50",    color: "text-blue-600",    show: can("chat"), badge: unreadCount },
    { to: "/comercial",   label: "Comercial",    icon: CrmIcon,      bg: "bg-emerald-50", color: "text-emerald-600", show: canSeeCrm },
    { to: "/orcamentos",  label: "Orçamentos",   icon: QuoteIcon,    bg: "bg-amber-50",   color: "text-amber-600",   show: canSeeQuotes },
    { to: "/proposta",    label: "Propostas",    icon: ProposalIcon, bg: "bg-sky-50",     color: "text-sky-600",     show: canSeeProposal },
    { to: "/marketing",   label: "Marketing",    icon: MarketingIcon,bg: "bg-pink-50",    color: "text-pink-600",    show: canSeeMarketing },
    { to: "/rh",          label: "RH",           icon: HrIcon,       bg: "bg-indigo-50",  color: "text-indigo-600",  show: canSeeHr },
    { to: "/almoxarifado",label: "Almoxarifado", icon: StockIcon,    bg: "bg-teal-50",    color: "text-teal-600",    show: canSeeStock },
    { to: "/producao",    label: "Produção",     icon: FactoryIcon,  bg: "bg-orange-50",  color: "text-orange-600",  show: can("producao") },
    { to: "/financeiro",  label: "Financeiro",   icon: FinanceIcon,  bg: "bg-green-50",   color: "text-green-600",   show: can("financeiro") },
  ].filter((m) => m.show);

  // Quick actions depend on role
  const quickActions = [
    canSeeQuotes  && { label: "Novo Orçamento",   icon: "📄", to: "/orcamentos/novo" },
    true          && { label: "Ver Tarefas",       icon: "✅", to: "/tarefas" },
    true          && { label: "Chat Interno",      icon: "💬", to: "/chat" },
    canSeeCrm     && { label: "Funil de Vendas",  icon: "📈", to: "/comercial/funil" },
    canSeeHr      && { label: "Funcionários",     icon: "👥", to: "/rh" },
    canSeeMarketing && { label: "Campanhas",      icon: "📣", to: "/marketing" },
    canSeeStock   && { label: "Almoxarifado",     icon: "📦", to: "/almoxarifado" },
    !canSeeCrm && !canSeeHr && !canSeeMarketing && !canSeeStock && { label: "Produção", icon: "🏭", to: "/producao" },
  ].filter(Boolean).slice(0, 4) as { label: string; icon: string; to: string }[];

  const userInitials = user?.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() ?? "U";

  const lumaGreeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia! Tudo bem?";
    if (h < 18) return "Boa tarde! Tudo bem?";
    return "Boa noite! Tudo bem?";
  })();

  const [lumaInput, setLumaInput] = useState("");
  const lumaInputRef = useRef<HTMLInputElement>(null);

  function goToLuma(e?: React.FormEvent) {
    e?.preventDefault();
    navigate("/documentos");
  }

  return (
    <div className="min-h-full overflow-x-hidden overflow-y-auto p-4 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">

        {/* ── HERO ── */}
        <section className="glass-card smooth-shadow relative overflow-hidden rounded-2xl p-5 md:p-8 col-span-1 md:col-span-3">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#005cba]/8 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-400/6 blur-[60px]" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#77767b] capitalize">{today}</p>
              <h1 className="text-[28px] md:text-[40px] font-bold leading-none tracking-tight text-[#030304] dark:text-white">
                {greeting}, {firstName}!
              </h1>
              <p className="mt-3 max-w-md text-[13px] md:text-[15px] italic text-[#46464a]/80 dark:text-gray-400">
                "{getQuote()}"
              </p>
            </div>
            {/* Date + Weather — row on mobile, column on desktop */}
            <div className="flex flex-row md:flex-col gap-3 flex-shrink-0">
              <div className="flex flex-1 md:flex-none items-center gap-3 rounded-2xl border border-white/60 bg-white/60 dark:bg-white/10 px-4 py-3 backdrop-blur">
                <svg className="h-6 w-6 md:h-8 md:w-8 text-[#005cba] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <div>
                  <span className="block text-[16px] md:text-[22px] font-bold leading-none text-[#030304] dark:text-white">
                    {new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "")}
                  </span>
                  <span className="block text-[11px] text-[#77767b]">
                    {new Date().toLocaleDateString("pt-BR", { weekday: "long" })}
                  </span>
                </div>
              </div>
              {weather ? (
                <div className="flex flex-1 md:flex-none items-center gap-3 rounded-2xl border border-white/60 bg-white/60 dark:bg-white/10 px-4 py-3 backdrop-blur">
                  <WeatherIcon code={weather.code} />
                  <div>
                    <span className="block text-[16px] md:text-[22px] font-bold leading-none text-[#030304] dark:text-white">{weather.temp}°C</span>
                    <span className="block text-[11px] text-[#77767b]">{weatherLabel(weather.code)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 md:flex-none items-center gap-3 rounded-2xl border border-white/60 bg-white/60 dark:bg-white/10 px-4 py-3 backdrop-blur">
                  <div className="h-7 w-7 animate-pulse rounded-full bg-[#e5e5ea]" />
                  <div className="space-y-1.5"><div className="h-4 w-12 animate-pulse rounded bg-[#e5e5ea]"/><div className="h-3 w-20 animate-pulse rounded bg-[#e5e5ea]"/></div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── WHATSAPP DESTAQUE (mobile only, only for users with WA access) ── */}
        {can("whatsapp") && <section className="md:hidden col-span-1">
          <button
            onClick={() => navigate("/whatsapp")}
            className="relative w-full overflow-hidden rounded-2xl p-5 flex items-center gap-4 active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, #00a884 0%, #075e54 100%)" }}
          >
            {/* glow blob */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <WhatsAppIcon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[17px] font-bold text-white leading-tight">WhatsApp</p>
              <p className="text-[13px] text-white/75 mt-0.5">
                {waUnread > 0 ? `${waUnread} mensagem${waUnread > 1 ? "ns" : ""} não lida${waUnread > 1 ? "s" : ""}` : "Toque para abrir o inbox"}
              </p>
            </div>
            {waUnread > 0 && (
              <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-green-700">
                {waUnread > 9 ? "9+" : waUnread}
              </span>
            )}
            <svg className="h-5 w-5 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </section>}

        {/* ── AÇÕES RÁPIDAS ── */}
        <section className="glass-card smooth-shadow rounded-2xl p-5 col-span-1">
          <h3 className="mb-3 text-[14px] font-semibold text-[#030304] dark:text-white">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map((action) => (
              <button key={action.to} onClick={() => navigate(action.to)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[rgba(0,0,0,0.05)] bg-white dark:bg-white/5 px-2 py-3.5 text-center transition-all hover:border-[#005cba]/30 hover:bg-[#005cba]/5 active:scale-95">
                <span className="text-[20px]">{action.icon}</span>
                <span className="text-[11px] font-semibold leading-tight text-[#46464a] dark:text-gray-300">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── LUMA ── */}
        <section className="col-span-1 md:col-span-2">
          <div className="glass-card smooth-shadow flex flex-col gap-4 rounded-[18px] p-5">
            <div className="flex items-start gap-3">
              <div className="luma-avatar-wave flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg">
                <svg className="h-6 w-6 text-white drop-shadow" viewBox="0 0 24 24" fill="none">
                  <path d="M9 3H7.2C6.08 3 5.52 3 5.09 3.22a2 2 0 0 0-.87.87C4 4.52 4 5.08 4 6.2V8M9 3h6M9 3V1m6 2h1.8c1.12 0 1.68 0 2.1.22a2 2 0 0 1 .88.87C20 4.52 20 5.08 20 6.2V8M15 3V1M4 8v8M4 8H2m18 0v8M22 8h-2M4 16v1.8c0 1.12 0 1.68.22 2.1a2 2 0 0 0 .87.88C5.52 21 6.08 21 7.2 21H9m-5-5H2m18 5H15m5-5h2M15 21h-6m6 0v2m-6-2v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[#77767b] dark:text-[#a0a0a4]">{lumaGreeting}</p>
                <p className="mt-0.5 text-[16px] font-bold leading-snug text-[#030304] dark:text-[#e0e0e2]">
                  Eu sou a Luma, <span className="text-[13px] font-medium text-[#46464a] dark:text-[#a0a0a4]">sua assistente IA</span>
                </p>
              </div>
            </div>
            <form onSubmit={goToLuma} className="flex gap-2">
              <input ref={lumaInputRef} value={lumaInput} onChange={e => setLumaInput(e.target.value)} onFocus={() => goToLuma()}
                placeholder="Pergunte algo para a Luma…"
                className="flex-1 min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f9f9fb] px-3 py-2.5 text-[13px] text-[#1a1c1d] placeholder-[#a0a0a4] outline-none dark:bg-[#111214] dark:text-[#e0e0e2] dark:border-white/8" readOnly />
              <button type="submit" className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-[#1a56db] px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1447c0] active:scale-95">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
                <span className="hidden sm:inline">Perguntar</span>
              </button>
            </form>
          </div>
        </section>

        {/* ── TAREFAS PENDENTES ── */}
        <section className="glass-card smooth-shadow flex flex-col rounded-2xl p-5 col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#030304] dark:text-white">Tarefas Pendentes</h3>
            {pendingTasks.length > 0 && (
              <span className="rounded-full bg-[#005cba]/10 px-2 py-0.5 text-[11px] font-semibold text-[#005cba]">{pendingTasks.length}</span>
            )}
          </div>
          {!board ? (
            <p className="text-[13px] text-[#77767b]">Carregando...</p>
          ) : pendingTasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-4">
              <p className="text-[13px] text-[#77767b]">Sem tarefas pendentes ✓</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto">
              {pendingTasks.map((task) => (
                <div key={task.id} onClick={() => navigate("/tarefas")}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.04)] bg-white dark:bg-white/5 p-3 transition-all hover:shadow-sm">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9z"/>
                  </svg>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-[#1a1c1d] dark:text-gray-200">{task.title}</p>
                    {task.dueDate && (
                      <p className={`mt-0.5 text-[10px] font-semibold ${new Date(task.dueDate) < new Date() ? "text-red-500" : "text-[#77767b]"}`}>
                        Vence {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/tarefas" className="mt-3 flex items-center gap-1 text-[12px] font-medium text-[#005cba] hover:text-[#003d80]">
            Ver todas
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
          </Link>
        </section>

        {/* ── MÓDULOS ── */}
        <section className="glass-card smooth-shadow rounded-2xl p-5 col-span-1 md:col-span-4">
          <h3 className="mb-3 text-[14px] font-semibold text-[#030304] dark:text-white">Módulos do Sistema</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2.5">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link key={mod.to} to={mod.to}
                  className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-[rgba(0,0,0,0.04)] bg-white dark:bg-white/5 px-2 py-3 text-center transition-all hover:border-[#005cba]/20 hover:shadow-md active:scale-95">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${mod.bg} ${mod.color}`}>
                    <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  </span>
                  <span className="text-[10px] md:text-[11px] font-semibold text-[#46464a] dark:text-gray-300 group-hover:text-[#005cba] leading-tight">{mod.label}</span>
                  {"badge" in mod && (mod.badge ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
                      {(mod.badge ?? 0) > 9 ? "9+" : mod.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── MINHA CONTA ── */}
        <section className="glass-card smooth-shadow flex flex-col rounded-2xl p-5 col-span-1">
          <h3 className="mb-3 text-[14px] font-semibold text-[#030304] dark:text-white">Minha Conta</h3>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#030304] dark:bg-white text-[14px] font-bold text-white dark:text-[#030304]">{userInitials}</div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#030304] dark:text-white">{user?.name}</p>
              <p className="text-[11px] text-[#77767b]">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/chat" className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${unreadCount > 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-[#f3f3f5] dark:bg-white/5"}`}>
              <div className="flex items-center gap-2">
                <svg className={`h-4 w-4 ${unreadCount > 0 ? "text-blue-600" : "text-[#77767b]"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>
                </svg>
                <span className={`text-[12px] font-medium ${unreadCount > 0 ? "text-blue-700 dark:text-blue-400" : "text-[#46464a] dark:text-gray-300"}`}>
                  {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "Sem msgs novas"}
                </span>
              </div>
              <svg className="h-3.5 w-3.5 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
            </Link>
            <Link to="/tarefas" className="flex items-center justify-between rounded-xl bg-[#f3f3f5] dark:bg-white/5 px-3 py-2.5 transition-colors hover:bg-[#eeeef0]">
              <span className="text-[12px] font-medium text-[#46464a] dark:text-gray-300">{pendingTasks.length} tarefa{pendingTasks.length !== 1 ? "s" : ""} pendente{pendingTasks.length !== 1 ? "s" : ""}</span>
              <svg className="h-3.5 w-3.5 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
            </Link>
            <Link to="/perfil" className="flex items-center justify-between rounded-xl bg-[#f3f3f5] dark:bg-white/5 px-3 py-2.5 transition-colors hover:bg-[#eeeef0]">
              <span className="text-[12px] font-medium text-[#46464a] dark:text-gray-300">Meu Perfil</span>
              <svg className="h-3.5 w-3.5 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
