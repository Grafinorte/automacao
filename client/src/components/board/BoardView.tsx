import { useEffect, useState, useCallback, useRef } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { boardApi } from "../../api/board";
import { tasksApi } from "../../api/tasks";
import { usersApi } from "../../api/users";
import type { Board, BoardSummary, Task, TaskUserRef } from "../../types";
import { ColumnContainer } from "./ColumnContainer";
import { TaskDetailModal, type TaskFormValues } from "../tasks/TaskDetailModal";
import { Button } from "../common/Button";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";

// ── Member management modal ───────────────────────────────────────────────────

function MembersModal({
  board, allUsers, onClose, onUpdated,
}: {
  board: Board;
  allUsers: TaskUserRef[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const memberIds = new Set(board.members.map((m) => m.user.id));
  const [adding, setAdding] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  async function handleAdd() {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await boardApi.addMember(board.id, selectedUserId);
      setSelectedUserId("");
      onUpdated();
    } finally { setAdding(false); }
  }

  async function handleRemove(userId: string) {
    await boardApi.removeMember(board.id, userId);
    onUpdated();
  }

  const available = allUsers.filter((u) => !memberIds.has(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-[17px] font-semibold text-[#030304] dark:text-white">Membros do grupo</h3>
        <p className="mb-4 text-[13px] text-[#77767b] dark:text-[#a0a0a4]">{board.name} · Admins sempre têm acesso</p>

        {/* Current members */}
        <div className="mb-4 space-y-2">
          {board.members.length === 0 && (
            <p className="text-[13px] text-[#a0a0a4]">Nenhum membro adicionado ainda.</p>
          )}
          {board.members.map(({ user }) => (
            <div key={user.id} className="flex items-center gap-3 rounded-xl bg-[#f9f9fb] px-3 py-2.5 dark:bg-[#222426]">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              <span className="flex-1 text-[13px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2]">{user.name}</span>
              <button onClick={() => handleRemove(user.id)}
                className="rounded-lg p-1 text-[#77767b] hover:text-red-500 dark:hover:text-red-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Add member */}
        {available.length > 0 && (
          <div className="flex gap-2">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded-xl border border-[#e0e0e2] px-3 py-2 text-[13px] text-[#1a1c1d] outline-none focus:border-[#005cba] dark:border-white/12 dark:bg-[#222426] dark:text-[#e0e0e2]">
              <option value="">Selecionar usuário...</option>
              {available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={handleAdd} disabled={!selectedUserId || adding}
              className="rounded-xl bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              Adicionar
            </button>
          </div>
        )}

        <button onClick={onClose}
          className="mt-4 w-full rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a] dark:border-white/12 dark:text-[#a0a0a4]">
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Create board modal ────────────────────────────────────────────────────────

function CreateBoardModal({ onClose, onCreate }: { onClose: () => void; onCreate: (b: BoardSummary) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const board = await boardApi.create(name.trim(), description.trim() || undefined);
      onCreate(board);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[17px] font-semibold text-[#030304] dark:text-white">Criar grupo de tarefas</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="Nome do grupo (ex: Marketing)" value={name}
            onChange={(e) => setName(e.target.value)} required autoFocus
            className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] outline-none focus:border-[#005cba] dark:border-white/12 dark:bg-[#222426] dark:text-white" />
          <input type="text" placeholder="Descrição (opcional)" value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] outline-none focus:border-[#005cba] dark:border-white/12 dark:bg-[#222426] dark:text-white" />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a] dark:border-white/12 dark:text-[#a0a0a4]">
              Cancelar
            </button>
            <button type="submit" disabled={!name.trim() || saving}
              className="flex-1 rounded-xl bg-[#005cba] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
              {saving ? "Criando..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main BoardView ────────────────────────────────────────────────────────────

export function BoardView() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "ADMIN";

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [users, setUsers] = useState<TaskUserRef[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(authUser?.id ?? "");
  const [activeTask, setActiveTask] = useState<Task | "new" | null>(null);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (isAdmin) usersApi.directory().then(setUsers).catch(() => setUsers([]));
  }, [isAdmin]);

  useEffect(() => {
    boardApi.list().then((bs) => {
      setBoards(bs);
      if (!loadedRef.current && bs.length > 0) {
        setActiveBoardId(bs[0].id);
        loadedRef.current = true;
      }
    });
  }, []);

  const reload = useCallback(async () => {
    if (!activeBoardId) return;
    const data = await boardApi.get(activeBoardId, selectedUserId || undefined);
    setBoard(data);
  }, [activeBoardId, selectedUserId]);

  useEffect(() => { reload(); }, [reload]);

  function onDragEnd(result: DropResult) {
    if (!board || !result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setBoard((prev) => {
      if (!prev) return prev;
      const columns = prev.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const sourceColumn = columns.find((c) => c.id === source.droppableId)!;
      const destColumn = columns.find((c) => c.id === destination.droppableId)!;
      const [moved] = sourceColumn.tasks.splice(source.index, 1);
      moved.columnId = destColumn.id;
      destColumn.tasks.splice(destination.index, 0, moved);
      return { ...prev, columns };
    });

    tasksApi.move(draggableId, destination.droppableId, destination.index).catch(() => {
      setError("Não foi possível salvar a movimentação.");
      reload();
    });
  }

  async function handleSaveTask(values: TaskFormValues) {
    const payload = {
      title: values.title,
      description: values.description || null,
      assigneeId: isAdmin ? (values.assigneeId || null) : undefined,
      priority: values.priority,
      dueDate: values.dueDate || null,
    };
    if (activeTask === "new" && newTaskColumnId) {
      await tasksApi.create({ ...payload, columnId: newTaskColumnId });
    } else if (activeTask && activeTask !== "new") {
      await tasksApi.update(activeTask.id, payload);
    }
    setActiveTask(null);
    setNewTaskColumnId(null);
    reload();
  }

  async function handleDeleteTask() {
    if (activeTask && activeTask !== "new") await tasksApi.remove(activeTask.id);
    setActiveTask(null);
    reload();
  }

  async function handleMarkDone() {
    if (!board || !activeTask || activeTask === "new") return;
    const doneCol = board.columns.find((c) => /conclu|done|feito|entregue/i.test(c.name));
    if (!doneCol) return;
    await tasksApi.move(activeTask.id, doneCol.id, 0);
    setActiveTask(null);
    reload();
  }

  async function handleCreateBoard(b: BoardSummary) {
    setBoards((prev) => [...prev, b]);
    setShowCreateBoard(false);
    setActiveBoardId(b.id);
  }

  const activeBoard = boards.find((b) => b.id === activeBoardId);

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-col border-b border-[rgba(199,198,202,0.3)] bg-white dark:border-white/8 dark:bg-[#1c1e22]">
        {/* Board tabs */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 pt-3 pb-0" style={{ scrollbarWidth: "none" }}>
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveBoardId(b.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-[13px] font-medium transition-colors ${
                b.id === activeBoardId
                  ? "border-[#005cba] text-[#005cba] dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-[#77767b] hover:text-[#1a1c1d] dark:text-[#a0a0a4] dark:hover:text-[#e0e0e2]"
              }`}
            >
              {b.isDefault ? (
                <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              )}
              {b.name}
              {!b.isDefault && (
                <span className="rounded-full bg-[rgba(0,0,0,0.06)] px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">
                  {b._count.members}
                </span>
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setShowCreateBoard(true)}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium text-[#77767b] transition-colors hover:bg-[#f3f3f5] hover:text-[#1a1c1d] dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Novo grupo
            </button>
          )}
        </div>

        {/* Sub-header: board title + controls */}
        <div className="flex items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#1a1c1d] dark:text-[#e0e0e2]">
              {activeBoard?.name ?? "Tarefas"}
            </span>
            {activeBoard && !activeBoard.isDefault && isAdmin && (
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-1 rounded-lg border border-[rgba(199,198,202,0.4)] px-2.5 py-1 text-[11px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-[#222426]"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                Membros
              </button>
            )}
          </div>

          {isAdmin && users.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#77767b]">Ver tarefas de</span>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="rounded-lg border border-[rgba(199,198,202,0.4)] bg-white px-2.5 py-1 text-[12px] font-medium text-[#1a1c1d] outline-none focus:border-[#005cba] dark:border-white/10 dark:bg-[#222426] dark:text-[#e0e0e2]"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === authUser?.id ? `${u.name} (eu)` : u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex-shrink-0 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">{error}</div>
      )}

      {board ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(199,198,202,0.5) transparent" }}>
            {board.columns
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((column, idx) => (
                <div key={column.id} className="flex flex-col">
                  <ColumnContainer
                    column={column}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < board.columns.length - 1}
                    onRename={(name) => boardApi.renameColumn(column.id, name).then(reload)}
                    onMoveLeft={async () => {
                      const ids = board.columns.map((c) => c.id);
                      const i = ids.indexOf(column.id);
                      [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
                      await boardApi.reorderColumns(ids);
                      reload();
                    }}
                    onMoveRight={async () => {
                      const ids = board.columns.map((c) => c.id);
                      const i = ids.indexOf(column.id);
                      [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                      await boardApi.reorderColumns(ids);
                      reload();
                    }}
                    onTaskClick={(task) => setActiveTask(task)}
                  />
                  <Button
                    variant="ghost"
                    className="mt-1 w-72 justify-center rounded-xl border border-dashed border-gray-300 text-gray-500"
                    onClick={() => { setNewTaskColumnId(column.id); setActiveTask("new"); }}
                  >
                    + Nova tarefa
                  </Button>
                </div>
              ))}

            {isAdmin && (
              <button
                onClick={() => activeBoardId && boardApi.addColumn(activeBoardId, "Nova coluna").then(reload)}
                className="flex h-12 w-72 flex-shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[rgba(199,198,202,0.5)] text-[13px] font-medium text-[#77767b] transition-colors hover:border-[#005cba] hover:text-[#005cba] dark:border-white/12 dark:text-[#a0a0a4]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Adicionar coluna
              </button>
            )}
          </div>
        </DragDropContext>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-[#77767b]">Carregando...</div>
      )}

      {activeTask && board && (
        <TaskDetailModal
          task={activeTask}
          users={users}
          columns={board.columns}
          onClose={() => { setActiveTask(null); setNewTaskColumnId(null); reload(); }}
          onSave={handleSaveTask}
          onDelete={activeTask !== "new" ? handleDeleteTask : undefined}
          onMarkDone={activeTask !== "new" ? handleMarkDone : undefined}
        />
      )}

      {showMembersModal && board && (
        <MembersModal
          board={board}
          allUsers={users}
          onClose={() => setShowMembersModal(false)}
          onUpdated={reload}
        />
      )}

      {showCreateBoard && (
        <CreateBoardModal
          onClose={() => setShowCreateBoard(false)}
          onCreate={handleCreateBoard}
        />
      )}
    </div>
  );
}
