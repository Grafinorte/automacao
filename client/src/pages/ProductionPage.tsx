import { useEffect, useState } from "react";
import { productionApi, type ProductionOrder, type ProdStatus, type ProdPriority } from "../api/production";
import { useAuth } from "../context/AuthContext";

const STAGES: { key: ProdStatus; label: string; color: string; bg: string }[] = [
  { key: "ARTE",      label: "Arte",      color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800" },
  { key: "IMPRESSAO", label: "Impressão", color: "text-blue-700 dark:text-blue-300",   bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  { key: "ACABAMENTO",label: "Acabamento",color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  { key: "ENTREGA",   label: "Entrega",   color: "text-green-700 dark:text-green-300", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  { key: "CONCLUIDO", label: "Concluído", color: "text-gray-500 dark:text-gray-400",   bg: "bg-gray-50 dark:bg-[#1c1e22] border-gray-200 dark:border-white/8" },
];

const PRIORITY_MAP: Record<ProdPriority, { label: string; cls: string }> = {
  BAIXA:   { label: "Baixa",   cls: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400" },
  NORMAL:  { label: "Normal",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  ALTA:    { label: "Alta",    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  URGENTE: { label: "Urgente", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR");
}

function isOverdue(dueDate: string | null, status: ProdStatus) {
  if (!dueDate || status === "CONCLUIDO" || status === "CANCELADO") return false;
  return new Date(dueDate) < new Date();
}

export function ProductionPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "ADMIN";

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // new order modal
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newPriority, setNewPriority] = useState<ProdPriority>("NORMAL");
  const [newDue, setNewDue] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  // detail/edit modal
  const [detail, setDetail] = useState<ProductionOrder | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  function reload() {
    productionApi.list().then((data) => { setOrders(data); setLoading(false); });
  }
  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNewError(null);
    setNewSaving(true);
    try {
      const order = await productionApi.create({
        title: newTitle,
        clientName: newClient,
        priority: newPriority,
        dueDate: newDue || null,
        notes: newNotes || null,
      });
      setOrders((prev) => [order, ...prev]);
      setShowNew(false);
      setNewTitle(""); setNewClient(""); setNewPriority("NORMAL"); setNewDue(""); setNewNotes("");
    } catch (err) {
      setNewError(err instanceof Error ? err.message : "Erro ao criar ordem");
    } finally {
      setNewSaving(false);
    }
  }

  async function handleAdvance(id: string) {
    try {
      const updated = await productionApi.advance(id);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
      if (detail?.id === id) setDetail(updated);
    } catch {}
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancelar esta ordem?")) return;
    try {
      const updated = await productionApi.cancel(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      if (detail?.id === id) setDetail(null);
      void updated;
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta ordem permanentemente?")) return;
    try {
      await productionApi.remove(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch {}
  }

  async function handleSaveNotes() {
    if (!detail) return;
    setEditSaving(true);
    try {
      const updated = await productionApi.update(detail.id, { notes: editNotes });
      setOrders((prev) => prev.map((o) => (o.id === detail.id ? updated : o)));
      setDetail(updated);
    } finally {
      setEditSaving(false);
    }
  }

  function openDetail(order: ProductionOrder) {
    setDetail(order);
    setEditNotes(order.notes ?? "");
  }

  const byStage = (stage: ProdStatus) => orders.filter((o) => o.status === stage);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-end justify-between border-b border-[rgba(0,0,0,0.06)] bg-white px-8 py-6 dark:border-white/8 dark:bg-[#141618]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">Gráfica</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-[#030304] dark:text-white">Produção</h1>
          <p className="mt-1 text-[15px] text-[#46464a] dark:text-[#a0a0a4]">Acompanhe cada etapa das ordens de serviço.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-[#030304] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-[#1d1d1f] active:scale-[0.98] dark:bg-white dark:text-[#030304] dark:hover:bg-[#e5e5e5]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Nova Ordem
        </button>
      </div>

      {/* Kanban */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-6">
        {STAGES.map((stage) => {
          const stageOrders = byStage(stage.key);
          const isFinal = stage.key === "CONCLUIDO";
          return (
            <div key={stage.key} className="flex w-72 flex-shrink-0 flex-col rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#f9f9fb] dark:border-white/6 dark:bg-[#1a1c20]">
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${stage.key === "ARTE" ? "bg-purple-500" : stage.key === "IMPRESSAO" ? "bg-blue-500" : stage.key === "ACABAMENTO" ? "bg-amber-500" : stage.key === "ENTREGA" ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className={`text-[13px] font-semibold ${stage.color}`}>{stage.label}</span>
                </div>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgba(0,0,0,0.06)] px-1.5 text-[11px] font-semibold text-[#46464a] dark:bg-white/10 dark:text-[#a0a0a4]">
                  {stageOrders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
                {loading && stageOrders.length === 0 && stage.key === "ARTE" && (
                  <p className="py-8 text-center text-[13px] text-[#77767b]">Carregando...</p>
                )}
                {stageOrders.map((order) => {
                  const overdue = isOverdue(order.dueDate, order.status);
                  const prio = PRIORITY_MAP[order.priority];
                  return (
                    <div
                      key={order.id}
                      onClick={() => openDetail(order)}
                      className="cursor-pointer rounded-xl border border-[rgba(0,0,0,0.07)] bg-white p-3.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 dark:border-white/8 dark:bg-[#222426]"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#77767b] dark:text-[#a0a0a4]">#{order.number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${prio.cls}`}>{prio.label}</span>
                      </div>
                      <p className="mb-1 text-[13px] font-semibold leading-snug text-[#030304] dark:text-white">{order.title}</p>
                      <p className="mb-2.5 text-[12px] text-[#46464a] dark:text-[#a0a0a4]">{order.clientName}</p>
                      {order.dueDate && (
                        <div className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? "text-red-600" : "text-[#77767b] dark:text-[#a0a0a4]"}`}>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                          {overdue ? "Atrasado · " : ""}{formatDate(order.dueDate)}
                        </div>
                      )}
                      {/* Advance button */}
                      {!isFinal && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAdvance(order.id); }}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] py-1.5 text-[11px] font-semibold text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-white/5"
                        >
                          Avançar etapa
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
                {!loading && stageOrders.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <p className="text-[12px] text-[#c7c6ca]">Sem ordens</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Order Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]">
            <h3 className="mb-4 text-[17px] font-semibold text-[#030304] dark:text-white">Nova Ordem de Produção</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Título / Serviço</label>
                <input
                  type="text" placeholder="Ex: Impressão de Banner 3x2m" value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)} required
                  className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Cliente</label>
                <input
                  type="text" placeholder="Nome do cliente" value={newClient}
                  onChange={(e) => setNewClient(e.target.value)} required
                  className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Prioridade</label>
                  <select
                    value={newPriority} onChange={(e) => setNewPriority(e.target.value as ProdPriority)}
                    className="w-full rounded-xl border border-[#e0e0e2] px-3 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="NORMAL">Normal</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Prazo</label>
                  <input
                    type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                    className="w-full rounded-xl border border-[#e0e0e2] px-3 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Observações</label>
                <textarea
                  placeholder="Detalhes, materiais, instruções..." value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)} rows={3}
                  className="w-full resize-none rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
                />
              </div>
              {newError && <p className="text-[13px] text-red-600">{newError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowNew(false)}
                  className="flex-1 rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a] dark:border-white/12 dark:text-[#a0a0a4]">
                  Cancelar
                </button>
                <button type="submit" disabled={newSaving}
                  className="flex-1 rounded-xl bg-[#030304] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#030304]">
                  {newSaving ? "Criando..." : "Criar ordem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]" onClick={(e) => e.stopPropagation()}>
            {/* Title row */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-[#77767b] dark:text-[#a0a0a4]">Ordem #{detail.number}</p>
                <h3 className="mt-0.5 text-[18px] font-semibold text-[#030304] dark:text-white">{detail.title}</h3>
                <p className="text-[14px] text-[#46464a] dark:text-[#a0a0a4]">{detail.clientName}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-white/5">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Status breadcrumb */}
            <div className="mb-5 flex items-center gap-1 overflow-x-auto">
              {STAGES.filter((s) => s.key !== "CONCLUIDO").map((s, i) => {
                const idx = STAGES.findIndex((x) => x.key === detail.status);
                const sIdx = STAGES.findIndex((x) => x.key === s.key);
                const isDone = sIdx <= idx;
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    {i > 0 && <svg className="h-3 w-3 flex-shrink-0 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isDone ? s.color + " bg-opacity-10 " + s.bg : "text-[#77767b] bg-[#f3f3f5] dark:text-[#a0a0a4] dark:bg-white/5"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Meta */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#f9f9fb] p-3 dark:bg-[#222426]">
                <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">Prioridade</p>
                <p className={`mt-0.5 text-[13px] font-semibold ${PRIORITY_MAP[detail.priority].cls.split(" ").slice(2).join(" ")}`}>
                  {PRIORITY_MAP[detail.priority].label}
                </p>
              </div>
              <div className="rounded-xl bg-[#f9f9fb] p-3 dark:bg-[#222426]">
                <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">Prazo</p>
                <p className={`mt-0.5 text-[13px] font-semibold ${isOverdue(detail.dueDate, detail.status) ? "text-red-600" : "text-[#030304] dark:text-white"}`}>
                  {detail.dueDate ? formatDate(detail.dueDate) : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-[#f9f9fb] p-3 dark:bg-[#222426]">
                <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">Criada por</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#030304] dark:text-white">{detail.createdBy.name}</p>
              </div>
              <div className="rounded-xl bg-[#f9f9fb] p-3 dark:bg-[#222426]">
                <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">Data criação</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#030304] dark:text-white">{formatDate(detail.createdAt)}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className="mb-1.5 block text-[12px] font-medium text-[#46464a] dark:text-[#a0a0a4]">Observações</label>
              <textarea
                value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                placeholder="Adicionar observações..."
                className="w-full resize-none rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] text-[#030304] focus:border-[#2563eb] focus:outline-none dark:border-white/12 dark:bg-[#222426] dark:text-white"
              />
              {editNotes !== (detail.notes ?? "") && (
                <button onClick={handleSaveNotes} disabled={editSaving}
                  className="mt-2 rounded-lg bg-[#030304] px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#030304]">
                  {editSaving ? "Salvando..." : "Salvar"}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {detail.status !== "CONCLUIDO" && detail.status !== "CANCELADO" && (
                <button
                  onClick={() => handleAdvance(detail.id)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#030304] px-4 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-[#030304]"
                >
                  Avançar etapa
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </button>
              )}
              {detail.status !== "CANCELADO" && detail.status !== "CONCLUIDO" && (
                <button onClick={() => handleCancel(detail.id)}
                  className="rounded-xl border border-[#e0e0e2] px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/12 dark:text-[#a0a0a4] dark:hover:bg-white/5">
                  Cancelar ordem
                </button>
              )}
              {canDelete && (
                <button onClick={() => handleDelete(detail.id)}
                  className="ml-auto rounded-xl px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
