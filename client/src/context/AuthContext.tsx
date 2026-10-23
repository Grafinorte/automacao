import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../api/auth";
import { ApiError, SESSION_EXPIRED_EVENT } from "../api/client";
import type { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** Mensagem exibida na tela de login quando a sessão expirou durante o uso. */
  sessionMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Tentativas ao abrir a página se o servidor estiver fora (deploy/reinício): ~1 min no total. */
const ME_MAX_ATTEMPTS = 12;
const ME_RETRY_DELAY_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loadSession = (attempt: number) => {
      authApi
        .me()
        .then((sessionUser) => {
          if (cancelled) return;
          setUser(sessionUser);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          // Só desloga se o servidor disser que a sessão é inválida.
          // Erros de rede/servidor (deploy, reinício) tentam de novo.
          const isAuthError = err instanceof ApiError && err.status === 401;
          if (isAuthError || attempt >= ME_MAX_ATTEMPTS) {
            setUser(null);
            setLoading(false);
            return;
          }
          timer = setTimeout(() => loadSession(attempt + 1), ME_RETRY_DELAY_MS);
        });
    };

    loadSession(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setSessionMessage("Sua sessão expirou. Entre novamente.");
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const sessionUser = await authApi.login(email, password);
    setSessionMessage(null);
    setUser(sessionUser);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionMessage, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return ctx;
}
