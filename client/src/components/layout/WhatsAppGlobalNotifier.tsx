import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { whatsappApi } from "../../api/whatsapp";
import { Avatar } from "../common/Avatar";

interface ToastMsg { id: string; convId: string; name: string; text: string; }

function playSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } catch { /* AudioContext indisponível */ }
}

export function WhatsAppGlobalNotifier() {
  const location = useLocation();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const initializedRef = useRef(false);

  const isOnWhatsApp = location.pathname === "/whatsapp";

  useEffect(() => {
    if (isOnWhatsApp) {
      // When user enters WhatsApp page, stop global polling and reset
      // so when they leave, first poll re-initializes counts (no duplicate toasts)
      initializedRef.current = false;
      return;
    }

    async function poll() {
      try {
        const data = await whatsappApi.getConversations("open");
        if (!initializedRef.current) {
          // First poll after leaving WhatsApp: just set baseline, no toast
          prevUnreadRef.current = Object.fromEntries(data.map(c => [c.id, c.unreadCount]));
          initializedRef.current = true;
          return;
        }
        data.forEach(conv => {
          const prev = prevUnreadRef.current[conv.id] ?? 0;
          if (conv.unreadCount > prev) {
            playSound();
            const toastId = `${conv.id}-${Date.now()}`;
            setToasts(ts => [...ts.slice(-4), {
              id: toastId,
              convId: conv.id,
              name: conv.contact.name,
              text: conv.lastMessageText ?? "Nova mensagem",
            }]);
            setTimeout(() => setToasts(ts => ts.filter(t => t.id !== toastId)), 6000);
          }
        });
        prevUnreadRef.current = Object.fromEntries(data.map(c => [c.id, c.unreadCount]));
      } catch { /* silencioso */ }
    }

    poll();
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, [isOnWhatsApp]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`@keyframes waNotiSlideIn { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto" style={{ animation: "waNotiSlideIn 0.25s ease-out" }}>
            <div
              onClick={() => { navigate("/whatsapp"); setToasts(ts => ts.filter(t => t.id !== toast.id)); }}
              className="flex items-start gap-3 bg-white dark:bg-[#2a2d32] rounded-2xl shadow-xl border border-[rgba(0,0,0,0.08)] dark:border-white/10 p-3 w-80 cursor-pointer hover:shadow-2xl transition-shadow"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Avatar name={toast.name} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{toast.name}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{toast.text}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setToasts(ts => ts.filter(t => t.id !== toast.id)); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-0.5 p-0.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
