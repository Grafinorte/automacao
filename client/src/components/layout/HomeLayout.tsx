import { Outlet } from "react-router-dom";
import { Header } from "./Header";

export function HomeLayout() {
  return (
    <div className="min-h-screen bg-[#f9f9fb]">
      <Header />
      <main className="pt-20">
        <Outlet />
      </main>
    </div>
  );
}
