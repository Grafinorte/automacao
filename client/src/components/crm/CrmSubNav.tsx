import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/comercial", label: "Dashboard", end: true },
  { to: "/comercial/funil", label: "Funil de vendas", end: false },
  { to: "/comercial/contatos", label: "Contatos", end: false },
  { to: "/comercial/prospeccao", label: "Prospecção", end: false },
  { to: "/proposta", label: "Propostas", end: false },
  { to: "/comercial/assistente", label: "✦ Assistente IA", end: false },
];

function tabClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
    isActive
      ? "bg-brand text-white"
      : "text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
  }`;
}

export function CrmSubNav({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mb-5"}`}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
