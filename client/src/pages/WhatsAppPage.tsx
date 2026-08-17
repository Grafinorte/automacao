import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { whatsappApi, type WaConversation, type WaMessage, type WaAutomation, type WaTemplate, type MetaTemplate, type WaMessageReplyTo, type WaContact, type WaLabel, type WaUser } from "../api/whatsapp";
import { crmApi } from "../api/crm";
import type { ContactWithDeals } from "../types";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/common/Avatar";
import { useNavigate } from "react-router-dom";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

// ─── Sound notification ────────────────────────────────────────────────────────

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext não disponível
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Conversation item ────────────────────────────────────────────────────────

function ConversationItem({ conv, active, onClick, onTogglePin }: {
  conv: WaConversation; active: boolean; onClick: () => void; onTogglePin: (pinned: boolean) => void;
}) {
  return (
    <div className={`group relative w-full flex items-start gap-3 px-4 py-3 border-b border-[rgba(0,0,0,0.05)] text-left transition-colors cursor-pointer ${
      active ? "bg-green-50 dark:bg-green-950/30" : "hover:bg-gray-50 dark:hover:bg-white/5"
    }`} onClick={onClick}>
      <div className="flex-shrink-0 mt-0.5">
        <Avatar name={conv.contact.name} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1">
            {conv.pinned && <span className="text-amber-500 text-xs">📌</span>}
            {conv.contact.name}
          </p>
          <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(conv.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {conv.lastMessageText ?? conv.contact.phone}
          </p>
          {conv.unreadCount > 0 && (
            <span className="flex-shrink-0 h-5 min-w-[20px] rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
        {conv.labels?.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {conv.labels.slice(0, 5).map(({ label }) => (
              <span
                key={label.id}
                title={label.name}
                className="rounded-full px-1.5 py-0 text-[9px] font-semibold text-white leading-4"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(!conv.pinned); }}
        title={conv.pinned ? "Desafixar" : "Fixar no topo"}
        className={`absolute right-2 top-2 p-1 rounded transition-opacity text-sm ${
          conv.pinned
            ? "opacity-100 text-amber-500"
            : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-amber-500"
        }`}
      >
        📌
      </button>
    </div>
  );
}

// ─── Link renderer ────────────────────────────────────────────────────────────

function renderMessageText(text: string | null | undefined, isOut: boolean) {
  if (!text) return null;
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts: Array<string | { url: string; idx: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ url: match[0], idx: idx++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <a
            key={part.idx}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all hover:opacity-80 ${isOut ? "text-green-100" : "text-blue-600 dark:text-blue-400"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part.url}
          </a>
        )
      )}
    </>
  );
}

// ─── Message ticks ────────────────────────────────────────────────────────────

function MessageTicks({ status }: { status: string }) {
  if (status === "failed") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
        <span style={{ color: "#fca5a5", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>!</span>
      </span>
    );
  }
  const color = status === "read" ? "#38bdf8" : "rgba(255,255,255,0.95)";
  const bg = status === "read" ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.18)";
  if (status === "read" || status === "delivered") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 16, borderRadius: 8, background: bg, flexShrink: 0 }}>
        <svg width="14" height="9" viewBox="0 0 15 10" fill="none">
          <path d="M1 5l3 3.5L10 1" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 5l3 3.5 6-7.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.18)", flexShrink: 0 }}>
      <svg width="10" height="9" viewBox="0 0 10 10" fill="none">
        <path d="M1 5l3 3.5L9 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

// ─── Quote preview (reply-to) ─────────────────────────────────────────────────

