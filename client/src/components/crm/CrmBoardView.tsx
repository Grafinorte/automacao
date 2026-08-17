import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { crmApi } from "../../api/crm";
import { quotesApi } from "../../api/quotes";
import { usersApi } from "../../api/users";
import type { Contact, CrmStage, Deal, QuoteListItem, TaskUserRef } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { useCrmOwnerFilter } from "../../hooks/useCrmOwnerFilter";
import { StageColumn } from "./StageColumn";
import { DealDetailModal, type DealFormValues } from "./DealDetailModal";
import { CrmSubNav } from "./CrmSubNav";
import { CrmOwnerFilterSelect } from "./CrmOwnerFilterSelect";
import { Button } from "../common/Button";

interface PendingLostMove {
  dealId: string;
  toStageId: string;
  toIndex: number;
  dealTitle: string;
}

export function CrmBoardView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const { owner, setOwner, salespeople } = useCrmOwnerFilter();
  const [stages, setStages] = useState<CrmStage[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<TaskUserRef[]>([]);
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [activeDeal, setActiveDeal] = useState<"new" | null>(null);
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBoard(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "right" ? 340 : -340, behavior: "smooth" });
  }

  async function handleExport() {
    const params = owner ? `?owner=${encodeURIComponent(owner)}` : "";
    const res = await fetch(`/api/crm/deals/export${params}`, { credentials: "include" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cd = res.headers.get("Content-Disposition") ?? "";
    a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? "leads-crm.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  const [newStageName, setNewStageName] = useState("");
  const [pendingLostMove, setPendingLostMove] = useState<PendingLostMove | null>(null);
  const [lossReason, setLossReason] = useState("");

  const reload = useCallback(async () => {
    const data = await crmApi.getBoard(owner);
    setStages(data);
  }, [owner]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    crmApi.listContacts().then(setContacts).catch(() => setContacts([]));
    usersApi.directory().then(setUsers).catch(() => setUsers([]));
    quotesApi.list().then(setQuotes).catch(() => setQuotes([]));
  }, []);

  function onDragEnd(result: DropResult) {
    if (!stages || !result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const destStage = stages.find((s) => s.id === destination.droppableId);

    // Intercept drag to "Perdido" stage — show loss reason modal first
    if (destStage?.isClosed && !destStage.isWon) {
      const allDeals = stages.flatMap((s) => s.deals);
      const movedDeal = allDeals.find((d) => d.id === draggableId);
      setPendingLostMove({
        dealId: draggableId,
        toStageId: destination.droppableId,
        toIndex: destination.index,
        dealTitle: movedDeal?.title ?? "este negócio",
      });
      return;
    }

    // Normal move — optimistic update
    setStages((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s, deals: [...s.deals] }));
      const srcStage = next.find((s) => s.id === source.droppableId)!;
      const dst = next.find((s) => s.id === destination.droppableId)!;
      const [moved] = srcStage.deals.splice(source.index, 1);
      moved.stageId = dst.id;
      dst.deals.splice(destination.index, 0, moved);
      return next;
    });

    crmApi.moveDeal(draggableId, destination.droppableId, destination.index).catch(() => {
      setError("Não foi possível salvar a movimentação. Atualizando o quadro...");
      reload();
    });
  }

  async function handleConfirmLost() {
    if (!pendingLostMove) return;
    const { dealId, toStageId, toIndex } = pendingLostMove;
    const reason = lossReason.trim() || null;

    // Optimistic update
    setStages((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s, deals: [...s.deals] }));
      const srcStage = next.find((s) => s.deals.some((d) => d.id === dealId));
      const dstStage = next.find((s) => s.id === toStageId);
      if (!srcStage || !dstStage) return next;
      const idx = srcStage.deals.findIndex((d) => d.id === dealId);
      const [moved] = srcStage.deals.splice(idx, 1);
      moved.stageId = toStageId;
      dstStage.deals.splice(toIndex, 0, moved);
      return next;
    });

    setPendingLostMove(null);
    setLossReason("");

    try {
      await crmApi.moveDeal(dealId, toStageId, toIndex);
      if (reason) await crmApi.updateDeal(dealId, { lossReason: reason });
    } catch {
      setError("Não foi possível salvar a movimentação. Atualizando o quadro...");
      reload();
    }
  }

  function handleCancelLost() {
    setPendingLostMove(null);
    setLossReason("");
  }

  async function handleRenameStage(stageId: string, name: string) {
    await crmApi.renameStage(stageId, name);
    reload();
  }

  async function handleMoveStage(stageId: string, direction: -1 | 1) {
    if (!stages) return;
    const ids = stages.map((s) => s.id);
    const index = ids.indexOf(stageId);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    await crmApi.reorderStages(ids);
    reload();
  }

  async function handleAddStage() {
    if (!newStageName.trim()) return;
    await crmApi.addStage(newStageName.trim());
    setNewStageName("");
    setAddingStage(false);
    reload();
  }

  async function handleSaveDeal(values: DealFormValues) {
    if (activeDeal === "new" && newDealStageId) {
      await crmApi.createDeal({
        title: values.title,
        contactId: values.contactId,
        stageId: newDealStageId,
        value: values.value,
        expectedCloseDate: values.expectedCloseDate || null,
        notes: values.notes || null,
        ownerId: values.ownerId,
        nextFollowUp: values.nextFollowUp || null,
        lossReason: values.lossReason || null,
        company: values.company,
      });
    }
    setActiveDeal(null);
    setNewDealStageId(null);
    reload();
  }

  if (!stages) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center">
        <p className="text-[15px] text-[#46464a]">Carregando funil de vendas...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[rgba(199,198,202,0.3)] bg-white px-6 py-3.5 dark:border-white/8 dark:bg-[#1c1e22]">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-[#030304] dark:text-[#e0e0e2]">CRM</h1>
          </div>
          {isAdmin && user && (
            <CrmOwnerFilterSelect
              owner={owner}
              onChange={setOwner}
              salespeople={salespeople}
              currentUserId={user.id}
            />
          )}
        </div>

        {/* Scroll arrows + sub-nav pills */}
        <div className="flex items-center gap-2">
          <CrmSubNav compact />
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-[rgba(199,198,202,0.4)] bg-white px-3 py-1.5 text-[12px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:border-white/10 dark:bg-[#222426] dark:text-[#a0a0a4] dark:hover:bg-[#2a2c30]"
            title="Exportar leads para planilha CSV"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exportar
          </button>

          <div className="flex items-center gap-1 border-l border-[rgba(199,198,202,0.4)] pl-3 dark:border-white/8">
            <button
              onClick={() => scrollBoard("left")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(199,198,202,0.4)] bg-white text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:border-white/10 dark:bg-[#222426] dark:text-[#a0a0a4] dark:hover:bg-[#2a2c30]"
              title="Rolar para esquerda"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => scrollBoard("right")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(199,198,202,0.4)] bg-white text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:border-white/10 dark:bg-[#222426] dark:text-[#a0a0a4] dark:hover:bg-[#2a2c30]"
              title="Rolar para direita"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {isAdmin && stages.length === 0 && (
        <div className="mx-6 mt-4 flex flex-shrink-0 items-center gap-4 rounded-2xl border border-dashed border-brand/30 bg-brand/5 px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Nenhum estágio criado</p>
            <p className="text-[13px] text-[#77767b]">Configure o funil padrão com os estágios recomendados para gráfica.</p>
          </div>
          <button
            onClick={async () => { await crmApi.setupDefaultStages(); reload(); }}
            className="ml-auto flex-shrink-0 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand/90"
          >
            Configurar funil padrão
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div ref={scrollRef} className="flex flex-1 gap-4 overflow-x-auto px-6 py-4"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(199,198,202,0.5) transparent" }}>
          {stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage, idx) => (
              <div key={stage.id} className="flex flex-col">
                <StageColumn
                  stage={stage}
                  canMoveLeft={idx > 0}
                  canMoveRight={idx < stages.length - 1}
                  onRename={(name) => handleRenameStage(stage.id, name)}
                  onMoveLeft={() => handleMoveStage(stage.id, -1)}
                  onMoveRight={() => handleMoveStage(stage.id, 1)}
                  onDealClick={(deal: Deal) => navigate(`/comercial/deals/${deal.id}`)}
                />
                <Button
                  variant="ghost"
                  className="mt-1 w-72 justify-center rounded-xl border border-dashed border-[rgba(199,198,202,0.4)] text-[#77767b] dark:border-white/10"
                  onClick={() => {
                    setNewDealStageId(stage.id);
                    setActiveDeal("new");
                  }}
                >
                  + Novo negócio
                </Button>
              </div>
            ))}

          {isAdmin && (
            <div className="w-72 flex-shrink-0">
              {addingStage ? (
                <div className="rounded-xl bg-[#f3f3f5] p-3 dark:bg-[#1c1e22]">
                  <input
                    autoFocus
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
                    placeholder="Nome do estágio"
                    className="mb-2 w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-1.5 text-sm text-[#1a1c1d] outline-none focus:border-brand"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddStage}>Adicionar</Button>
                    <Button variant="secondary" onClick={() => setAddingStage(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-center rounded-xl border border-dashed border-[rgba(199,198,202,0.4)] text-[#77767b] dark:border-white/10"
                  onClick={() => setAddingStage(true)}
                >
                  + Novo estágio
                </Button>
              )}
            </div>
          )}
        </div>
      </DragDropContext>

      {/* New deal modal */}
      {activeDeal === "new" && (
        <DealDetailModal
          deal="new"
          contacts={contacts}
          users={users}
          quotes={quotes}
          onClose={() => { setActiveDeal(null); setNewDealStageId(null); }}
          onSave={handleSaveDeal}
        />
      )}

      {/* Loss reason modal */}
      {pendingLostMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1c1e22]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-semibold text-[#030304]">Marcar como perdido?</h3>
            <p className="mt-1 text-[13px] text-[#77767b]">
              <span className="font-medium text-[#1a1c1d]">"{pendingLostMove.dealTitle}"</span> será movido para a etapa de perdidos.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                Motivo da perda <span className="normal-case font-normal">(opcional)</span>
              </label>
              <input
                autoFocus
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmLost()}
                placeholder="Ex: Preço, prazo, optou por concorrente..."
                className="w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 text-sm text-[#1a1c1d] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:bg-[#222426]"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={handleConfirmLost}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.98]"
              >
                Confirmar perda
              </button>
              <button
                onClick={handleCancelLost}
                className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
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
