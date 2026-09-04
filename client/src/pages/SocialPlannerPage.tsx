import { useEffect, useRef, useState } from "react";
import { metaApi, type SocialPost } from "../api/meta";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function startOfWeek(d: Date) {
  const c = new Date(d); c.setDate(c.getDate() - c.getDay()); c.setHours(0, 0, 0, 0); return c;
}
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(d: Date) { return isSameDay(d, new Date()); }

const STATUS_BG: Record<string, string> = {
  PENDING: "#005cba",
  PUBLISHED: "#16a34a",
  FAILED: "#dc2626",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Agendado",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
};

// ─── Post detail modal ────────────────────────────────────────────────────────

function PostDetailModal({ post, onClose, onDelete }: {
  post: SocialPost; onClose: () => void; onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Remover este post do calendário?")) return;
    setDeleting(true);
    try { await metaApi.deleteScheduledPost(post.id); onDelete(); onClose(); }
    catch { setDeleting(false); }
  }

  const bg = STATUS_BG[post.status] ?? "#666";
  const label = STATUS_LABEL[post.status] ?? post.status;
  const scheduledDate = new Date(post.scheduledAt);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: bg }}>{label}</span>
            <span className="text-xs text-gray-400">
              {scheduledDate.toLocaleDateString("pt-BR")} às {scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          {/* media preview */}
          {/\.(mp4|mov|avi|webm)$/i.test(post.mediaUrl) ? (
            <video src={post.mediaUrl} className="w-full h-40 object-cover rounded-xl bg-black" controls />
          ) : (
            <img src={post.mediaUrl} alt="" className="w-full h-40 object-cover rounded-xl bg-gray-100" />
          )}
          <div className="space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Conta</p>
            <p className="text-sm text-gray-900 dark:text-white font-medium">@{post.account}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Tipo</p>
            <p className="text-sm text-gray-900 dark:text-white">{post.mediaType}</p>
          </div>
          {post.caption && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Legenda</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{post.caption}</p>
            </div>
          )}
          {post.status === "FAILED" && post.errorMsg && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Erro ao publicar</p>
              <p className="text-xs text-red-700 dark:text-red-300">{post.errorMsg}</p>
            </div>
          )}
          {post.status === "PUBLISHED" && post.igMediaId && (
            <p className="text-xs text-green-600 dark:text-green-400">ID Instagram: {post.igMediaId}</p>
          )}
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="w-full py-2 mt-1 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors">
            {deleting ? "Removendo..." : "Remover post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── File upload area ─────────────────────────────────────────────────────────

function FileUploadArea({ label, accept, onFile, preview }: {
  label: string; accept: string; onFile: (f: File) => void; preview?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <div onClick={() => ref.current?.click()}
        className="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 h-28 cursor-pointer hover:border-[#005cba]/60 hover:bg-blue-50/20 dark:hover:bg-white/3 transition-all overflow-hidden">
        {preview ? (
          <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
            </svg>
            <span className="text-xs text-gray-400">{label}</span>
          </>
        )}
        {preview && <div className="absolute inset-0 bg-black/0 hover:bg-black/25 transition-all" />}
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

// ─── Create post modal ────────────────────────────────────────────────────────

const MEDIA_TYPES = [
  { key: "IMAGE",   label: "📷 Foto",    accept: "image/*",         hasCover: false, isStory: false },
  { key: "REELS",   label: "🎬 Reels",   accept: "video/*",         hasCover: true,  isStory: false },
  { key: "STORIES", label: "📱 Stories", accept: "image/*,video/*",  hasCover: false, isStory: true  },
] as const;

type MediaTypeKey = "IMAGE" | "REELS" | "STORIES";

function CreatePostModal({ accounts, initialDate, initialTime, onClose, onDone }: {
  accounts: string[];
  initialDate?: Date;
  initialTime?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDate = initialDate ?? new Date();
  const defaultDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}`;
  const defaultTime = initialTime ?? "12:00";

  const [publishMode, setPublishMode] = useState<"now" | "schedule">(initialDate ? "schedule" : "now");
  const [account, setAccount] = useState(accounts[0] ?? "");
  const [mediaType, setMediaType] = useState<MediaTypeKey>("IMAGE");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [date, setDate] = useState(defaultDateStr);
  const [time, setTime] = useState(defaultTime);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mt = MEDIA_TYPES.find(m => m.key === mediaType)!;

  function pickFile(file: File, setF: (f: File) => void, setP: (s: string) => void) {
    setF(file); setP(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!mediaFile) { setError("Selecione a mídia"); return; }
    setError(""); setUploading(true);
    let mediaUrl: string, coverUrl: string | undefined;
    try {
      mediaUrl = (await metaApi.uploadMedia(mediaFile)).url;
      if (coverFile) coverUrl = (await metaApi.uploadMedia(coverFile)).url;
    } catch (e) { setError(e instanceof Error ? e.message : "Erro no upload"); setUploading(false); return; }
    setUploading(false); setLoading(true);
    try {
      if (publishMode === "now") {
        await metaApi.publishNow(account, { mediaUrl, caption, mediaType, coverUrl });
      } else {
        const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
        await metaApi.schedulePost({ account, mediaUrl, caption, mediaType, coverUrl, scheduledAt });
      }
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao publicar");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Criar post</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 dark:bg-white/5 rounded-xl p-1">
            {(["now", "schedule"] as const).map(m => (
              <button key={m} type="button" onClick={() => setPublishMode(m)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${publishMode === m ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
                {m === "now" ? "Publicar agora" : "Agendar"}
              </button>
            ))}
          </div>

          {/* Account */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Conta</p>
            <select value={account} onChange={e => setAccount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]">
              {accounts.map(a => <option key={a} value={a}>@{a}</option>)}
            </select>
          </div>

          {/* Type */}
          <div className="flex gap-2">
            {MEDIA_TYPES.map(t => (
              <button key={t.key} type="button"
                onClick={() => { setMediaType(t.key); setMediaFile(null); setMediaPreview(""); setCoverFile(null); setCoverPreview(""); }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${mediaType === t.key ? "bg-[#005cba] text-white border-[#005cba]" : "border-gray-200 dark:border-white/10 text-gray-500 hover:border-[#005cba]/40"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {mt.isStory && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
              Stories: foto (até 24h) ou vídeo curto (até 60s). Sem legenda.
            </p>
          )}

          {/* Files */}
          <div className={`grid gap-3 ${mt.hasCover ? "grid-cols-2" : "grid-cols-1"}`}>
            <FileUploadArea
              label={mediaType === "IMAGE" ? "Foto" : mediaType === "REELS" ? "Vídeo" : "Foto ou Vídeo"}
              accept={mt.accept}
              onFile={f => pickFile(f, setMediaFile, setMediaPreview)}
              preview={mediaPreview}
            />
            {mt.hasCover && (
              <FileUploadArea label="Capa do Reel" accept="image/*"
                onFile={f => pickFile(f, setCoverFile, setCoverPreview)} preview={coverPreview} />
            )}
          </div>

          {!mt.isStory && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Legenda</p>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                placeholder="Escreva a legenda..."
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba] resize-none" />
              <p className="text-xs text-gray-400 text-right">{caption.length}/2200</p>
            </div>
          )}

          {publishMode === "schedule" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Data</p>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Hora</p>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]" />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 text-center bg-red-50 dark:bg-red-500/10 rounded-lg py-2">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={uploading || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] disabled:opacity-50 transition-colors">
            {uploading ? "Enviando arquivo..." : loading ? "Publicando..." : publishMode === "now" ? "Publicar agora" : "Agendar post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ weekStart, posts, onDayClick, onPostClick }: {
  weekStart: Date; posts: SocialPost[];
  onDayClick: (date: Date, time: string) => void;
  onPostClick: (post: SocialPost) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function postsForDayHour(day: Date, hour: number) {
    return posts.filter(p => {
      const d = new Date(p.scheduledAt);
      return isSameDay(d, day) && d.getHours() === hour;
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-200 dark:border-white/5 sticky top-0 bg-white dark:bg-[#111] z-10">
        <div className="h-12" />
        {days.map((day, i) => (
          <div key={i} className={`h-12 flex flex-col items-center justify-center text-xs border-l border-gray-100 dark:border-white/5 ${isToday(day) ? "bg-[#005cba]/5" : ""}`}>
            <span className="text-gray-400 font-medium">{DAYS_SHORT[day.getDay()]}</span>
            <span className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday(day) ? "bg-[#005cba] text-white" : "text-gray-700 dark:text-gray-200"}`}>
              {day.getDate()}
            </span>
          </div>
        ))}
      </div>
      {hours.map(hour => (
        <div key={hour} className="grid grid-cols-[56px_repeat(7,1fr)] min-h-[52px] border-b border-gray-100 dark:border-white/5">
          <div className="text-[10px] text-gray-400 text-right pr-2 pt-1 font-medium select-none">
            {hour === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
          </div>
          {days.map((day, di) => {
            const dayPosts = postsForDayHour(day, hour);
            return (
              <div key={di}
                onClick={() => onDayClick(day, `${String(hour).padStart(2, "0")}:00`)}
                className={`border-l border-gray-100 dark:border-white/5 relative p-0.5 cursor-pointer group hover:bg-[#005cba]/5 transition-colors ${isToday(day) ? "bg-[#005cba]/3" : ""}`}>
                {dayPosts.map(p => (
                  <div key={p.id}
                    onClick={e => { e.stopPropagation(); onPostClick(p); }}
                    className="text-[10px] font-semibold px-1.5 py-1 rounded-lg text-white truncate mb-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: STATUS_BG[p.status] ?? "#666" }}
                    title={p.status === "FAILED" && p.errorMsg ? `Erro: ${p.errorMsg}` : (p.caption || p.account)}>
                    {new Date(p.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} @{p.account}
                  </div>
                ))}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <svg className="h-4 w-4 text-[#005cba]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ month, year, posts, onDayClick, onPostClick }: {
  month: number; year: number; posts: SocialPost[];
  onDayClick: (date: Date, time: string) => void;
  onPostClick: (post: SocialPost) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-white/5 rounded-xl overflow-hidden">
        {DAYS_SHORT.map(d => (
          <div key={d} className="bg-white dark:bg-[#111] text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
        ))}
        {cells.map((day, i) => {
          const dayPosts = day ? posts.filter(p => isSameDay(new Date(p.scheduledAt), day)) : [];
          return (
            <div key={i}
              onClick={() => day && onDayClick(day, "12:00")}
              className={`bg-white dark:bg-[#111] min-h-[90px] p-1.5 transition-colors ${!day ? "opacity-0 pointer-events-none" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/3"} ${day && isToday(day) ? "ring-inset ring-2 ring-[#005cba]" : ""}`}>
              {day && (
                <>
                  <span className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday(day) ? "bg-[#005cba] text-white" : "text-gray-600 dark:text-gray-300"}`}>
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayPosts.slice(0, 3).map(p => (
                      <div key={p.id}
                        onClick={e => { e.stopPropagation(); onPostClick(p); }}
                        className="text-[9px] font-semibold px-1 py-0.5 rounded text-white truncate cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: STATUS_BG[p.status] ?? "#666" }}
                        title={p.status === "FAILED" && p.errorMsg ? `Erro: ${p.errorMsg}` : (p.caption || p.account)}>
                        {new Date(p.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} @{p.account}
                      </div>
                    ))}
                    {dayPosts.length > 3 && <p className="text-[9px] text-gray-400 font-medium">+{dayPosts.length - 3} mais</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

export function SocialPlannerPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [createTime, setCreateTime] = useState<string | undefined>();
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const weekCursor = startOfWeek(new Date(selectedYear, selectedMonth, 1));

  useEffect(() => {
    setLoading(true);
    Promise.all([metaApi.getScheduledPosts(), metaApi.getAccounts()])
      .then(([p, a]) => {
        setPosts(p);
        setAccounts(a.map(acc => acc.name));
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  function openCreate(date: Date, time: string) {
    setCreateDate(date); setCreateTime(time); setShowCreate(true);
  }

  function goBack() {
    if (viewMode === "week") {
      const prev = addDays(weekCursor, -7);
      setSelectedMonth(prev.getMonth()); setSelectedYear(prev.getFullYear());
    } else {
      const d = new Date(selectedYear, selectedMonth - 1, 1);
      setSelectedMonth(d.getMonth()); setSelectedYear(d.getFullYear());
    }
  }

  function goForward() {
    if (viewMode === "week") {
      const next = addDays(weekCursor, 7);
      setSelectedMonth(next.getMonth()); setSelectedYear(next.getFullYear());
    } else {
      const d = new Date(selectedYear, selectedMonth + 1, 1);
      setSelectedMonth(d.getMonth()); setSelectedYear(d.getFullYear());
    }
  }

  function goToday() {
    setSelectedMonth(new Date().getMonth()); setSelectedYear(new Date().getFullYear());
  }

  const weekEnd = addDays(weekCursor, 6);
  const headerWeekLabel = weekCursor.getMonth() === weekEnd.getMonth()
    ? `${weekCursor.getDate()}–${weekEnd.getDate()} ${MONTHS_PT[weekCursor.getMonth()]}`
    : `${weekCursor.getDate()} ${MONTHS_PT[weekCursor.getMonth()].slice(0, 3)} – ${weekEnd.getDate()} ${MONTHS_PT[weekEnd.getMonth()].slice(0, 3)}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#111] flex-shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
            {(["month", "week"] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === m ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
                {m === "month" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>

          {/* Prev / Today / Next */}
          <button type="button" onClick={goBack}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <button type="button" onClick={goToday}
            className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            Hoje
          </button>
          <button type="button" onClick={goForward}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>

          {/* Month + Year dropdowns */}
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-sm font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005cba]">
            {MONTHS_PT.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-sm font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#005cba]">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {viewMode === "week" && (
            <span className="text-xs text-gray-400 font-medium">{headerWeekLabel}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}
            className="p-2 rounded-xl border border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button type="button" onClick={() => { setCreateDate(undefined); setCreateTime(undefined); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] transition-colors shadow-md shadow-[#005cba]/20">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Criar post
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-[#111] flex-shrink-0">
        {[["#005cba", "Agendado"], ["#16a34a", "Publicado"], ["#dc2626", "Falhou"]].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="text-xs text-gray-400 ml-2 hidden sm:inline">Clique em qualquer dia para agendar</span>
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <svg className="h-8 w-8 animate-spin text-[#005cba]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : viewMode === "week" ? (
        <WeekView weekStart={weekCursor} posts={posts} onDayClick={openCreate} onPostClick={setSelectedPost} />
      ) : (
        <MonthView month={selectedMonth} year={selectedYear} posts={posts} onDayClick={openCreate} onPostClick={setSelectedPost} />
      )}

      {showCreate && (
        <CreatePostModal
          accounts={accounts}
          initialDate={createDate}
          initialTime={createTime}
          onClose={() => setShowCreate(false)}
          onDone={() => setRefreshKey(k => k + 1)}
        />
      )}

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onDelete={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
