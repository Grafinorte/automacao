import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/marketing", label: "Dashboard", end: true },
  { to: "/marketing/conteudo", label: "Calendário de conteúdo", end: false },
  { to: "/marketing/campanhas", label: "Campanhas", end: false },
  { to: "/marketing/instagram", label: "Instagram", end: false },
];

function tabClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
    isActive ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
  }`;
}

export function MarketingSubNav() {
  return (
    <div className="mb-5 flex items-center gap-2">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
