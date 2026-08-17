import { useState, type FormEvent } from "react";
import { crmApi } from "../../api/crm";
import { quotesApi } from "../../api/quotes";
import type { Contact, DealActivity, DealDetail, QuoteListItem, TaskUserRef } from "../../types";
import { Button } from "../common/Button";
import { Avatar } from "../common/Avatar";

export interface DealFormValues {
  title: string;
  contactId: string;
  value: number;
  expectedCloseDate: string;
  ownerId: string;
  notes: string;
  nextFollowUp: string;
  lossReason: string;
  company: string;
}

const CRM_COMPANIES = [
  { id: "GRAFINORTE", label: "Grafinorte", logo: "/assets/fav-grafinorte.png" },
  { id: "PLUSPACK",   label: "Pluspack",   logo: "/assets/fav-pluspack.png" },
] as const;

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function DealDetailModal({
  deal,
  contacts,
  users,
  quotes,
  onClose,
  onSave,
  onDelete,
  onQuoteLinked,
}: {
  deal: DealDetail | "new";
  contacts: Contact[];
  users: TaskUserRef[];
  quotes: QuoteListItem[];
  onClose: () => void;
  onSave: (values: DealFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onQuoteLinked?: () => void;
}) {
  const isNew = deal === "new";
  const [values, setValues] = useState<DealFormValues>(
    isNew
      ? { title: "", contactId: "", value: 0, expectedCloseDate: "", ownerId: "", notes: "", nextFollowUp: "", lossReason: "", company: "GRAFINORTE" }
      : {
          title: deal.title,
          contactId: deal.contact.id,
          value: deal.value,
          expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : "",
          ownerId: deal.owner.id,
          notes: deal.notes ?? "",
          nextFollowUp: deal.nextFollowUp ? deal.nextFollowUp.slice(0, 10) : "",
          lossReason: deal.lossReason ?? "",
          company: deal.company ?? "GRAFINORTE",
        }
  );
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState<DealActivity[]>(!isNew ? deal.activities : []);
  const [newNote, setNewNote] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [quoteId, setQuoteId] = useState<string>(!isNew ? deal.quote?.id ?? "" : "");
  const [linkingQuote, setLinkingQuote] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || (!isNew && !values.contactId) || !values.ownerId) return;
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote() {
    if (isNew || !newNote.trim()) return;
    setPostingNote(true);
    try {
      const activity = await crmApi.addActivity(deal.id, newNote.trim());
      setActivities((prev) => [activity, ...prev]);
      setNewNote("");
    } finally {
      setPostingNote(false);
    }
  }

  async function handleLinkQuote(newQuoteId: string) {
    if (isNew) return;
    setLinkingQuote(true);
    try {
      await crmApi.updateDeal(deal.id, { quoteId: newQuoteId || null });
      setQuoteId(newQuoteId);
      onQuoteLinked?.();
    } finally {
      setLinkingQuote(false);
    }
  }

  const linkedQuote = quotes.find((q) => q.id === quoteId);

  const inputCls =
    "mt-1 w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[17px] font-semibold text-[#030304]">
            {isNew ? "Novo negócio" : "Detalhes do negócio"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] transition-colors hover:bg-[#f3f3f5] hover:text-[#1a1c1d] dark:hover:bg-[#222426]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Empresa */}
            <div>
              <label className={labelCls}>Empresa</label>
              <div className="mt-1.5 flex gap-2">
                {CRM_COMPANIES.map((c) => {
                  const active = values.company === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, company: c.id }))}
                      className={`flex flex-1 items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        active
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-[rgba(199,198,202,0.3)] bg-white hover:border-blue-300 dark:bg-[#23252a] dark:border-white/8 dark:hover:border-blue-600"
                      }`}
                    >
                      <img src={c.logo} alt={c.label} className="h-7 w-7 rounded-md object-contain" />
                      <span className={`text-[13px] font-semibold ${active ? "text-blue-700 dark:text-blue-300" : "text-on-surface dark:text-white"}`}>
                        {c.label}
                      </span>
                      {active && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Título */}
            <div>
              <label className={labelCls}>Título</label>
              <input
                autoFocus
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                placeholder="Ex: Empresa ABC — Banners"
                className={inputCls}
              />
            </div>

            {/* Contato + Responsável */}
            {isNew ? (
              <div>
                <label className={labelCls}>Responsável</label>
                <select
                  value={values.ownerId}
                  onChange={(e) => setValues((v) => ({ ...v, ownerId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Selecione...</option>
                  {users.filter((u) => !u.role || u.role === "COMERCIAL" || u.role === "ADMIN").map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Contato</label>
                  <select
                    value={values.contactId}
                    onChange={(e) => setValues((v) => ({ ...v, contactId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Selecione...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.company ? ` (${c.company})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Responsável</label>
                  <select
                    value={values.ownerId}
                    onChange={(e) => setValues((v) => ({ ...v, ownerId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Selecione...</option>
                    {users.filter((u) => !u.role || u.role === "COMERCIAL" || u.role === "ADMIN").map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Valor + Previsão */}
            {isNew ? (
              <div>
                <label className={labelCls}>Previsão de fechamento</label>
                <input
                  type="date"
                  value={values.expectedCloseDate}
                  onChange={(e) => setValues((v) => ({ ...v, expectedCloseDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={values.value}
                    onChange={(e) => setValues((v) => ({ ...v, value: Number(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Previsão de fechamento</label>
                  <input
                    type="date"
                    value={values.expectedCloseDate}
                    onChange={(e) => setValues((v) => ({ ...v, expectedCloseDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* Follow-up + Motivo de perda */}
            {isNew ? (
              <div>
                <label className={labelCls}>Motivo de perda</label>
                <input
                  value={values.lossReason}
                  onChange={(e) => setValues((v) => ({ ...v, lossReason: e.target.value }))}
                  placeholder="Ex: Preço, prazo, concorrente..."
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Próximo contato</label>
                  <input
                    type="date"
                    value={values.nextFollowUp}
                    onChange={(e) => setValues((v) => ({ ...v, nextFollowUp: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Motivo de perda</label>
                  <input
                    value={values.lossReason}
                    onChange={(e) => setValues((v) => ({ ...v, lossReason: e.target.value }))}
                    placeholder="Ex: Preço, prazo, concorrente..."
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className={labelCls}>Notas</label>
              <textarea
                value={values.notes}
                onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                rows={2}
                className={inputCls}
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] pt-4 dark:border-white/8">
              {!isNew && onDelete ? (
                <Button type="button" variant="danger" onClick={onDelete}>Excluir</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={saving || !values.title.trim() || (!isNew && !values.contactId)}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </form>

          {!isNew && (
            <>
              {/* Orçamento vinculado */}
              <div className="mt-5 border-t border-[rgba(0,0,0,0.06)] pt-5 dark:border-white/8">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                  Orçamento vinculado
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={quoteId}
                    onChange={(e) => handleLinkQuote(e.target.value)}
                    disabled={linkingQuote}
                    className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                  >
                    <option value="">Nenhum orçamento vinculado</option>
                    {quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        Nº {q.number} · {q.clientName} · {formatCurrency(q.total)}
                      </option>
                    ))}
                  </select>
                  {linkedQuote && (
                    <a href={quotesApi.pdfUrl(linkedQuote.id)} target="_blank" rel="noreferrer" className="flex-shrink-0">
                      <Button type="button" variant="secondary">Ver PDF</Button>
                    </a>
                  )}
                  <a href="/orcamentos/novo" target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <Button type="button" variant="secondary">+ Orçamento</Button>
                  </a>
                </div>
              </div>

              {/* Histórico */}
              <div className="mt-5 border-t border-[rgba(0,0,0,0.06)] pt-5 dark:border-white/8">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                  Histórico de atividades
                </h3>
                <div className="mb-4 flex gap-2">
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                    placeholder="Registrar nota, ligação, reunião..."
                    className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                  />
                  <Button type="button" disabled={postingNote || !newNote.trim()} onClick={handleAddNote}>
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-2.5">
                      <Avatar name={activity.author.name} avatarUrl={activity.author.avatarUrl} />
                      <div className="flex-1 rounded-xl bg-[#f9f9fb] px-3 py-2.5 dark:bg-[#222426]">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-[#1a1c1d]">{activity.author.name}</span>
                          <span className="text-[11px] text-[#77767b]">{formatDateTime(activity.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-[13px] text-[#46464a]">{activity.body}</p>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="py-4 text-center text-[13px] text-[#77767b]">Nenhuma atividade registrada ainda.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
