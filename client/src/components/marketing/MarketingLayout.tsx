import { NavLink, Outlet } from "react-router-dom";
import { ICONS, MktIcon } from "./mkt-ui";

const GROUPS: { title: string; items: { to: string; end?: boolean; label: string; icon: string; isNew?: boolean }[] }[] = [
  {
    title: "Visão geral",
    items: [{ to: "/marketing", end: true, label: "Instagram", icon: ICONS.chart }],
  },
  {
    title: "Conteúdo",
    items: [{ to: "/marketing/planner", label: "Planner", icon: ICONS.calendar }],
  },
  {
    title: "Inteligência",
    items: [
      { to: "/marketing/anuncios", label: "Anúncios", icon: ICONS.megaphone, isNew: true },
      { to: "/marketing/buscas", label: "Buscas no Google", icon: ICONS.search, isNew: true },
      { to: "/marketing/concorrentes", label: "Concorrentes IA", icon: ICONS.bulb },
    ],
  },
  {
    title: "Site",
    items: [{ to: "/marketing/site", label: "Site (Analytics)", icon: ICONS.globe }],
  },
];

export function MarketingLayout() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden md:h-[calc(100vh-5rem)]">
      <aside className="relative flex w-60 flex-shrink-0 flex-col gap-5 overflow-y-auto border-r border-[rgba(0,0,0,0.06)] bg-white px-3 py-5 dark:border-white/5 dark:bg-[#141517]">
        <div className="flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#005cba] to-[#8b5cf6] text-white shadow-[0_6px_16px_-6px_rgba(0,92,186,0.7)]">
            <MktIcon d={ICONS.sparkles} className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-bold text-[#111214] dark:text-white">Marketing</p>
            <p className="text-[10.5px] text-[#77767b]">Grafinorte · Pluspack</p>
          </div>
        </div>

        {GROUPS.map((g) => (
          <nav key={g.title} className="flex flex-col gap-0.5">
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-[#77767b]/80">{g.title}</p>
            {g.items.map(({ to, end, label, icon, isNew }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 ${isActive
                    ? "bg-gradient-to-r from-[#005cba] to-[#2f7fe0] text-white shadow-[0_8px_20px_-8px_rgba(0,92,186,0.8)]"
                    : "text-[#46464a] hover:translate-x-0.5 hover:bg-[#f3f3f5] hover:text-[#111214] dark:hover:bg-white/5 dark:hover:text-white"}`}>
                {({ isActive }) => (
                  <>
                    <span className={isActive ? "text-white" : "text-[#77767b] transition-colors group-hover:text-[#005cba] dark:group-hover:text-[#7fb4f5]"}>
                      <MktIcon d={icon} className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {isNew && (
                      <span className={`rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide ${isActive ? "bg-white/20 text-white" : "bg-gradient-to-r from-[#005cba] to-[#8b5cf6] text-white"}`}>novo</span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        ))}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f7f9] dark:bg-[#111214]">
        <Outlet />
      </main>
    </div>
  );
}
