import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { hrAssistantApi, type HrChatMessage, type HrConversationSummary } from "../api/hrAssistant";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { HrSubNav } from "../components/hr/HrSubNav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function makeTitle(msg: string) { return msg.trim().slice(0, 60) + (msg.length > 60 ? "…" : ""); }

function groupConversations(list: HrConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 6 * 86400000;

  const groups: { label: string; items: HrConversationSummary[] }[] = [
    { label: "Hoje", items: [] },
    { label: "Ontem", items: [] },
    { label: "Últimos 7 dias", items: [] },
    { label: "Mais antigos", items: [] },
  ];
  for (const c of list) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= today) groups[0].items.push(c);
    else if (t >= yesterday) groups[1].items.push(c);
    else if (t >= week) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const HR_ANIM_CSS = `
  @keyframes hrCycle {
    0%   { opacity: 0; transform: scale(0.7) rotate(-8deg); }
    8%   { opacity: 1; transform: scale(1)   rotate(0deg);  }
    30%  { opacity: 1; transform: scale(1)   rotate(0deg);  }
    38%  { opacity: 0; transform: scale(0.75) rotate(8deg); }
    100% { opacity: 0; transform: scale(0.7) rotate(-8deg); }
  }
`;

function PersonIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className="absolute h-[52%] w-[52%] text-white" style={style}>
      <circle cx="16" cy="10" r="5" />
      <path d="M6 28c0-5.523 4.477-10 10-10s10 4.477 10 10" />
    </svg>
  );
}

function CalendarIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className="absolute h-[52%] w-[52%] text-white" style={style}>
      <rect x="4" y="6" width="24" height="22" rx="3" />
      <line x1="4" y1="13" x2="28" y2="13" />
      <line x1="10" y1="3" x2="10" y2="9" />
      <line x1="22" y1="3" x2="22" y2="9" />
      <circle cx="11" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="21" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckDocIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className="absolute h-[52%] w-[52%] text-white" style={style}>
      <path d="M8 4h10l6 6v18H8V4z" />
      <path d="M18 4v6h6" />
      <path d="M11 18l3 3 7-7" />
    </svg>
  );
}

