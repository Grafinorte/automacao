import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAssistant } from "../../context/AssistantContext";

const SUGGESTIONS = [
  "Papéis disponíveis",
  "Preço do couchê 90g",
  "Gramatura para folder",
  "Tipos de acabamento",
];

export function AssistantPanel() {
  const { messages, sending, error, sendMessage, clear } = useAssistant();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    await sendMessage(content);
  }

  async function handleSuggestion(s: string) {
    await sendMessage(s);
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-in { animation: fadeSlideUp 0.2s ease-out; }
        @keyframes aiPulse {
          0%   { box-shadow: 0 0 0 0 rgba(0,92,186,0.45); }
          70%  { box-shadow: 0 0 0 7px rgba(0,92,186,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,92,186,0); }
        }
        .ai-pulse { animation: aiPulse 2.4s ease-out infinite; }
      `}</style>

      <aside className="fixed right-0 top-20 z-40 flex h-[calc(100vh-80px)] w-80 flex-col border-l border-[rgba(199,198,202,0.3)] bg-white">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.05)] px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Avatar with pulse */}
            <div className="relative flex-shrink-0">
              <div
                className="ai-pulse flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
              >
                ✦
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white">
                <span className={`h-2 w-2 rounded-full ${sending ? "animate-ping bg-amber-400" : "bg-green-400"}`} />
              </span>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#030304]">Assistente IA</p>
              <p className="text-[11px] text-[#77767b]">
                {sending ? "Pensando…" : "Catálogo · Papéis · Preços"}
              </p>
            </div>
          </div>
          {!isEmpty && (
            <button
              onClick={clear}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-[#77767b] transition-colors hover:bg-[#f3f3f5] hover:text-[#1a1c1d]"
            >
              Limpar
            </button>
          )}
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isEmpty ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div
                className="ai-pulse flex h-14 w-14 items-center justify-center rounded-2xl text-[22px] text-white"
                style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
              >
                ✦
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#030304]">Como posso ajudar?</p>
                <p className="mt-1 px-2 text-[12px] leading-relaxed text-[#77767b]">
                  Pergunte sobre produtos, papéis, especificações ou preços do catálogo.
                </p>
              </div>
              {/* Suggestions */}
              <div className="mt-1 flex flex-col gap-2 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    disabled={sending}
                    className="w-full rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#f9f9fb] px-3 py-2.5 text-left text-[12px] font-medium text-[#46464a] transition-all hover:border-[#005cba]/30 hover:bg-[#005cba]/5 hover:text-[#005cba] active:scale-[0.98] disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}
                >
                  {/* AI avatar (only on left messages) */}
                  {m.role !== "user" && (
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
                    >
                      ✦
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-sm bg-[#030304] text-white"
                        : "rounded-bl-sm border border-[rgba(0,0,0,0.05)] bg-[#f3f3f5] text-[#1a1c1d]"
                    }`}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <div className="msg-in flex items-end gap-2">
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
                  >
                    ✦
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-[rgba(0,0,0,0.05)] bg-[#f3f3f5] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-1.5 w-1.5 rounded-full bg-[#005cba]/50"
                          style={{ animation: "bounce 1s infinite", animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {error}
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* ── Input ── */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-[rgba(0,0,0,0.05)] bg-white px-3 py-3"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pergunte sobre o catálogo…"
            disabled={sending}
            className="flex-1 rounded-xl border border-[#c7c6ca] bg-[#f9f9fb] px-3 py-2 text-[13px] text-[#1a1c1d] placeholder-[#77767b] outline-none transition-all focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#005cba 0%,#7c3aed 100%)" }}
          >
            {sending ? (
              <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
      </aside>
    </>
  );
}
