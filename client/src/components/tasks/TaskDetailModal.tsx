import { useRef, useState } from "react";
import type { Column, Priority, Task, TaskAttachment, TaskSubtask, TaskUserRef } from "../../types";
import { tasksApi } from "../../api/tasks";

export interface TaskFormValues {
  title: string;
  description: string;
  assigneeId: string;
  priority: Priority;
  dueDate: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isPdf(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf");
}

function userInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

const PRIORITY_META: Record<Priority, { label: string; color: string; dot: string }> = {
  LOW:    { label: "Baixa",  color: "text-slate-500",  dot: "bg-slate-400" },
  MEDIUM: { label: "Média",  color: "text-amber-600",  dot: "bg-amber-400" },
  HIGH:   { label: "Alta",   color: "text-red-600",    dot: "bg-red-500"   },
};

// ── sub-components ────────────────────────────────────────────────────────────

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex w-[140px] flex-shrink-0 items-center gap-2 text-[12px] text-[#77767b]">
        <span className="flex-shrink-0">{icon}</span>
        {label}
      </div>
      <div className="flex-1 text-[13px] text-[#1a1c1d] dark:text-[#e0e0e2]">{children}</div>
    </div>
  );
}

function AttachmentChip({
  attachment, onDelete, deleting,
}: { attachment: TaskAttachment; onDelete: () => void; deleting: boolean }) {
  const pdf = isPdf(attachment.fileName);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 dark:bg-[#111214] dark:border-white/8">
      {pdf ? (
        <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 flex-shrink-0 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      )}
      <a href={attachment.fileUrl} target="_blank" rel="noreferrer"
        className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#1a1c1d] hover:text-[#005cba] dark:text-[#e0e0e2]">
        {attachment.fileName}
      </a>
      <button onClick={onDelete} disabled={deleting}
        className="flex-shrink-0 rounded-full p-0.5 text-[#77767b] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-900/20">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function TaskDetailModal({
  task, users, columns = [], onClose, onSave, onDelete, onMarkDone,
}: {
  task: Task | "new";
  users: TaskUserRef[];
  columns?: Column[];
  onClose: () => void;
  onSave: (values: TaskFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onMarkDone?: () => Promise<void>;
}) {
  const isNew = task === "new";

  const [values, setValues] = useState<TaskFormValues>(
    isNew
      ? { title: "", description: "", assigneeId: "", priority: "MEDIUM", dueDate: "" }
      : {
          title: task.title,
          description: task.description ?? "",
          assigneeId: task.assignee?.id ?? "",
          priority: task.priority,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
        }
  );

  const [saving, setSaving] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>(!isNew ? (task.attachments ?? []) : []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingAttachId, setDeletingAttachId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subtasks
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>(!isNew ? (task.subtasks ?? []) : []);
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Task members (participantes)
  const [members, setMembers] = useState<{ user: TaskUserRef }[]>(!isNew ? (task.members ?? []) : []);
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  async function handleAddSubtask(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !newSubtask.trim() || isNew) return;
    setAddingSubtask(true);
    try {
      const sub = await tasksApi.createSubtask(task.id, newSubtask.trim());
      setSubtasks((prev) => [...prev, sub]);
      setNewSubtask("");
    } finally { setAddingSubtask(false); }
  }

  async function handleToggleSubtask(subtaskId: string, done: boolean) {
    if (isNew) return;
    const sub = await tasksApi.toggleSubtask(task.id, subtaskId, done);
    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? sub : s)));
  }

  async function handleDeleteSubtask(subtaskId: string) {
    if (isNew) return;
    await tasksApi.deleteSubtask(task.id, subtaskId);
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
  }

  async function handleAddMember() {
    if (!addMemberUserId || isNew) return;
    setAddingMember(true);
    try {
      const updated = await tasksApi.addMember(task.id, addMemberUserId);
      setMembers(updated.members ?? []);
      setAddMemberUserId("");
    } finally { setAddingMember(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (isNew) return;
    const updated = await tasksApi.removeMember(task.id, userId);
    setMembers(updated.members ?? []);
  }

  const currentColumn = !isNew ? columns.find((c) => c.id === task.columnId) : null;
  const assigneeUser = users.find((u) => u.id === values.assigneeId);
  const priorityMeta = PRIORITY_META[values.priority];

  async function handleSave() {
    if (!values.title.trim()) return;
    setSaving(true);
    try { await onSave(values); } finally { setSaving(false); }
  }

  async function handleMarkDone() {
    if (!onMarkDone) return;
    setMarkingDone(true);
    try { await onMarkDone(); } finally { setMarkingDone(false); }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || isNew) return;
    setUploadError(null);
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const attachment = await tasksApi.uploadAttachment(task.id, dataUrl, file.name);
      setAttachments((prev) => [...prev, attachment]);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Erro ao enviar arquivo";
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (isNew) return;
    setDeletingAttachId(attachmentId);
    try {
      await tasksApi.deleteAttachment(task.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } finally {
      setDeletingAttachId(null);
    }
  }

  const selectCls = "w-full rounded-lg border border-[rgba(0,0,0,0.1)] bg-transparent px-2 py-1 text-[13px] outline-none focus:border-[#005cba] dark:border-white/10 dark:bg-[#222426] dark:text-[#e0e0e2] cursor-pointer";

  return (
    <>
      {/* Backdrop — click outside to close */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-20 z-50 flex h-[calc(100vh-80px)] w-full flex-col border-l border-[rgba(0,0,0,0.08)] bg-white shadow-2xl dark:border-white/8 dark:bg-[#1c1e22] sm:w-[480px]">

        {/* ── Top bar ── */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-[rgba(0,0,0,0.07)] px-4 py-3 dark:border-white/8">
          {!isNew && onMarkDone && (
            <button
              onClick={handleMarkDone}
              disabled={markingDone}
              className="flex items-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-[12px] font-medium text-[#46464a] transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-emerald-900/20"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {markingDone ? "Movendo…" : "Marcar como concluída"}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Assignee chip */}
            {assigneeUser && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#005cba] text-[10px] font-bold text-white" title={assigneeUser.name}>
                {userInitials(assigneeUser.name)}
              </div>
            )}

            {/* Created by */}
            {!isNew && (
              <span className="text-[11px] text-[#77767b]">
                Criado {formatDate(task.createdAt)}
              </span>
            )}

            {/* Delete */}
            {!isNew && onDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Excluir tarefa"
                className="rounded-lg p-1.5 text-[#77767b] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-900/20"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#77767b] transition hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Title */}
          <div className="px-6 pb-2 pt-5">
            <input
              autoFocus
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              placeholder="Título da tarefa"
              className="w-full bg-transparent text-[22px] font-bold leading-snug text-[#030304] outline-none placeholder-[#c7c6ca] dark:text-[#e0e0e2]"
            />
          </div>

          {/* Properties */}
          <div className="mx-6 border-b border-[rgba(0,0,0,0.06)] pb-3 pt-1 dark:border-white/6">

            {/* Responsável */}
            <PropRow
              icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>}
              label="Responsável"
            >
              <select value={values.assigneeId} onChange={(e) => setValues((v) => ({ ...v, assigneeId: e.target.value }))} className={selectCls}>
                <option value="">Nenhum responsável</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </PropRow>

            {/* Data de conclusão */}
            <PropRow
              icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>}
              label="Data de conclusão"
            >
              <input type="date" value={values.dueDate} onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
                className={`${selectCls} text-[#1a1c1d] dark:text-[#e0e0e2]`} />
            </PropRow>

            {/* Coluna/Status */}
            {currentColumn && (
              <PropRow
                icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>}
                label="Status"
              >
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f3f3f5] px-2 py-0.5 text-[12px] font-medium text-[#46464a] dark:bg-[#222426] dark:text-[#c0c0c4]">
                  {currentColumn.name}
                </span>
              </PropRow>
            )}

            {/* Prioridade */}
            <PropRow
              icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" /></svg>}
              label="Prioridade"
            >
              <select value={values.priority} onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value as Priority }))} className={selectCls}>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
              </select>
            </PropRow>

            {/* Priority visual pill */}
            <div className="mt-1 flex items-center gap-1.5 pl-[152px]">
              <span className={`h-2 w-2 rounded-full ${priorityMeta.dot}`} />
              <span className={`text-[11px] font-medium ${priorityMeta.color}`}>{priorityMeta.label}</span>
            </div>
          </div>

          {/* Description */}
          <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/6">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#77767b]">Descrição</h3>
            <textarea
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              rows={4}
              placeholder="Do que se trata esta tarefa?"
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-[#1a1c1d] outline-none placeholder-[#a0a0a4] dark:text-[#e0e0e2]"
            />
          </div>

          {/* Subtasks */}
          {!isNew && (
            <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/6">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#77767b]">Subtarefas</h3>
                {subtasks.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#77767b]">
                    {subtasks.filter((s) => s.done).length}/{subtasks.length}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {subtasks.length > 0 && (
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#e8e8ea] dark:bg-[#2a2c30]">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100)}%` }}
                  />
                </div>
              )}

              {/* List */}
              <div className="space-y-0.5">
                {subtasks.map((sub) => (
                  <div key={sub.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-[#f9f9fb] dark:hover:bg-[#222426]">
                    <button
                      onClick={() => handleToggleSubtask(sub.id, !sub.done)}
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        sub.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-[#c7c6ca] hover:border-emerald-400 dark:border-white/20"
                      }`}
                    >
                      {sub.done && (
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                    <span className={`flex-1 text-[13px] ${sub.done ? "line-through text-[#a0a0a4]" : "text-[#1a1c1d] dark:text-[#e0e0e2]"}`}>
                      {sub.title}
                    </span>
                    <button
                      onClick={() => handleDeleteSubtask(sub.id)}
                      className="hidden rounded p-0.5 text-[#77767b] hover:text-red-500 group-hover:flex dark:hover:text-red-400"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add input */}
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-[#c7c6ca] px-3 py-2 transition-colors focus-within:border-[#005cba] dark:border-white/15">
                <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#a0a0a4]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <input
                  type="text"
                  placeholder="Adicionar subtarefa… (Enter para salvar)"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={handleAddSubtask}
                  disabled={addingSubtask}
                  className="flex-1 bg-transparent text-[13px] text-[#1a1c1d] outline-none placeholder-[#a0a0a4] dark:text-[#e0e0e2]"
                />
              </div>
            </div>
          )}

          {/* Participantes */}
          {!isNew && users.length > 0 && (
            <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/6">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#77767b]">Participantes</h3>
              <div className="space-y-1.5">
                {members.map(({ user }) => (
                  <div key={user.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-[#f9f9fb] dark:hover:bg-[#222426]">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#005cba] text-[9px] font-bold text-white">
                      {userInitials(user.name)}
                    </div>
                    <span className="flex-1 text-[13px] text-[#1a1c1d] dark:text-[#e0e0e2]">{user.name}</span>
                    <button
                      onClick={() => handleRemoveMember(user.id)}
                      className="hidden rounded p-0.5 text-[#77767b] hover:text-red-500 group-hover:flex dark:hover:text-red-400"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {/* Add member row */}
              {(() => {
                const memberIds = new Set(members.map((m) => m.user.id));
                const available = users.filter((u) => !memberIds.has(u.id) && u.id !== values.assigneeId);
                if (available.length === 0) return null;
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <select value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}
                      className="flex-1 rounded-lg border border-dashed border-[#c7c6ca] bg-transparent px-3 py-1.5 text-[13px] text-[#1a1c1d] outline-none focus:border-[#005cba] dark:border-white/15 dark:text-[#e0e0e2]">
                      <option value="">Adicionar participante...</option>
                      {available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button onClick={handleAddMember} disabled={!addMemberUserId || addingMember}
                      className="flex-shrink-0 rounded-lg bg-[#005cba] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
                      {addingMember ? "..." : "Adicionar"}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Attachments */}
          <div className="px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#77767b]">
                Anexos
                {attachments.length > 0 && (
                  <span className="ml-2 rounded-full bg-[#005cba]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#005cba] normal-case tracking-normal">
                    {attachments.length}
                  </span>
                )}
              </h3>
              {!isNew && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#005cba] transition hover:bg-[#005cba]/5 disabled:opacity-40"
                >
                  {uploading ? (
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  )}
                  {uploading ? "Enviando…" : "Adicionar"}
                </button>
              )}
              <input ref={fileInputRef} type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                className="hidden" onChange={handleFileChange} />
            </div>

            {uploadError && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-600 dark:bg-red-900/20">{uploadError}</p>
            )}

            {attachments.length > 0 ? (
              <div className="space-y-1.5">
                {attachments.map((a) => (
                  <AttachmentChip key={a.id} attachment={a}
                    onDelete={() => handleDeleteAttachment(a.id)}
                    deleting={deletingAttachId === a.id} />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#a0a0a4]">
                {isNew ? "Salve a tarefa para adicionar anexos." : "Nenhum anexo. PNG, JPEG, PDF (máx. 10 MB)."}
              </p>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.07)] px-6 py-3 dark:border-white/8">
          <button onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#46464a] transition hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !values.title.trim()}
            className="rounded-xl bg-[#005cba] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#0051a8] disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </>
  );
}
