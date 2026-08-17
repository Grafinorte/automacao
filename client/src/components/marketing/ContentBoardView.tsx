import { useCallback, useEffect, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { marketingApi } from "../../api/marketing";
import { usersApi } from "../../api/users";
import type { Campaign, ContentBoardColumn as ContentBoardColumnType, ContentItem, ContentStatus, TaskUserRef } from "../../types";
import { ContentColumn } from "./ContentColumn";
import { ContentDetailModal, type ContentFormValues } from "./ContentDetailModal";
import { MarketingSubNav } from "./MarketingSubNav";
import { Button } from "../common/Button";

export function ContentBoardView() {
  const [columns, setColumns] = useState<ContentBoardColumnType[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<TaskUserRef[]>([]);
  const [activeItem, setActiveItem] = useState<ContentItem | "new" | null>(null);
  const [newItemStatus, setNewItemStatus] = useState<ContentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await marketingApi.getContentBoard();
    setColumns(data);
  }, []);

  useEffect(() => {
    reload();
    marketingApi.listCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    usersApi.directory().then(setUsers).catch(() => setUsers([]));
  }, [reload]);

  function onDragEnd(result: DropResult) {
    if (!columns || !result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    setColumns((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const sourceCol = next.find((c) => c.status === source.droppableId)!;
      const destCol = next.find((c) => c.status === destination.droppableId)!;
      const [moved] = sourceCol.items.splice(source.index, 1);
      moved.status = destCol.status;
      destCol.items.splice(destination.index, 0, moved);
      return next;
    });

    marketingApi
      .moveContentItem(draggableId, destination.droppableId as ContentStatus, destination.index)
      .catch(() => {
        setError("Não foi possível salvar a movimentação. Atualizando o quadro...");
        reload();
      });
  }

  async function handleSave(values: ContentFormValues) {
    const payload = {
      title: values.title,
      type: values.type,
      channel: values.channel,
      scheduledDate: values.scheduledDate || null,
      campaignId: values.campaignId || null,
      assigneeId: values.assigneeId || null,
      notes: values.notes || null,
    };
    if (activeItem === "new" && newItemStatus) {
      await marketingApi.createContentItem({ ...payload, status: newItemStatus });
    } else if (activeItem && activeItem !== "new") {
      await marketingApi.updateContentItem(activeItem.id, payload);
    }
    setActiveItem(null);
    setNewItemStatus(null);
    reload();
  }

  async function handleDelete() {
    if (activeItem && activeItem !== "new") {
      await marketingApi.deleteContentItem(activeItem.id);
    }
    setActiveItem(null);
    reload();
  }

  if (!columns) {
    return <div className="p-8 text-center text-gray-500">Carregando calendário de conteúdo...</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-gray-900">Marketing</h1>
      <p className="mb-4 text-sm text-gray-500">Calendário de conteúdo</p>
      <MarketingSubNav />
      {error && (
        <div className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">{error}</div>
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column.status} className="flex flex-col">
              <ContentColumn column={column} onItemClick={(item) => setActiveItem(item)} />
              <Button
                variant="ghost"
                className="mt-1 w-72 justify-center rounded-xl border border-dashed border-gray-300 text-gray-500"
                onClick={() => {
                  setNewItemStatus(column.status);
                  setActiveItem("new");
                }}
              >
                + Nova peça
              </Button>
            </div>
          ))}
        </div>
      </DragDropContext>

      {activeItem && (
        <ContentDetailModal
          item={activeItem}
          campaigns={campaigns}
          users={users}
          onClose={() => {
            setActiveItem(null);
            setNewItemStatus(null);
          }}
          onSave={handleSave}
          onDelete={activeItem !== "new" ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
