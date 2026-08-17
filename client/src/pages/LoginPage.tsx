import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f5f5f7] px-5">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[5%] -top-[10%] h-[40%] w-[40%] rounded-full bg-blue-100/40 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[5%] h-[40%] w-[30%] rounded-full bg-[#e2e2e4]/50 blur-[100px]" />
      </div>

      {/* Logo */}
      <header className="mb-8 w-full max-w-[240px]">
        <img src="/assets/logo-full.png" alt="Grafinorte" className="h-auto w-full object-contain" />
      </header>

      {/* Card */}
      <main className="w-full max-w-md">
        <div className="rounded-2xl border border-black/[0.05] bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <div className="mb-7 text-center">
            <h1 className="text-[20px] font-semibold text-[#030304]">Acessar Portal</h1>
            <p className="mt-1 text-[15px] text-[#46464a]">Entre com suas credenciais corporativas</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="block px-1 text-[13px] font-medium text-[#46464a]">E-mail Corporativo</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                <input
                  type="email" required autoFocus
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@grafinorte.com.br"
                  className="h-12 w-full rounded-lg border border-[#c7c6ca] bg-white pl-11 pr-4 text-[15px] text-[#1a1c1d] placeholder-[#77767b] outline-none transition-all focus:border-[#030304] focus:ring-2 focus:ring-[#030304]/10"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block px-1 text-[13px] font-medium text-[#46464a]">Senha</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                </svg>
                <input
                  type={showPass ? "text" : "password"} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-lg border border-[#c7c6ca] bg-white pl-11 pr-12 text-[15px] text-[#1a1c1d] placeholder-[#77767b] outline-none transition-all focus:border-[#030304] focus:ring-2 focus:ring-[#030304]/10"
                />
                <button
                  type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#77767b] transition-colors hover:text-[#1a1c1d]"
                >
                  {showPass ? (
                    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-700">{error}</div>
            )}

            <button
              type="submit" disabled={submitting}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#030304] text-[15px] font-semibold text-white transition-all hover:bg-[#1d1d1f] active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? (
                "Verificando..."
              ) : (
                <>
                  Acessar Portal
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 flex items-center gap-5 text-[11px] font-medium uppercase tracking-wider text-[#77767b]">
        <a href="#" className="transition-colors hover:text-[#1a1c1d]">Suporte</a>
        <span className="h-3 w-px bg-[#c7c6ca]" />
        <a href="#" className="transition-colors hover:text-[#1a1c1d]">Privacidade</a>
        <span className="h-3 w-px bg-[#c7c6ca]" />
        <span>© 2024 Grafinorte</span>
      </footer>
    </div>
  );
}