function QuoteBar({ replyTo, isOut }: { replyTo: WaMessageReplyTo; isOut: boolean }) {
  const label = replyTo.direction === "outbound" ? "Você" : (replyTo.sentBy?.name ?? "Contato");
  const preview = replyTo.mediaType
    ? `📎 ${replyTo.mediaType === "image" ? "Imagem" : replyTo.mediaType === "audio" ? "Áudio" : replyTo.mediaType === "video" ? "Vídeo" : replyTo.filename ?? "Documento"}`
    : (replyTo.text ?? "");

  return (
    <div className={`flex mb-1.5 rounded-lg overflow-hidden border-l-[3px] ${
      isOut ? "border-green-200 bg-green-600/40" : "border-green-500 bg-black/5 dark:bg-white/5"
    }`}>
      <div className="px-2 py-1.5 min-w-0">
        <p className={`text-[10px] font-semibold mb-0.5 ${isOut ? "text-green-100" : "text-green-600 dark:text-green-400"}`}>
          {label}
        </p>
        <p className={`text-[11px] truncate ${isOut ? "text-green-100/80" : "text-gray-500 dark:text-gray-400"}`}>
          {preview}
        </p>
      </div>
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg, onReply, onEdit, onForward, onContactConverse }: {
  msg: WaMessage;
  onReply: (msg: WaMessage) => void;
  onEdit: (updated: WaMessage) => void;
  onForward: (msg: WaMessage) => void;
  onContactConverse?: (phone: string, name: string) => void;
}) {
  const isOut = msg.direction === "outbound";
  const mediaSrc = msg.mediaUrl ? `/wa-media/${msg.mediaUrl}` : null;
  const canEdit = isOut && !msg.mediaType && !!msg.text && !msg.isInternal;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleSaveEdit() {
    if (!editText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await whatsappApi.updateMessage(msg.id, editText.trim());
      onEdit(updated as WaMessage);
      setEditing(false);
    } finally { setSavingEdit(false); }
  }

  if (msg.isInternal) {
    return (
      <div className="flex justify-center mb-2">
        <div className="max-w-[78%] rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="h-3 w-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Nota interna</span>
            {msg.sentBy && <span className="text-[10px] text-amber-500">· {msg.sentBy.name}</span>}
          </div>
          <p className="text-gray-800 dark:text-amber-100 whitespace-pre-wrap">{msg.text}</p>
          <p className="text-[10px] text-amber-400 mt-1 text-right">{formatTime(msg.createdAt)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-2 group`}>
      {/* Reply button — left for outbound, right for inbound */}
      {!isOut && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center mr-2 flex-shrink-0 flex items-center gap-1">
          <button onClick={() => onReply(msg)} title="Responder" className="text-gray-400 hover:text-green-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={() => onForward(msg)} title="Encaminhar" className="text-gray-400 hover:text-blue-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      )}

      <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm ${
        isOut
          ? "bg-green-500 text-white rounded-br-sm"
          : "bg-white dark:bg-[#2a2d32] text-gray-900 dark:text-white shadow-sm rounded-bl-sm border border-[rgba(0,0,0,0.06)]"
      }`}>
        {/* Quote (reply-to) */}
        {msg.replyTo && <QuoteBar replyTo={msg.replyTo} isOut={isOut} />}

        {/* Image / Sticker */}
        {mediaSrc && (msg.mediaType === "image" || msg.mediaType === "sticker") && (
          <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="block mb-1">
            <img
              src={mediaSrc}
              alt={msg.filename ?? "imagem"}
              className={`rounded-xl max-w-full cursor-pointer hover:opacity-90 transition-opacity ${msg.mediaType === "sticker" ? "max-w-[160px]" : ""}`}
              style={{ maxHeight: 280 }}
            />
          </a>
        )}
        {/* Video */}
        {mediaSrc && msg.mediaType === "video" && (
          <video controls src={mediaSrc} className="rounded-xl max-w-full mb-1" style={{ maxHeight: 280 }} />
        )}
        {/* Audio */}
        {mediaSrc && msg.mediaType === "audio" && (
          <audio controls src={mediaSrc} className="w-full mb-1" style={{ minWidth: 200 }} />
        )}
        {/* Document */}
        {mediaSrc && msg.mediaType === "document" && (
          <a
            href={mediaSrc}
            download={msg.filename ?? "arquivo"}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-1 transition-colors ${
              isOut ? "bg-green-600 hover:bg-green-700" : "bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20"
            }`}
          >
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs truncate max-w-[180px]">{msg.filename ?? "Documento"}</span>
            <svg className="h-3.5 w-3.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        )}

        {/* Caption when there is media */}
        {mediaSrc && msg.text && !msg.text.startsWith("[") && (
          <p className="whitespace-pre-wrap">{renderMessageText(msg.text, isOut)}</p>
        )}
        {/* Fallback placeholder when media failed to load */}
        {!mediaSrc && msg.mediaType && (
          <p className="opacity-60 italic text-xs">{msg.text || `[${msg.mediaType}]`}</p>
        )}
        {/* Shared contact card */}
        {!mediaSrc && !msg.mediaType && (msg.text?.startsWith("📇 ") || msg.text?.match(/^\[contacts?\]$/i)) && (() => {
          const lines = msg.text?.startsWith("📇 ") ? msg.text.split("\n") : ["📇 Contato compartilhado"];
          const contactName = lines[0].replace("📇 ", "");
          const phones = lines.slice(1).filter(Boolean);
          const firstPhone = phones[0];
          return (
            <div className={`rounded-xl overflow-hidden min-w-[210px] ${isOut ? "bg-green-600/40" : "bg-gray-100 dark:bg-white/8"}`}>
              <div className="flex items-center gap-2.5 p-2.5">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOut ? "bg-green-400/30" : "bg-gray-300 dark:bg-white/15"}`}>
                  <svg className="h-5 w-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{contactName}</p>
                  {phones.length > 0 ? phones.map(p => (
                    <p key={p} className={`text-xs mt-0.5 ${isOut ? "text-green-100" : "text-gray-600 dark:text-gray-300"}`}>{p}</p>
                  )) : (
                    <p className="text-xs mt-0.5 opacity-60">Número não disponível</p>
                  )}
                </div>
              </div>
              {onContactConverse && firstPhone && (
                <button
                  onClick={() => onContactConverse(firstPhone, contactName)}
                  className={`w-full text-xs font-semibold py-1.5 border-t flex items-center justify-center gap-1.5 transition-colors ${
                    isOut
                      ? "border-green-500/40 text-green-100 hover:bg-green-500/30"
                      : "border-gray-200 dark:border-white/10 text-green-600 dark:text-green-400 hover:bg-gray-200 dark:hover:bg-white/10"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Iniciar conversa
                </button>
              )}
            </div>
          );
        })()}
        {/* Plain text message (no media, not a contact card) */}
        {!mediaSrc && !msg.mediaType && msg.text && !msg.text.startsWith("📇 ") && !msg.text.match(/^\[contacts?\]$/i) && (
          editing ? (
            <div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                  if (e.key === "Escape") setEditing(false);
                }}
                rows={Math.max(2, editText.split("\n").length)}
                autoFocus
                className={`w-full bg-transparent resize-none outline-none text-sm whitespace-pre-wrap ${isOut ? "text-white placeholder-green-200" : "text-gray-900 dark:text-white"}`}
                style={{ minWidth: 180 }}
              />
              <div className="flex justify-end gap-3 mt-1.5">
                <button onClick={() => setEditing(false)} className={`text-xs ${isOut ? "text-green-100 hover:text-white" : "text-gray-400 hover:text-gray-600"}`}>
                  Cancelar
                </button>
                <button onClick={handleSaveEdit} disabled={savingEdit} className={`text-xs font-semibold disabled:opacity-50 ${isOut ? "text-white" : "text-green-600 dark:text-green-400"}`}>
                  {savingEdit ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{renderMessageText(msg.text, isOut)}</p>
          )
        )}

        {/* Footer: time + ticks */}
        <p className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isOut ? "text-green-100" : "text-gray-400"}`}>
          {formatTime(msg.createdAt)}
          {isOut && msg.sentBy && <span>· {msg.sentBy.name}</span>}
          {isOut && <MessageTicks status={msg.status} />}
        </p>
      </div>

      {/* Actions for outbound */}
      {isOut && !editing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center ml-2 flex-shrink-0 flex items-center gap-1">
          {canEdit && (
            <button onClick={() => { setEditText(msg.text ?? ""); setEditing(true); }} title="Editar" className="text-gray-400 hover:text-amber-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          <button onClick={() => onForward(msg)} title="Encaminhar" className="text-gray-400 hover:text-blue-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
          <button onClick={() => onReply(msg)} title="Responder" className="text-gray-400 hover:text-green-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Templates panel ──────────────────────────────────────────────────────────

function TemplatesManager({ onClose, onSelect }: { onClose: () => void; onSelect?: (text: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [form, setForm] = useState({ name: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    whatsappApi.getTemplates().then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name || !form.text) return;
    setSaving(true);
    try {
      await whatsappApi.createTemplate(form);
      setForm({ name: "", text: "" });
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este template?")) return;
    await whatsappApi.deleteTemplate(id);
    load();
  }

  return (
    <div className="fixed bottom-[80px] right-8 w-80 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1e2024] shadow-xl z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Templates</p>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => setShowForm((v) => !v)} className="text-xs text-green-600 font-medium hover:underline">
              + Novo
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showForm && isAdmin && (
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] bg-gray-50 dark:bg-white/3 space-y-2">
          <input
            placeholder="Nome do template"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-1.5 text-sm focus:outline-none"
          />
          <textarea
            placeholder="Texto da mensagem..."
            rows={3}
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-1.5 text-sm focus:outline-none resize-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50">
              {saving ? "..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
        {templates.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">Nenhum template cadastrado.</p>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="px-4 py-3 flex items-start gap-2 group cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors"
              onClick={() => { if (onSelect) { onSelect(t.text); onClose(); } }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{t.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.text}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                  className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Automations panel ────────────────────────────────────────────────────────

function AutomationsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [automations, setAutomations] = useState<WaAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", keyword: "", matchType: "contains", response: "", active: true });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    whatsappApi.getAutomations().then(setAutomations).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name || !form.keyword || !form.response) return;
    setSaving(true);
    try {
      await whatsappApi.createAutomation(form);
      setForm({ name: "", keyword: "", matchType: "contains", response: "", active: true });
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(auto: WaAutomation) {
    await whatsappApi.updateAutomation(auto.id, { active: !auto.active });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta automação?")) return;
    await whatsappApi.deleteAutomation(id);
    load();
  }

  const matchLabels: Record<string, string> = { contains: "Contém", exact: "Exato", starts_with: "Começa com" };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Automações</h2>
          <p className="text-xs text-gray-500 mt-0.5">Respostas automáticas por palavra-chave</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600">
            + Nova
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)] bg-gray-50 dark:bg-white/3 space-y-3">
          <input placeholder="Nome da automação" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
          <div className="flex gap-2">
            <input placeholder="Palavra-chave" value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
              className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
            <select value={form.matchType} onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value }))}
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400">
              <option value="contains">Contém</option>
              <option value="exact">Exato</option>
              <option value="starts_with">Começa com</option>
            </select>
          </div>
          <textarea placeholder="Resposta automática..." rows={3} value={form.response} onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 dark:border-white/10 px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-green-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-8">Carregando...</p>
        ) : automations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">🤖</p>
            <p className="text-sm text-gray-400">Nenhuma automação criada.</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.05)]">
            {automations.map((auto) => (
              <div key={auto.id} className="flex items-start gap-3 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{auto.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${auto.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-white/5"}`}>
                      {auto.active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{matchLabels[auto.matchType] ?? auto.matchType}:</span> "{auto.keyword}"
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{auto.response}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleActive(auto)} className="rounded-lg p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20">
                      {auto.active ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    <button onClick={() => handleDelete(auto.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meta templates panel ─────────────────────────────────────────────────────

function MetaTemplatesPanel({ onSend }: { onSend: (convId: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "UTILITY", language: "pt_BR", bodyText: "", exampleValues: "" });
  const [saving, setSaving] = useState(false);
  const [sendModal, setSendModal] = useState<MetaTemplate | null>(null);

  const load = useCallback(() => {
    whatsappApi.getMetaTemplates().then(setTemplates).catch(() => setTemplates([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.name || !form.bodyText) return;
    setSaving(true);
    try {
      await whatsappApi.createMetaTemplate({
        name: form.name,
        category: form.category,
        language: form.language,
        bodyText: form.bodyText,
        exampleValues: form.exampleValues ? form.exampleValues.split(",").map(s => s.trim()) : undefined,
      });
      setForm({ name: "", category: "UTILITY", language: "pt_BR", bodyText: "", exampleValues: "" });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao criar template");
    } finally { setSaving(false); }
  }

  const statusColor: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const statusLabel: Record<string, string> = { APPROVED: "Aprovado ✓", PENDING: "Aguardando", REJECTED: "Rejeitado" };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Templates da Meta</h2>
          <p className="text-xs text-gray-500 mt-0.5">Para iniciar conversas com novos contatos</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(v => !v)} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600">
            + Novo
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)] bg-gray-50 dark:bg-white/3 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome (sem espaços)</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: orcamento_pronto"
                className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none">
                <option value="UTILITY">Utilidade</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Texto — use {`{{1}}`}, {`{{2}}`} para variáveis
            </label>
            <textarea value={form.bodyText} onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))} rows={4}
              placeholder={`Olá {{1}}, aqui é a Grafinorte! Seu orçamento está pronto. Posso te enviar?`}
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Exemplos das variáveis (separados por vírgula)</label>
            <input value={form.exampleValues} onChange={e => setForm(f => ({ ...f, exampleValues: e.target.value }))} placeholder="João Silva, Grafinorte"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
          </div>
          <p className="text-xs text-gray-400">A Meta analisa e aprova em até 24h. Após aprovado você poderá usar para iniciar conversas.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 dark:border-white/10 px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-green-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">
              {saving ? "Enviando..." : "Enviar para Meta"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-8">Carregando...</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-sm text-gray-400">Nenhum template criado.</p>
            {isAdmin && <p className="text-xs text-gray-400 mt-1">Clique em "+ Novo" para criar.</p>}
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.05)]">
            {templates.map(t => {
              const body = t.components.find(c => c.type === "BODY");
              return (
                <div key={t.id} className="flex items-start gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor[t.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {statusLabel[t.status] ?? t.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{t.language} · {t.category}</span>
                    </div>
                    {body?.text && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{body.text}</p>}
                  </div>
                  {t.status === "APPROVED" && (
                    <button onClick={() => setSendModal(t)}
                      className="flex-shrink-0 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600">
                      Usar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendModal && (
        <SendTemplateModal template={sendModal} onClose={() => setSendModal(null)} onSent={(id) => { setSendModal(null); onSend(id); }} />
      )}
    </div>
  );
}

function SendTemplateModal({ template, onClose, onSent }: {
  template: MetaTemplate; onClose: () => void; onSent: (convId: string) => void;
}) {
  const body = template.components.find(c => c.type === "BODY");
  const headerComp = template.components.find(c => c.type === "HEADER");
  const headerMediaType = headerComp?.format && ["IMAGE","VIDEO","DOCUMENT"].includes(headerComp.format)
    ? headerComp.format.toLowerCase() : null;
  const varCount = (body?.text?.match(/\{\{\d+\}\}/g) ?? []).length;
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [variables, setVariables] = useState<string[]>(Array(varCount).fill(""));
  const [headerMediaId, setHeaderMediaId] = useState("");
  const [headerFileName, setHeaderFileName] = useState("");
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);

  const preview = body?.text?.replace(/\{\{(\d+)\}\}/g, (_, i) => variables[Number(i) - 1] || `{{${i}}}`) ?? "";

  const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  const canSend = !!phone.trim() && (!headerMediaType || !!headerMediaId);

  async function handleHeaderUpload(file: File) {
    setUploadingHeader(true);
    setError(null);
    try {
      const { mediaId } = await whatsappApi.uploadMedia(file);
      setHeaderMediaId(mediaId);
      setHeaderFileName(file.name);
    } catch {
      setError("Erro ao fazer upload da mídia. Tente novamente.");
    } finally {
      setUploadingHeader(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    setSaving(true); setError(null);
    try {
      const result = await whatsappApi.sendTemplateMessage({
        phone: phone.trim(), name: name.trim() || undefined,
        templateName: template.name, language: template.language,
        variables: variables.filter(Boolean),
        ...(headerMediaType && headerMediaId ? { headerMediaUrl: headerMediaId, headerMediaType, headerFileName: headerFileName || undefined } : {}),
      });
      onSent(result.conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2024] shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Enviar template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {preview && (
          <div className="mb-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-3">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Prévia da mensagem:</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{preview}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Número (com DDI)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999998888" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nome do contato (opcional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" className={inputCls} />
          </div>
          {headerMediaType && (
            <div>
              <label className={labelCls}>
                {headerMediaType === "image" ? "Imagem" : headerMediaType === "video" ? "Vídeo" : "Documento"} do cabeçalho *
              </label>
              <input ref={headerFileRef} type="file"
                accept={headerMediaType === "image" ? "image/*" : headerMediaType === "video" ? "video/*" : "*/*"}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleHeaderUpload(f); }} />
              <button type="button" onClick={() => headerFileRef.current?.click()}
                disabled={uploadingHeader}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-[#2a2d32] px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 disabled:opacity-50 transition-colors">
                {uploadingHeader ? (
                  <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Enviando...</>
                ) : headerFileName ? (
                  <><svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg><span className="truncate text-green-600 dark:text-green-400">{headerFileName}</span><span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Trocar</span></>
                ) : (
                  <><svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Clique para selecionar o arquivo</>
                )}
              </button>
            </div>
          )}
          {variables.map((v, i) => (
            <div key={i}>
              <label className={labelCls}>Variável {`{{${i + 1}}}`}</label>
              <input value={v} onChange={e => setVariables(vs => vs.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Valor para {{${i + 1}}}`} className={inputCls} />
            </div>
          ))}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="rounded-xl border border-gray-200 dark:border-white/10 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSend} disabled={saving || !canSend}
            className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-40">
            {saving ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New conversation modal ───────────────────────────────────────────────────

function NewConversationModal({ onClose, onCreated, initialPhone = "", initialName = "" }: {
  onClose: () => void;
  onCreated: (convId: string) => void;
  initialPhone?: string;
  initialName?: string;
}) {
  const [mode, setMode] = useState<"template" | "free">("template");
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplate | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [headerMediaId, setHeaderMediaId] = useState("");
  const [headerFileName, setHeaderFileName] = useState("");
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    whatsappApi.getMetaTemplates()
      .then(ts => {
        const approved = ts.filter(t => t.status === "APPROVED");
        setMetaTemplates(approved);
        if (approved.length > 0) setSelectedTemplate(approved[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    if (!selectedTemplate) { setVariables([]); setHeaderMediaId(""); setHeaderFileName(""); return; }
    const body = selectedTemplate.components.find(c => c.type === "BODY");
    const varCount = (body?.text?.match(/\{\{\d+\}\}/g) ?? []).length;
    setVariables(Array(varCount).fill(""));
    setHeaderMediaId("");
    setHeaderFileName("");
  }, [selectedTemplate]);

  async function handleHeaderUpload(file: File) {
    setUploadingHeader(true);
    setError(null);
    try {
      const { mediaId } = await whatsappApi.uploadMedia(file);
      setHeaderMediaId(mediaId);
      setHeaderFileName(file.name);
    } catch {
      setError("Erro ao fazer upload da mídia. Tente novamente.");
    } finally {
      setUploadingHeader(false);
    }
  }

  const headerComp = selectedTemplate?.components.find(c => c.type === "HEADER");
  const headerMediaType = headerComp?.format && ["IMAGE","VIDEO","DOCUMENT"].includes(headerComp.format)
    ? headerComp.format.toLowerCase()
    : null;

  const preview = (() => {
    if (!selectedTemplate) return "";
    const body = selectedTemplate.components.find(c => c.type === "BODY");
    return body?.text?.replace(/\{\{(\d+)\}\}/g, (_, i) => variables[Number(i) - 1] || `{{${i}}}`) ?? "";
  })();

  const canSend = mode === "template"
    ? !!phone.trim() && !!selectedTemplate && (!headerMediaType || !!headerMediaId)
    : !!phone.trim() && !!text.trim();

  async function handleSend() {
    if (!canSend) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "template" && selectedTemplate) {
        const result = await whatsappApi.sendTemplateMessage({
          phone: phone.trim(),
          name: name.trim() || undefined,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          variables: variables.filter(Boolean),
          ...(headerMediaType && headerMediaId ? {
            headerMediaUrl: headerMediaId,
            headerMediaType,
          } : {}),
        });
        onCreated(result.conversation.id);
      } else {
        const result = await whatsappApi.startConversation({ phone: phone.trim(), name: name.trim() || undefined, text: text.trim() });
        onCreated(result.conversation.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2024] shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Nova conversa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden mb-4 text-sm">
          <button
            className={`flex-1 py-2 font-medium transition-colors ${mode === "template" ? "bg-green-500 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"}`}
            onClick={() => setMode("template")}
          >
            Template
          </button>
          <button
            className={`flex-1 py-2 font-medium transition-colors ${mode === "free" ? "bg-green-500 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"}`}
            onClick={() => setMode("free")}
          >
            Texto livre
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Número (com DDI, ex: +5511999998888)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999998888" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nome do contato (opcional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" className={inputCls} />
          </div>

          {mode === "template" ? (
            loadingTemplates ? (
              <p className="text-xs text-gray-400 py-2">Carregando templates...</p>
            ) : metaTemplates.length === 0 ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">Nenhum template aprovado encontrado. Crie um template na aba <strong>Templates</strong> e aguarde aprovação da Meta.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Template</label>
                  <select
                    value={selectedTemplate?.name ?? ""}
                    onChange={e => setSelectedTemplate(metaTemplates.find(t => t.name === e.target.value) ?? null)}
                    className={inputCls}
                  >
                    {metaTemplates.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Header media upload — shown only when template requires it */}
                {headerMediaType && (
                  <div>
                    <label className={labelCls}>
                      {headerMediaType === "image" ? "Imagem" : headerMediaType === "video" ? "Vídeo" : "Documento"} do cabeçalho *
                    </label>
                    <input ref={headerFileRef} type="file"
                      accept={headerMediaType === "image" ? "image/*" : headerMediaType === "video" ? "video/*" : "*/*"}
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleHeaderUpload(f); }} />
                    <button type="button" onClick={() => headerFileRef.current?.click()}
                      disabled={uploadingHeader}
                      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-[#2a2d32] px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 disabled:opacity-50 transition-colors">
                      {uploadingHeader ? (
                        <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Enviando...</>
                      ) : headerFileName ? (
                        <><svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg><span className="truncate text-green-600 dark:text-green-400">{headerFileName}</span><span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Trocar</span></>
                      ) : (
                        <><svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Clique para selecionar o arquivo</>
                      )}
                    </button>
                  </div>
                )}

                {preview && (
                  <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-3">
                    <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 mb-1">Prévia da mensagem:</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{preview}</p>
                  </div>
                )}

                {variables.map((v, i) => (
                  <div key={i}>
                    <label className={labelCls}>Variável {`{{${i + 1}}}`}</label>
                    <input
                      value={v}
                      onChange={e => setVariables(vs => vs.map((x, j) => j === i ? e.target.value : x))}
                      placeholder={`Valor para {{${i + 1}}}`}
                      className={inputCls}
                    />
                  </div>
                ))}
              </>
            )
          ) : (
            <>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ Texto livre só funciona se o contato já conversou com você nas últimas 24h. Para iniciar conversa com novos contatos, use um <strong>Template</strong>.
                </p>
              </div>
              <div>
                <label className={labelCls}>Mensagem</label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={4}
                  placeholder="Digite a mensagem..."
                  className={`${inputCls} resize-none`}
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="rounded-xl border border-gray-200 dark:border-white/10 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={saving || !canSend}
            className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
          >
            {saving ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Enviando...
              </>
            ) : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Label Manager Modal ──────────────────────────────────────────────────────

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#64748b", "#78716c",
];

function LabelManager({
  labels,
  onClose,
  onCreated,
  onDeleted,
}: {
  labels: WaLabel[];
  onClose: () => void;
  onCreated: (label: WaLabel) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[3]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await whatsappApi.createLabel({ name: name.trim(), color });
      onCreated(created);
      setName("");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await whatsappApi.deleteLabel(id);
      onDeleted(id);
    } finally { setDeletingId(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-[#1c1e22] rounded-2xl shadow-2xl border border-[rgba(0,0,0,0.08)] w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <p className="font-semibold text-gray-900 dark:text-white">Gerenciar Etiquetas</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Existing labels */}
        <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
          {labels.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma etiqueta criada ainda.</p>
          ) : (
            labels.map((label) => (
              <div key={label.id} className="flex items-center gap-3 rounded-xl border border-[rgba(0,0,0,0.06)] px-3 py-2">
                <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">{label.name}</span>
                <button
                  onClick={() => handleDelete(label.id)}
                  disabled={deletingId === label.id}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Create form */}
        <div className="px-5 pb-5 border-t border-[rgba(0,0,0,0.06)] pt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Nova etiqueta</p>
          <div className="flex gap-2 mb-3">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full flex-shrink-0 transition-transform hover:scale-110"
                style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : undefined, outlineOffset: "2px" }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Nome da etiqueta..."
              className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-3 py-2 text-sm focus:outline-none focus:border-green-400 dark:text-white"
            />
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : "Criar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Panel ────────────────────────────────────────────────────────────

function ContactPanel({
  contact,
  onClose,
  onUpdated,
}: {
  contact: WaContact;
  onClose: () => void;
  onUpdated: (updated: WaContact) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(contact.name);
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const [crmContact, setCrmContact] = useState<ContactWithDeals | null>(null);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);

  useEffect(() => {
    setName(contact.name);
    setNotes(contact.notes ?? "");
    setCrmContact(null);
    setCrmError(null);
    if (contact.crmContactId) {
      setLoadingCrm(true);
      crmApi.getContact(contact.crmContactId)
        .then(setCrmContact)
        .catch(() => setCrmError("Não foi possível carregar dados do CRM."))
        .finally(() => setLoadingCrm(false));
    }
  }, [contact.id, contact.crmContactId]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await whatsappApi.patchContact(contact.id, {
        name: name.trim() || contact.name,
        notes: notes.trim(),
      });
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCrm() {
    setSavingCrm(true);
    try {
      const stages = await crmApi.listStages();
      const firstStage = [...stages].sort((a, b) => a.order - b.order)[0];
      if (!firstStage) throw new Error("Configure as etapas do CRM primeiro.");
      const crm = await crmApi.createContact({ name: name.trim() || contact.name, phone: contact.phone });
      await crmApi.createDeal({ title: name.trim() || contact.name, contactId: crm.id, stageId: firstStage.id });
      const updated = await whatsappApi.patchContact(contact.id, { crmContactId: crm.id });
      onUpdated(updated);
      const data = await crmApi.getContact(crm.id);
      setCrmContact(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao criar no CRM. Verifique permissão (ADMIN ou COMERCIAL).");
    } finally {
      setSavingCrm(false);
    }
  }

  const COLORS = ["bg-green-500", "bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
  const colorIdx = contact.phone.charCodeAt(contact.phone.length - 1) % COLORS.length;
  const initials = contact.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

  const stageColors: Record<string, string> = {
    won: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
    default: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  function fmtValue(v: number) {
    return v > 0 ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }) : null;
  }
  function fmtDate(iso: string | null | undefined) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Drag handle (mobile only) */}
      <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)] dark:border-white/[0.06] flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Contato / CRM</p>
        <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + identity */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/[0.06]">
          <div className={`h-14 w-14 flex-shrink-0 rounded-full ${COLORS[colorIdx]} flex items-center justify-center text-white text-lg font-bold`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white leading-tight truncate">{contact.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{contact.phone}</p>
            {crmContact?.company && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium truncate">{crmContact.company}</p>}
            {crmContact?.email && <a href={`mailto:${crmContact.email}`} className="text-xs text-blue-500 hover:underline block mt-0.5 truncate">{crmContact.email}</a>}
          </div>
        </div>

        {/* Edit form */}
        <div className="p-4 space-y-3 border-b border-[rgba(0,0,0,0.06)] dark:border-white/[0.06]">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-3 py-2.5 text-sm focus:outline-none focus:border-green-400 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Anotações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observações sobre este contato..."
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-3 py-2.5 text-sm focus:outline-none focus:border-green-400 dark:text-white resize-none" />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded-xl bg-[#00a884] py-2.5 text-sm font-semibold text-white hover:bg-[#00956e] disabled:opacity-50 transition-colors active:scale-[0.98]">
            {saving ? "Salvando..." : "Salvar contato"}
          </button>
        </div>

        {/* CRM section */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Negócios no CRM</p>
            {crmContact && (
              <button onClick={() => navigate("/comercial/funil")} className="text-[11px] font-medium text-blue-500 hover:underline">
                Abrir funil →
              </button>
            )}
          </div>

          {loadingCrm ? (
            <div className="flex items-center justify-center gap-2 text-gray-400 text-xs py-6">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Carregando CRM...
            </div>
          ) : crmError ? (
            <p className="text-xs text-red-400 text-center py-2">{crmError}</p>
          ) : crmContact ? (
            <div className="space-y-2.5">
              {crmContact.deals.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Nenhum negócio encontrado.</p>
              ) : (
                crmContact.deals.map(deal => {
                  const colorKey = deal.stage.isWon ? "won" : deal.stage.isClosed ? "closed" : "default";
                  const val = fmtValue(deal.value);
                  const followUp = fmtDate(deal.nextFollowUp);
                  const closeDate = fmtDate(deal.expectedCloseDate);
                  return (
                    <div key={deal.id} className="rounded-2xl border border-[rgba(0,0,0,0.07)] dark:border-white/[0.08] bg-gray-50 dark:bg-white/5 p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">{deal.title}</p>
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${stageColors[colorKey]}`}>
                          {deal.stage.name}
                        </span>
                      </div>
                      {val && <p className="text-base font-bold text-green-600 dark:text-green-400">{val}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {deal.owner && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            {deal.owner.name}
                          </div>
                        )}
                        {followUp && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            {followUp}
                          </div>
                        )}
                        {closeDate && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            {closeDate}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <button
                onClick={async () => {
                  const stages = await crmApi.listStages().catch(() => []);
                  const firstStage = [...stages].sort((a, b) => a.order - b.order)[0];
                  if (!firstStage) return alert("Configure as etapas do CRM primeiro.");
                  await crmApi.createDeal({ title: name.trim() || contact.name, contactId: crmContact.id, stageId: firstStage.id });
                  const data = await crmApi.getContact(crmContact.id);
                  setCrmContact(data);
                }}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-green-600 hover:border-green-400 dark:hover:border-green-600 transition-colors active:scale-[0.98]"
              >
                + Novo negócio
              </button>
            </div>
          ) : (
            /* Not in CRM yet — prominent CTA */
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 p-5 flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                <svg className="h-6 w-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Não está no CRM</p>
                <p className="text-xs text-gray-400 mt-0.5">Adicione para acompanhar negócios e histórico</p>
              </div>
              <button onClick={handleCreateCrm} disabled={savingCrm}
                className="w-full rounded-xl bg-violet-500 hover:bg-violet-600 active:scale-[0.98] disabled:opacity-50 py-3 text-sm font-semibold text-white transition-all shadow-sm">
                {savingCrm ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    Criando...
                  </span>
                ) : "Adicionar ao CRM"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: bottom sheet overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative w-full max-h-[88vh] rounded-t-2xl bg-white dark:bg-[#1c1e22] shadow-2xl flex flex-col overflow-hidden"
          style={{ animation: "slideUp 0.25s ease-out" }}>
          {panelContent}
        </div>
      </div>

      {/* Desktop: side panel */}
      <div className="hidden md:flex w-72 flex-shrink-0 border-l border-[rgba(0,0,0,0.06)] dark:border-white/[0.06] flex-col bg-white dark:bg-[#1c1e22] overflow-hidden">
        {panelContent}
      </div>
    </>
  );
}

// ─── Forward modal ────────────────────────────────────────────────────────────

function ForwardModal({ msg, conversations, onClose }: {
  msg: WaMessage;
  conversations: WaConversation[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [forwarding, setForwarding] = useState<string | null>(null);

  const previewText = msg.text
    ? msg.text.slice(0, 60) + (msg.text.length > 60 ? "…" : "")
    : `[${msg.mediaType ?? "mídia"}]`;

  const filtered = conversations.filter((c) =>
    c.contact.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact.phone.includes(search)
  );

  async function handleForward(convId: string) {
    if (forwarding) return;
    setForwarding(convId);
    try {
      const fwd = msg.text ?? `[${msg.mediaType ?? "mídia"}]`;
      await whatsappApi.sendMessage(convId, `↪️ ${fwd}`);
      onClose();
    } finally { setForwarding(null); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl md:rounded-2xl bg-white dark:bg-[#1e2024] shadow-2xl overflow-hidden"
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white">Encaminhar mensagem</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{previewText}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-3">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            autoFocus
            className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2a2d32] px-4 py-2 text-sm focus:outline-none focus:border-green-400 dark:text-white"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Nenhuma conversa encontrada.</p>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleForward(conv.id)}
                disabled={!!forwarding}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
              >
                <Avatar name={conv.contact.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.contact.name}</p>
                  <p className="text-xs text-gray-400 truncate">{conv.contact.phone}</p>
                </div>
                {forwarding === conv.id && (
                  <svg className="h-4 w-4 animate-spin text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

interface ToastMsg { id: string; convId: string; name: string; text: string; }

function ToastNotification({ toast, onDismiss, onClick }: {
  toast: ToastMsg; onDismiss: () => void; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 bg-white dark:bg-[#2a2d32] rounded-2xl shadow-xl border border-[rgba(0,0,0,0.08)] dark:border-white/10 p-3 w-80 cursor-pointer hover:shadow-2xl transition-shadow"
      style={{ animation: "slideInRight 0.25s ease-out" }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Avatar name={toast.name} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{toast.name}</p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{toast.text}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDismiss(); }}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-0.5 p-0.5"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WhatsAppPage() {
  const [tab, setTab] = useState<"inbox" | "templates" | "automacoes">("inbox");
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [activeConv, setActiveConv] = useState<WaConversation | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<{ open: number; unread: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");
  const [search, setSearch] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [showNewConv, setShowNewConv] = useState(false);
  const [replyingTo, setReplyingTo] = useState<WaMessage | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<WaMessage | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [agents, setAgents] = useState<WaUser[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [newConvPrefill, setNewConvPrefill] = useState<{ phone: string; name: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const prevMsgCountRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load templates, labels and agents on mount
  useEffect(() => {
    whatsappApi.getTemplates().then(setTemplates).catch(() => {});
    whatsappApi.getLabels().then(setLabels).catch(() => {});
    whatsappApi.getAgents().then(setAgents).catch(() => {});
  }, []);

  const loadConversations = useCallback(() => {
    whatsappApi.getConversations(statusFilter)
      .then((data) => {
        // Sound + toast notification for new unread messages
        data.forEach((conv) => {
          const prev = prevUnreadRef.current[conv.id] ?? 0;
          if (conv.unreadCount > prev && conv.id !== activeConvId) {
            playNotificationSound();
            const toastId = `${conv.id}-${Date.now()}`;
            setToasts(ts => [...ts.slice(-4), {
              id: toastId,
              convId: conv.id,
              name: conv.contact.name,
              text: conv.lastMessageText ?? "Nova mensagem",
            }]);
            setTimeout(() => setToasts(ts => ts.filter(t => t.id !== toastId)), 5000);
          }
        });
        prevUnreadRef.current = Object.fromEntries(data.map((c) => [c.id, c.unreadCount]));
        setConversations(data);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [statusFilter, activeConvId]);

  useEffect(() => {
    setLoadingConvs(true);
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    whatsappApi.getStats().then(setStats).catch(() => {});
  }, [conversations]);

  useEffect(() => {
    if (!activeConvId) return;
    prevMsgCountRef.current = 0; // reset so scroll-to-bottom always fires on conversation open
    setLoadingMsgs(true);
    whatsappApi.getConversationMessages(activeConvId)
      .then(({ conversation, messages }) => {
        setActiveConv(conversation);
        setMessages(messages);
        setConversations((cs) => cs.map((c) => c.id === activeConvId ? { ...c, unreadCount: 0 } : c));
        prevUnreadRef.current[activeConvId] = 0;
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId]);

  // Poll active conversation messages every 5s to catch inbound messages and fix any duplicates
  useEffect(() => {
    if (!activeConvId) return;
    const timer = setInterval(() => {
      whatsappApi.getConversationMessages(activeConvId)
        .then(({ messages: newMsgs }) => {
          setMessages(prev => {
            if (
              newMsgs.length === prev.length &&
              newMsgs[newMsgs.length - 1]?.id === prev[prev.length - 1]?.id &&
              newMsgs[newMsgs.length - 1]?.status === prev[prev.length - 1]?.status
            ) return prev;
            return newMsgs;
          });
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [activeConvId]);

  useEffect(() => {
    const delta = messages.length - prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (delta <= 0) return;
    // Bulk load (initial open) → instant; single new message → smooth
    messagesEndRef.current?.scrollIntoView({ behavior: delta === 1 ? "smooth" : "instant" });
  }, [messages]);

  useEffect(() => {
    const timer = setInterval(loadConversations, 10000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  // Close pickers on outside click
  useEffect(() => {
    if (!showTemplates && !showLabelPicker && !showAgentPicker && !showEmojiPicker) return;
    function handle(e: MouseEvent) {
      const target = e.target as Element;
      if (showTemplates && !target.closest("[data-templates-panel]")) setShowTemplates(false);
      if (showLabelPicker && !target.closest("[data-label-picker]")) setShowLabelPicker(false);
      if (showAgentPicker && !target.closest("[data-agent-picker]")) setShowAgentPicker(false);
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(target)) setShowEmojiPicker(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showTemplates, showLabelPicker, showAgentPicker, showEmojiPicker]);

  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messages]);

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.contact.name.toLowerCase().includes(q) ||
      c.contact.phone.includes(q)
    );
  });

  async function handleSend() {
    if (!activeConvId || sending || uploadingMedia) return;
    if (stagedFile) { await sendStagedFile(); return; }
    if (!replyText.trim()) return;
    setSending(true);
    const currentReplyId = replyingTo?.id;
    const currentNoteMode = isNoteMode;
    try {
      const msg = await whatsappApi.sendMessage(activeConvId, replyText.trim(), currentReplyId, currentNoteMode);
      setMessages((ms) => [...ms, msg]);
      setReplyText("");
      setReplyingTo(null);
      if (!currentNoteMode) loadConversations();
    } catch (err) {
      console.error("Erro ao enviar:", err);
    } finally { setSending(false); }
  }

  function stageFile(file: File) {
    setStagedFile(file);
    setStagedPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    // focus textarea so Enter works immediately
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function clearStagedFile() {
    setStagedFile(null);
    if (stagedPreview) URL.revokeObjectURL(stagedPreview);
    setStagedPreview(null);
  }

  async function sendStagedFile() {
    if (!activeConvId || !stagedFile) return;
    setUploadingMedia(true);
    const file = stagedFile;
    const caption = replyText.trim();
    clearStagedFile();
    try {
      const { mediaId, mimetype, localFilename } = await whatsappApi.uploadMedia(file);
      const msg = await whatsappApi.sendMediaMessage(activeConvId, {
        mediaId, mimetype, localFilename,
        caption: caption || undefined,
      });
      setMessages((ms) => [...ms, msg]);
      setReplyText("");
      setReplyingTo(null);
      loadConversations();
    } catch (err) {
      console.error("Erro ao enviar arquivo:", err);
    } finally { setUploadingMedia(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stageFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) stageFile(file);
  }

  function insertEmoji(emoji: { native: string }) {
    const ta = textareaRef.current;
    if (!ta) { setReplyText(t => t + emoji.native); return; }
    const start = ta.selectionStart ?? replyText.length;
    const end = ta.selectionEnd ?? replyText.length;
    const next = replyText.slice(0, start) + emoji.native + replyText.slice(end);
    setReplyText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.native.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function handleCloseConversation() {
    if (!activeConvId) return;
    await whatsappApi.patchConversation(activeConvId, { status: "closed" });
    setActiveConvId(null); setActiveConv(null); setMessages([]); setReplyingTo(null);
    loadConversations();
  }

  async function handleReopenConversation() {
    if (!activeConvId) return;
    await whatsappApi.patchConversation(activeConvId, { status: "open" });
    loadConversations();
    setActiveConv((c) => c ? { ...c, status: "open" } : c);
  }

  function handleContactUpdated(updated: WaContact) {
    setActiveConv(c => c ? { ...c, contact: updated } : c);
    setConversations(cs => cs.map(c => c.contactId === updated.id ? { ...c, contact: updated } : c));
  }

  function handleContactConverse(phone: string, name: string) {
    const norm = (p: string) => p.replace(/[\s\-().]/g, "");
    const existing = conversations.find(c => norm(c.contact.phone) === norm(phone));
    if (existing) {
      setActiveConvId(existing.id);
      setTab("inbox");
    } else {
      setNewConvPrefill({ phone, name });
      setShowNewConv(true);
    }
  }

  async function toggleLabel(labelId: string) {
    if (!activeConvId || !activeConv) return;
    const isActive = activeConv.labels.some((l) => l.label.id === labelId);
    const updated = isActive
      ? await whatsappApi.removeLabel(activeConvId, labelId)
      : await whatsappApi.addLabel(activeConvId, labelId);
    setActiveConv((c) => c ? { ...c, labels: updated.labels } : c);
    setConversations((cs) => cs.map((c) => c.id === activeConvId ? { ...c, labels: updated.labels } : c));
  }

  async function assignAgent(agentId: string | null) {
    if (!activeConvId) return;
    setShowAgentPicker(false);
    await whatsappApi.patchConversation(activeConvId, { assignedToId: agentId });
    const agentData = agentId ? (agents.find((a) => a.id === agentId) ?? null) : null;
    setActiveConv((c) => c ? { ...c, assignedToId: agentId, assignedTo: agentData } : c);
    setConversations((cs) => cs.map((c) => c.id === activeConvId ? { ...c, assignedToId: agentId, assignedTo: agentData } : c));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio.${ext}`, { type: mimeType });
        stageFile(file);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-[calc(100vh-80px)] flex-col overflow-hidden">
      {/* Desktop tab bar */}
      <div className="hidden md:flex flex-shrink-0 items-center gap-1 px-4 border-b border-[rgba(0,0,0,0.07)] dark:border-white/8 bg-white dark:bg-[#1c1e22]">
        {(["inbox", "templates", "automacoes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === t ? "border-green-500 text-green-600 dark:text-green-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t === "inbox" ? "Inbox" : t === "templates" ? "Templates" : "Automações"}
          </button>
        ))}
      </div>

      {/* Mobile toolbar — search + new conv */}
      <div className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#1c1e22] border-b border-[rgba(0,0,0,0.06)] dark:border-white/8">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-100 dark:bg-white/8 px-3 py-2">
          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..." className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none" />
          {search && <button onClick={() => setSearch("")} className="text-gray-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
        </div>
        <button onClick={() => setShowNewConv(true)} className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-green-500 text-white">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        </button>
      </div>

      {/* Content */}
      {tab === "automacoes" ? (
        <div className="flex-1 overflow-hidden px-8 pb-8">
          <div className="h-full rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] overflow-hidden">
            <AutomationsPanel />
          </div>
        </div>
      ) : tab === "templates" ? (
        <div className="flex-1 overflow-hidden px-8 pb-8">
          <div className="h-full rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] overflow-hidden">
            <MetaTemplatesPanel onSend={(id) => { setActiveConvId(id); setTab("inbox"); loadConversations(); }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden md:px-8 md:pb-8 md:gap-4">
          {showNewConv && (
            <NewConversationModal
              onClose={() => { setShowNewConv(false); setNewConvPrefill(null); }}
              onCreated={(id) => { setActiveConvId(id); setShowNewConv(false); setNewConvPrefill(null); loadConversations(); }}
              initialPhone={newConvPrefill?.phone}
              initialName={newConvPrefill?.name}
            />
          )}

          {/* Conversation list — full screen on mobile when no active conv */}
          <div className={`${activeConvId ? "hidden md:flex" : "flex"} w-full md:w-80 flex-shrink-0 flex-col md:rounded-2xl border-r md:border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] overflow-hidden`}>
            {/* Desktop: new conv + search */}
            <div className="hidden md:flex px-3 py-2.5 border-b border-[rgba(0,0,0,0.06)] items-center gap-2">
              <button onClick={() => setShowNewConv(true)} title="Nova conversa" className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              </button>
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-1.5">
                <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"/>
              </div>
            </div>

            {/* Status filter */}
            <div className="flex border-b border-[rgba(0,0,0,0.06)] px-1 py-1">
              {(["open", "closed"] as const).map((s) => (
                <button key={s} onClick={() => { setStatusFilter(s); setActiveConvId(null); }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                >
                  {s === "open" ? "Abertas" : "Encerradas"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingConvs ? (
                <p className="text-center text-sm text-gray-400 py-8">Carregando...</p>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-3xl mb-2">💬</p>
                  <p className="text-sm text-gray-400">
                    {search ? "Nenhum resultado." : `Nenhuma conversa ${statusFilter === "open" ? "aberta" : "encerrada"}.`}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    active={conv.id === activeConvId}
                    onClick={() => setActiveConvId(conv.id)}
                    onTogglePin={async (pinned) => {
                      const updated = await whatsappApi.patchConversation(conv.id, { pinned });
                      setConversations((cs) => {
                        const next = cs.map((c) => c.id === conv.id ? { ...c, pinned: updated.pinned } : c);
                        return [...next].sort((a, b) => {
                          if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                          if ((b.unreadCount ?? 0) !== (a.unreadCount ?? 0)) return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
                          return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
                        });
                      });
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Chat panel — full screen on mobile when conv is active */}
          <div className={`${activeConvId ? "flex" : "hidden md:flex"} flex-1 flex-col md:rounded-2xl border-0 md:border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] overflow-hidden`}>
            {!activeConvId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
                  <svg className="h-8 w-8 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200">WhatsApp Inbox</p>
                <p className="text-sm text-gray-400 mt-1">Selecione uma conversa para começar</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex-shrink-0 flex items-center gap-3 px-3 md:px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
                  {/* Back button — mobile only */}
                  <button
                    onClick={() => { setActiveConvId(null); setActiveConv(null); setMessages([]); }}
                    className="md:hidden flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {/* Left: avatar + identity + labels */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={activeConv?.contact.name ?? ""} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeConv?.contact.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs text-gray-400">{activeConv?.contact.phone}</p>
                        {activeConv?.labels?.map(({ label }) => (
                          <span key={label.id} className="rounded-full px-1.5 text-[9px] font-semibold text-white leading-4" style={{ backgroundColor: label.color }}>
                            {label.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Label picker — desktop only */}
                    <div className="hidden md:block relative" data-label-picker>
                        <button
                          onClick={() => setShowLabelPicker(v => !v)}
                          title="Etiquetas"
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                            showLabelPicker ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-600" : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </button>
                        {showLabelPicker && (
                          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#2a2d32] rounded-xl shadow-lg border border-[rgba(0,0,0,0.08)] z-20 min-w-[170px] py-1.5">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pb-1">Etiquetas</p>
                            {labels.length === 0 ? (
                              <p className="text-xs text-gray-400 px-3 py-2">Nenhuma etiqueta criada.</p>
                            ) : labels.map((label) => {
                              const active = activeConv?.labels?.some((l) => l.label.id === label.id);
                              return (
                                <button
                                  key={label.id}
                                  onClick={() => toggleLabel(label.id)}
                                  className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left"
                                >
                                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                                  <span className="text-sm text-gray-700 dark:text-gray-200 flex-1">{label.name}</span>
                                  {active && (
                                    <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                            <div className="border-t border-[rgba(0,0,0,0.06)] mt-1 pt-1">
                              <button
                                onClick={() => { setShowLabelPicker(false); setShowLabelManager(true); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-xs text-gray-500 dark:text-gray-400"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Gerenciar etiquetas
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    {/* Agent picker — desktop only */}
                    <div className="hidden md:block relative" data-agent-picker>
                      <button
                        onClick={() => setShowAgentPicker(v => !v)}
                        title={activeConv?.assignedTo ? `Atribuído: ${activeConv.assignedTo.name}` : "Atribuir atendente"}
                        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 transition-colors text-xs font-medium ${
                          activeConv?.assignedToId
                            ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                            : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="max-w-[80px] truncate">{activeConv?.assignedTo?.name ?? "Atribuir"}</span>
                      </button>
                      {showAgentPicker && (
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#2a2d32] rounded-xl shadow-lg border border-[rgba(0,0,0,0.08)] z-20 min-w-[170px] py-1.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pb-1">Transferir para</p>
                          <button
                            onClick={() => assignAgent(null)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left"
                          >
                            <span className="text-sm text-gray-500 italic">Sem atribuição</span>
                          </button>
                          {agents.map((agent) => (
                            <button
                              key={agent.id}
                              onClick={() => assignAgent(agent.id)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left"
                            >
                              <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">{agent.name}</span>
                              {activeConv?.assignedToId === agent.id && (
                                <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Contact info toggle */}
                    <button
                      onClick={() => setShowContactPanel(v => !v)}
                      title="Contato / CRM"
                      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition-colors text-xs font-semibold ${
                        showContactPanel
                          ? "border-violet-400 bg-violet-50 dark:bg-violet-900/25 text-violet-600 dark:text-violet-400"
                          : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-violet-500 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zM19 21a7 7 0 10-14 0" />
                      </svg>
                      <span className="hidden sm:inline">Contato / CRM</span>
                    </button>

                    {activeConv?.status === "open" ? (
                      <button onClick={handleCloseConversation}
                        className="hidden md:flex items-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Encerrar
                      </button>
                    ) : (
                      <button onClick={handleReopenConversation}
                        className="hidden md:flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                        Reabrir
                      </button>
                    )}

                    {/* Mobile: encerrar/reabrir como ícone */}
                    {activeConv?.status === "open" ? (
                      <button onClick={handleCloseConversation} title="Encerrar conversa"
                        className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </button>
                    ) : (
                      <button onClick={handleReopenConversation} title="Reabrir conversa"
                        className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-green-200 text-green-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Body: messages + optional contact panel */}
                <div className="flex flex-1 overflow-hidden">
                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto px-2 md:px-5 py-3 md:py-4 bg-[#f0f2f5] dark:bg-[#151719] relative"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) stageFile(f); }}
                >
                  {loadingMsgs ? (
                    <p className="text-center text-sm text-gray-400 py-8">Carregando...</p>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-8">Nenhuma mensagem ainda.</p>
                  ) : (
                    uniqueMessages.map((msg) => (
                      <ChatBubble
                        key={msg.id}
                        msg={msg}
                        onReply={setReplyingTo}
                        onEdit={(updated) => setMessages((ms) => ms.map((m) => m.id === updated.id ? updated : m))}
                        onForward={setForwardingMsg}
                        onContactConverse={handleContactConverse}
                      />
                    ))
                  )}
                  <div ref={messagesEndRef} />
                  {/* Drag-over overlay */}
                  {dragOver && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-green-500/10 border-2 border-dashed border-green-400 rounded-xl pointer-events-none">
                      <svg className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="text-green-700 dark:text-green-300 font-semibold text-sm">Solte o arquivo aqui</p>
                    </div>
                  )}
                </div>

                {/* Reply area */}
                {activeConv?.status === "open" && (
                  <div className="flex-shrink-0 border-t border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22]">
                    {/* Replying-to banner */}
                    {replyingTo && (
                      <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-[rgba(0,0,0,0.05)]">
                        <div className="flex-1 min-w-0 border-l-[3px] border-green-500 pl-2">
                          <p className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                            {replyingTo.direction === "outbound" ? "Você" : activeConv?.contact.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {replyingTo.mediaType
                              ? `📎 ${replyingTo.mediaType === "image" ? "Imagem" : replyingTo.mediaType === "audio" ? "Áudio" : replyingTo.mediaType === "video" ? "Vídeo" : replyingTo.filename ?? "Documento"}`
                              : replyingTo.text ?? ""}
                          </p>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {/* Staged file preview */}
                    {stagedFile && (
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[rgba(0,0,0,0.05)] bg-green-50 dark:bg-green-900/10">
                        {stagedPreview ? (
                          <img src={stagedPreview} className="h-14 w-14 rounded-lg object-cover flex-shrink-0 border border-green-200 dark:border-green-700" />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{stagedFile.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{(stagedFile.size / 1024).toFixed(0)} KB</p>
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">↵ Enter para enviar{replyText.trim() ? " com legenda" : ""}</p>
                        </div>
                        <button
                          onClick={clearStagedFile}
                          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Templates dropdown */}
                    {templates.length > 0 && (
                      <div className="px-4 pt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {templates.slice(0, 8).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setReplyText(t.text)}
                            className="flex-shrink-0 rounded-full border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-3 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`flex items-end gap-2 px-2 py-2 ${isNoteMode ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>

                      {/* Desktop-only: Templates + Note mode */}
                      <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 pb-1">
                        <div className="relative" data-templates-panel>
                          <button
                            onClick={() => setShowTemplates((v) => !v)}
                            title="Templates de mensagem"
                            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                              showTemplates
                                ? "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-600"
                                : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500 hover:text-green-600 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                            }`}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                          </button>
                          {showTemplates && <TemplatesManager onClose={() => setShowTemplates(false)} onSelect={(text) => { setReplyText(text); setTimeout(() => textareaRef.current?.focus(), 50); }} />}
                        </div>
                        <button
                          onClick={() => setIsNoteMode((v) => !v)}
                          title={isNoteMode ? "Modo nota — clique para voltar ao modo resposta" : "Nota interna (só para a equipe)"}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                            isNoteMode
                              ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-500"
                              : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500 hover:text-amber-500 hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </button>
                      </div>

                      {/* WhatsApp-style pill: [😊 | input | 📎] */}
                      <div ref={emojiPickerRef} className={`relative flex-1 flex items-end rounded-[22px] border transition-colors ${
                        isNoteMode
                          ? "border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10"
                          : "border-[rgba(0,0,0,0.12)] dark:border-white/10 bg-white dark:bg-[#2a2d32]"
                      }`}>
                        {/* Emoji button — left inside pill */}
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(v => !v)}
                          title="Emojis"
                          className="flex-shrink-0 flex h-10 w-10 items-center justify-center text-[20px] text-gray-400 hover:text-yellow-400 transition-colors"
                        >
                          😊
                        </button>

                        {/* Emoji picker floating */}
                        {showEmojiPicker && (
                          <div className="absolute bottom-12 left-0 z-50 shadow-2xl rounded-2xl overflow-hidden">
                            <Picker
                              data={data}
                              onEmojiSelect={(e: { native: string }) => { insertEmoji(e); setShowEmojiPicker(false); }}
                              locale="pt"
                              theme="auto"
                              previewPosition="none"
                              skinTonePosition="none"
                            />
                          </div>
                        )}

                        {/* Textarea — middle */}
                        <textarea
                          ref={textareaRef}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            if (e.key === "Escape") { setShowEmojiPicker(false); clearStagedFile(); }
                          }}
                          onPaste={handlePaste}
                          placeholder={
                            isRecording
                              ? "🔴 Gravando... toque no botão para parar"
                              : isNoteMode
                              ? "Nota interna (só para a equipe)..."
                              : "Mensagem"
                          }
                          rows={1}
                          disabled={isRecording}
                          className="flex-1 resize-none bg-transparent py-2.5 pr-1 text-[15px] text-[#111b21] dark:text-white placeholder-gray-400 focus:outline-none disabled:opacity-60"
                          style={{ maxHeight: 120, overflowY: "auto" }}
                        />

                        {/* Attach button — right inside pill */}
                        <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFileChange} />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingMedia}
                          title="Enviar arquivo ou imagem"
                          className="flex-shrink-0 flex h-10 w-10 items-center justify-center text-gray-400 hover:text-green-500 transition-colors disabled:opacity-40"
                        >
                          {uploadingMedia ? (
                            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Green circular button — send when text/file staged, mic/stop when recording */}
                      <button
                        onClick={(replyText.trim() || stagedFile) ? handleSend : isRecording ? stopRecording : startRecording}
                        disabled={sending || uploadingMedia}
                        title={replyText.trim() ? "Enviar" : isRecording ? "Parar gravação" : "Gravar áudio"}
                        className={`flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all active:scale-95 disabled:opacity-40 ${
                          isRecording
                            ? "bg-red-500 hover:bg-red-600 animate-pulse"
                            : "bg-[#00a884] hover:bg-[#00956e]"
                        }`}
                      >
                        {(replyText.trim() || stagedFile) ? (
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                        ) : isRecording ? (
                          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="5" y="5" width="14" height="14" rx="2" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 0014 0M12 17v4M8 21h8" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                  </div>
                  {showContactPanel && activeConv && (
                    <ContactPanel
                      contact={activeConv.contact}
                      onClose={() => setShowContactPanel(false)}
                      onUpdated={handleContactUpdated}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {forwardingMsg && (
        <ForwardModal
          msg={forwardingMsg}
          conversations={conversations}
          onClose={() => setForwardingMsg(null)}
        />
      )}

      {showLabelManager && (
        <LabelManager
          labels={labels}
          onClose={() => setShowLabelManager(false)}
          onCreated={(label) => setLabels((ls) => [...ls, label].sort((a, b) => a.name.localeCompare(b.name)))}
          onDeleted={(id) => {
            setLabels((ls) => ls.filter((l) => l.id !== id));
            setConversations((cs) => cs.map((c) => ({ ...c, labels: c.labels.filter((l) => l.label.id !== id) })));
            setActiveConv((c) => c ? { ...c, labels: c.labels.filter((l) => l.label.id !== id) } : c);
          }}
        />
      )}

      {/* Toast notifications — bottom-right */}
      <style>{`@keyframes slideInRight { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }`}</style>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastNotification
              toast={toast}
              onDismiss={() => setToasts(ts => ts.filter(t => t.id !== toast.id))}
              onClick={() => {
                setActiveConvId(toast.convId);
                setTab("inbox");
                setToasts(ts => ts.filter(t => t.id !== toast.id));
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
