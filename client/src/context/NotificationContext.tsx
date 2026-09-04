import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { notificationsApi, type AppNotification } from "../api/notifications";
import { useAuth } from "./AuthContext";

// ── Sound ─────────────────────────────────────────────────────────────────────

function playNotifSound() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    function tone(freq: number, startAt: number, dur: number) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, startAt);
      g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + dur);
    }

    tone(880, ctx.currentTime, 0.12);
    tone(1100, ctx.currentTime + 0.1, 0.18);
  } catch {}
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  title: string;
  body?: string | null;
  type: string;
}

const TYPE_ICON: Record<string, string> = {
  TASK_ASSIGNED: "📋",
  NEW_MESSAGE: "💬",
  PRODUCTION_ADVANCE: "🏭",
  service_done: "🏁",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4_000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="flex w-80 items-start gap-3 rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-[#1c1e22]/95"
      style={{ animation: "toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1)" }}
    >
      <span className="mt-0.5 text-[18px] leading-none">{TYPE_ICON[toast.type] ?? "🔔"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#1a1c1d] dark:text-[#e0e0e2]">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">{toast.body}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="mt-0.5 flex-shrink-0 rounded-full p-0.5 text-[#77767b] hover:text-[#1a1c1d] dark:hover:text-[#e0e0e2]"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

// ── Context ───────────────────────────────────────────────────────────────────

// ── WA message listeners (for WhatsApp page real-time refresh) ────────────────
type WaMessagePayload = { convId: string; contactName: string; text: string; phoneNumberId?: string };
const waListeners = new Set<(p: WaMessagePayload) => void>();
export function subscribeWaMessage(cb: (p: WaMessagePayload) => void) {
  waListeners.add(cb);
  return () => { waListeners.delete(cb); };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface NotificationCtx {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const Ctx = createContext<NotificationCtx>({
  notifications: [],
  unreadCount: 0,
  markRead: async () => {},
  markAllRead: async () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const initialLoadRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!user) return;

    initialLoadRef.current = false;
    notificationsApi.list().then((list) => {
      setNotifications(list);
      initialLoadRef.current = true;
    }).catch(() => { initialLoadRef.current = true; });

    function connect() {
      const es = new EventSource("/api/notifications/stream", { withCredentials: true });
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "notification") {
            const notif = msg.data as AppNotification;
            setNotifications((prev) => [notif, ...prev].slice(0, 40));

            // Only play sound/show toast after initial load (skip historical ones)
            if (initialLoadRef.current) {
              playNotifSound();
              const toast: Toast = {
                id: notif.id + "_" + Date.now(),
                title: notif.title,
                body: notif.body,
                type: notif.type,
              };
              setToasts((prev) => [...prev.slice(-4), toast]);
            }
          } else if (msg.event === "wa_message") {
            // Notify WhatsApp page (or global notifier) in real-time
            for (const cb of waListeners) {
              try { cb(msg.data); } catch {}
            }
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5_000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markRead(id: string) {
    await notificationsApi.markRead(id).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await notificationsApi.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <Ctx.Provider value={{ notifications, unreadCount, markRead, markAllRead }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </Ctx.Provider>
  );
}

export function useNotifications() {
  return useContext(Ctx);
}
