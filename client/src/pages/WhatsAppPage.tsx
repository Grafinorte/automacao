import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { whatsappApi, type WaConversation, type WaMessage, type WaAutomation, type WaTemplate, type MetaTemplate, type WaMessageReplyTo, type WaContact, type WaLabel, type WaUser } from "../api/whatsapp";
import { crmApi } from "../api/crm";
import type { ContactWithDeals } from "../types";
import { useAuth } from "../context/AuthContext";
import { subscribeWaMessage } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { Avatar } from "../components/common/Avatar";
import { useNavigate } from "react-router-dom";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

// ─── Desktop (OS) notification ────────────────────────────────────────────────

function sendDesktopNotification(name: string, text: string, onClick?: () => void) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(name, {
      body: text,
      icon: "/assets/fav-grafinorte.png",
      tag: `wa-${name}`,
    });
    if (onClick) n.onclick = () => { window.focus(); onClick(); };
  } catch {
    // Firefox private mode throws
  }
}

async function requestDesktopNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  await Notification.requestPermission();
}

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

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="px-3 py-1 rounded-full text-[11px] font-medium text-[#667781] dark:text-gray-400 shadow-sm"
        style={{ backgroundColor: "rgba(225,221,213,0.92)", backdropFilter: "blur(4px)" }}>
        {label}
      </span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-2">
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1"
        style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.06)" }}>
        <span className="block w-2 h-2 rounded-full bg-gray-400" style={{ animation: "wa-typing 1.2s infinite ease-in-out", animationDelay: "0ms" }} />
        <span className="block w-2 h-2 rounded-full bg-gray-400" style={{ animation: "wa-typing 1.2s infinite ease-in-out", animationDelay: "200ms" }} />
        <span className="block w-2 h-2 rounded-full bg-gray-400" style={{ animation: "wa-typing 1.2s infinite ease-in-out", animationDelay: "400ms" }} />
      </div>
    </div>
  );
}

// ─── Conversation item ────────────────────────────────────────────────────────

