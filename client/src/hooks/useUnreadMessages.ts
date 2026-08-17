import { useEffect, useState } from "react";
import { messagesApi } from "../api/messages";
import { useAuth } from "../context/AuthContext";

const POLL_INTERVAL_MS = 10000;

export function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    function poll() {
      messagesApi
        .unreadCount()
        .then((res) => {
          if (!cancelled) setCount(res.count);
        })
        .catch(() => {});
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  return count;
}
