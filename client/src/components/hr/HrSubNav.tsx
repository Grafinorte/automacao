import { NavLink } from "react-router-dom";
import { useHrCompany, HR_COMPANIES, type HrCompany } from "../../context/HrCompanyContext";

const TABS = [
  { to: "/rh",              label: "Dashboard",    end: true },
  { to: "/rh/funcionarios", label: "Funcionários", end: false },
  { to: "/rh/ferias",       label: "Férias",       end: false },
  { to: "/rh/assistente",   label: "Assistente IA", end: false },
];

function tabClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
    isActive ? "bg-brand text-white" : "text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
  }`;
}

export function HrSubNav() {
  const { company, setCompany } = useHrCompany();

  return (
    <div className="mb-6 space-y-4">
      {/* Company switcher */}
      <div className="flex items-center gap-3">
        {HR_COMPANIES.map((c) => {
          const active = company === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCompany(c.id as HrCompany)}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all duration-200 ${
                active
                  ? "border-[#005cba] bg-[#005cba]/8 shadow-sm dark:border-[#60a5fa] dark:bg-[#60a5fa]/10"
                  : "border-[rgba(199,198,202,0.4)] bg-white hover:border-[#005cba]/40 hover:bg-[#f3f3f5] dark:bg-[#1c1e22] dark:border-white/8 dark:hover:border-[#60a5fa]/30"
              }`}
            >
              <img
                src={c.logo}
                alt={c.label}
                className="h-6 w-auto max-w-[80px] object-contain"
              />
              <span className={`text-[12px] font-semibold ${
                active ? "text-[#005cba] dark:text-[#60a5fa]" : "text-[#46464a] dark:text-[#a0a0a4]"
              }`}>
                {c.label}
              </span>
              {active && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#005cba] dark:bg-[#60a5fa]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-2">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
