import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Avisos e confirmações no visual da plataforma, no lugar do alert/confirm do navegador.
 * Funcionam de qualquer lugar: notify.error("..."), await confirmAction("Excluir X?").
 * O <FeedbackHost /> é montado uma vez na raiz do App.
 */

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; text: string }
interface Dialog {
  id: number; title: string; message?: string;
  confirmLabel: string; cancelLabel: string | null; danger: boolean;
  resolve: (ok: boolean) => void;
}

const MAX_TOASTS = 4;
const TOAST_MS: Record<Kind, number> = { success: 3500, info: 5000, error: 7000 };
// Primeira palavra que indica ação destrutiva vira o rótulo do botão vermelho
const DANGER_WORDS = ["excluir", "remover", "desativar", "cancelar", "apagar"];

let toasts: Toast[] = [];
let dialogs: Dialog[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(kind: Kind, text: string) {
  const id = ++seq;
  toasts = [...toasts, { id, kind, text }].slice(-MAX_TOASTS);
  emit();
  setTimeout(() => dismiss(id), TOAST_MS[kind]);
}

export const notify = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", text),
  info: (text: string) => push("info", text),
};

/** "Título\n\nDetalhes" vira título em destaque e texto menor embaixo */
function split(text: string) {
  const [first, ...rest] = text.split("\n\n");
  return { title: first.trim(), message: rest.join("\n\n").trim() || undefined };
}

function open(d: Omit<Dialog, "id" | "resolve">) {
  return new Promise<boolean>((resolve) => {
    dialogs = [...dialogs, { ...d, id: ++seq, resolve }];
    emit();
  });
}

export function confirmAction(text: string, opts: { confirmLabel?: string; danger?: boolean } = {}) {
  const { title, message } = split(text);
  const word = DANGER_WORDS.find((w) => title.toLowerCase().startsWith(w));
  const danger = opts.danger ?? !!word;
  const confirmLabel = opts.confirmLabel ?? (word ? word[0].toUpperCase() + word.slice(1) : "Confirmar");
  return open({ title, message, confirmLabel, cancelLabel: confirmLabel === "Cancelar" ? "Voltar" : "Cancelar", danger });
}

/** Mensagem longa que a pessoa precisa ler (instruções, lista de erros) */
export async function showMessage(text: string) {
  const { title, message } = split(text);
  await open({ title, message, confirmLabel: "Entendi", cancelLabel: null, danger: false });
}

function close(d: Dialog, ok: boolean) {
  dialogs = dialogs.filter((x) => x.id !== d.id);
  emit();
  d.resolve(ok);
}

const TOAST_STYLE: Record<Kind, { bar: string; icon: string }> = {
  success: { bar: "bg-green-500", icon: "M4.5 12.75l6 6 9-13.5" },
  error: { bar: "bg-red-500", icon: "M12 9v3.75m0 3.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  info: { bar: "bg-[#005cba]", icon: "m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" },
};

function DialogView({ d }: { d: Dialog }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(d, false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d]);

  return (
    <div className="fb-fade fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onMouseDown={() => d.cancelLabel && close(d, false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={`fb-t-${d.id}`}
        className="fb-pop w-full max-w-md rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#1c1e22]"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex gap-3">
          <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${d.danger ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400" : "bg-[#005cba]/10 text-[#005cba] dark:text-[#4d9fff]"}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={d.danger ? "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" : TOAST_STYLE.info.icon} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`fb-t-${d.id}`} className="text-[15px] font-semibold leading-snug text-[#1a1c1d] dark:text-white">{d.title}</h2>
            {d.message && <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-[#46464a] dark:text-[#a0a0a4]">{d.message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {d.cancelLabel && (
            <button onClick={() => close(d, false)} className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-white/5">
              {d.cancelLabel}
            </button>
          )}
          <button ref={confirmRef} onClick={() => close(d, true)}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-[#1c1e22] ${d.danger ? "bg-red-600 hover:bg-red-700 focus:ring-red-500/40" : "bg-[#005cba] hover:bg-[#004a96] focus:ring-[#005cba]/40"}`}>
            {d.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackHost() {
  const state = useSyncExternalStore(subscribe, () => `${toasts.map((t) => t.id).join(",")}|${dialogs.map((d) => d.id).join(",")}`);
  void state;
  const current = dialogs[0];
  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className="fb-pop pointer-events-auto flex overflow-hidden rounded-xl border border-[rgba(199,198,202,0.35)] bg-white shadow-lg dark:border-white/10 dark:bg-[#23252a]">
            <span className={`w-1 flex-shrink-0 ${TOAST_STYLE[t.kind].bar}`} />
            <div className="flex flex-1 items-start gap-2.5 px-3 py-2.5">
              <svg className={`mt-0.5 h-4 w-4 flex-shrink-0 ${t.kind === "success" ? "text-green-600" : t.kind === "error" ? "text-red-600" : "text-[#005cba] dark:text-[#4d9fff]"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={TOAST_STYLE[t.kind].icon} />
              </svg>
              <p className="flex-1 whitespace-pre-line text-[13px] leading-snug text-[#1a1c1d] dark:text-[#e0e0e2]">{t.text}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="-mr-1 rounded p-0.5 text-[#a0a0a4] hover:text-[#46464a] dark:hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      {current && <DialogView key={current.id} d={current} />}
    </>
  );
}
