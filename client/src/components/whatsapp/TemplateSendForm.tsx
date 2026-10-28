// Envio de template aprovado pela Meta: escolha do template, campos das variáveis e prévia como no WhatsApp.
// Usado no botão de templates do chat, em "Nova conversa" e na aba Templates.
import { useEffect, useMemo, useRef, useState } from "react";
import { whatsappApi, type MetaTemplate, type WaConversation, type WaMessage } from "../../api/whatsapp";
import { useAuth } from "../../context/AuthContext";

const CATEGORY_LABELS: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

/** Maior {{n}} do texto = quantas variáveis ele pede */
const varCount = (text?: string) => Math.max(0, ...(text?.match(/\{\{(\d+)\}\}/g) ?? []).map((m) => Number(m.replace(/\D/g, ""))));
const fill = (text: string, values: string[]) => text.replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i) - 1]?.trim() || `{{${i}}}`);
export const prettyTemplateName = (name: string) => name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function parts(t: MetaTemplate) {
  const header = t.components.find((c) => c.type === "HEADER");
  const body = t.components.find((c) => c.type === "BODY");
  const footer = t.components.find((c) => c.type === "FOOTER");
  const buttons = t.components.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  const headerMediaType = header?.format && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format) ? header.format.toLowerCase() : null;
  return {
    header, body, footer, buttons, headerMediaType,
    headerVars: header?.format === "TEXT" ? varCount(header.text) : 0,
    bodyVars: varCount(body?.text),
    // Botão de link com {{1}} no endereço precisa do complemento do link
    urlButtons: buttons.map((b, index) => ({ b, index })).filter(({ b }) => b.type === "URL" && /\{\{\d+\}\}/.test(b.url ?? "")),
  };
}