function AIAvatar({ size = "md" }: { size?: "sm" | "lg" | "md" }) {
  const T = 4.5;
  const S = T / 3;

  if (size !== "lg") {
    return (
      <div className={`flex flex-shrink-0 items-center justify-center rounded-full ${size === "sm" ? "h-7 w-7" : "h-9 w-9"}`}
        style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}>
        <svg className="h-[44%] w-[44%] text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      </div>
    );
  }

  const iconStyle = (delay: number): React.CSSProperties => ({
    animation: `hrCycle ${T}s ease-in-out infinite`,
    animationDelay: `${delay}s`,
    animationFillMode: "backwards",
  });

  return (
    <>
      <style>{HR_ANIM_CSS}</style>
      <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full overflow-hidden"
        style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}>
        <PersonIcon   style={iconStyle(0)} />
        <CalendarIcon style={iconStyle(S)} />
        <CheckDocIcon style={iconStyle(S * 2)} />
      </div>
    </>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      <AIAvatar size="sm" />
      <div className="rounded-2xl rounded-bl-sm border border-[rgba(0,0,0,0.06)] bg-white px-5 py-3.5 shadow-sm dark:border-white/6 dark:bg-[#23252a]">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-1.5 w-1.5 rounded-full bg-[#2563eb]/40"
              style={{ animation: "bounce 1s infinite", animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, userInitials }: { msg: HrChatMessage; userInitials: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-end gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      style={{ animation: "fadeIn 0.2s ease-out" }}>
      {isUser ? (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1a1c1d] text-[10px] font-bold text-white dark:bg-white/10 dark:text-[#e0e0e2]">
          {userInitials}
        </div>
      ) : <AIAvatar size="sm" />}
      <div className={`flex max-w-[76%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-[#1a1c1d] text-white dark:bg-[#2563eb]"
            : "rounded-bl-sm border border-[rgba(0,0,0,0.05)] bg-white text-[#1a1c1d] shadow-sm dark:border-white/5 dark:bg-[#23252a] dark:text-[#e0e0e2]"
        }`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function InputBar({ inputRef, input, loading, onChange, onSubmit, onKeyDown }: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  input: string; loading: boolean;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}
      className="flex items-end gap-0 rounded-2xl border border-[rgba(199,198,202,0.45)] bg-white shadow-md transition-shadow focus-within:shadow-lg dark:border-white/10 dark:bg-[#1e2024] w-full">
      <textarea ref={inputRef} rows={1} value={input}
        onChange={(e) => {
          onChange(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
        }}
        onKeyDown={onKeyDown}
        placeholder="Pergunte à Lisania…"
        disabled={loading}
        className="flex-1 resize-none rounded-2xl bg-transparent px-5 py-3.5 text-[14px] text-[#1a1c1d] placeholder-[#a0a0a4] outline-none disabled:opacity-50 dark:text-[#e0e0e2]"
        style={{ minHeight: 52, maxHeight: 140 }}
      />
      <button type="submit" disabled={loading || !input.trim()}
        className="m-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-25"
        style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}>
        {loading ? (
          <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        )}
      </button>
    </form>
  );
}

const SUGGESTIONS = [
  "Como calcular férias proporcionais?",
  "Quais são as obrigações do eSocial?",
  "Como funciona o aviso prévio na demissão?",
  "O que é a CIPA e quando é obrigatória?",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function HrAssistantPage() {
  const { user } = useAuth();
  const userInitials = user
    ? user.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
    : "EU";

  const [conversations, setConversations] = useState<HrConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HrChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchConversations = useCallback(() => {
    hrAssistantApi.listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  function startNew() { setActiveId(makeId()); setMessages([]); setError(null); setInput(""); }

  async function loadConversation(id: string) {
    try {
      const conv = await hrAssistantApi.getConversation(id);
      setActiveId(conv.id); setMessages(conv.messages); setError(null); setInput("");
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    await hrAssistantApi.deleteConversation(id).catch(() => {});
    if (activeId === id) { setActiveId(null); setMessages([]); }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    const convId = activeId ?? makeId();
    if (!activeId) setActiveId(convId);
    const userMsg: HrChatMessage = { role: "user", content: text.trim() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setLoading(true);
    const history = withUser.slice(0, -1);
    try {
      const { answer } = await hrAssistantApi.ask(text.trim(), history);
      const aiMsg: HrChatMessage = { role: "assistant", content: answer };
      const all = [...withUser, aiMsg];
      setMessages(all);
      hrAssistantApi.saveConversation(convId, makeTitle(text.trim()), all)
        .then(() => fetchConversations()).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao processar sua pergunta.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); send(input); }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const isFresh = messages.length === 0;
  const groups = groupConversations(conversations);

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">

        {/* ── Sub-nav ── */}
        <div className="flex-shrink-0">
          <HrSubNav />
        </div>

        {/* ── Chat layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ── */}
          <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[rgba(199,198,202,0.3)] bg-white dark:border-white/8 dark:bg-[#1c1e22]">
            <div className="p-3">
              <button onClick={startNew}
                className="flex w-full items-center gap-2 rounded-xl border border-[rgba(199,198,202,0.5)] px-3 py-2.5 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f5f5f7] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Nova conversa
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "thin" }}>
              {groups.length === 0 ? (
                <p className="px-3 pt-4 text-[12px] text-[#a0a0a4]">Nenhuma conversa ainda.</p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="mb-1 px-3 pt-3 text-[10px] font-semibold uppercase tracking-widest text-[#77767b]">
                      {group.label}
                    </p>
                    {group.items.map((conv) => (
                      <div key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={`group relative flex cursor-pointer items-center rounded-lg px-3 py-2 text-[13px] transition-colors ${
                          activeId === conv.id
                            ? "bg-[#f0f0f2] font-medium text-[#030304] dark:bg-white/8 dark:text-[#e0e0e2]"
                            : "text-[#46464a] hover:bg-[#f5f5f7] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
                        }`}>
                        <span className="flex-1 truncate pr-5">{conv.title}</span>
                        <button
                          onClick={(e) => handleDelete(conv.id, e)}
                          disabled={deletingId === conv.id}
                          className="absolute right-2 hidden rounded p-0.5 text-[#9ca3af] transition-colors hover:text-red-500 group-hover:flex dark:text-[#6b7280]"
                          title="Deletar">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[rgba(199,198,202,0.3)] px-4 py-3 dark:border-white/8">
              <p className="text-[11px] text-[#a0a0a4]">Assistente de RH com IA</p>
            </div>
          </aside>

          {/* ── Chat area ── */}
          <div className="flex flex-1 flex-col overflow-hidden bg-[#f7f7f9] dark:bg-[#131416]">

            {/* Fresh state */}
            {isFresh && (
              <div className="flex flex-1 flex-col items-center justify-center px-6"
                style={{ animation: "fadeInUp 0.35s ease-out" }}>
                <div className="mb-6"><AIAvatar size="lg" /></div>
                <h1 className="mb-2 text-center text-[28px] font-semibold tracking-tight text-[#1a1c1d] dark:text-[#e0e0e2]">
                  Por onde começamos?
                </h1>
                <p className="mb-10 text-center text-[15px] text-[#77767b] dark:text-[#a0a0a4]">
                  Lisania · Assistente de RH com Inteligência Artificial
                </p>
                <div className="w-full max-w-2xl">
                  <InputBar inputRef={inputRef} input={input} loading={loading}
                    onChange={setInput} onSubmit={handleSubmit} onKeyDown={handleKeyDown} />
                </div>
                <div className="mt-4 flex w-full max-w-2xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-[rgba(199,198,202,0.5)] bg-white px-4 py-2 text-[13px] font-medium text-[#46464a] shadow-sm transition-all hover:border-[#2563eb] hover:text-[#2563eb] active:scale-95 dark:border-white/8 dark:bg-[#1e2024] dark:text-[#a0a0a4]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {!isFresh && (
              <>
                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 md:px-[8%] lg:px-[14%]">
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} userInitials={userInitials} />
                  ))}
                  {loading && <TypingIndicator />}
                  {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-[rgba(199,198,202,0.25)] bg-[#f7f7f9] px-6 py-4 dark:border-white/5 dark:bg-[#131416] md:px-[8%] lg:px-[14%]">
                  <InputBar inputRef={inputRef} input={input} loading={loading}
                    onChange={setInput} onSubmit={handleSubmit} onKeyDown={handleKeyDown} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
