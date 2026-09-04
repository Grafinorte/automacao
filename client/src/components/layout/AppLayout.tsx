import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WhatsAppGlobalNotifier } from "./WhatsAppGlobalNotifier";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[#f9f9fb] dark:bg-[#111214]">
      <Header />
      <Sidebar />
      <main className="md:ml-64 pt-14 md:pt-20">
        <div className="h-[calc(100vh-56px)] md:h-[calc(100vh-80px)] flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
      <WhatsAppGlobalNotifier />
    </div>
  );
}
