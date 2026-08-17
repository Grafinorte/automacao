import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { assistantApi, type AssistantMessage } from "../api/assistant";
import { ApiError } from "../api/client";

const STORAGE_KEY = "grafinorte.assistant.history";

interface AssistantContextValue {
  messages: AssistantMessage[];
  sending: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clear: () => void;
}

const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

function loadHistory(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<AssistantMessage[]>(loadHistory);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setError(null);
      const nextMessages: AssistantMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMessages);
      setSending(true);
      try {
        const reply = await assistantApi.chat(nextMessages);
        setMessages((prev) => [...prev, reply]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Não foi possível falar com o assistente");
      } finally {
        setSending(false);
      }
    },
    [messages]
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <AssistantContext.Provider value={{ messages, sending, error, sendMessage, clear }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error("useAssistant deve ser usado dentro de um AssistantProvider");
  }
  return ctx;
}
