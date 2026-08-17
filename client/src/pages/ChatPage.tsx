import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { messagesApi, type ConversationSummary, type Message } from "../api/messages";
import { groupChatApi, type GroupChatSummary, type GroupMessage } from "../api/groupChat";
import { usersApi } from "../api/users";
import type { MessageAttachment, TaskUserRef } from "../types";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/common/Avatar";

const DM_POLL_MS = 3000;
const CONVS_POLL_MS = 7000;
const GROUP_POLL_MS = 3000;
const ONLINE_POLL_MS = 30_000;

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatRelativeDay(value: string) {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return formatTime(value);
  return date.toLocaleDateString("pt-BR");
}
function isPdf(name: string) { return name.toLowerCase().endsWith(".pdf"); }
function isAudio(name: string) { return /\.(mp3|wav|ogg|webm|m4a|aac|opus)$/i.test(name); }
function isImage(name: string) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(name); }
function userInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

interface PendingFile { key: string; file: File; objectUrl: string; }

function AttachView({ attachment, fromMe }: { attachment: MessageAttachment; fromMe: boolean }) {
  const fileCls = fromMe
    ? "flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors bg-[#004aa3] text-white hover:bg-[#003d8a]"
    : "flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors bg-[#f0f0f5] text-[#1a1c1d] hover:bg-[#e8e8ef] dark:bg-[#2a2c32] dark:text-[#e0e0e2]";

  if (isPdf(attachment.fileName)) {
    return (
      <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className={fileCls}>
        <svg className="h-4 w-4 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <span className="max-w-[180px] truncate">{attachment.fileName}</span>
      </a>
    );
  }
  if (isAudio(attachment.fileName)) {
    return (
      <div className={fromMe ? "flex flex-col gap-1 rounded-xl px-3 py-2 bg-[#004aa3]" : "flex flex-col gap-1 rounded-xl px-3 py-2 bg-[#f0f0f5] dark:bg-[#2a2c32]"}>
        <span className={`max-w-[200px] truncate text-[11px] ${fromMe ? "text-white/80" : "text-[#77767b]"}`}>{attachment.fileName}</span>
        <audio src={attachment.fileUrl} controls className="h-8 w-full max-w-[260px] rounded" />
      </div>
    );
  }
  if (isImage(attachment.fileName)) {
    return (
      <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        <img src={attachment.fileUrl} alt={attachment.fileName} className="max-h-48 max-w-xs rounded-xl object-cover shadow-sm" />
      </a>
    );
  }
  return (
    <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className={fileCls}>
      <svg className="h-4 w-4 flex-shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="max-w-[180px] truncate">{attachment.fileName}</span>
    </a>
  );
}

// ── Create group modal ────────────────────────────────────────────────────────

