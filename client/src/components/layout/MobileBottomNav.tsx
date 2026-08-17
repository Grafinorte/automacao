import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasModuleAccess } from "../../config/modules";
import { useUnreadWa } from "../../hooks/useUnreadWa";

function HomeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function WaIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function CrmIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const waUnread = useUnreadWa();

  if (!user) return null;

  const can = (m: string) => hasModuleAccess(user.role, user.permissions, m);

  const baseCls = "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors";
  const activeCls = "text-green-600 dark:text-green-400";
  const inactiveCls = "text-gray-400 dark:text-gray-500";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-14 border-t border-[rgba(0,0,0,0.08)] dark:border-white/10 bg-white dark:bg-[#1c1e22]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>

      <NavLink to="/" end className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls}`}>
        <HomeIcon />
        Início
      </NavLink>

      {can("whatsapp") && (
        <NavLink to="/whatsapp" className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls} relative`}>
          <span className="relative">
            <WaIcon />
            {waUnread > 0 && (
              <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold px-1">
                {waUnread > 9 ? "9+" : waUnread}
              </span>
            )}
          </span>
          WhatsApp
        </NavLink>
      )}

<NavLink to="/tarefas" className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls}`}>
        <TaskIcon />
        Tarefas
      </NavLink>

      <NavLink to="/chat" className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls}`}>
        <MoreIcon />
        Menu
      </NavLink>
    </nav>
  );
}
