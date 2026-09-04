import { useEffect, useState, useMemo } from "react";
import { metaApi, type IgAccountSummary, type IgPost } from "../api/meta";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Sparkline chart ──────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="w-full h-10 rounded bg-gray-100 dark:bg-white/5" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 100, H = 36;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `M0,${H} L${pts.split(" ").join(" L")} L${W},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon, sparkValues, sparkColor }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
  sparkValues?: number[]; sparkColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-gray-100 dark:border-white/5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
      </div>
      {sparkValues && sparkValues.length > 1 && sparkColor && (
        <Sparkline values={sparkValues} color={sparkColor} />
      )}
    </div>
  );
}

// ─── Post thumbnail ───────────────────────────────────────────────────────────

function PostThumb({ post, rank }: { post: IgPost; rank?: number }) {
  const thumb = post.thumbnail_url ?? post.media_url;
  const engagement = (post.like_count ?? 0) + (post.comments_count ?? 0);
  return (
    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
      className="group relative rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5 aspect-square border border-transparent hover:border-[#005cba]/50 transition-all block">
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📷</div>
      )}
      {rank != null && rank < 3 && (
        <div className="absolute top-1.5 left-1.5 bg-amber-400 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
          {rank + 1}
        </div>
      )}
      {(post.media_type === "VIDEO" || post.media_type === "REELS") && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-1">
          <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex flex-col items-center justify-end pb-2 gap-0.5">
        <div className="opacity-0 group-hover:opacity-100 transition-all text-center">
          <p className="text-white text-xs font-semibold">❤️ {fmt(post.like_count)} · 💬 {fmt(post.comments_count)}</p>
          <p className="text-white/70 text-[10px]">{fmt(engagement)} interações · {timeAgo(post.timestamp)}</p>
        </div>
      </div>
    </a>
  );
}

// ─── Reach bar chart ──────────────────────────────────────────────────────────

function DailyBars({ values, color }: { values: { value: number; end_time: string }[]; color: string }) {
  if (!values.length) return null;
  const last30 = values.slice(-30);
  const max = Math.max(...last30.map(v => v.value)) || 1;
  return (
    <div className="flex items-end gap-px h-12 w-full">
      {last30.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-sm transition-all group/bar relative"
          style={{ height: `${Math.max(4, (v.value / max) * 100)}%`, backgroundColor: color, opacity: 0.7 + (i / last30.length) * 0.3 }}
          title={`${new Date(v.end_time).toLocaleDateString("pt-BR")}: ${fmt(v.value)}`}
        />
      ))}
    </div>
  );
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ summary }: { summary: IgAccountSummary }) {
  const p = summary.profile;

  const reachValues = useMemo(() =>
    summary.insights.find(i => i.name === "reach")?.values ?? [], [summary.insights]);
  const impressionValues = useMemo(() =>
    summary.insights.find(i => i.name === "impressions")?.values ?? [], [summary.insights]);
  const profileViewValues = useMemo(() =>
    summary.insights.find(i => i.name === "profile_views")?.values ?? [], [summary.insights]);

  const totalReach = useMemo(() => reachValues.reduce((s, v) => s + v.value, 0), [reachValues]);
  const totalImpressions = useMemo(() => impressionValues.reduce((s, v) => s + v.value, 0), [impressionValues]);
  const totalProfileViews = useMemo(() => profileViewValues.reduce((s, v) => s + v.value, 0), [profileViewValues]);

  const totalLikes = useMemo(() =>
    summary.posts.reduce((s, post) => s + (post.like_count ?? 0), 0), [summary.posts]);
  const totalComments = useMemo(() =>
    summary.posts.reduce((s, post) => s + (post.comments_count ?? 0), 0), [summary.posts]);

  const engRate = useMemo(() => {
    if (!p?.followers_count || !summary.posts.length) return 0;
    const total = summary.posts.reduce((s, post) => s + (post.like_count ?? 0) + (post.comments_count ?? 0), 0);
    return (total / summary.posts.length / p.followers_count) * 100;
  }, [summary.posts, p]);

  const topPosts = useMemo(() =>
    [...summary.posts].sort((a, b) =>
      ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0))
    ), [summary.posts]);

  return (
    <div className="space-y-6">
      {/* Profile card */}
      {p && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
          {/* Banner */}
          <div className="h-28 bg-gradient-to-r from-[#005cba] via-blue-500 to-purple-600 relative">
            <div className="absolute -bottom-9 left-6">
              {p.profile_picture_url ? (
                <img src={p.profile_picture_url} alt="" className="w-18 h-18 w-[72px] h-[72px] rounded-full object-cover ring-4 ring-white dark:ring-[#1a1a1a]" />
              ) : (
                <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-[#005cba] to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-white dark:ring-[#1a1a1a]">
                  {p.name?.[0] ?? p.username?.[0]}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="pt-12 px-6 pb-5">
            <div className="flex items-start justify-between gap-4">
              {/* Left — name & bio */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">@{p.username}</p>
                {p.name && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{p.name}</p>}
                {p.biography && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-snug">{p.biography}</p>
                )}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[#005cba] hover:underline mt-1 inline-block">{p.website}</a>
                )}
              </div>

              {/* Right — stats */}
              <div className="flex gap-6 text-center flex-shrink-0">
                {[["seguidores", p.followers_count], ["seguindo", p.follows_count], ["posts", p.media_count]].map(([l, v]) => (
                  <div key={String(l)}>
                    <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{fmt(v as number)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Alcance 30d" value={fmt(totalReach)} sub="pessoas únicas"
          color="bg-blue-50 dark:bg-blue-500/10 text-blue-600"
          sparkValues={reachValues.map(v => v.value)} sparkColor="#005cba"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>}
        />
        <StatCard
          label="Impressões 30d" value={fmt(totalImpressions)} sub="visualizações totais"
          color="bg-purple-50 dark:bg-purple-500/10 text-purple-600"
          sparkValues={impressionValues.map(v => v.value)} sparkColor="#9333ea"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
        />
        <StatCard
          label="Visitas ao perfil" value={fmt(totalProfileViews)} sub="últimos 30 dias"
          color="bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600"
          sparkValues={profileViewValues.map(v => v.value)} sparkColor="#0891b2"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
        />
        <StatCard
          label="Engajamento" value={engRate > 0 ? `${engRate.toFixed(2)}%` : "—"} sub="por post / seguidores"
          color="bg-green-50 dark:bg-green-500/10 text-green-600"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Curtidas (total)", value: fmt(totalLikes), icon: "❤️", sub: `${summary.posts.length} posts` },
          { label: "Comentários", value: fmt(totalComments), icon: "💬", sub: "nos posts recentes" },
          { label: "Média curtidas", value: fmt(summary.posts.length ? Math.round(totalLikes / summary.posts.length) : 0), icon: "📊", sub: "por post" },
          { label: "Média comentários", value: fmt(summary.posts.length ? Math.round(totalComments / summary.posts.length) : 0), icon: "📝", sub: "por post" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 border border-gray-100 dark:border-white/5 flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="text-xs text-gray-400 font-medium">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{s.value}</p>
              <p className="text-xs text-gray-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reach chart */}
      {reachValues.length > 2 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Alcance diário (30 dias)</p>
              <p className="text-xs text-gray-400 mt-0.5">Pessoas únicas que viram seus conteúdos</p>
            </div>
            <p className="text-sm font-bold text-[#005cba]">{fmt(totalReach)} total</p>
          </div>
          <DailyBars values={reachValues} color="#005cba" />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{new Date(reachValues[0]?.end_time).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
            <span>{new Date(reachValues[reachValues.length - 1]?.end_time).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          </div>
        </div>
      )}

      {/* Impressions chart */}
      {impressionValues.length > 2 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Impressões diárias (30 dias)</p>
              <p className="text-xs text-gray-400 mt-0.5">Total de vezes que seus conteúdos foram exibidos</p>
            </div>
            <p className="text-sm font-bold text-purple-600">{fmt(totalImpressions)} total</p>
          </div>
          <DailyBars values={impressionValues} color="#9333ea" />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{new Date(impressionValues[0]?.end_time).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
            <span>{new Date(impressionValues[impressionValues.length - 1]?.end_time).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          </div>
        </div>
      )}

      {/* Top posts */}
      {topPosts.length > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top posts por engajamento</p>
              <p className="text-xs text-gray-400 mt-0.5">Ordenados por curtidas + comentários</p>
            </div>
            <span className="text-xs text-gray-400">{topPosts.length} posts</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {topPosts.slice(0, 8).map((post, i) => <PostThumb key={post.id} post={post} rank={i} />)}
          </div>
        </div>
      )}

      {/* All posts grid */}
      {summary.posts.length > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Todos os posts recentes</p>
            <span className="text-xs text-gray-400">{summary.posts.length} posts</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {summary.posts.map(post => <PostThumb key={post.id} post={post} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MarketingDashboardPage() {
  const [summaries, setSummaries] = useState<IgAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAccount, setActiveAccount] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    metaApi.getSummary()
      .then(data => {
        setSummaries(data);
        if (data.length > 0 && !activeAccount) setActiveAccount(data[0].account);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const active = summaries.find(s => s.account === activeAccount);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Instagram</h1>
            <p className="text-sm text-gray-400 mt-0.5">Desempenho real das suas contas</p>
          </div>
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white text-sm transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Atualizar
          </button>
        </div>

        {/* Account tabs */}
        {summaries.length > 1 && (
          <div className="flex gap-2 mb-6">
            {summaries.map(s => (
              <button key={s.account} type="button" onClick={() => setActiveAccount(s.account)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${activeAccount === s.account ? "bg-[#005cba] text-white border-[#005cba] shadow-md shadow-[#005cba]/20" : "bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-[#005cba]/40"}`}>
                {s.profile?.profile_picture_url
                  ? <img src={s.profile.profile_picture_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#005cba] to-purple-500" />}
                @{s.account}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center space-y-3">
              <svg className="h-10 w-10 animate-spin text-[#005cba] mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-sm text-gray-400">Carregando métricas do Instagram...</p>
            </div>
          </div>
        ) : active ? (
          <AccountSection summary={active} />
        ) : (
          <div className="text-center py-32">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-gray-500 dark:text-gray-400">Nenhuma conta Instagram configurada.</p>
            <p className="text-xs text-gray-400 mt-1">Adicione as variáveis META_INSTAGRAM_* no .env do servidor</p>
          </div>
        )}
      </div>
    </div>
  );
}
