import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { crmApi } from "../api/crm";
import { usersApi } from "../api/users";
import type { Contact, CrmStageBase, DealActivity, DealDetail, TaskUserRef } from "../types";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function fmtDate(v: string) {
  return new Date(v).toLocaleDateString("pt-BR");
}

function fmtDateTime(v: string) {
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
      {initials(name)}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-[13px] text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 dark:bg-[#222426] dark:text-[#e0e0e2]";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";

export function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [stages, setStages] = useState<CrmStageBase[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<TaskUserRef[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [value, setValue] = useState(0);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [company, setCompany] = useState("GRAFINORTE");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Activities
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [newNote, setNewNote] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  // Stage move
  const [movingStage, setMovingStage] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);
  const [pendingLossStageId, setPendingLossStageId] = useState<string | null>(null);
  const [lossReasonInput, setLossReasonInput] = useState("");

  function populateForm(d: DealDetail) {
    setTitle(d.title);
    setContactId(d.contact.id);
    setOwnerId(d.owner.id);
    setValue(d.value);
    setExpectedCloseDate(d.expectedCloseDate ? d.expectedCloseDate.slice(0, 10) : "");
    setNextFollowUp(d.nextFollowUp ? d.nextFollowUp.slice(0, 10) : "");
    setNotes(d.notes ?? "");
    setLossReason(d.lossReason ?? "");
    setCompany(d.company ?? "GRAFINORTE");
    setDirty(false);
  }

  useEffect(() => {
    if (!dealId) return;
    setLoading(true);
    Promise.all([
      crmApi.getDeal(dealId),
      crmApi.listStages(),
      crmApi.listContacts(),
      usersApi.directory(),
    ])
      .then(([d, s, c, u]) => {
        setDeal(d);
        populateForm(d);
        setActivities(d.activities ?? []);
        setStages(s);
        setContacts(c);
        setUsers(u);
      })
      .catch(() => navigate("/comercial/funil"))
      .finally(() => setLoading(false));
  }, [dealId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      await crmApi.updateDeal(deal.id, {
        title,
        contactId,
        ownerId,
        value,
        expectedCloseDate: expectedCloseDate || null,
        nextFollowUp: nextFollowUp || null,
        notes: notes || null,
        lossReason: lossReason || null,
        company,
      });
      // Refresh deal to get updated data
      const updated = await crmApi.getDeal(deal.id);
      setDeal(updated);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function doMoveToStage(stageId: string, reason?: string) {
    if (!deal) return;
    setMovingStage(true);
    try {
      await crmApi.moveDeal(deal.id, stageId, 0);
      if (reason) await crmApi.updateDeal(deal.id, { lossReason: reason });
      const updated = await crmApi.getDeal(deal.id);
      setDeal(updated);
      populateForm(updated);
      setActivities(updated.activities ?? []);
    } finally {
      setMovingStage(false);
    }
  }

  function handleClickStage(stageId: string) {
    if (!deal || movingStage) return;
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.id === deal.stageId) return;
    if (stage.isClosed && !stage.isWon) {
      setPendingLossStageId(stageId);
      setShowLossModal(true);
    } else {
      doMoveToStage(stageId);
    }
  }

  async function handleConfirmLoss() {
    if (!pendingLossStageId) return;
    const reason = lossReasonInput.trim();
    await doMoveToStage(pendingLossStageId, reason || undefined);
    if (reason) setLossReason(reason);
    setShowLossModal(false);
    setPendingLossStageId(null);
    setLossReasonInput("");
  }

  async function handleAddNote() {
    if (!deal || !newNote.trim()) return;
    setPostingNote(true);
    try {
      const activity = await crmApi.addActivity(deal.id, newNote.trim());
      setActivities((prev) => [activity, ...prev]);
      setNewNote("");
    } finally {
      setPostingNote(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="text-[15px] text-[#46464a]">Carregando negócio...</p>
      </div>
    );
  }

  if (!deal) return null;

  const currentStage = stages.find((s) => s.id === deal.stageId);
  const currentOrder = currentStage?.order ?? -1;
  const wonStage = stages.find((s) => s.isClosed && s.isWon);
  const lostStage = stages.find((s) => s.isClosed && !s.isWon);
  const isWon = currentStage?.isClosed && currentStage.isWon;
  const isLost = currentStage?.isClosed && !currentStage.isWon;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-white px-5 py-3 dark:border-white/8 dark:bg-[#1c1e22]">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/comercial/funil")}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold text-[#030304] dark:text-[#e0e0e2]">{deal.title}</h1>
            <span className="inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
              Funil de Vendas
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {!isLost && lostStage && (
            <button
              onClick={() => { setPendingLossStageId(lostStage.id); setShowLossModal(true); }}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Marcar perda
            </button>
          )}
          {!isWon && wonStage && (
            <button
              onClick={() => handleClickStage(wonStage.id)}
              disabled={movingStage}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Marcar venda
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline bar ── */}
      <div className="flex-shrink-0 overflow-x-auto border-b border-[rgba(0,0,0,0.06)] bg-[#f9f9fb] px-4 py-2 dark:border-white/8 dark:bg-[#181a1e]">
        <div className="flex items-center gap-0.5">
          {stages.map((stage, idx, arr) => {
            const isCurrent = stage.id === deal.stageId;
            const isPast = stage.order < currentOrder && !isCurrent;
            const isLostS = stage.isClosed && !stage.isWon;
            const isWonS = stage.isClosed && stage.isWon;

            let bg = "";
            if (isCurrent) {
              bg = isLostS
                ? "bg-red-500 text-white"
                : isWonS
                ? "bg-green-600 text-white"
                : "bg-brand text-white";
            } else if (isPast) {
              bg = "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400";
            } else {
              bg = "bg-white text-[#77767b] hover:bg-[#eeeef0] dark:bg-[#1c1e22] dark:hover:bg-[#222426]";
            }

            return (
              <div key={stage.id} className="flex items-center">
                <button
                  onClick={() => handleClickStage(stage.id)}
                  disabled={movingStage || isCurrent}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all disabled:cursor-default ${bg}`}
                >
                  {stage.name}
                </button>
                {idx < arr.length - 1 && (
                  <svg className="h-3 w-3 flex-shrink-0 text-[rgba(0,0,0,0.15)] dark:text-white/15" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex w-72 flex-shrink-0 flex-col overflow-y-auto border-r border-[rgba(0,0,0,0.06)] bg-white px-5 py-5 dark:border-white/8 dark:bg-[#1c1e22]">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-wider text-[#46464a]">Negociação</p>
          <div className="space-y-3.5">
            {/* Empresa */}
            <div>
              <label className={labelCls}>Empresa</label>
              <div className="mt-1.5 flex gap-2">
                {[
                  { id: "GRAFINORTE", label: "Grafinorte", logo: "/assets/fav-grafinorte.png" },
                  { id: "PLUSPACK",   label: "Pluspack",   logo: "/assets/fav-pluspack.png" },
                ].map((c) => {
                  const active = company === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCompany(c.id); setDirty(true); }}
                      className={`flex flex-1 items-center gap-1.5 rounded-xl border-2 px-2 py-2 transition-all ${
                        active
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-[rgba(199,198,202,0.3)] bg-white hover:border-blue-300 dark:bg-[#23252a] dark:border-white/8"
                      }`}
                    >
                      <img src={c.logo} alt={c.label} className="h-6 w-6 rounded-md object-contain" />
                      <span className={`text-[12px] font-semibold ${active ? "text-blue-700 dark:text-blue-300" : "text-on-surface dark:text-white"}`}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={labelCls}>Nome</label>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contato</label>
              <select value={contactId} onChange={(e) => { setContactId(e.target.value); setDirty(true); }} className={inputCls}>
                <option value="">Selecione...</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Responsável</label>
              <select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setDirty(true); }} className={inputCls}>
                <option value="">Selecione...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <input
                type="number" step="0.01" min="0"
                value={value}
                onChange={(e) => { setValue(Number(e.target.value) || 0); setDirty(true); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Previsão de fechamento</label>
              <input type="date" value={expectedCloseDate} onChange={(e) => { setExpectedCloseDate(e.target.value); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Próximo contato</label>
              <input type="date" value={nextFollowUp} onChange={(e) => { setNextFollowUp(e.target.value); setDirty(true); }} className={inputCls} />
            </div>
            {(isLost || !!lossReason) && (
              <div>
                <label className={labelCls}>Motivo da perda</label>
                <input value={lossReason} onChange={(e) => { setLossReason(e.target.value); setDirty(true); }} placeholder="Ex: Preço, prazo..." className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Notas</label>
              <textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} className={inputCls} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>

            <div className="space-y-1.5 border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-white/8">
              <div className="flex justify-between text-[12px]">
                <span className="text-[#77767b]">Criado em</span>
                <span className="text-[#46464a] dark:text-[#a0a0a4]">{fmtDate(deal.createdAt)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-[#77767b]">Criado por</span>
                <span className="text-[#46464a] dark:text-[#a0a0a4]">{deal.createdBy.name}</span>
              </div>
              {deal.value > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#77767b]">Valor</span>
                  <span className="font-semibold text-[#030304] dark:text-[#e0e0e2]">
                    {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              )}
              {deal.quote && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#77767b]">Orçamento</span>
                  <span className="text-brand">Nº {deal.quote.number}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: activity area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#f9f9fb] dark:bg-[#181a1e]">
          {/* Tab bar */}
          <div className="border-b border-[rgba(0,0,0,0.06)] bg-white px-5 dark:border-white/8 dark:bg-[#1c1e22]">
            <button className="border-b-2 border-brand px-4 py-3 text-[13px] font-medium text-brand">
              Histórico
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto p-5">
            {/* Add note */}
            <div className="mb-5 flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddNote()}
                placeholder="Adicionar anotação, ligação, reunião..."
                className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-4 py-2.5 text-[13px] text-[#1a1c1d] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 dark:bg-[#1c1e22] dark:text-[#e0e0e2]"
              />
              <button
                onClick={handleAddNote}
                disabled={postingNote || !newNote.trim()}
                className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-brand/90 disabled:opacity-40"
              >
                {postingNote ? "..." : "Adicionar"}
              </button>
            </div>

            {/* Activity feed */}
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="glass-card smooth-shadow rounded-2xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={a.author.name} avatarUrl={a.author.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#1a1c1d] dark:text-[#e0e0e2]">{a.author.name}</span>
                        <span className="flex-shrink-0 text-[11px] text-[#77767b]">{fmtDateTime(a.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[13px] text-[#46464a] dark:text-[#a0a0a4]">{a.body}</p>
                    </div>
                  </div>
                </div>
              ))}

              {activities.length === 0 && (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f3f5] dark:bg-[#222426]">
                    <svg className="h-6 w-6 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-[#77767b]">Nenhuma atividade registrada ainda.</p>
                  <p className="mt-0.5 text-[12px] text-[#77767b]">Adicione uma anotação acima.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Loss reason modal ── */}
      {showLossModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1c1e22]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Marcar como perdido?</h3>
            <p className="mt-1 text-[13px] text-[#77767b]">O negócio será movido para a etapa de perdidos.</p>
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                Motivo da perda <span className="font-normal normal-case">(opcional)</span>
              </label>
              <input
                autoFocus
                value={lossReasonInput}
                onChange={(e) => setLossReasonInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmLoss()}
                placeholder="Ex: Preço, prazo, concorrente..."
                className="w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 text-sm text-[#1a1c1d] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:bg-[#222426] dark:text-[#e0e0e2]"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={handleConfirmLoss}
                disabled={movingStage}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {movingStage ? "Salvando..." : "Confirmar perda"}
              </button>
              <button
                onClick={() => { setShowLossModal(false); setPendingLossStageId(null); setLossReasonInput(""); }}
                className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