function CreateGroupModal({ allUsers, onClose, onCreate }: {
  allUsers: TaskUserRef[];
  onClose: () => void;
  onCreate: (g: GroupChatSummary) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const g = await groupChatApi.create(name.trim(), Array.from(selected));
      onCreate(g);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Erro ao criar grupo";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[17px] font-semibold text-[#030304] dark:text-white">Criar grupo de conversa</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
          )}
          <input type="text" placeholder="Nome do grupo" value={name} onChange={(e) => setName(e.target.value)} required autoFocus
            className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] outline-none focus:border-[#005cba] dark:border-white/12 dark:bg-[#222426] dark:text-white" />

          <div>
            <p className="mb-2 text-[12px] font-semibold text-[#77767b]">Adicionar participantes</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {allUsers.map((u) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${selected.has(u.id) ? "bg-[#005cba]/10 text-[#005cba]" : "hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"}`}>
                  <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${selected.has(u.id) ? "border-[#005cba] bg-[#005cba]" : "border-[#c7c6ca]"}`}>
                    {selected.has(u.id) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                  <span className="text-[13px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2]">{u.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a] dark:border-white/12 dark:text-[#a0a0a4]">
              Cancelar
            </button>
            <button type="submit" disabled={!name.trim() || saving}
              className="flex-1 rounded-xl bg-[#005cba] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
              {saving ? "Criando..." : `Criar${selected.size > 0 ? ` (${selected.size + 1})` : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Manage group members modal ────────────────────────────────────────────────

function ManageGroupModal({ group, allUsers, onClose, onUpdated }: {
  group: GroupChatSummary;
  allUsers: TaskUserRef[];
  onClose: () => void;
  onUpdated: (g: GroupChatSummary) => void;
}) {
  const memberIds = new Set(group.members.map((m) => m.user.id));
  const available = allUsers.filter((u) => !memberIds.has(u.id));
  const [addUserId, setAddUserId] = useState("");

  async function handleAdd() {
    if (!addUserId) return;
    const updated = await groupChatApi.addMember(group.id, addUserId);
    setAddUserId("");
    onUpdated(updated);
  }

  async function handleRemove(userId: string) {
    const updated = await groupChatApi.removeMember(group.id, userId);
    onUpdated(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1c1e22]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-[17px] font-semibold text-[#030304] dark:text-white">{group.name}</h3>
        <p className="mb-4 text-[13px] text-[#77767b]">{group.members.length} participante{group.members.length !== 1 ? "s" : ""}</p>

        <div className="mb-4 max-h-52 space-y-1.5 overflow-y-auto">
          {group.members.map(({ user }) => (
            <div key={user.id} className="flex items-center gap-2.5 rounded-xl bg-[#f9f9fb] px-3 py-2 dark:bg-[#222426]">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              <span className="flex-1 text-[13px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2]">{user.name}</span>
              <button onClick={() => handleRemove(user.id)}
                className="rounded-lg p-1 text-[#77767b] hover:text-red-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {available.length > 0 && (
          <div className="mb-4 flex gap-2">
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
              className="flex-1 rounded-xl border border-[#e0e0e2] px-3 py-2 text-[13px] outline-none focus:border-[#005cba] dark:border-white/12 dark:bg-[#222426] dark:text-[#e0e0e2]">
              <option value="">Adicionar pessoa...</option>
              {available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={handleAdd} disabled={!addUserId}
              className="rounded-xl bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              Adicionar
            </button>
          </div>
        )}

        <button onClick={onClose}
          className="w-full rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a] dark:border-white/12 dark:text-[#a0a0a4]">
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

export function ChatPage() {
  const { userId, groupId } = useParams<{ userId?: string; groupId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [groups, setGroups] = useState<GroupChatSummary[]>([]);
  const [allUsers, setAllUsers] = useState<TaskUserRef[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  const [dmThread, setDmThread] = useState<Message[]>([]);
  const [groupThread, setGroupThread] = useState<GroupMessage[]>([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [managingGroup, setManagingGroup] = useState<GroupChatSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isAdmin) usersApi.directory().then(setAllUsers).catch(() => {});
  }, [isAdmin]);

  // Online users polling
  useEffect(() => {
    function fetchOnline() {
      fetch("/api/notifications/online", { credentials: "include" })
        .then((r) => r.json())
        .then((data: unknown) => {
          const ids = data && typeof data === "object" && "onlineUserIds" in data
            ? (data as { onlineUserIds: unknown }).onlineUserIds
            : data;
          setOnlineIds(Array.isArray(ids) ? ids as string[] : []);
        })
        .catch(() => {});
    }
    fetchOnline();
    const iv = setInterval(fetchOnline, ONLINE_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  const loadGroups = useCallback(() => {
    groupChatApi.list().then(setGroups).catch(() => {});
  }, []);

  const loadConversations = useCallback(() => {
    messagesApi.conversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    loadGroups();
    loadConversations();
    const iv1 = setInterval(loadGroups, CONVS_POLL_MS);
    const iv2 = setInterval(loadConversations, CONVS_POLL_MS);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [loadGroups, loadConversations]);

  const loadDmThread = useCallback(() => {
    if (!userId) return;
    messagesApi.thread(userId).then(setDmThread).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) { setDmThread([]); return; }
    setGroupThread([]);
    loadDmThread();
    messagesApi.markRead(userId).then(loadConversations).catch(() => {});
    const iv = setInterval(() => {
      loadDmThread();
      messagesApi.markRead(userId).then(loadConversations).catch(() => {});
    }, DM_POLL_MS);
    return () => clearInterval(iv);
  }, [userId, loadDmThread, loadConversations]);

  const loadGroupThread = useCallback(() => {
    if (!groupId) return;
    groupChatApi.getMessages(groupId).then(setGroupThread).catch(() => {});
  }, [groupId]);

  useEffect(() => {
    if (!groupId) { setGroupThread([]); return; }
    setDmThread([]);
    loadGroupThread();
    const iv = setInterval(loadGroupThread, GROUP_POLL_MS);
    return () => clearInterval(iv);
  }, [groupId, loadGroupThread]);

  // Smart scroll: only auto-scroll when user is at/near the bottom
  function handleThreadScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dmThread, groupThread]);

  // On conversation change, always scroll to bottom
  useEffect(() => {
    isAtBottomRef.current = true;
    threadEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [userId, groupId]);

  useEffect(() => {
    setPendingFiles([]);
    setUploadError(null);
    setDraft("");
    setIsDragging(false);
    dragDepth.current = 0;
  }, [userId, groupId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ key: `${Date.now()}-${Math.random()}`, file: f, objectUrl: URL.createObjectURL(f) })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    inputRef.current?.focus();
  }

  function removePending(key: string) {
    setPendingFiles((prev) => {
      const entry = prev.find((p) => p.key === key);
      if (entry) URL.revokeObjectURL(entry.objectUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        const objectUrl = URL.createObjectURL(file);
        setPendingFiles((prev) => [...prev, { key: `audio-${Date.now()}`, file, objectUrl }]);
        setIsRecording(false);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch {
      setUploadError("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function scrollToBottom() {
    isAtBottomRef.current = true;
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const hasText = draft.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!hasText && !hasFiles) return;
    if (!userId && !groupId) return;

    setUploadError(null);
    setSending(true);
    try {
      if (groupId) {
        let attachments: { fileUrl: string; fileName: string }[] | undefined;
        if (hasFiles) {
          const results = await Promise.all(pendingFiles.map((pf) => messagesApi.uploadFile(pf.file)));
          attachments = results;
          pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.objectUrl));
          setPendingFiles([]);
        }
        await groupChatApi.sendMessage(groupId, draft.trim(), attachments);
        setDraft("");
        if (inputRef.current) inputRef.current.style.height = "auto";
        scrollToBottom();
        loadGroupThread();
        loadGroups();
      } else if (userId) {
        let attachments: { fileUrl: string; fileName: string }[] | undefined;
        if (hasFiles) {
          const results = await Promise.all(pendingFiles.map((pf) => messagesApi.uploadFile(pf.file)));
          attachments = results;
          pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.objectUrl));
          setPendingFiles([]);
        }
        await messagesApi.send(userId, draft.trim(), attachments);
        setDraft("");
        if (inputRef.current) inputRef.current.style.height = "auto";
        scrollToBottom();
        loadDmThread();
        loadConversations();
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Erro ao enviar";
      setUploadError(msg);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current++;
    if (dragDepth.current === 1) setIsDragging(true);
  }
  function handleDragLeave() {
    dragDepth.current--;
    if (dragDepth.current === 0) setIsDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!userId && !groupId) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ key: `${Date.now()}-${Math.random()}`, file: f, objectUrl: URL.createObjectURL(f) })),
    ]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  }

  const activeContact = conversations.find((c) => c.user.id === userId)?.user;
  const activeGroup = groups.find((g) => g.id === groupId);
  const canSend = !sending && (draft.trim().length > 0 || pendingFiles.length > 0);
  const isGroupView = !!groupId;
  const isDmView = !!userId;
  const isContactOnline = !!activeContact && onlineIds.includes(activeContact.id);

  function groupAvatarStack(g: GroupChatSummary) {
    return g.members.slice(0, 3);
  }

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-[rgba(0,0,0,0.05)] bg-white dark:border-white/8 dark:bg-[#1c1e22]">
        <div className="flex-shrink-0 border-b border-[rgba(0,0,0,0.05)] px-5 py-4 dark:border-white/8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-[#030304] dark:text-white">Bate-papo</h1>
              <p className="mt-0.5 text-[11px] text-[#77767b]">Mensagens e grupos</p>
            </div>
            {isAdmin && (
              <button onClick={() => setShowCreateGroup(true)}
                title="Criar grupo"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(199,198,202,0.4)] text-[#77767b] transition-colors hover:border-[#005cba] hover:text-[#005cba] dark:border-white/10">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {groups.length > 0 && (
            <div>
              <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-[#77767b]">Grupos</p>
              {groups.map((g) => {
                const isActive = g.id === groupId;
                const lastMsg = g.messages[0];
                return (
                  <button key={g.id} onClick={() => navigate(`/chat/group/${g.id}`)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-[#005cba]/6 border-r-2 border-[#005cba]" : "hover:bg-[#f9f9fb] dark:hover:bg-[#222426]"}`}>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005cba] to-[#0080ff] text-[12px] font-bold text-white">
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`truncate text-[13px] font-semibold ${isActive ? "text-[#005cba]" : "text-[#1a1c1d] dark:text-[#e0e0e2]"}`}>
                          {g.name}
                        </p>
                        {lastMsg && <span className="flex-shrink-0 text-[10px] text-[#77767b]">{formatRelativeDay(lastMsg.createdAt)}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#77767b]">
                        {lastMsg ? lastMsg.body || "📎 Arquivo" : `${g.members.length} participantes`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-[#77767b]">Diretas</p>
            {conversations.length === 0 ? (
              <p className="px-5 py-2 text-[12px] text-[#a0a0a4]">Sem colegas disponíveis.</p>
            ) : (
              conversations.map((c) => {
                const isActive = c.user.id === userId;
                const online = onlineIds.includes(c.user.id);
                return (
                  <button key={c.user.id} onClick={() => navigate(`/chat/${c.user.id}`)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-[#005cba]/6 border-r-2 border-[#005cba]" : "hover:bg-[#f9f9fb] dark:hover:bg-[#222426]"}`}>
                    <div className="relative flex-shrink-0">
                      <Avatar name={c.user.name} avatarUrl={c.user.avatarUrl} size="md" />
                      {online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400 dark:border-[#1c1e22]" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`truncate text-[13px] font-semibold ${isActive ? "text-[#005cba]" : "text-[#1a1c1d] dark:text-[#e0e0e2]"}`}>
                          {c.user.name}
                        </p>
                        {c.lastMessage && <span className="flex-shrink-0 text-[10px] text-[#77767b]">{formatRelativeDay(c.lastMessage.createdAt)}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-[#77767b]">
                        {c.lastMessage ? `${c.lastMessage.fromMe ? "Você: " : ""}${c.lastMessage.body || "📎 Arquivo"}` : "Iniciar conversa"}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[#005cba] px-1.5 text-[10px] font-bold text-white">
                        {c.unreadCount > 9 ? "9+" : c.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Thread area ── */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden bg-[#f9f9fb] dark:bg-[#111214]"
        onDragEnter={isDmView || isGroupView ? handleDragEnter : undefined}
        onDragLeave={isDmView || isGroupView ? handleDragLeave : undefined}
        onDragOver={isDmView || isGroupView ? handleDragOver : undefined}
        onDrop={isDmView || isGroupView ? handleDrop : undefined}
      >
        {isDragging && (isDmView || isGroupView) && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-[#005cba] bg-[#005cba]/10">
            <div className="flex flex-col items-center gap-3">
              <svg className="h-12 w-12 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-[16px] font-semibold text-[#005cba]">Solte para enviar</p>
            </div>
          </div>
        )}
        {!isDmView && !isGroupView ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-[#1c1e22]">
              <svg className="h-8 w-8 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#46464a] dark:text-[#c0c0c4]">Selecione uma conversa</p>
              <p className="mt-1 text-[13px] text-[#77767b]">Escolha um colega ou grupo à esquerda.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Thread header ── */}
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-[rgba(0,0,0,0.05)] bg-white px-6 py-4 shadow-sm dark:border-white/8 dark:bg-[#1c1e22]">
              {isGroupView && activeGroup ? (
                <>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005cba] to-[#0080ff] text-[13px] font-bold text-white">
                    {activeGroup.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-[#030304] dark:text-white">{activeGroup.name}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      {groupAvatarStack(activeGroup).map(({ user: u }) => (
                        <span key={u.id} className="text-[11px] text-[#77767b]">{u.name.split(" ")[0]}</span>
                      ))}
                      {activeGroup.members.length > 3 && (
                        <span className="text-[11px] text-[#77767b]">+{activeGroup.members.length - 3}</span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => setManagingGroup(activeGroup)}
                      className="flex items-center gap-1 rounded-lg border border-[rgba(199,198,202,0.4)] px-2.5 py-1.5 text-[11px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                      Membros
                    </button>
                  )}
                </>
              ) : activeContact ? (
                <>
                  <div className="relative">
                    <Avatar name={activeContact.name} avatarUrl={activeContact.avatarUrl} size="md" />
                    {isContactOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400 dark:border-[#1c1e22]" />
                    )}
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-[#030304] dark:text-white">{activeContact.name}</p>
                    {isContactOnline && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-green-500 font-medium">Online</span>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* ── Messages ── */}
            <div ref={scrollContainerRef} onScroll={handleThreadScroll} className="flex-1 overflow-y-auto px-6 py-6">
              {isGroupView ? (
                groupThread.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <p className="text-[13px] text-[#77767b]">Nenhuma mensagem ainda. Seja o primeiro a falar!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {groupThread.map((m, i) => {
                      const fromMe = m.senderId === user?.id;
                      const showSenderName = !fromMe && (i === 0 || groupThread[i - 1]?.senderId !== m.senderId);
                      const hasBody = m.body.trim().length > 0;
                      const hasAttachments = m.attachments && m.attachments.length > 0;
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${fromMe ? "flex-row-reverse" : "flex-row"}`}>
                          {!fromMe && (
                            <div className="w-8 flex-shrink-0">
                              {showSenderName && (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#005cba]/15 text-[9px] font-bold text-[#005cba]" title={m.sender.name}>
                                  {userInitials(m.sender.name)}
                                </div>
                              )}
                            </div>
                          )}
                          <div className={`flex max-w-[65%] flex-col gap-0.5 ${fromMe ? "items-end" : "items-start"}`}>
                            {showSenderName && !fromMe && (
                              <span className="px-1 text-[10px] font-semibold text-[#77767b]">{m.sender.name}</span>
                            )}
                            {hasBody && (
                              <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${fromMe ? "rounded-br-sm bg-[#005cba] text-white" : "rounded-bl-sm bg-white text-[#1a1c1d] dark:bg-[#1c1e22] dark:text-[#e0e0e2]"}`}
                                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {m.body}
                              </div>
                            )}
                            {hasAttachments && (
                              <div className={`flex flex-col gap-1.5 ${fromMe ? "items-end" : "items-start"}`}>
                                {m.attachments.map((a) => <AttachView key={a.id} attachment={a} fromMe={fromMe} />)}
                              </div>
                            )}
                            <span className="px-1 text-[10px] text-[#77767b]">{formatTime(m.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </div>
                )
              ) : (
                dmThread.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <p className="text-[13px] text-[#77767b]">
                      Nenhuma mensagem ainda. Diga olá para {activeContact?.name}!
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {dmThread.map((m, i) => {
                      const fromMe = m.senderId === user?.id;
                      const showAvatar = !fromMe && (i === 0 || dmThread[i - 1]?.senderId !== m.senderId);
                      const hasAttachments = m.attachments && m.attachments.length > 0;
                      const hasBody = m.body.trim().length > 0;
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${fromMe ? "flex-row-reverse" : "flex-row"}`}>
                          {!fromMe && (
                            <div className="w-8 flex-shrink-0">
                              {showAvatar && activeContact && (
                                <Avatar name={activeContact.name} avatarUrl={activeContact.avatarUrl} size="sm" />
                              )}
                            </div>
                          )}
                          <div className={`flex max-w-[65%] flex-col gap-1 ${fromMe ? "items-end" : "items-start"}`}>
                            {hasBody && (
                              <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${fromMe ? "rounded-br-sm bg-[#005cba] text-white" : "rounded-bl-sm bg-white text-[#1a1c1d]"}`}
                                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {m.body}
                              </div>
                            )}
                            {hasAttachments && (
                              <div className={`flex flex-col gap-1.5 ${fromMe ? "items-end" : "items-start"}`}>
                                {m.attachments.map((a) => <AttachView key={a.id} attachment={a} fromMe={fromMe} />)}
                              </div>
                            )}
                            <span className="px-1 text-[10px] text-[#77767b]">{formatRelativeDay(m.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </div>
                )
              )}
            </div>

            {/* ── Input ── */}
            <div className="flex-shrink-0 border-t border-[rgba(0,0,0,0.05)] bg-white px-5 py-4 dark:border-white/8 dark:bg-[#1c1e22]">
              {pendingFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingFiles.map((pf) => {
                    const isImg = pf.file.type.startsWith("image/");
                    const isAud = pf.file.type.startsWith("audio/");
                    return (
                      <div key={pf.key} className="relative">
                        {isImg ? (
                          <img src={pf.objectUrl} alt={pf.file.name} className="h-14 w-14 rounded-xl object-cover shadow-sm" />
                        ) : isAud ? (
                          <div className="flex h-14 items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.4)] bg-[#f9f9fb] px-2">
                            <svg className="h-4 w-4 flex-shrink-0 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                            </svg>
                            <span className="max-w-[70px] truncate text-[10px] font-medium text-[#46464a]">{pf.file.name}</span>
                          </div>
                        ) : (
                          <div className="flex h-14 items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.4)] bg-[#f9f9fb] px-3">
                            <svg className="h-4 w-4 flex-shrink-0 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            <span className="max-w-[100px] truncate text-[11px] font-medium text-[#46464a]">{pf.file.name}</span>
                          </div>
                        )}
                        <button onClick={() => removePending(pf.key)}
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#030304] text-white hover:bg-[#46464a]">
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {uploadError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-600 dark:bg-red-900/20 dark:text-red-400">{uploadError}</p>}

              <form onSubmit={handleSend} className="flex items-end gap-2">
                {/* Attach button */}
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || isRecording}
                  className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-xl border border-[#c7c6ca] bg-[#f9f9fb] text-[#77767b] transition-colors hover:border-[#030304] hover:text-[#030304] disabled:opacity-40 dark:border-white/10 dark:bg-[#222426] dark:hover:border-white/30">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

                {/* Mic button */}
                <button type="button"
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={sending}
                  title={isRecording ? "Gravando… solte para parar" : "Segurar para gravar áudio"}
                  className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
                    isRecording
                      ? "animate-pulse border-red-400 bg-red-50 text-red-500 dark:bg-red-900/20"
                      : "border-[#c7c6ca] bg-[#f9f9fb] text-[#77767b] hover:border-[#030304] hover:text-[#030304] dark:border-white/10 dark:bg-[#222426] dark:hover:border-white/30"
                  }`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                  </svg>
                </button>

                <textarea ref={inputRef} rows={1} value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={isRecording ? "Gravando áudio… solte para adicionar" : isGroupView ? `Mensagem para ${activeGroup?.name ?? "grupo"}…` : `Mensagem para ${activeContact?.name ?? ""}…`}
                  disabled={sending || isRecording}
                  className="flex-1 resize-none rounded-xl border border-[#c7c6ca] bg-[#f9f9fb] px-4 py-3 text-[14px] text-[#1a1c1d] placeholder-[#77767b] outline-none transition-all focus:border-[#030304] focus:ring-2 focus:ring-[#030304]/10 disabled:opacity-50 dark:border-white/10 dark:bg-[#222426] dark:text-[#e0e0e2]"
                  style={{ minHeight: 46, maxHeight: 120 }}
                />

                <button type="submit" disabled={!canSend}
                  className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-xl bg-[#030304] transition-all hover:bg-[#1d1d1f] active:scale-95 disabled:opacity-30 dark:bg-[#005cba]">
                  {sending ? (
                    <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </form>
              <p className="mt-2 text-center text-[11px] text-[#77767b]">Enter para enviar · Shift+Enter para nova linha · Segurar 🎤 para gravar</p>
            </div>
          </>
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          allUsers={allUsers}
          onClose={() => setShowCreateGroup(false)}
          onCreate={(g) => {
            setGroups((prev) => [g, ...prev]);
            setShowCreateGroup(false);
            navigate(`/chat/group/${g.id}`);
          }}
        />
      )}

      {managingGroup && (
        <ManageGroupModal
          group={managingGroup}
          allUsers={allUsers}
          onClose={() => setManagingGroup(null)}
          onUpdated={(updated) => {
            setGroups((prev) => prev.map((g) => (g.id === updated?.id ? { ...g, ...updated } : g)));
            if (updated) setManagingGroup(updated);
          }}
        />
      )}
    </div>
  );
}
