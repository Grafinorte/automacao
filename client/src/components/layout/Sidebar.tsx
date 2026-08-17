import { NavLink, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUnreadMessages } from "../../hooks/useUnreadMessages";
import {
  HomeIcon, TasksIcon, FactoryIcon, HrIcon, FinanceIcon,
  MarketingIcon, QuoteIcon, ChatIcon, CatalogIcon, UsersAdminIcon,
  CrmIcon, LogoutIcon, StockIcon, HelpIcon, DocumentsIcon, RkwIcon, DownloadIcon, ServicesIcon,
} from "../icons/Icons";
import { hasModuleAccess } from "../../config/modules";

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium transition-all duration-200 ${
    isActive
      ? "bg-secondary-container text-on-secondary-container font-semibold dark:bg-[#2d1a1b] dark:text-[#e87c80]"
      : "text-on-surface-variant hover:bg-surface-container-high hover:translate-x-0.5 dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
  }`;
}

function NavGroup({
  icon, label, prefix, children,
}: {
  icon: React.ReactNode;
  label: string;
  prefix: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(prefix);
  const [open, setOpen] = useState(isActive);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium transition-all duration-200 ${
          isActive
            ? "bg-secondary-container text-on-secondary-container font-semibold dark:bg-[#2d1a1b] dark:text-[#e87c80]"
            : "text-on-surface-variant hover:bg-surface-container-high dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
        }`}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <svg
          className={`h-3.5 w-3.5 flex-shrink-0 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="ml-9 mt-0.5 flex flex-col gap-0.5 border-l border-[rgba(199,198,202,0.4)] pl-2.5 dark:border-white/8">
          {children}
        </div>
      )}
    </div>
  );
}

function SubNavLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
          isActive
            ? "bg-secondary-container text-on-secondary-container font-semibold dark:bg-[#2d1a1b] dark:text-[#e87c80]"
            : "text-on-surface-variant hover:bg-surface-container-high dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function chatNavClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-semibold transition-all duration-200 ${
    isActive
      ? "bg-blue-500 text-white shadow-md shadow-blue-200 dark:shadow-blue-900"
      : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-900/40"
  }`;
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const unreadCount = useUnreadMessages();

  if (!user) return null;

  const can = (moduleId: string) =>
    hasModuleAccess(user.role, user.permissions, moduleId);

  const isAdmin = user.role === "ADMIN";

  return (
    <aside className="hidden md:flex fixed left-0 top-20 z-40 h-[calc(100vh-80px)] w-64 flex-col overflow-y-auto border-r border-[rgba(199,198,202,0.3)] bg-white px-4 py-4 shadow-sm dark:bg-[#1c1e22] dark:border-white/8">
      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1">
        <NavLink to="/" end className={navClass}>
          <HomeIcon className="h-[18px] w-[18px] flex-shrink-0" />
          Início
        </NavLink>
        <NavLink to="/tarefas" className={navClass}>
          <TasksIcon className="h-[18px] w-[18px] flex-shrink-0" />
          Tarefas
        </NavLink>
        <NavLink
          to="/documentos"
          className={({ isActive }) =>
            `nav-ai-wave${isActive ? " nav-ai-active" : ""} flex items-center gap-3 rounded-lg px-4 py-3 text-[13px]`
          }
        >
          <DocumentsIcon className="h-[18px] w-[18px] flex-shrink-0" />
          Agente Luma
        </NavLink>

        {can("comercial") && (
          <NavGroup
            icon={<CrmIcon className="h-[18px] w-[18px] flex-shrink-0" />}
            label="Comercial"
            prefix="/comercial"
          >
            <SubNavLink to="/comercial" label="Dashboard" end />
            <SubNavLink to="/comercial/funil" label="CRM" />
            <SubNavLink to="/comercial/contatos" label="Contatos" />
            <SubNavLink to="/comercial/prospeccao" label="Prospecção" />
            <SubNavLink to="/proposta" label="Propostas" />
            <SubNavLink to="/comercial/assistente" label="✦ Assistente IA" />
          </NavGroup>
        )}
        {can("orcamentos") && (
          <NavLink to="/orcamentos" className={navClass}>
            <QuoteIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Orçamentos
          </NavLink>
        )}
        {can("marketing") && (
          <NavLink to="/marketing" className={navClass}>
            <MarketingIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Marketing
          </NavLink>
        )}
        {can("rh") && (
          <NavLink to="/rh" className={navClass}>
            <HrIcon className="h-[18px] w-[18px] flex-shrink-0" />
            RH
          </NavLink>
        )}
        {can("almoxarifado") && (
          <NavLink to="/almoxarifado" className={navClass}>
            <StockIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Almoxarifado
          </NavLink>
        )}
        {can("servicos") && (
          <NavLink to="/servicos" className={navClass}>
            <ServicesIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Central de Serviços
          </NavLink>
        )}
        {can("producao") && (
          <NavLink to="/producao" className={navClass}>
            <FactoryIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Produção
          </NavLink>
        )}
        {can("financeiro") && (
          <NavLink to="/financeiro" className={navClass}>
            <FinanceIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Financeiro
          </NavLink>
        )}

        {can("whatsapp") && (
          <NavLink
            to="/whatsapp"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-green-500 text-white shadow-md shadow-green-200 dark:shadow-green-900"
                  : "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/60 dark:text-green-400 dark:hover:bg-green-900/40"
              }`
            }
          >
            <svg className="h-[18px] w-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </NavLink>
        )}

        {/* Chat — destacado */}
        <div className="mt-3 border-t border-[rgba(199,198,202,0.4)] dark:border-white/8 pt-3 flex flex-col gap-1">
          <NavLink to="/chat" className={chatNavClass}>
            <span className="relative flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
              <ChatIcon className="h-[18px] w-[18px]" />
            </span>
            Chat Interno
            {unreadCount > 0 && (
              <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white shadow-sm">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/downloads" className={navClass}>
            <DownloadIcon className="h-[18px] w-[18px] flex-shrink-0" />
            Downloads
          </NavLink>
        </div>

        {isAdmin && (
          <>
            <div className="my-2 border-t border-[rgba(199,198,202,0.4)] dark:border-white/8" />
            <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#46464a]/50 dark:text-[#a0a0a4]/50">Admin</p>
            <NavLink to="/catalogo" className={navClass}>
              <CatalogIcon className="h-[18px] w-[18px] flex-shrink-0" />
              Catálogo
            </NavLink>
            <NavLink to="/usuarios" className={navClass}>
              <UsersAdminIcon className="h-[18px] w-[18px] flex-shrink-0" />
              Usuários
            </NavLink>
            <NavLink to="/rkw" className={navClass}>
              <RkwIcon className="h-[18px] w-[18px] flex-shrink-0" />
              RKW Gerencial
            </NavLink>
          </>
        )}
      </nav>

      {/* Bottom: Help + Logout */}
      <div className="mt-4 flex flex-col gap-1 border-t border-[rgba(199,198,202,0.4)] dark:border-white/8 pt-4">
        <Link
          to="/ajuda"
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium text-on-surface-variant dark:text-[#a0a0a4] transition-colors hover:bg-surface-container-high dark:hover:bg-[#222426]"
        >
          <HelpIcon className="h-[18px] w-[18px] flex-shrink-0" />
          Central de Ajuda
        </Link>
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-medium text-brand transition-colors hover:bg-[#fff5f5] dark:hover:bg-[#2a1515]"
        >
          <LogoutIcon className="h-[18px] w-[18px] flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}
