import { useEffect, useRef, useState } from "react";
import { whatsappApi } from "../api/whatsapp";

export function useUnreadWa() {
  const [unread, setUnread] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const convs = await whatsappApi.getConversations("open");
        setUnread(convs.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0));
      } catch { /* ignore */ }
    }
    fetch();
    timerRef.current = setInterval(fetch, 15000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return unread;
}
