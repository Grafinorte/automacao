import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WhatsAppGlobalNotifier } from "./WhatsAppGlobalNotifier";

const SIDEBAR_KEY = "sidebar-open";

function readSidebarPref() {
  try { return localStorage.getItem(SIDEBAR_KEY) !== "0"; } catch { return true; }
}

export function AppLayout() {
  const { pathname } = useLocation();
  // No WhatsApp a barra lateral começa fechada para a conversa ganhar espaço (monitores pequenos)
  const onWhatsApp = pathname.startsWith("/whatsapp");
  const [pref, setPref] = useState(readSidebarPref);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  useEffect(() => { if (onWhatsApp) setWhatsAppOpen(false); }, [onWhatsApp]);

  const sidebarOpen = onWhatsApp ? whatsAppOpen : pref;
  function toggleSidebar() {
    if (onWhatsApp) { setWhatsAppOpen((v) => !v); return; }
    setPref((v) => {
      try { localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1"); } catch { /* sem localStorage */ }
      return !v;
    });
  }

  return (
    <div className="min-h-screen bg-[#f9f9fb] dark:bg-[#111214]">
      {/* No WhatsApp o topo fica compacto (48px) para sobrar altura às conversas */}
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} compact={onWhatsApp} />
      <Sidebar open={sidebarOpen} compact={onWhatsApp} />
      <main className={`pt-14 ${onWhatsApp ? "md:pt-12" : "md:pt-20"} transition-[margin] duration-200 ${sidebarOpen ? "md:ml-64" : "md:ml-0"}`}>
        <div className={`h-[calc(100vh-56px)] ${onWhatsApp ? "md:h-[calc(100vh-48px)]" : "md:h-[calc(100vh-80px)]"} flex flex-col overflow-hidden`}>
          <Outlet />
        </div>
      </main>
      <WhatsAppGlobalNotifier />
    </div>
  );
}
