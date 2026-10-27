import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { metaApi, type IgAccountSummary, type IgPost } from "../api/meta";
import {
  CountUp, EmptyState, HeroSegmented, ICONS, InsightCard, KpiCard, LoadingBlocks, MiniStat, MktHero, MktIcon, MktPage,
  Panel, RankBars, Segmented, DeltaPill, fmtCompact, fmtInt, fmtPct, tooltipStyle, useChartColors,
} from "../components/marketing/mkt-ui";

// ─── Cálculos sobre os posts ──────────────────────────────────────────────────

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_FULL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function formatOf(p: IgPost) {
  if (p.media_product_type === "REELS") return "Reels";
  if (p.media_type === "CAROUSEL_ALBUM") return "Carrossel";
  if (p.media_type === "VIDEO") return "Vídeo";
  return "Foto";
}
/** Interações do post: curtidas + comentários (+ salvamentos e compartilhamentos quando a Meta informa) */
const interactions = (p: IgPost) => (p.like_count ?? 0) + (p.comments_count ?? 0) + (p.insights?.saved ?? 0) + (p.insights?.shares ?? 0);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const timeAgo = (ts: string) => {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
};

function usePostAnalytics(posts: IgPost[]) {
  return useMemo(() => {
    const avg = (list: IgPost[]) => (list.length ? list.reduce((s, p) => s + interactions(p), 0) / list.length : 0);
    const group = (key: (p: IgPost) => string | number) => {
      const m = new Map<string | number, IgPost[]>();
      for (const p of posts) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
      return m;
    };
    const byFormat = [...group(formatOf).entries()].map(([k, list]) => ({ label: String(k), value: Math.round(avg(list)), count: list.length })).sort((a, b) => b.value - a.value);
    const byWeekday = WEEKDAYS.map((d, i) => {
      const list = posts.filter((p) => new Date(p.timestamp).getDay() === i);
      return { day: d, full: WEEKDAYS_FULL[i], avg: Math.round(avg(list)), count: list.length };
    });
    const periods = [
      { label: "manhã (6h–12h)", test: (h: number) => h >= 6 && h < 12 },
      { label: "tarde (12h–18h)", test: (h: number) => h >= 12 && h < 18 },
      { label: "noite (18h–24h)", test: (h: number) => h >= 18 },
      { label: "madrugada (0h–6h)", test: (h: number) => h < 6 },
    ].map((p) => {
      const list = posts.filter((x) => p.test(new Date(x.timestamp).getHours()));
      return { label: p.label, avg: avg(list), count: list.length };
    });
    const since = Date.now() - 28 * 86_400_000;
    const recent = posts.filter((p) => new Date(p.timestamp).getTime() >= since).length;
    // Melhor dia/horário só com pelo menos 2 posts, para não eleger um post isolado
    const bestDay = [...byWeekday].filter((d) => d.count >= 2).sort((a, b) => b.avg - a.avg)[0];
    const bestPeriod = [...periods].filter((p) => p.count >= 2).sort((a, b) => b.avg - a.avg)[0];
    return { byFormat, byWeekday, bestDay, bestPeriod, perWeek: recent / 4, avgAll: avg(posts) };
  }, [posts]);
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function PostTile({ post, rank }: { post: IgPost; rank?: number }) {
  const thumb = post.thumbnail_url ?? post.media_url;
  return (
    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
      className="group relative block aspect-square overflow-hidden rounded-xl bg-[#f1f1f3] ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45)] dark:bg-white/5 dark:ring-white/5">
      {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        : <div className="flex h-full items-center justify-center text-2xl text-[#c7c6ca]">📷</div>}
      {rank != null && rank < 3 && (
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[10px] font-bold text-[#3b2400] shadow">{rank + 1}</span>
      )}
      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9.5px] font-semibold text-white backdrop-blur">{formatOf(post)}</span>
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="text-[11px] font-semibold text-white">❤️ {fmtCompact(post.like_count ?? 0)} · 💬 {fmtCompact(post.comments_count ?? 0)}{post.insights?.saved ? ` · 🔖 ${fmtCompact(post.insights.saved)}` : ""}</p>
        <p className="text-[10px] text-white/70">{timeAgo(post.timestamp)} atrás{post.insights?.reach ? ` · alcance ${fmtCompact(post.insights.reach)}` : ""}</p>
      </div>
    </a>
  );
}

function Spotlight({ post }: { post: IgPost }) {
  const thumb = post.thumbnail_url ?? post.media_url;
  const metrics = [
    { icon: "❤️", label: "Curtidas", value: post.like_count },
    { icon: "💬", label: "Comentários", value: post.comments_count },
    { icon: "🔖", label: "Salvamentos", value: post.insights?.saved },
    { icon: "↗️", label: "Compartilhamentos", value: post.insights?.shares },
    { icon: "👥", label: "Alcance", value: post.insights?.reach },
    { icon: "▶️", label: "Visualizações", value: post.insights?.views },
  ].filter((m) => m.value != null);
  return (
    <div className="grid gap-4 rounded-2xl bg-gradient-to-br from-[#005cba]/[0.06] via-transparent to-[#8b5cf6]/[0.07] p-3 sm:grid-cols-[180px_1fr] dark:from-[#3d8ef0]/10 dark:to-[#8b5cf6]/10">
      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded-xl ring-1 ring-black/5">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center bg-[#f1f1f3] text-3xl">📷</div>}
        <span className="absolute left-2 top-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-[#3b2400] shadow">🏆 campeão</span>
      </a>
      <div className="min-w-0 py-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{formatOf(post)} · {new Date(post.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p>
        <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-[#1a1c1d] dark:text-[#e0e0e2]">{post.caption || "Sem legenda"}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/5">
              <p className="text-[10.5px] text-[#77767b]">{m.icon} {m.label}</p>
              <p className="text-[16px] font-bold tabular-nums text-[#111214] dark:text-white"><CountUp value={m.value ?? 0} format={fmtCompact} /></p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Conta ────────────────────────────────────────────────────────────────────

function AccountView({ summary }: { summary: IgAccountSummary }) {
  const colors = useChartColors();
  const [chart, setChart] = useState<"reach" | "followers" | "table">("reach");
  const [postSort, setPostSort] = useState<"top" | "recent">("top");
  const p = summary.profile;
  const cur = summary.totals?.current ?? {};
  const prev = summary.totals?.previous ?? {};
  const reachSeries = summary.insights.find((i) => i.name === "reach")?.values ?? [];
  const followerSeries = summary.insights.find((i) => i.name === "follower_count")?.values ?? [];
  const newFollowers = followerSeries.reduce((s, v) => s + v.value, 0);
  const daily = reachSeries.map((v, i) => ({ date: v.end_time, reach: v.value, followers: followerSeries[i]?.value ?? 0 }));
  const a = usePostAnalytics(summary.posts);
  const ranked = useMemo(() => [...summary.posts].sort((x, y) => interactions(y) - interactions(x)), [summary.posts]);
  const shown = postSort === "top" ? ranked : summary.posts;
  const engagementRate = cur.reach ? (cur.total_interactions ?? 0) / cur.reach : null;
  const prevEngagementRate = prev.reach ? (prev.total_interactions ?? 0) / prev.reach : undefined;

  const insights = [
    a.bestDay && { emoji: "📅", title: "Melhor dia para postar", value: a.bestDay.full, detail: `média de ${fmtInt(a.bestDay.avg)} interações por post` },
    a.bestPeriod && { emoji: "⏰", title: "Melhor horário", value: a.bestPeriod.label, detail: `média de ${fmtInt(a.bestPeriod.avg)} interações por post` },
    a.byFormat[0] && { emoji: "🎬", title: "Formato campeão", value: a.byFormat[0].label, detail: `${fmtInt(a.byFormat[0].value)} interações por post (${a.byFormat[0].count} posts)` },
    { emoji: "🗓️", title: "Ritmo de postagem", value: `${a.perWeek.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} posts por semana`, detail: "nas últimas 4 semanas" },
  ].filter(Boolean) as { emoji: string; title: string; value: string; detail: string }[];

  return (
    <>
      {/* Perfil */}
      {p && (
        <section className="mkt-rise relative overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-[#1c1e22]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-[#dd2a7b]/15 to-[#515bd4]/15 blur-2xl" />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="relative h-[76px] w-[76px] flex-shrink-0">
              <div className="mkt-ring absolute inset-0 rounded-full" />
              <div className="absolute inset-[3px] overflow-hidden rounded-full bg-white ring-2 ring-white dark:ring-[#1c1e22]">
                {p.profile_picture_url ? <img src={p.profile_picture_url} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#005cba] to-[#8b5cf6] text-2xl font-bold text-white">{(p.name || p.username)[0]}</div>}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold text-[#111214] dark:text-white">@{p.username}</p>
              {p.name && <p className="text-[13px] text-[#77767b]">{p.name}</p>}
              {p.biography && <p className="mt-1 line-clamp-2 max-w-xl text-[12.5px] text-[#46464a]">{p.biography}</p>}
              {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-[12.5px] font-medium text-[#005cba] hover:underline dark:text-[#7fb4f5]">{p.website.replace(/^https?:\/\//, "")}</a>}
            </div>
            <div className="flex gap-6 text-center">
              {[
                { label: "seguidores", value: p.followers_count },
                { label: "posts", value: p.media_count },
                { label: "novos (28 dias)", value: newFollowers, plus: true },
              ].map((s) => (
                <div key={s.label}>
                  <p className={`text-[22px] font-bold tabular-nums leading-tight ${s.plus ? "text-emerald-600 dark:text-emerald-400" : "text-[#111214] dark:text-white"}`}>
                    {s.plus && s.value > 0 ? "+" : ""}<CountUp value={s.value ?? 0} format={fmtCompact} />
                  </p>
                  <p className="text-[11.5px] text-[#77767b]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Indicadores dos últimos 28 dias */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={ICONS.eye} label="Visualizações" value={cur.views ?? null} previous={prev.views} format={fmtCompact} accent="blue" delay={40}
          hint="Vezes que seus posts, reels e stories foram exibidos" />
        <KpiCard icon={ICONS.users} label="Contas alcançadas" value={cur.reach ?? null} previous={prev.reach} format={fmtCompact} accent="violet" delay={100}
          spark={reachSeries.map((v) => v.value)} hint="Pessoas diferentes que viram seu conteúdo" />
        <KpiCard icon={ICONS.user} label="Visitas ao perfil" value={cur.profile_views ?? null} previous={prev.profile_views} accent="teal" delay={160}
          hint="Vezes que abriram o seu perfil" />
        <KpiCard icon={ICONS.heart} label="Interações" value={cur.total_interactions ?? null} previous={prev.total_interactions} accent="rose" delay={220}
          hint="Curtidas, comentários, salvamentos, compartilhamentos e respostas" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat icon={ICONS.bolt} label="Contas que interagiram" value={cur.accounts_engaged != null ? fmtInt(cur.accounts_engaged) : "—"} delay={80}
          detail={cur.accounts_engaged != null ? <DeltaPill current={cur.accounts_engaged} previous={prev.accounts_engaged} /> : undefined} />
        <MiniStat icon={ICONS.cursor} label="Toques no link do site" value={cur.website_clicks != null ? fmtInt(cur.website_clicks) : "—"} delay={140}
          detail={cur.website_clicks != null ? <DeltaPill current={cur.website_clicks} previous={prev.website_clicks} /> : undefined} />
        <MiniStat icon={ICONS.trend} label="Taxa de engajamento (interações ÷ alcance)" value={engagementRate != null ? fmtPct(engagementRate) : "—"} delay={200}
          detail={engagementRate != null ? <DeltaPill current={engagementRate} previous={prevEngagementRate} /> : undefined} />
      </div>

      {insights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {insights.map((i, n) => <InsightCard key={i.title} {...i} delay={120 + n * 60} />)}
        </div>
      )}

      {/* Gráfico diário */}
      <Panel title={chart === "followers" ? "Novos seguidores por dia" : "Contas alcançadas por dia"} subtitle="Últimos 30 dias" delay={160}
        action={<Segmented value={chart} onChange={setChart} options={[{ value: "reach", label: "Alcance" }, { value: "followers", label: "Seguidores" }, { value: "table", label: "Tabela" }]} />}>
        {daily.length < 2 ? (
          <p className="py-10 text-center text-[13px] text-[#77767b]">A Meta ainda não enviou dados diários para esta conta.</p>
        ) : chart === "table" ? (
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-white dark:bg-[#1c1e22]"><tr className="text-left text-[11px] uppercase tracking-wider text-[#77767b]"><th className="py-2">Dia</th><th className="text-right">Alcance</th><th className="text-right">Novos seguidores</th></tr></thead>
              <tbody>{daily.map((d) => (
                <tr key={d.date} className="border-t border-[rgba(0,0,0,0.05)] dark:border-white/5"><td className="py-1.5 text-[#1a1c1d]">{fmtDay(d.date)}</td><td className="text-right tabular-nums">{fmtInt(d.reach)}</td><td className="text-right tabular-nums">{fmtInt(d.followers)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              {chart === "reach" ? (
                <AreaChart data={daily} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="igReach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.main} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={colors.main} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => fmtCompact(Number(v))} width={56} />
                  <Tooltip {...tooltipStyle} labelFormatter={(d) => fmtDay(String(d))} formatter={(v) => [fmtInt(Number(v ?? 0)), "Contas alcançadas"]} cursor={{ stroke: colors.axis, strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="reach" stroke={colors.main} strokeWidth={2} fill="url(#igReach)" animationDuration={1000}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: colors.ring }} />
                </AreaChart>
              ) : (
                <BarChart data={daily} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                  <Tooltip {...tooltipStyle} labelFormatter={(d) => fmtDay(String(d))} formatter={(v) => [fmtInt(Number(v ?? 0)), "Novos seguidores"]} cursor={{ fill: colors.track }} />
                  <Bar dataKey="followers" fill={colors.main} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={900} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {summary.posts.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Formato que mais engaja" subtitle={`Média de interações por post (últimos ${summary.posts.length} posts)`} delay={200}>
            <RankBars unit="interações por post" showShare={false}
              rows={a.byFormat.map((f) => ({ label: `${f.label} · ${f.count} ${f.count === 1 ? "post" : "posts"}`, value: f.value, hint: `${f.label}: ${fmtInt(f.value)} interações em média, em ${f.count} posts` }))} />
          </Panel>
          <Panel title="Engajamento por dia da semana" subtitle="Média de interações dos posts publicados em cada dia" delay={260}>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.byWeekday} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: colors.track }}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? "")}
                    formatter={(v, _n, item) => [`${fmtInt(Number(v ?? 0))} interações em média (${item?.payload?.count ?? 0} posts)`, ""]} separator="" />
                  <Bar dataKey="avg" fill={colors.main} radius={[4, 4, 0, 0]} maxBarSize={34} animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}

      {ranked.length > 0 && (
        <Panel title="Posts em destaque" subtitle="Interações = curtidas + comentários + salvamentos + compartilhamentos" delay={300}
          action={<Segmented value={postSort} onChange={setPostSort} options={[{ value: "top", label: "Mais engajamento" }, { value: "recent", label: "Mais recentes" }]} />}>
          {postSort === "top" && <Spotlight post={ranked[0]} />}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {(postSort === "top" ? shown.slice(1, 17) : shown.slice(0, 16)).map((post, i) => (
              <PostTile key={post.id} post={post} rank={postSort === "top" ? i + 1 : undefined} />
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function MarketingDashboardPage() {
  const [summaries, setSummaries] = useState<IgAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAccount, setActiveAccount] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    metaApi.getSummary()
      .then((data) => {
        setSummaries(data);
        setUpdatedAt(new Date());
        setActiveAccount((cur) => cur || data[0]?.account || "");
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const active = summaries.find((s) => s.account === activeAccount);

  return (
    <MktPage hero={
      <MktHero icon={ICONS.chart} eyebrow="Instagram · últimos 28 dias" title="Visão geral"
        badge={updatedAt && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
        subtitle="Como estão as contas da Grafinorte e da Pluspack: alcance, visitas, interações e o que mais funciona."
        actions={<>
          {summaries.length > 1 && (
            <HeroSegmented value={activeAccount} onChange={setActiveAccount} options={summaries.map((s) => ({
              value: s.account,
              label: <>{s.profile?.profile_picture_url ? <img src={s.profile.profile_picture_url} alt="" className="h-5 w-5 rounded-full object-cover" /> : null}@{s.account}</>,
            }))} />
          )}
          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-medium text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-60">
            <MktIcon d={ICONS.refresh} className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </>} />
    }>
      {loading && !active ? <LoadingBlocks />
        : active ? <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}><AccountView key={active.account} summary={active} /></div>
        : <EmptyState icon={ICONS.chart} title="Nenhuma conta do Instagram configurada" text="Adicione as variáveis META_INSTAGRAM_* no .env do servidor." />}
    </MktPage>
  );
}