function ConversationItem({ conv, active, onClick, onTogglePin, phoneNumbers }: {
  conv: WaConversation; active: boolean; onClick: () => void; onTogglePin: (pinned: boolean) => void;
  phoneNumbers?: import("../api/whatsapp").WaPhoneNumber[];
}) {
  const phoneName = conv.phoneNumberId && phoneNumbers && phoneNumbers.length > 1
    ? phoneNumbers.find(p => p.phoneNumberId === conv.phoneNumberId)?.displayName
    : null;
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
        {(conv.labels?.length > 0 || phoneName) && (
          <div className="flex gap-1 mt-1 flex-wrap items-center">
            {phoneName && (
              <span className="rounded-full px-1.5 py-0 text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 leading-4">
                📱 {phoneName}
              </span>
            )}
            {conv.labels?.slice(0, 4).map(({ label }) => (
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
            className={`underline break-all hover:opacity-80 ${isOut ? "text-[#075e54]" : "text-blue-600 dark:text-blue-400"}`}
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
  const color = status === "read" ? "#53bdeb" : "#667781";
  if (status === "read" || status === "delivered") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 14, flexShrink: 0 }}>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M1 5.5l3.5 4L11 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.5 5.5l3.5 4 6-8.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, flexShrink: 0 }}>
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3.5 4L11 1" stroke="#667781" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

// ─── Quote preview (reply-to) ─────────────────────────────────────────────────

function quotePreviewText(text?: string | null, mediaType?: string | null, filename?: string | null): string {
  if (mediaType) {
    if (mediaType === "image") return "📷 Imagem";
    if (mediaType === "audio") return "🎵 Áudio";
    if (mediaType === "video") return "🎥 Vídeo";
    if (mediaType === "sticker") return "🎭 Sticker";
    return `📎 ${filename ?? "Documento"}`;
  }
  if (!text || text === "[unsupported]") return "💬 Mensagem";
  if (text.startsWith("[Template:")) return "📋 Template";
  return text;
}

function QuoteBar({ replyTo, isOut, onScrollTo }: { replyTo: WaMessageReplyTo; isOut: boolean; onScrollTo?: () => void }) {
  const label = replyTo.direction === "outbound" ? "Você" : (replyTo.sentBy?.name ?? "Contato");
  const preview = quotePreviewText(replyTo.text, replyTo.mediaType, replyTo.filename);
  const isImage = replyTo.mediaType === "image" && replyTo.mediaUrl;

  return (
    <div
      className={`flex mb-1.5 rounded-lg overflow-hidden border-l-[3px] transition-opacity ${
        isOut ? "border-[#4fae4e] bg-[#c8edd0]" : "border-[#4fae4e] bg-black/5 dark:bg-white/5"
      } ${onScrollTo ? "cursor-pointer hover:opacity-80" : ""}`}
      onClick={onScrollTo}
    >
      <div className="flex-1 px-2 py-1.5 min-w-0">
        <p className={`text-[10px] font-semibold mb-0.5 ${isOut ? "text-[#075e54]" : "text-green-600 dark:text-green-400"}`}>
          {label}
        </p>
        <p className={`text-[11px] truncate ${isOut ? "text-[#111b21]/80" : "text-gray-500 dark:text-gray-400"}`}>
          {preview}
        </p>
      </div>
      {isImage && (
        <img
          src={replyTo.mediaUrl!}
          alt="imagem"
          className="h-14 w-14 object-cover flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
    </div>
  );
}

// ─── WhatsApp-style audio player ─────────────────────────────────────────────

const WAVEFORM = [3,5,8,4,10,14,9,6,12,16,11,7,13,15,8,5,10,12,6,9,14,11,4,8,13,7,10,5,12,9,6,14,8,11,4,10,13,7,9,12];

function WaAudioPlayer({ src, isOut }: { src: string; isOut: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  function fmt(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play(); }
  }

  function toggleSpeed() {
    const next = speed === 1 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * duration;
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const filledBars = Math.round(progress * WAVEFORM.length);

  const trackColor = isOut ? "#4fae4e" : "#8696a0";
  const playedColor = isOut ? "#1a6e1a" : "#007bfc";

  return (
    <div className="flex items-center gap-2 py-0.5" style={{ minWidth: 200, maxWidth: 280 }}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{ background: isOut ? "#25d36620" : "#8696a020" }}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill={isOut ? "#1a6e1a" : "#54656f"}>
            <rect x="3" y="2" width="4" height="12" rx="1"/>
            <rect x="9" y="2" width="4" height="12" rx="1"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill={isOut ? "#1a6e1a" : "#54656f"}>
            <path d="M4 2.5l10 5.5-10 5.5V2.5z"/>
          </svg>
        )}
      </button>

      {/* Waveform + time row */}
      <div className="flex-1 flex flex-col gap-0.5">
        {/* Waveform bars */}
        <div className="flex items-end gap-[2px] h-8 cursor-pointer" onClick={seek}>
          {WAVEFORM.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: `${h * 2}px`,
                borderRadius: 2,
                background: i < filledBars ? playedColor : trackColor,
                opacity: i < filledBars ? 1 : 0.45,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
        {/* Time */}
        <div className="flex justify-between text-[10px]" style={{ color: isOut ? "#1a6e1a" : "#8696a0" }}>
          <span>{fmt(currentTime || duration)}</span>
          <button
            onClick={toggleSpeed}
            className="font-semibold text-[10px] leading-none px-1 py-0.5 rounded"
            style={{ background: isOut ? "#c8f7d0" : "#e9edef", color: isOut ? "#1a6e1a" : "#54656f" }}
          >
            {speed}x
          </button>
        </div>
      </div>

      {/* Mic icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center relative">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#666">
          <path d="M12 15a4 4 0 004-4V5a4 4 0 10-8 0v6a4 4 0 004 4zm-1 2.93A7 7 0 015 11H3a9 9 0 008 8.94V22h2v-2.06A9 9 0 0021 11h-2a7 7 0 01-7 6.93z"/>
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
            <path d="M12 15a4 4 0 004-4V5a4 4 0 10-8 0v6a4 4 0 004 4z"/>
          </svg>
        </span>
      </div>
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg, onReply, onEdit, onForward, onDelete, onStar, onScrollToQuote, onContactConverse, inSelectionMode, selected, onSelect, highlighted }: {
  msg: WaMessage;
  onReply: (msg: WaMessage) => void;
  onEdit: (updated: WaMessage) => void;
  onForward: (msg: WaMessage) => void;
  onDelete: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  onScrollToQuote?: (id: string) => void;
  onContactConverse?: (phone: string, name: string) => void;
  inSelectionMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  highlighted?: boolean;
}) {
  const isOut = msg.direction === "outbound";
  const mediaSrc = msg.mediaUrl ? `/wa-media/${msg.mediaUrl}` : null;
  const canEdit = isOut && !msg.mediaType && !!msg.text && !msg.isInternal;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const isForwarded = !!(msg.forwarded || msg.text?.startsWith("↪️ "));
  const displayTextForwarded = isForwarded && msg.text?.startsWith("↪️ ") ? msg.text.slice("↪️ ".length) : msg.text;

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  function openMenu(e: React.MouseEvent) {
    if (inSelectionMode) { onSelect?.(msg.id); return; }
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    setMenuPos({ x, y });
    setMenuOpen(true);
  }

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
      <div id={`msg-${msg.id}`} className="flex justify-center mb-2">
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
    <>
      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[160px] rounded-xl bg-white dark:bg-[#2a2d32] shadow-2xl border border-[rgba(0,0,0,0.1)] dark:border-white/10 py-1 text-sm"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button onClick={() => { onReply(msg); setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            Responder
          </button>
          <button onClick={() => { try { navigator.clipboard.writeText(msg.text ?? ""); } catch {} setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            Copiar
          </button>
          <button onClick={() => { onStar(msg.id, !msg.starred); setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
            <svg className={`h-4 w-4 flex-shrink-0 ${msg.starred ? "text-amber-400 fill-amber-400" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
            {msg.starred ? "Desmarcar estrela" : "Marcar com estrela"}
          </button>
          <button onClick={() => { onForward(msg); setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/></svg>
            Encaminhar
          </button>
          {onSelect && (
            <button onClick={() => { onSelect(msg.id); setMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
              <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Selecionar
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditText(msg.text ?? ""); setEditing(true); setMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-left text-gray-700 dark:text-gray-200">
              <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Editar
            </button>
          )}
          <div className="border-t border-[rgba(0,0,0,0.06)] my-1" />
          <button onClick={() => { onDelete(msg.id); setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/10 text-left text-red-600 dark:text-red-400">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Excluir
          </button>
        </div>
      )}

    <div
      id={`msg-${msg.id}`}
      className={`flex ${isOut ? "justify-end" : "justify-start"} mb-2 group ${inSelectionMode ? "cursor-pointer" : ""} ${highlighted ? "rounded-xl bg-yellow-100/50 dark:bg-yellow-900/20" : ""}`}
      onClick={inSelectionMode ? () => onSelect?.(msg.id) : undefined}
      onContextMenu={openMenu}
    >
      {/* Selection checkbox */}
      {inSelectionMode && (
        <div className={`self-center mr-2 flex-shrink-0 ${isOut ? "order-last ml-2 mr-0" : ""}`}>
          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? "bg-green-500 border-green-500" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1c1e22]"}`}>
            {selected && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
          </div>
        </div>
      )}

      {/* ⋮ menu button — right for inbound, left for outbound */}
      {!inSelectionMode && !isOut && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center mr-1 flex-shrink-0">
          <button onClick={openMenu} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-600">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
      )}

      <div className={`relative max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
        isOut
          ? "rounded-br-sm text-[#111b21]"
          : "bg-white dark:bg-[#202c33] text-gray-900 dark:text-[#e9edef] rounded-bl-sm border border-[rgba(0,0,0,0.04)]"
      }`} style={isOut ? { backgroundColor: "#dcf8c6" } : {}}>

        {/* Forwarded indicator */}
        {isForwarded && (
          <div className={`flex items-center gap-1 mb-1 text-[10px] font-medium ${isOut ? "text-[#5a9f5a]" : "text-gray-400 dark:text-gray-500"}`}>
            <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/></svg>
            Encaminhada
          </div>
        )}

        {/* Star indicator */}
        {msg.starred && (
          <div className="absolute -top-1.5 -right-1.5">
            <span className="text-[10px]">⭐</span>
          </div>
        )}

        {/* Quote (reply-to) */}
        {msg.replyTo && <QuoteBar replyTo={msg.replyTo} isOut={isOut} onScrollTo={onScrollToQuote ? () => onScrollToQuote(msg.replyTo!.id) : undefined} />}

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
          <WaAudioPlayer src={mediaSrc} isOut={isOut} />
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
            <p className="whitespace-pre-wrap">{renderMessageText(isForwarded && displayTextForwarded ? displayTextForwarded : (msg.text ?? ""), isOut)}</p>
          )
        )}

        {/* Footer: time + ticks */}
        <p className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isOut ? "text-[#667781]" : "text-gray-400 dark:text-gray-500"}`}>
          {formatTime(msg.createdAt)}
          {isOut && msg.sentBy && <span>· {msg.sentBy.name}</span>}
          {isOut && <MessageTicks status={msg.status} />}
        </p>
      </div>

      {/* ⋮ menu button — right side for outbound */}
      {!inSelectionMode && isOut && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center ml-1 flex-shrink-0">
          <button onClick={openMenu} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-600">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
      )}
    </div>
    </>
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

function NewConversationModal({ onClose, onCreated, initialPhone = "", initialName = "", phoneNumberId }: {
  onClose: () => void;
  onCreated: (convId: string) => void;
  initialPhone?: string;
  initialName?: string;
  phoneNumberId?: string | null;
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
          phoneNumberId: phoneNumberId ?? undefined,
          ...(headerMediaType && headerMediaId ? {
            headerMediaUrl: headerMediaId,
            headerMediaType,
          } : {}),
        });
        onCreated(result.conversation.id);
      } else {
        const result = await whatsappApi.startConversation({ phone: phone.trim(), name: name.trim() || undefined, text: text.trim(), phoneNumberId: phoneNumberId ?? undefined });
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
  messages,
}: {
  contact: WaContact;
  onClose: () => void;
  onUpdated: (updated: WaContact) => void;
  messages?: WaMessage[];
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(contact.name);
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const [crmContact, setCrmContact] = useState<ContactWithDeals | null>(null);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [contactTab, setContactTab] = useState<"info" | "media">("info");

  const mediaMessages = (messages ?? []).filter(m => m.mediaType && m.mediaUrl && !m.isInternal);
  const imageMessages = mediaMessages.filter(m => m.mediaType === "image" || m.mediaType === "sticker");
  const docMessages = mediaMessages.filter(m => m.mediaType === "document");
  const videoMessages = mediaMessages.filter(m => m.mediaType === "video");

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

  const AVATAR_COLORS_LOCAL = ["#e53935","#d81b60","#8e24aa","#5e35b1","#3949ab","#1e88e5","#039be5","#00acc1","#00897b","#43a047","#7cb342","#f4511e","#fb8c00","#6d4c41","#546e7a","#00838f","#2e7d32","#6a1b9a","#0277bd"];
  const nameHash = contact.name.split("").reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);
  const avatarBg = AVATAR_COLORS_LOCAL[Math.abs(nameHash) % AVATAR_COLORS_LOCAL.length];
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

      {/* Tab bar */}
      <div className="flex border-b border-[rgba(0,0,0,0.06)] flex-shrink-0">
        {(["info", "media"] as const).map(t => (
          <button key={t} onClick={() => setContactTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${contactTab === t ? "border-green-500 text-green-600 dark:text-green-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
            {t === "info" ? "Informações" : `Mídia (${mediaMessages.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Media gallery tab */}
        {contactTab === "media" && (
          <div className="p-4">
            {mediaMessages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-2xl mb-2">📷</p>
                <p className="text-sm text-gray-400">Nenhuma mídia compartilhada.</p>
              </div>
            ) : (
              <>
                {imageMessages.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Fotos ({imageMessages.length})</p>
                    <div className="grid grid-cols-3 gap-1">
                      {imageMessages.map(m => (
                        <a key={m.id} href={`/wa-media/${m.mediaUrl}`} target="_blank" rel="noopener noreferrer"
                          className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-white/10 hover:opacity-90 transition-opacity">
                          <img src={`/wa-media/${m.mediaUrl}`} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {videoMessages.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Vídeos ({videoMessages.length})</p>
                    <div className="grid grid-cols-2 gap-1">
                      {videoMessages.map(m => (
                        <a key={m.id} href={`/wa-media/${m.mediaUrl}`} target="_blank" rel="noopener noreferrer"
                          className="aspect-video rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center hover:opacity-90 transition-opacity">
                          <svg className="h-8 w-8 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {docMessages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Documentos ({docMessages.length})</p>
                    <div className="space-y-1.5">
                      {docMessages.map(m => (
                        <a key={m.id} href={`/wa-media/${m.mediaUrl}`} target="_blank" rel="noopener noreferrer" download={m.filename ?? "arquivo"}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                          <svg className="h-5 w-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          <span className="text-xs text-gray-700 dark:text-gray-200 truncate flex-1">{m.filename ?? "Documento"}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Info tab */}
        {contactTab === "info" && (<>
        {/* Avatar + identity */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/[0.06]">
          <div className="h-14 w-14 flex-shrink-0 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: avatarBg }}>
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
        </>)}
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
      const fwd = msg.text?.startsWith("↪️ ") ? msg.text.slice("↪️ ".length) : (msg.text ?? `[${msg.mediaType ?? "mídia"}]`);
      await whatsappApi.sendMessage(convId, fwd, undefined, undefined, true);
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

// ─── Phone numbers panel ─────────────────────────────────────────────────────

function PhoneNumbersPanel({ phoneNumbers, onRefresh }: {
  phoneNumbers: import("../api/whatsapp").WaPhoneNumber[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phoneNumberId: "", displayName: "", phone: "", accessToken: "" });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", phone: "", accessToken: "" });

  async function handleAdd() {
    if (!form.phoneNumberId || !form.displayName) return;
    setSaving(true);
    try {
      await whatsappApi.createPhoneNumber({
        phoneNumberId: form.phoneNumberId,
        displayName: form.displayName,
        phone: form.phone || undefined,
        accessToken: form.accessToken || undefined,
      });
      setForm({ phoneNumberId: "", displayName: "", phone: "", accessToken: "" });
      setShowForm(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      await whatsappApi.updatePhoneNumber(id, {
        displayName: editForm.displayName,
        phone: editForm.phone || undefined,
        accessToken: editForm.accessToken || undefined,
      });
      setEditId(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este número?")) return;
    await whatsappApi.deletePhoneNumber(id);
    onRefresh();
  }

  async function toggleActive(id: string, active: boolean) {
    await whatsappApi.updatePhoneNumber(id, { active });
    onRefresh();
  }

  const inputCls = "w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2024] px-3 py-1.5 text-sm focus:outline-none focus:border-green-400";

  return (
    <div className="flex-1 overflow-auto px-8 pb-8 pt-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Números WhatsApp</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gerencie os números conectados via coexistência</p>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Adicionar
          </button>
        </div>

        {showForm && (
          <div className="mb-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Novo número</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Phone Number ID *</label>
                <input placeholder="1311728092015168" value={form.phoneNumberId} onChange={e => setForm(f => ({ ...f, phoneNumberId: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Nome do número *</label>
                <input placeholder="Ex: Victor - Vendas" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Número (exibição)</label>
                <input placeholder="+55 43 9 9999-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Token (se diferente do principal)</label>
                <input placeholder="EAAx... (opcional)" value={form.accessToken} onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))} className={inputCls} type="password" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5">Cancelar</button>
              <button onClick={handleAdd} disabled={saving || !form.phoneNumberId || !form.displayName} className="text-sm bg-green-500 text-white px-4 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50">Salvar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {phoneNumbers.map(pn => (
            <div key={pn.id} className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] p-4">
              {editId === pn.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Nome</label>
                      <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Número (exibição)</label>
                      <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Token de acesso</label>
                      <input value={editForm.accessToken} onChange={e => setEditForm(f => ({ ...f, accessToken: e.target.value }))} className={inputCls} type="password" placeholder="Deixe em branco para usar o token principal" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10">Cancelar</button>
                    <button onClick={() => handleSaveEdit(pn.id)} disabled={saving} className="text-sm bg-green-500 text-white px-4 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50">Salvar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.12-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{pn.displayName}</p>
                    <p className="text-xs text-gray-400">{pn.phone ?? pn.phoneNumberId}</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-500 font-mono">ID: {pn.phoneNumberId}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleActive(pn.id, !pn.active)}
                      className={`text-[11px] font-medium rounded-full px-2.5 py-0.5 ${pn.active ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}>
                      {pn.active ? "Ativo" : "Inativo"}
                    </button>
                    <button onClick={() => { setEditId(pn.id); setEditForm({ displayName: pn.displayName, phone: pn.phone ?? "", accessToken: "" }); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/10">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(pn.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                      Remover
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WhatsAppPage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<"inbox" | "templates" | "automacoes" | "numeros">("inbox");
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
  const [convFilter, setConvFilter] = useState<"all" | "unread" | "pinned">("all");
  const [assignFilter, setAssignFilter] = useState<"all" | "mine" | "queue">("all");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const isAdmin = user?.role === "ADMIN";
  const assignedPhoneId = user?.waPhoneNumberId ?? null;
  const [phoneNumbers, setPhoneNumbers] = useState<import("../api/whatsapp").WaPhoneNumber[]>([]);
  const [phoneFilter, setPhoneFilter] = useState<string>("all");
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(() => {
    // Non-admin users with an assigned phone number are locked to it
    if (assignedPhoneId) return assignedPhoneId;
    return localStorage.getItem("wa_selected_phone") ?? null;
  });
  const [rememberPhone, setRememberPhone] = useState(() => !!localStorage.getItem("wa_selected_phone"));
  const [search, setSearch] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);
  const [fileModalCaption, setFileModalCaption] = useState("");
  const [fileModalActiveIdx, setFileModalActiveIdx] = useState(0);
  const fileModalAddRef = useRef<HTMLInputElement>(null);
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
  const [isTyping, setIsTyping] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [showConvSearch, setShowConvSearch] = useState(false);
  const [convSearchIndex, setConvSearchIndex] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [starredFilter, setStarredFilter] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("wa_sidebar_width");
    return saved ? Math.max(260, Math.min(560, parseInt(saved))) : 320;
  });
  const sidebarDragRef = useRef<{ dragging: boolean; startX: number; startW: number }>({ dragging: false, startX: 0, startW: 320 });
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const isFirstLoadRef = useRef(true);
  const activeConvIdRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load templates, labels, agents and phone numbers on mount
  useEffect(() => {
    whatsappApi.getTemplates().then(setTemplates).catch(() => {});
    whatsappApi.getLabels().then(setLabels).catch(() => {});
    whatsappApi.getAgents().then(setAgents).catch(() => {});
    whatsappApi.getPhoneNumbers().then(setPhoneNumbers).catch(() => {});
    requestDesktopNotificationPermission();
  }, []);

  // Sync selectedPhoneNumberId → phoneFilter
  useEffect(() => {
    setPhoneFilter(selectedPhoneNumberId ?? "all");
  }, [selectedPhoneNumberId]);

  // When user's assigned phone loads, auto-select it (admins can still override)
  useEffect(() => {
    if (assignedPhoneId && !isAdmin) {
      setSelectedPhoneNumberId(assignedPhoneId);
    }
  }, [assignedPhoneId, isAdmin]);

  function selectPhone(phoneNumberId: string, remember: boolean) {
    setSelectedPhoneNumberId(phoneNumberId);
    setRememberPhone(remember);
    if (remember) localStorage.setItem("wa_selected_phone", phoneNumberId);
    else localStorage.removeItem("wa_selected_phone");
  }

  function leavePhone() {
    setSelectedPhoneNumberId(null);
    setRememberPhone(false);
    localStorage.removeItem("wa_selected_phone");
    setActiveConvId(null);
    setActiveConv(null);
    setMessages([]);
  }

  const loadConversations = useCallback(() => {
    whatsappApi.getConversations(statusFilter)
      .then((data) => {
        // Skip notifications on the very first load (just populate the ref baseline)
        if (!isFirstLoadRef.current) {
          data.forEach((conv) => {
            const prev = prevUnreadRef.current[conv.id] ?? 0;
            if (conv.unreadCount > prev && conv.id !== activeConvIdRef.current) {
              playNotificationSound();
              const msgText = conv.lastMessageText ?? "Nova mensagem";
              const toastId = `${conv.id}-${Date.now()}`;
              setToasts(ts => [...ts.slice(-4), {
                id: toastId,
                convId: conv.id,
                name: conv.contact.name,
                text: msgText,
              }]);
              setTimeout(() => setToasts(ts => ts.filter(t => t.id !== toastId)), 5000);
              sendDesktopNotification(conv.contact.name, msgText, () => setActiveConvId(conv.id));
            }
          });
        }
        isFirstLoadRef.current = false;
        prevUnreadRef.current = Object.fromEntries(data.map((c) => [c.id, c.unreadCount]));
        setConversations(data);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [statusFilter]);

  useEffect(() => {
    setLoadingConvs(true);
    loadConversations();
  }, [loadConversations]);

  // Keep ref in sync so loadConversations can read it without being in its dep array
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // Real-time: reload conversations only when a message arrives for the phone we're viewing
  useEffect(() => {
    return subscribeWaMessage(({ phoneNumberId }) => {
      if (selectedPhoneNumberId && phoneNumberId && selectedPhoneNumberId !== phoneNumberId) return;
      loadConversations();
    });
  }, [loadConversations, selectedPhoneNumberId]);

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
    const wasInitialLoad = prevMsgCountRef.current === 0;
    prevMsgCountRef.current = messages.length;
    if (delta <= 0) return;
    // Show typing indicator briefly before new inbound message appears (skip on initial bulk load)
    const lastMsg = messages[messages.length - 1];
    if (!wasInitialLoad && delta === 1 && lastMsg?.direction === "inbound") {
      setIsTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setIsTyping(false), 1200);
    }
    // Bulk load → instant (setTimeout lets DOM render first); single new message → smooth
    if (wasInitialLoad) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: delta === 1 ? "smooth" : "instant" });
    }
  }, [messages]);

  useEffect(() => {
    if (replyText === "" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [replyText]);

  // Ctrl+F to open in-conversation search
  useEffect(() => {
    if (!activeConvId) return;
    function handle(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowConvSearch(v => !v);
        setConvSearch("");
      }
      if (e.key === "Escape") {
        setShowConvSearch(false);
        setConvSearch("");
        exitSelectionMode();
      }
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [activeConvId]);

  useEffect(() => {
    const timer = setInterval(loadConversations, 10000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  // Close pickers on outside click
  useEffect(() => {
    if (!showTemplates && !showLabelPicker && !showAgentPicker && !showEmojiPicker && !showAttachMenu) return;
    function handle(e: MouseEvent) {
      const target = e.target as Element;
      if (showTemplates && !target.closest("[data-templates-panel]")) setShowTemplates(false);
      if (showLabelPicker && !target.closest("[data-label-picker]")) setShowLabelPicker(false);
      if (showAgentPicker && !target.closest("[data-agent-picker]")) setShowAgentPicker(false);
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(target)) setShowEmojiPicker(false);
      if (showAttachMenu && !target.closest("[data-attach-menu]")) setShowAttachMenu(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showTemplates, showLabelPicker, showAgentPicker, showEmojiPicker, showAttachMenu]);

  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messages]);

  const searchedMessages = useMemo(() => {
    if (!convSearch.trim()) return uniqueMessages;
    const q = convSearch.toLowerCase();
    return uniqueMessages.filter(m => m.text?.toLowerCase().includes(q) || m.filename?.toLowerCase().includes(q));
  }, [uniqueMessages, convSearch]);

  const displayedMessages = starredFilter
    ? uniqueMessages.filter(m => m.starred)
    : (convSearch.trim() ? searchedMessages : uniqueMessages);

  const searchMatchIds = useMemo(() => {
    if (!convSearch.trim()) return [];
    return searchedMessages.map(m => m.id);
  }, [searchedMessages, convSearch]);

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = c.contact.name.toLowerCase().includes(q) || c.contact.phone.includes(q);
    const matchPhone = phoneFilter === "all" || c.phoneNumberId === phoneFilter || !c.phoneNumberId;
    const matchStatus = c.status === statusFilter;
    const matchConv = convFilter === "all" || (convFilter === "unread" && (c.unreadCount ?? 0) > 0) || (convFilter === "pinned" && c.pinned);
    const matchAssign = assignFilter === "all" || (assignFilter === "mine" && c.assignedToId === user?.id) || (assignFilter === "queue" && !c.assignedToId);
    const matchLabel = !labelFilter || c.labels.some(({ label }) => label.id === labelFilter);
    return matchSearch && matchPhone && matchStatus && matchConv && matchAssign && matchLabel;
  });

  async function handleSend() {
    if (!activeConvId || sending || uploadingMedia) return;
    if (stagedFiles.length > 0) { await sendStagedFile(); return; }
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
    // WhatsApp Cloud API size limits
    let maxBytes: number;
    let typeName: string;
    if (file.type.startsWith("image/")) {
      maxBytes = 5 * 1024 * 1024; typeName = "imagens (máx. 5 MB)";
    } else if (file.type.startsWith("video/")) {
      maxBytes = 16 * 1024 * 1024; typeName = "vídeos (máx. 16 MB)";
    } else if (file.type.startsWith("audio/")) {
      maxBytes = 16 * 1024 * 1024; typeName = "áudios (máx. 16 MB)";
    } else {
      maxBytes = 100 * 1024 * 1024; typeName = "documentos (máx. 100 MB)";
    }
    if (file.size > maxBytes) {
      const fileMB = (file.size / 1024 / 1024).toFixed(1);
      setAttachError(`"${file.name}" é muito grande (${fileMB} MB). Limite do WhatsApp para ${typeName}.`);
      setTimeout(() => setAttachError(null), 5000);
      return;
    }
    setStagedFiles((prev) => {
      if (prev.length === 0) setFileModalActiveIdx(0);
      return [...prev, file];
    });
    setStagedPreviews((prev) => [...prev, file.type.startsWith("image/") ? URL.createObjectURL(file) : ""]);
  }

  function removeStagedFile(idx: number) {
    setStagedFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setFileModalActiveIdx((cur) => Math.min(cur, Math.max(0, next.length - 1)));
      return next;
    });
    setStagedPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function clearStagedFiles() {
    stagedPreviews.forEach((url) => { if (url) URL.revokeObjectURL(url); });
    setStagedFiles([]);
    setStagedPreviews([]);
    setFileModalCaption("");
    setFileModalActiveIdx(0);
  }

  async function sendStagedFile() {
    if (!activeConvId || stagedFiles.length === 0) return;
    setUploadingMedia(true);
    const files = [...stagedFiles];
    const caption = fileModalCaption.trim();
    clearStagedFiles();
    setReplyingTo(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { mediaId, mimetype, localFilename, filename } = await whatsappApi.uploadMedia(file);
        const msg = await whatsappApi.sendMediaMessage(activeConvId, {
          mediaId, mimetype, localFilename, filename,
          caption: i === 0 && caption ? caption : undefined,
        });
        setMessages((ms) => [...ms, msg]);
      }
      loadConversations();
    } catch (err) {
      console.error("Erro ao enviar arquivo:", err);
    } finally { setUploadingMedia(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach(stageFile);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach((item) => { const f = item.getAsFile(); if (f) stageFile(f); });
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

  async function handleDeleteMsg(id: string) {
    if (!confirm("Excluir esta mensagem?")) return;
    await whatsappApi.deleteMessage(id).catch(() => {});
    setMessages(ms => ms.filter(m => m.id !== id));
    setSelectedMsgIds(s => { const n = new Set(s); n.delete(id); return n; });
  }

  async function handleStarMsg(id: string, starred: boolean) {
    try {
      const updated = await whatsappApi.starMessage(id, starred);
      setMessages(ms => ms.map(m => m.id === id ? { ...m, starred: (updated as WaMessage).starred } : m));
    } catch {}
  }

  function handleScrollToMsg(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 0.3s";
    el.style.background = "rgba(34,197,94,0.18)";
    setTimeout(() => { el.style.background = ""; }, 1200);
  }

  function toggleMsgSelection(id: string) {
    setSelectedMsgIds(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    if (!selectionMode) setSelectionMode(true);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedMsgIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedMsgIds.size === 0) return;
    if (!confirm(`Excluir ${selectedMsgIds.size} mensagem(ns)?`)) return;
    await Promise.allSettled([...selectedMsgIds].map(id => whatsappApi.deleteMessage(id)));
    setMessages(ms => ms.filter(m => !selectedMsgIds.has(m.id)));
    exitSelectionMode();
  }

  function handleBulkForward() {
    if (selectedMsgIds.size === 0) return;
    const firstId = [...selectedMsgIds][0];
    const firstMsg = uniqueMessages.find(m => m.id === firstId);
    if (firstMsg) setForwardingMsg(firstMsg);
    exitSelectionMode();
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

  // ── Phone selection screen — only shown to admins (or users without assigned number) ──
  if (!selectedPhoneNumberId && (isAdmin || !assignedPhoneId) && phoneNumbers.length > 0) {
    const totalOpen = conversations.filter(c => c.status === "open").length;
    return (
      <div className="flex h-[calc(100vh-56px)] md:h-[calc(100vh-80px)] items-center justify-center bg-gray-50 dark:bg-[#0b141a]">
        <div className="w-full max-w-md mx-auto px-6">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-1">Quem está atendendo?</h1>
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6">Selecione o número para iniciar o atendimento</p>

          {/* Number cards */}
          <div className="space-y-2 mb-5">
            {phoneNumbers.filter(pn => pn.active).map(pn => {
              const convCount = conversations.filter(c => c.phoneNumberId === pn.phoneNumberId && c.status === "open").length;
              const unreadCount = conversations.filter(c => c.phoneNumberId === pn.phoneNumberId && c.unreadCount > 0).reduce((sum, c) => sum + c.unreadCount, 0);
              const initials = pn.displayName.trim().split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase() ?? "").join("");
              const colors = ["#e53935","#d81b60","#8e24aa","#3949ab","#1e88e5","#00897b","#43a047","#f4511e","#fb8c00"];
              const bg = colors[Math.abs(pn.displayName.split("").reduce((h,c) => c.charCodeAt(0) + ((h<<5)-h), 0)) % colors.length];
              return (
                <button
                  key={pn.id}
                  onClick={() => selectPhone(pn.phoneNumberId, rememberPhone)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[rgba(0,0,0,0.08)] dark:border-white/10 bg-white dark:bg-[#1c1e22] hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition-all text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: bg }}>
                      {initials}
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white dark:border-[#1c1e22]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{pn.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{pn.phone ?? pn.phoneNumberId}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {unreadCount > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-green-500 text-white text-[11px] font-bold flex items-center justify-center">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {convCount}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stats */}
          <div className="rounded-xl border border-[rgba(0,0,0,0.06)] dark:border-white/8 bg-white dark:bg-[#1c1e22] px-4 py-3 mb-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total em atendimento:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{totalOpen} conversas</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Números ativos:</span>
              <span className="font-semibold text-green-600">{phoneNumbers.filter(p => p.active).length} de {phoneNumbers.length}</span>
            </div>
          </div>

          {/* Remember + settings */}
          <label className="flex items-center gap-2.5 cursor-pointer mb-5 select-none">
            <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)}
              className="w-4 h-4 rounded accent-green-500 cursor-pointer" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Lembrar e conectar automaticamente na próxima vez</span>
          </label>

          <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
            <button onClick={() => setTab("numeros")} className="flex items-center gap-1.5 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
              Configurações de números
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Auto-select: assigned phone for non-admin, or single number ─────────────
  if (!selectedPhoneNumberId && assignedPhoneId) {
    setSelectedPhoneNumberId(assignedPhoneId);
  } else if (!selectedPhoneNumberId && phoneNumbers.length === 1) {
    selectPhone(phoneNumbers[0].phoneNumberId, false);
  }

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-[calc(100vh-80px)] flex-col overflow-hidden">
      {/* Desktop tab bar */}
      <div className="hidden md:flex flex-shrink-0 items-center gap-1 px-4 border-b border-[rgba(0,0,0,0.07)] dark:border-white/8 bg-white dark:bg-[#1c1e22]">
        {(["inbox", "templates", "automacoes", ...(isAdmin ? ["numeros"] : [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === t ? "border-green-500 text-green-600 dark:text-green-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t === "inbox" ? "Inbox" : t === "templates" ? "Templates" : t === "automacoes" ? "Automações" : "Números"}
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
      {tab === "numeros" ? (
        <PhoneNumbersPanel
          phoneNumbers={phoneNumbers}
          onRefresh={() => whatsappApi.getPhoneNumbers().then(setPhoneNumbers).catch(() => {})}
        />
      ) : tab === "automacoes" ? (
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
              phoneNumberId={selectedPhoneNumberId}
            />
          )}

          {/* Conversation list — full screen on mobile when no active conv */}
          <div
            className={`${activeConvId ? "hidden md:flex" : "flex"} w-full flex-shrink-0 flex-col md:rounded-2xl border-r md:border border-[rgba(0,0,0,0.06)] bg-white dark:bg-[#1c1e22] overflow-hidden relative`}
            style={{ width: activeConvId ? `${sidebarWidth}px` : undefined }}
          >
            {/* Resize handle — desktop only */}
            <div
              className="hidden md:flex absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 items-center justify-center group"
              onMouseDown={(e) => {
                e.preventDefault();
                sidebarDragRef.current = { dragging: true, startX: e.clientX, startW: sidebarWidth };
                let lastW = sidebarWidth;
                const onMove = (ev: MouseEvent) => {
                  if (!sidebarDragRef.current.dragging) return;
                  const delta = ev.clientX - sidebarDragRef.current.startX;
                  lastW = Math.max(260, Math.min(560, sidebarDragRef.current.startW + delta));
                  setSidebarWidth(lastW);
                };
                const onUp = () => {
                  sidebarDragRef.current.dragging = false;
                  localStorage.setItem("wa_sidebar_width", String(lastW));
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            >
              <div className="w-0.5 h-8 rounded-full bg-transparent group-hover:bg-green-400 transition-colors" />
            </div>

            {/* Header: user + phone */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[rgba(0,0,0,0.06)]">
              <Avatar name={user?.name ?? ""} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{user?.name ?? "Atendimento"}</p>
                {selectedPhoneNumberId && phoneNumbers.length > 0 && (() => {
                  const pn = phoneNumbers.find(p => p.phoneNumberId === selectedPhoneNumberId);
                  return pn ? (
                    <div className="flex items-center gap-1">
                      <p className="text-[11px] text-gray-400 truncate leading-tight">{pn.displayName}</p>
                      {/* Botão trocar número — visível para admins ou quem não tem número fixo */}
                      {(isAdmin || !assignedPhoneId) && phoneNumbers.filter(p => p.active).length > 1 && (
                        <button
                          onClick={() => { setSelectedPhoneNumberId(null); localStorage.removeItem("wa_selected_phone"); }}
                          title="Trocar número"
                          className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-green-500 transition-colors"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}
              </div>
              {/* Bell: notification permission indicator */}
              <button
                onClick={async () => {
                  if (!("Notification" in window)) {
                    alert("Seu navegador não suporta notificações.");
                    return;
                  }
                  if (Notification.permission === "denied") {
                    alert('Notificações bloqueadas.\n\nPara ativar:\n1. Clique no cadeado/ícone na barra de endereços\n2. Vá em "Permissões do site"\n3. Mude "Notificações" para "Permitir"\n4. Recarregue a página');
                    return;
                  }
                  const result = await Notification.requestPermission();
                  if (result === "granted") {
                    new Notification("Notificações ativadas!", { body: "Você receberá alertas de novas mensagens.", icon: "/assets/fav-grafinorte.png" });
                  }
                }}
                title={
                  !("Notification" in window) ? "Navegador não suporta notificações" :
                  Notification.permission === "granted" ? "Notificações ativas" :
                  Notification.permission === "denied" ? "Notificações bloqueadas — clique para ver como ativar" :
                  "Ativar notificações do Windows"
                }
                className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors relative"
              >
                <svg className={`h-4 w-4 ${
                  !("Notification" in window) ? "text-gray-300" :
                  Notification.permission === "granted" ? "text-green-500" :
                  Notification.permission === "denied" ? "text-red-400" :
                  "text-gray-400"
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {Notification.permission === "denied" && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                )}
                {Notification.permission === "default" && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
              <button onClick={() => setShowNewConv(true)} title="Nova conversa" className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
              </button>
              {phoneNumbers.length > 1 && isAdmin && (
                <button onClick={leavePhone} title="Trocar número" className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
                </button>
              )}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 mx-3 my-2 rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2 border border-[rgba(0,0,0,0.05)]">
              <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar em todas as conversas" className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"/>
              {search && <button onClick={() => setSearch("")} className="text-gray-400"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
            </div>

            {/* Filter row 1: Tudo / Não lidas / Favoritas / Tags */}
            <div className="flex items-center px-3 pb-1 gap-0.5 border-b border-[rgba(0,0,0,0.06)]">
              {([["all","Tudo"],["unread","Não lidas"],["pinned","Favoritas"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setConvFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${convFilter === key ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
                  {label}
                </button>
              ))}
              {activeConvId && (
                <button onClick={() => setStarredFilter(v => !v)} title="Ver mensagens com estrela"
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ml-0.5 ${starredFilter ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "text-gray-400 hover:text-amber-500"}`}>
                  ⭐
                </button>
              )}
              <button onClick={() => { setStatusFilter(statusFilter === "open" ? "closed" : "open"); setActiveConvId(null); }}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z"/></svg>
                Tags ▾
              </button>
            </div>

            {/* Filter row 2: Todas / Minhas / Fila + status */}
            <div className="flex items-center px-3 py-1 border-b border-[rgba(0,0,0,0.06)] gap-0.5">
              {([["all","Todas"],["mine","Minhas"],["queue","Fila"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setAssignFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${assignFilter === key ? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-0.5">
                {(["open","closed"] as const).map(s => (
                  <button key={s} onClick={() => { setStatusFilter(s); setActiveConvId(null); }}
                    className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${statusFilter === s ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30" : "text-gray-400 hover:text-gray-600"}`}>
                    {s === "open" ? "Abertas" : "Fechadas"}
                  </button>
                ))}
              </div>
            </div>

            {/* Label chips */}
            {labels.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[rgba(0,0,0,0.06)] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <button onClick={() => setLabelFilter(null)}
                  className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${!labelFilter ? "bg-gray-800 text-white border-gray-800 dark:bg-white dark:text-gray-900" : "text-gray-500 border-gray-200 dark:border-white/10 hover:border-gray-400"}`}>
                  Todas
                </button>
                {labels.map(label => (
                  <button key={label.id} onClick={() => setLabelFilter(labelFilter === label.id ? null : label.id)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${labelFilter === label.id ? "text-white border-transparent" : "text-gray-500 border-gray-200 dark:border-white/10 hover:border-gray-400"}`}
                    style={labelFilter === label.id ? { backgroundColor: label.color, borderColor: label.color } : {}}>
                    {labelFilter !== label.id && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />}
                    {label.name}
                  </button>
                ))}
              </div>
            )}


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
                    phoneNumbers={phoneNumbers}
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
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-32 h-32 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-6">
                  <svg className="h-16 w-16 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">WhatsApp Business API</h2>
                <p className="text-sm text-gray-400 mb-6 max-w-xs">Configure suas credenciais da API oficial do WhatsApp para começar a enviar e receber mensagens.</p>
                {isAdmin && (
                  <button onClick={() => setTab("numeros")} className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors text-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3H9"/></svg>
                    Configurar API →
                  </button>
                )}
                <p className="text-xs text-gray-400 mt-4 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                  Suas mensagens são protegidas com criptografia de ponta a ponta
                </p>
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

                    {/* Search within conversation */}
                    <button
                      onClick={() => { setShowConvSearch(v => !v); if (showConvSearch) setConvSearch(""); }}
                      title="Buscar na conversa (Ctrl+F)"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                        showConvSearch ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "border-[rgba(0,0,0,0.08)] dark:border-white/10 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </button>

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

                {/* In-conversation search bar */}
                {showConvSearch && (
                  <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#1c1e22] border-b border-[rgba(0,0,0,0.06)]">
                    <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input
                      autoFocus
                      value={convSearch}
                      onChange={e => { setConvSearch(e.target.value); setConvSearchIndex(0); }}
                      onKeyDown={e => {
                        if (e.key === "Escape") { setShowConvSearch(false); setConvSearch(""); }
                        if (e.key === "Enter") {
                          const next = (convSearchIndex + 1) % Math.max(1, searchMatchIds.length);
                          setConvSearchIndex(next);
                          if (searchMatchIds[next]) handleScrollToMsg(searchMatchIds[next]);
                        }
                      }}
                      placeholder="Buscar na conversa..."
                      className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                    />
                    {convSearch && searchMatchIds.length > 0 && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {convSearchIndex + 1}/{searchMatchIds.length}
                      </span>
                    )}
                    {convSearch && searchMatchIds.length === 0 && (
                      <span className="text-xs text-red-400 flex-shrink-0">Nenhum resultado</span>
                    )}
                    {convSearch && searchMatchIds.length > 0 && (
                      <>
                        <button onClick={() => { const prev = (convSearchIndex - 1 + searchMatchIds.length) % searchMatchIds.length; setConvSearchIndex(prev); handleScrollToMsg(searchMatchIds[prev]); }}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/10">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>
                        </button>
                        <button onClick={() => { const next = (convSearchIndex + 1) % searchMatchIds.length; setConvSearchIndex(next); handleScrollToMsg(searchMatchIds[next]); }}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/10">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                        </button>
                      </>
                    )}
                    <button onClick={() => { setShowConvSearch(false); setConvSearch(""); }} className="text-gray-400 hover:text-gray-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}

                {/* Starred filter banner */}
                {starredFilter && (
                  <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800/40">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex-1">⭐ Mostrando mensagens marcadas com estrela</span>
                    <button onClick={() => setStarredFilter(false)} className="text-amber-400 hover:text-amber-600 text-xs">Sair</button>
                  </div>
                )}

                {/* Selection mode action bar */}
                {selectionMode && (
                  <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-800/40">
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 flex-1">{selectedMsgIds.size} selecionada{selectedMsgIds.size !== 1 ? "s" : ""}</span>
                    <button onClick={handleBulkForward} disabled={selectedMsgIds.size === 0}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 px-2">
                      Encaminhar
                    </button>
                    <button onClick={handleBulkDelete} disabled={selectedMsgIds.size === 0}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 px-2">
                      Excluir
                    </button>
                    <button onClick={exitSelectionMode} className="text-xs text-gray-500 hover:text-gray-700 px-2">Cancelar</button>
                  </div>
                )}

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto px-2 md:px-5 py-3 md:py-4 relative"
                  style={{
                    backgroundImage: `url('/assets/${theme === "dark" ? "bg_whatsapp_escuro" : "bg_whatsapp"}.png')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "repeat",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(stageFile); }}
                >
                  {loadingMsgs ? (
                    <p className="text-center text-sm text-gray-400 py-8">Carregando...</p>
                  ) : displayedMessages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-8">
                      {starredFilter ? "Nenhuma mensagem com estrela." : convSearch ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem ainda."}
                    </p>
                  ) : (
                    (() => {
                      let lastDate = "";
                      return displayedMessages.map((msg) => {
                        const msgDate = new Date(msg.createdAt).toDateString();
                        const showSep = msgDate !== lastDate;
                        lastDate = msgDate;
                        const isHighlighted = convSearch.trim() !== "" && searchMatchIds.includes(msg.id);
                        return (
                          <div key={msg.id}>
                            {showSep && <DateSeparator label={formatDateSeparator(msg.createdAt)} />}
                            <ChatBubble
                              msg={msg}
                              onReply={setReplyingTo}
                              onEdit={(updated) => setMessages((ms) => ms.map((m) => m.id === updated.id ? updated : m))}
                              onForward={setForwardingMsg}
                              onDelete={handleDeleteMsg}
                              onStar={handleStarMsg}
                              onScrollToQuote={handleScrollToMsg}
                              onContactConverse={handleContactConverse}
                              inSelectionMode={selectionMode}
                              selected={selectedMsgIds.has(msg.id)}
                              onSelect={toggleMsgSelection}
                              highlighted={isHighlighted}
                            />
                          </div>
                        );
                      });
                    })()
                  )}
                  {isTyping && <TypingIndicator />}
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
                    {/* File size error banner */}
                    {attachError && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800/30">
                        <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <p className="flex-1 text-xs text-red-700 dark:text-red-400">{attachError}</p>
                        <button onClick={() => setAttachError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {/* Replying-to banner */}
                    {replyingTo && (
                      <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-[rgba(0,0,0,0.05)]">
                        <div className="flex-1 min-w-0 border-l-[3px] border-green-500 pl-2">
                          <p className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                            {replyingTo.direction === "outbound" ? "Você" : activeConv?.contact.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {quotePreviewText(replyingTo.text, replyingTo.mediaType, replyingTo.filename)}
                          </p>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                          onChange={(e) => {
                            setReplyText(e.target.value);
                            const ta = e.currentTarget;
                            ta.style.height = "auto";
                            ta.style.height = `${ta.scrollHeight}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            if (e.key === "Escape") { setShowEmojiPicker(false); clearStagedFiles(); }
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
                          style={{ maxHeight: 200, overflowY: "auto" }}
                        />

                        {/* Hidden file inputs for each type */}
                        <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                        <input ref={videoInputRef} type="file" multiple accept="video/*" className="hidden" onChange={handleFileChange} />
                        <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.ai" className="hidden" onChange={handleFileChange} />
                        <input ref={fileInputRef} type="file" multiple accept="*/*" className="hidden" onChange={handleFileChange} />

                        {/* Attach button + popup menu */}
                        <div className="relative flex-shrink-0" data-attach-menu>
                          {/* Popup menu */}
                          {showAttachMenu && (
                            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-2xl shadow-2xl p-3 flex flex-col gap-1 z-50 min-w-[160px]"
                              style={{ background: "#202c33" }}>
                              {/* Imagem */}
                              <button
                                onClick={() => { setShowAttachMenu(false); imageInputRef.current?.click(); }}
                                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0" style={{ background: "#bf59cf" }}>
                                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                  </svg>
                                </div>
                                <span className="text-[13px] font-medium text-white">Imagem</span>
                              </button>
                              {/* Vídeo */}
                              <button
                                onClick={() => { setShowAttachMenu(false); videoInputRef.current?.click(); }}
                                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0" style={{ background: "#0063cb" }}>
                                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                  </svg>
                                </div>
                                <span className="text-[13px] font-medium text-white">Vídeo</span>
                              </button>
                              {/* Documento */}
                              <button
                                onClick={() => { setShowAttachMenu(false); docInputRef.current?.click(); }}
                                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0" style={{ background: "#0091c2" }}>
                                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                </div>
                                <span className="text-[13px] font-medium text-white">Documento</span>
                              </button>
                              {/* Arquivo qualquer */}
                              <button
                                onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}
                                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0" style={{ background: "#e07610" }}>
                                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                  </svg>
                                </div>
                                <span className="text-[13px] font-medium text-white">Arquivo</span>
                              </button>
                            </div>
                          )}

                          <button
                            onClick={() => setShowAttachMenu((v) => !v)}
                            disabled={uploadingMedia}
                            title="Anexar"
                            className={`flex h-10 w-10 items-center justify-center transition-colors disabled:opacity-40 ${
                              showAttachMenu ? "text-green-500" : "text-gray-400 hover:text-green-500"
                            }`}
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
                      </div>

                      {/* Green circular button — send when text/file staged, mic/stop when recording */}
                      <button
                        onClick={(replyText.trim() || stagedFiles.length > 0) ? handleSend : isRecording ? stopRecording : startRecording}
                        disabled={sending || uploadingMedia}
                        title={replyText.trim() ? "Enviar" : isRecording ? "Parar gravação" : "Gravar áudio"}
                        className={`flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all active:scale-95 disabled:opacity-40 ${
                          isRecording
                            ? "bg-red-500 hover:bg-red-600 animate-pulse"
                            : "bg-[#00a884] hover:bg-[#00956e]"
                        }`}
                      >
                        {(replyText.trim() || stagedFiles.length > 0) ? (
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
                      messages={uniqueMessages}
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
      <style>{`
        @keyframes slideInRight { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes wa-typing { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }
      `}</style>
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

      {/* WhatsApp Web-style file preview modal */}
      {stagedFiles.length > 0 && (
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "rgba(0,0,0,0.93)" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: "#1f2c34" }}>
            <label
              htmlFor="file-modal-add-input"
              title="Adicionar mais arquivos"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </label>
            <input
              ref={fileModalAddRef}
              id="file-modal-add-input"
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="flex-1 text-center text-sm font-medium text-white truncate px-2">
              {stagedFiles[fileModalActiveIdx]?.name ?? ""}
            </p>
            <button
              onClick={clearStagedFiles}
              title="Fechar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center overflow-hidden p-6">
            {stagedPreviews[fileModalActiveIdx] ? (
              <img
                src={stagedPreviews[fileModalActiveIdx]}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-white">
                <div className="flex h-28 w-28 items-center justify-center rounded-3xl" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <svg className="h-14 w-14 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-sm text-white/60 max-w-xs text-center break-all px-4">
                  {stagedFiles[fileModalActiveIdx]?.name ?? ""}
                </p>
              </div>
            )}
          </div>

          {/* Bottom: thumbnail strip + caption + send */}
          <div className="flex-shrink-0" style={{ background: "#1f2c34" }}>
            {/* Thumbnail strip (only if multiple files) */}
            {stagedFiles.length > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
                {stagedFiles.map((file, idx) => (
                  <div key={idx} className="relative flex-shrink-0">
                    <button
                      onClick={() => setFileModalActiveIdx(idx)}
                      className={`h-14 w-14 rounded-lg overflow-hidden flex items-center justify-center border-2 transition-all ${
                        idx === fileModalActiveIdx
                          ? "border-[#00a884]"
                          : "border-transparent opacity-50 hover:opacity-80"
                      }`}
                    >
                      {stagedPreviews[idx] ? (
                        <img src={stagedPreviews[idx]} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <svg className="h-6 w-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => removeStagedFile(idx)}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:bg-black hover:text-white transition-colors"
                    >
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Caption input + send button */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 rounded-full px-4 py-2.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                <input
                  type="text"
                  value={fileModalCaption}
                  onChange={(e) => setFileModalCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleSend(); }
                    if (e.key === "Escape") clearStagedFiles();
                  }}
                  placeholder="Adicionar uma legenda..."
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSend}
                disabled={uploadingMedia}
                className="flex h-12 w-12 items-center justify-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                style={{ background: "#00a884" }}
              >
                {uploadingMedia ? (
                  <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