const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-3.5 py-2.5 text-sm focus:outline-none focus:border-green-400 dark:text-white";
const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export function TemplateSendForm({ target, phoneNumberId, fixedTemplate, onSent, onCancel }: {
  /** Conversa existente (envio de dentro do chat) ou número novo digitado pelo vendedor */
  target: { conversationId: string } | { phone: string; name?: string };
  /** Número que envia — os templates vêm da conta (WABA) dele */
  phoneNumberId?: string | null;
  /** Já abre com este template escolhido (aba Templates → "Usar") */
  fixedTemplate?: MetaTemplate;
  onSent: (result: { conversation: WaConversation; message: WaMessage }) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MetaTemplate[]>(fixedTemplate ? [fixedTemplate] : []);
  const [loading, setLoading] = useState(!fixedTemplate);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MetaTemplate | null>(fixedTemplate ?? null);
  const [bodyVals, setBodyVals] = useState<string[]>([]);
  const [headerVals, setHeaderVals] = useState<string[]>([]);
  const [buttonVals, setButtonVals] = useState<string[]>([]);
  const [headerMediaId, setHeaderMediaId] = useState("");
  const [headerFileName, setHeaderFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fixedTemplate) return;
    setLoading(true); setLoadError(null);
    whatsappApi.getMetaTemplates(phoneNumberId)
      .then((ts) => {
        const approved = ts.filter((t) => t.status === "APPROVED");
        setTemplates(approved);
        setSelected((cur) => (cur && approved.some((t) => t.id === cur.id) ? cur : approved.length === 1 ? approved[0] : null));
      })
      .catch(() => setLoadError("Não foi possível carregar os templates deste número. Confira o ID da conta (WABA) em WhatsApp › Números."))
      .finally(() => setLoading(false));
  }, [phoneNumberId, fixedTemplate]);

  const p = selected ? parts(selected) : null;
  useEffect(() => {
    setBodyVals(Array(p?.bodyVars ?? 0).fill(""));
    setHeaderVals(Array(p?.headerVars ?? 0).fill(""));
    setButtonVals(Array(p?.urlButtons.length ?? 0).fill(""));
    setHeaderMediaId(""); setHeaderFileName(""); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? templates.filter((t) => `${t.name} ${t.components.find((c) => c.type === "BODY")?.text ?? ""}`.toLowerCase().includes(q)) : templates;
  }, [templates, search]);

  const bodyText = p?.body?.text ? fill(p.body.text, bodyVals) : "";
  const headerText = p?.header?.format === "TEXT" && p.header.text ? fill(p.header.text, headerVals) : "";
  const missing = [...bodyVals, ...headerVals, ...buttonVals].some((v) => !v.trim()) || (!!p?.headerMediaType && !headerMediaId);
  const hasTarget = "conversationId" in target ? true : target.phone.replace(/\D/g, "").length >= 10;

  async function upload(file: File) {
    setUploading(true); setError(null);
    try {
      const { mediaId } = await whatsappApi.uploadMedia(file, phoneNumberId);
      setHeaderMediaId(mediaId); setHeaderFileName(file.name);
    } catch {
      setError("Erro ao enviar o arquivo do cabeçalho. Tente novamente.");
    } finally { setUploading(false); }
  }

  async function send() {
    if (!selected || !p || missing || !hasTarget || sending) return;
    setSending(true); setError(null);
    try {
      const result = await whatsappApi.sendTemplateMessage({
        ...("conversationId" in target ? { conversationId: target.conversationId } : { phone: target.phone.trim(), name: target.name?.trim() || undefined }),
        templateName: selected.name,
        language: selected.language,
        variables: bodyVals.map((v) => v.trim()),
        headerVariables: headerVals.length ? headerVals.map((v) => v.trim()) : undefined,
        buttonVariables: p.urlButtons.length ? p.urlButtons.map(({ index }, i) => ({ index, value: buttonVals[i].trim() })) : undefined,
        ...(p.headerMediaType && headerMediaId ? { headerMediaUrl: headerMediaId, headerMediaType: p.headerMediaType, headerFileName: headerFileName || undefined } : {}),
        ...(phoneNumberId ? { phoneNumberId } : {}),
        previewText: [headerText, bodyText].filter(Boolean).join("\n\n"),
      });
      onSent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar o template.");
    } finally { setSending(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner /> Carregando templates...</div>;
  }
  if (loadError) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{loadError}</p>;
  }
  if (!templates.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        Nenhum template aprovado neste número.{" "}
        {user?.role === "ADMIN" ? <>Crie um na aba <b>Templates</b> e aguarde a aprovação da Meta (até 24h).</> : "Peça ao administrador para criar um na aba Templates."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lista de templates */}
      {!fixedTemplate && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className={labelCls + " !mb-0"}>Escolha o template</label>
            <span className="text-[11px] text-gray-400">{templates.length} aprovado{templates.length === 1 ? "" : "s"}</span>
          </div>
          {templates.length > 4 && (
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar template..." className={inputCls + " mb-2 py-2"} />
          )}
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((t) => {
              const active = selected?.id === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setSelected(t)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${active
                    ? "border-green-400 bg-green-50 ring-1 ring-green-400/40 dark:border-green-600 dark:bg-green-900/20"
                    : "border-gray-200 hover:border-green-300 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-[13px] font-semibold text-gray-900 dark:text-white">{prettyTemplateName(t.name)}</span>
                    <span className="flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-gray-500 dark:text-gray-400">{t.components.find((c) => c.type === "BODY")?.text ?? ""}</p>
                </button>
              );
            })}
            {!filtered.length && <p className="py-3 text-center text-xs text-gray-400">Nenhum template com “{search}”.</p>}
          </div>
        </div>
      )}

      {selected && p && (
        <>
          {/* Campos */}
          {(p.headerMediaType || headerVals.length > 0 || bodyVals.length > 0 || buttonVals.length > 0) && (
            <div className="space-y-3">
              {p.headerMediaType && (
                <div>
                  <label className={labelCls}>{p.headerMediaType === "image" ? "Imagem" : p.headerMediaType === "video" ? "Vídeo" : "Documento (PDF)"} do cabeçalho *</label>
                  <input ref={fileRef} type="file" className="hidden"
                    accept={p.headerMediaType === "image" ? "image/*" : p.headerMediaType === "video" ? "video/*" : ".pdf,application/pdf,*/*"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 transition-colors hover:border-green-400 hover:text-green-600 disabled:opacity-50 dark:border-white/20 dark:bg-[#2a2d32] dark:text-gray-400">
                    {uploading ? <><Spinner /> Enviando arquivo...</>
                      : headerFileName ? <><span className="text-green-500">✓</span><span className="truncate text-green-600 dark:text-green-400">{headerFileName}</span><span className="ml-auto text-[10px] text-gray-400">Trocar</span></>
                      : "Clique para escolher o arquivo"}
                  </button>
                </div>
              )}
              {headerVals.map((v, i) => (
                <div key={`h${i}`}>
                  <label className={labelCls}>Título — {`{{${i + 1}}}`}</label>
                  <input value={v} onChange={(e) => setHeaderVals((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} />
                </div>
              ))}
              {bodyVals.map((v, i) => (
                <div key={`b${i}`}>
                  <label className={labelCls}>Variável {`{{${i + 1}}}`}</label>
                  <input value={v} onChange={(e) => setBodyVals((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={i === 0 ? "ex.: nome do cliente" : "Preencha"} className={inputCls} />
                </div>
              ))}
              {p.urlButtons.map(({ b }, i) => (
                <div key={`u${i}`}>
                  <label className={labelCls}>Link do botão “{b.text}” — complete o endereço</label>
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[45%] truncate text-[11px] text-gray-400" title={b.url}>{b.url?.replace(/\{\{\d+\}\}.*/, "")}</span>
                    <input value={buttonVals[i] ?? ""} onChange={(e) => setButtonVals((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Prévia como no WhatsApp */}
          <div className="rounded-2xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#667781]">Prévia</p>
            <div className="max-w-[92%] overflow-hidden rounded-xl rounded-tl-sm bg-[#ffffff] shadow-sm dark:bg-[#202c33]">
              {p.headerMediaType && (
                <div className="flex h-24 items-center justify-center bg-[#d1d7db] text-[11px] text-[#54656f] dark:bg-[#2a3942] dark:text-[#aebac1]">
                  {headerFileName ? `📎 ${headerFileName}` : p.headerMediaType === "image" ? "🖼 imagem" : p.headerMediaType === "video" ? "🎬 vídeo" : "📄 documento"}
                </div>
              )}
              <div className="px-3 py-2">
                {headerText && <p className="mb-1 text-[13.5px] font-bold text-[#111b21] dark:text-[#e9edef]">{headerText}</p>}
                <p className="whitespace-pre-wrap text-[13.5px] leading-snug text-[#111b21] dark:text-[#e9edef]">{bodyText}</p>
                {p.footer?.text && <p className="mt-1 text-[11.5px] text-[#667781]">{p.footer.text}</p>}
              </div>
              {p.buttons.length > 0 && (
                <div className="divide-y divide-[#e9edef] border-t border-[#e9edef] dark:divide-[#2a3942] dark:border-[#2a3942]">
                  {p.buttons.map((b, i) => <p key={i} className="py-2 text-center text-[13px] font-medium text-[#027eb5] dark:text-[#53bdeb]">{b.text}</p>)}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">Cancelar</button>
        <button type="button" onClick={send} disabled={!selected || missing || !hasTarget || sending}
          title={!selected ? "Escolha um template" : !hasTarget ? "Digite o número com DDD" : missing ? "Preencha todos os campos" : undefined}
          className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-40">
          {sending ? <><Spinner className="h-3.5 w-3.5" /> Enviando...</> : "Enviar template"}
        </button>
      </div>
    </div>
  );
}
