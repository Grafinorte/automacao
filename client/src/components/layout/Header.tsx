import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useNotifications } from "../../context/NotificationContext";
import { Avatar } from "../common/Avatar";
import { ROLE_LABELS } from "../../types";
import { BellIcon, ChevronDownIcon } from "../icons/Icons";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const TYPE_ICON: Record<string, string> = {
  task_assigned: "✅",
  new_message: "💬",
  production_advance: "🏭",
};

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  async function handleNotifClick(id: string, link: string | null) {
    await markRead(id);
    setBellOpen(false);
    if (link) navigate(link);
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 md:h-20 items-center justify-between border-b border-[rgba(199,198,202,0.3)] bg-white/80 px-4 md:px-10 backdrop-blur-md dark:bg-[#14161a]/90 dark:border-white/8">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <img
          src={theme === "dark" ? "/assets/logo-white.png" : "/assets/logo-full.png"}
          alt="Grafinorte"
          className="hidden md:block h-8 w-auto"
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">

        {/* Dark / Light toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
        >
          {theme === "dark" ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>

        {/* Notification Bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#46464a] transition-colors hover:bg-[#f3f3f5] hover:text-[#1a1c1d] dark:text-[#a0a0a4] dark:hover:bg-[#222426] dark:hover:text-[#e0e0e2]"
          >
            <BellIcon className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[rgba(199,198,202,0.4)] bg-white shadow-xl dark:bg-[#1c1e22] dark:border-white/10">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-4 py-3 dark:border-white/8">
                <span className="text-[13px] font-semibold text-[#030304] dark:text-white">Notificações</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] font-medium text-[#2563eb] hover:underline dark:text-blue-400"
                  >
                    Marcar tudo como lido
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10">
                    <span className="text-2xl">🔔</span>
                    <p className="mt-2 text-[13px] text-[#77767b] dark:text-[#a0a0a4]">Sem notificações</p>
                  </div>
                )}
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n.id, n.link)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f9f9fb] dark:hover:bg-[#222426] ${!n.read ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                  >
                    <span className="flex-shrink-0 text-lg leading-none mt-0.5">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-[12.5px] ${!n.read ? "font-semibold text-[#030304] dark:text-white" : "font-medium text-[#46464a] dark:text-[#a0a0a4]"}`}>
                          {n.title}
                        </p>
                        <span className="flex-shrink-0 text-[10px] text-[#77767b] dark:text-[#a0a0a4]">{timeAgo(n.createdAt)}</span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#77767b] dark:text-[#a0a0a4]">{n.body}</p>
                      )}
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={menuRef} className="relative ml-1">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
          >
            <Avatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
            <div className="hidden text-left sm:block">
              <p className="text-[13.5px] font-semibold leading-tight text-[#1a1c1d] dark:text-[#e0e0e2]">{user.name}</p>
              <p className="text-[11px] leading-tight text-[#46464a] dark:text-[#a0a0a4]">{ROLE_LABELS[user.role]}</p>
            </div>
            <ChevronDownIcon className="h-4 w-4 text-[#46464a] dark:text-[#a0a0a4]" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-[rgba(199,198,202,0.4)] bg-white py-1 shadow-lg dark:bg-[#1c1e22] dark:border-white/10">
              <Link
                to="/perfil"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-[#1a1c1d] transition-colors hover:bg-[#f3f3f5] dark:text-[#e0e0e2] dark:hover:bg-[#222426]"
              >
                Meu perfil
              </Link>
              <button
                onClick={() => logout()}
                className="block w-full px-4 py-2.5 text-left text-sm text-brand transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
