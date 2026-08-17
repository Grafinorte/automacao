import { useState, useRef, useEffect, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CrmSubNav } from "../components/crm/CrmSubNav";

interface Message {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  "Qual o valor total do funil?",
  "Deals parados há mais de 7 dias",
  "Negócios fechados esse mês",
  "Últimas atividades do CRM",
  "Buscar contatos por empresa",
];

/* ── Typing dots ─────────────────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      {/* AI avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
        >
          ✦
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white">
          <span className="h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75" />
        </span>
      </div>

      {/* Dots bubble */}
      <div className="glass-card smooth-shadow rounded-2xl rounded-bl-sm px-5 py-4">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 rounded-full bg-[#005cba]/50"
              style={{
                animation: "bounce 1s infinite",
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Single message ──────────────────────────────────────────────────────── */
function MessageBubble({ msg, userInitials }: { msg: Message; userInitials: string }) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`flex items-end gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      style={{ animation: "fadeSlideIn 0.25s ease-out" }}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#030304] text-[11px] font-bold text-white">
          {userInitials}
        </div>
      ) : (
        <div className="relative flex-shrink-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
          >
            ✦
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white">
            <span className="h-2 w-2 rounded-full bg-green-400" />
          </span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-[#030304] text-white"
            : "glass-card smooth-shadow rounded-bl-sm text-[#1a1c1d]"
        }`}
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {msg.text}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function CrmAgentPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "Olá! Sou o Assistente Comercial da Grafinorte.\n\nTenho acesso ao CRM em tempo real e posso responder perguntas sobre funil de vendas, deals, contatos e atividades. Como posso ajudar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { user } = useAuth();
  const userInitials = user
    ? user.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
    : "EU";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    const userMsg: Message = { role: "user", text: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const history = newMessages.slice(1, -1).map((m) => ({ role: m.role, text: m.text }));

    try {
      const { reply } = await api.post<{ reply: string }>("/crm/agent", {
        message: text.trim(),
        history,
      });
      setMessages((prev) => [...prev, { role: "model", text: reply }]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao processar sua pergunta";
      setError(msg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .ai-glow {
          box-shadow: 0 0 0 0 rgba(0,92,186,0);
          animation: pulse-ring 2.5s ease-out infinite;
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(0,92,186,0.4); }
          70%  { box-shadow: 0 0 0 8px rgba(0,92,186,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,92,186,0); }
        }
      `}</style>

      {/* Header — mesmo padrão das outras páginas CRM */}
      <div className="flex-shrink-0 px-8 pt-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
            <p className="mt-1 text-[17px] text-[#46464a]">Assistente com acesso ao CRM em tempo real. Powered by Gemini</p>
          </div>
        </div>
        <CrmSubNav />
      </div>

      {/* Chat — ocupa o restante da altura */}
      <div className="flex flex-1 flex-col overflow-hidden px-8 pb-8">
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.05)] bg-[#f9f9fb]">

          {/* Chat header bar */}
          <div className="flex items-center gap-3 border-b border-[rgba(0,0,0,0.05)] bg-white px-5 py-3">
            <div className="relative">
              <div
                className="ai-glow flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
              >
                ✦
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white">
                <span className={`h-2 w-2 rounded-full ${loading ? "animate-ping bg-amber-400" : "bg-green-400"}`} />
              </span>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#030304]">Assistente Comercial</p>
              <p className="text-[11px] text-[#77767b]">
                {loading ? "Consultando o CRM…" : "Online · Dados em tempo real"}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} userInitials={userInitials} />
            ))}
            {loading && <TypingIndicator />}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-[13px] text-red-700">{error}</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions — only on first message */}
          {messages.length === 1 && !loading && (
            <div className="border-t border-[rgba(0,0,0,0.04)] bg-white px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Sugestões</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-[#c7c6ca] bg-[#f9f9fb] px-3 py-1.5 text-[12px] font-medium text-[#46464a] transition-all hover:border-[#005cba] hover:bg-[#005cba]/5 hover:text-[#005cba] active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-[rgba(0,0,0,0.05)] bg-white px-4 py-3">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre o CRM… (Enter para enviar)"
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-[#c7c6ca] bg-[#f9f9fb] px-4 py-2.5 text-[14px] text-[#1a1c1d] placeholder-[#77767b] outline-none transition-all focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 disabled:opacity-50"
                style={{ minHeight: 42, maxHeight: 120 }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-30"
                style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
              >
                {loading ? (
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-[#77767b]">
              Dados consultados em tempo real · Powered by Gemini
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
