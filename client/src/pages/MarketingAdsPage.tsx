import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { researchApi, type AdsResearch, type CompetitorAd, type ResearchSummary } from "../api/marketingResearch";
import { competitorApi, type CompetitorProfile } from "../api/competitor";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  EmptyState, ErrorBox, HeroResearchBar, HeroSegmented, ICONS, InsightCard, KpiCard, LoadingBlocks, MktHero, MktIcon, MktPage,
  Panel, RankBars, Segmented, fmtCompact, fmtInt, fmtUsd,
} from "../components/marketing/mkt-ui";

type Mode = "ADS_ADVERTISER" | "ADS_KEYWORD";

const FORMAT_LABELS: Record<string, string> = {
  image: "Imagem", video: "Vídeo", carousel: "Carrossel", dpa: "Catálogo de produtos", dco: "Criativo dinâmico", text: "Só texto",
};
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", whatsapp: "WhatsApp", threads: "Threads", audience_network: "Rede de parceiros da Meta",
};
const KEYWORD_SUGGESTIONS = ["gráfica", "cartão de visita", "embalagem personalizada", "adesivo personalizado", "panfleto", "caixa personalizada"];

const daysRunning = (ad: CompetitorAd) => (ad.startDate ? Math.max(0, Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86_400_000)) : null);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// ─── Cartão de anúncio ────────────────────────────────────────────────────────

function AdCard({ ad, delay }: { ad: CompetitorAd; delay: number }) {
  const [img, setImg] = useState(0);
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const days = daysRunning(ad);
  const veteran = days != null && days >= 30;
  const media = ad.images[img];

  return (
    <article style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className="mkt-rise group flex flex-col overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.25)] dark:border-white/[0.07] dark:bg-[#1c1e22]">
      {/* Mídia */}
      <div className="relative aspect-square overflow-hidden bg-[#f1f1f3] dark:bg-white/5">
        {ad.video && (!media || broken) ? (
          <video src={ad.video} controls preload="metadata" className="h-full w-full object-cover" />
        ) : media && !broken ? (
          <img src={media} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[#77767b]">
            <MktIcon d={ICONS.megaphone} className="h-8 w-8" />
            <span className="text-[11.5px]">{broken ? "Imagem expirou — veja na Biblioteca" : "Anúncio só com texto"}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur">{FORMAT_LABELS[ad.format] ?? ad.format}</span>
          {days != null && (
            <span title={ad.startDate ? `No ar desde ${fmtDate(ad.startDate)}` : undefined}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur ${veteran ? "bg-amber-400/95 text-[#3b2400]" : "bg-black/60 text-white"}`}>
              {veteran ? "🔥 " : ""}{days === 0 ? "começou hoje" : `${days} ${days === 1 ? "dia" : "dias"} no ar`}
            </span>
          )}
        </div>
        {ad.images.length > 1 && !broken && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {ad.images.map((_, i) => (
              <button key={i} type="button" onClick={() => setImg(i)} aria-label={`Imagem ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === img ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"}`} />
            ))}
          </div>
        )}
      </div>

      {/* Texto */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005cba] to-[#8b5cf6] text-[11px] font-bold text-white">
            {ad.pageName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#111214] dark:text-white">{ad.pageName}</p>
            {ad.pageLikes != null && <p className="text-[11px] text-[#77767b]">{fmtCompact(ad.pageLikes)} curtidas na página</p>}
          </div>
        </div>
        {ad.title && <p className="mt-3 line-clamp-2 text-[13px] font-semibold text-[#111214] dark:text-white">{ad.title}</p>}
        {ad.body && (
          <p className={`mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[#46464a] ${expanded ? "" : "line-clamp-4"}`}>{ad.body}</p>
        )}
        {ad.body.length > 220 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 self-start text-[12px] font-medium text-[#005cba] hover:underline dark:text-[#7fb4f5]">
            {expanded ? "Mostrar menos" : "Ler tudo"}
          </button>
        )}

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap gap-1">
            {ad.platforms.map((p) => (
              <span key={p} className="rounded-md bg-[#f3f3f5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#46464a] dark:bg-white/5">{PLATFORM_LABELS[p] ?? p}</span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.06)] pt-3">
            <div className="min-w-0">
              {ad.cta && <span className="rounded-lg bg-[#005cba]/10 px-2 py-1 text-[11.5px] font-semibold text-[#005cba] dark:bg-[#3d8ef0]/15 dark:text-[#7fb4f5]">{ad.cta}</span>}
              {ad.linkCaption && <p className="mt-1 truncate text-[11px] text-[#77767b]" title={ad.linkUrl ?? undefined}>{ad.linkCaption}</p>}
            </div>
            <a href={ad.url} target="_blank" rel="noopener noreferrer"
              className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] hover:text-[#111214] dark:hover:bg-white/5 dark:hover:text-white">
              Biblioteca <MktIcon d={ICONS.external} className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function MarketingAdsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("palavra") ? "ADS_KEYWORD" : "ADS_ADVERTISER");
  const [query, setQuery] = useState(params.get("palavra") ?? "");
  const [research, setResearch] = useState<AdsResearch | null>(null);
  const [history, setHistory] = useState<ResearchSummary[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [format, setFormat] = useState("all");

  const loadHistory = () => researchApi.list("ads").then(setHistory).catch(() => {});
  useEffect(() => {
    loadHistory();
    competitorApi.getProfiles().then(setCompetitors).catch(() => {});
  }, []);

  async function run(kind: Mode, q: string) {
    if (q.trim().length < 2 || loading) return;
    setMode(kind); setQuery(q); setLoading(true); setError(null); setFormat("all");
    try {
      setResearch(await researchApi.run<AdsResearch["result"]>(kind, q));
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível pesquisar agora.");
    } finally {
      setLoading(false);
    }
  }

  // Vindo da página de Buscas no Google ("ver anúncios desta palavra")
  useEffect(() => {
    const p = params.get("palavra");
    if (p) { run("ADS_KEYWORD", p); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openHistory(id: string) {
    setLoading(true); setError(null);
    try {
      const r = await researchApi.get<AdsResearch["result"]>(id);
      setResearch(r); setMode(r.kind as Mode); setQuery(r.query); setFormat("all");
    } catch { setError("Não foi possível abrir esta pesquisa."); }
    finally { setLoading(false); }
  }

  const ads = research?.result.ads ?? [];
  const stats = useMemo(() => {
    const days = ads.map(daysRunning).filter((d): d is number => d != null);
    const count = (key: (a: CompetitorAd) => string[]) => {
      const m = new Map<string, number>();
      for (const a of ads) for (const k of key(a)) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      advertisers: count((a) => [a.pageName]),
      formats: count((a) => [a.format]),
      platforms: count((a) => a.platforms),
      ctas: count((a) => (a.cta ? [a.cta] : [])),
      maxDays: days.length ? Math.max(...days) : null,
      avgDays: days.length ? days.reduce((s, d) => s + d, 0) / days.length : null,
      veterans: days.filter((d) => d >= 30).length,
      newThisWeek: days.filter((d) => d <= 7).length,
    };
  }, [ads]);

  const visible = useMemo(() => {
    const list = ads.filter((a) => format === "all" || a.format === format);
    return [...list].sort((a, b) => {
      const da = daysRunning(a) ?? -1, db = daysRunning(b) ?? -1;
      return sort === "oldest" ? db - da : da - db;
    });
  }, [ads, sort, format]);

  const chips = mode === "ADS_ADVERTISER"
    ? [...new Set(competitors.map((c) => c.name))].slice(0, 8)
    : KEYWORD_SUGGESTIONS;

  return (
    <MktPage hero={
      <MktHero icon={ICONS.megaphone} eyebrow="Biblioteca de Anúncios da Meta" title="Anúncios dos concorrentes"
        subtitle="O que as gráficas estão anunciando agora no Facebook, Instagram e WhatsApp — e há quanto tempo cada anúncio está no ar.">
        <form onSubmit={(e) => { e.preventDefault(); run(mode, query); }} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <HeroSegmented value={mode} onChange={(v) => setMode(v)} options={[
            { value: "ADS_ADVERTISER", label: "Por empresa" },
            { value: "ADS_KEYWORD", label: "Por palavra" },
          ]} />
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur focus-within:ring-white/40">
            <MktIcon d={ICONS.search} className="ml-2 h-4 w-4 flex-shrink-0 text-white/60" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100}
              placeholder={mode === "ADS_ADVERTISER" ? "Nome da empresa, site ou página do Facebook (ex.: Printi)" : "Palavra no texto do anúncio (ex.: cartão de visita)"}
              className="mkt-hero-input min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[14px] text-white placeholder-white/45 outline-none" />
            <button type="submit" disabled={loading || query.trim().length < 2}
              className="flex items-center gap-1.5 rounded-xl bg-[#ffffff] px-4 py-2 text-[13px] font-semibold text-[#0d2547] shadow-sm transition-all hover:shadow-[0_0_24px_rgba(125,180,255,0.6)] disabled:opacity-50">
              {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0d2547]/30 border-t-[#0d2547]" /> : <MktIcon d={ICONS.search} className="h-3.5 w-3.5" />}
              Pesquisar
            </button>
          </div>
        </form>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-white/50">{mode === "ADS_ADVERTISER" ? "Seus concorrentes:" : "Sugestões:"}</span>
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => run(mode, c)}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/20 hover:text-white">{c}</button>
            ))}
          </div>
        )}
        <HeroResearchBar showCost={isAdmin} onOpen={openHistory}
          current={research && { ...research, detail: research.kind === "ADS_ADVERTISER" ? "por empresa" : "por palavra" }}
          history={history.map((h) => ({ id: h.id, query: h.query, detail: `${h.kind === "ADS_ADVERTISER" ? "empresa" : "palavra"} · ${h.itemCount} anúncios · ${h.userName}` }))} />
      </MktHero>
    }>
      {error && <ErrorBox message={error} />}

      <div className="grid gap-5 2xl:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          {loading && <LoadingBlocks />}

          {!loading && !research && (
            <EmptyState icon={ICONS.megaphone} title="Pesquise um concorrente ou uma palavra"
              text={<>Por <b>empresa</b>: todos os anúncios que ela está rodando agora. Por <b>palavra</b>: anúncios de qualquer empresa que falam daquilo (ex.: “cartão de visita”). Anúncio que está há muito tempo no ar normalmente é o que está dando resultado.</>} />
          )}

          {!loading && research && ads.length === 0 && (
            <EmptyState icon={ICONS.search} title={`Nenhum anúncio ativo para “${research.query}”`}
              text={mode === "ADS_ADVERTISER" ? "A empresa pode não estar anunciando agora, ou o nome é diferente na Biblioteca. Tente o site (ex.: printi.com.br) ou o link da página do Facebook." : "Tente uma palavra mais comum ou pesquise pelo nome da empresa."} />
          )}

          {!loading && research && ads.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard icon={ICONS.megaphone} label="Anúncios ativos" value={ads.length} accent="blue" hint="Anúncios encontrados rodando agora" />
                <KpiCard icon={ICONS.users} label="Anunciantes" value={stats.advertisers.length} accent="violet" delay={60} hint="Empresas diferentes nos resultados" />
                <KpiCard icon={ICONS.flame} label="No ar há 30+ dias" value={stats.veterans} accent="amber" delay={120}
                  sub={stats.maxDays != null ? `o mais antigo: ${fmtInt(stats.maxDays)} dias` : undefined} hint="Anúncio que fica muito tempo no ar costuma estar vendendo" />
                <KpiCard icon={ICONS.sparkles} label="Novos nesta semana" value={stats.newThisWeek} accent="teal" delay={180}
                  sub={stats.avgDays != null ? `média de ${fmtInt(stats.avgDays)} dias no ar` : undefined} hint="Começaram nos últimos 7 dias — o que estão testando agora" />
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <Panel title="Formatos" subtitle="Tipo de criativo mais usado" delay={100}>
                  <RankBars unit="anúncios" rows={stats.formats.map(([k, v]) => ({ label: FORMAT_LABELS[k] ?? k, value: v }))} />
                </Panel>
                <Panel title="Onde aparecem" subtitle="Plataformas em que os anúncios rodam" delay={160}>
                  <RankBars unit="anúncios" showShare={false} rows={stats.platforms.map(([k, v]) => ({ label: PLATFORM_LABELS[k] ?? k, value: v, hint: `${PLATFORM_LABELS[k] ?? k}: ${v} de ${ads.length} anúncios` }))} />
                </Panel>
                {research.kind === "ADS_KEYWORD" && stats.advertisers.length > 1 ? (
                  <Panel title="Quem mais anuncia" subtitle="Anúncios por empresa" delay={220}>
                    <RankBars unit="anúncios" showShare={false} rows={stats.advertisers.slice(0, 6).map(([k, v]) => ({ label: k, value: v }))} />
                  </Panel>
                ) : (
                  <Panel title="Botão do anúncio" subtitle="O que pedem para o cliente fazer" delay={220}>
                    <RankBars unit="anúncios" showShare={false} rows={stats.ctas.slice(0, 6).map(([k, v]) => ({ label: k, value: v }))} empty="Sem botão nos anúncios." />
                  </Panel>
                )}
              </div>

              {stats.veterans > 0 && (
                <InsightCard emoji="💡" title="Dica" value={`${stats.veterans} ${stats.veterans === 1 ? "anúncio está" : "anúncios estão"} no ar há mais de um mês`}
                  detail="Ninguém paga tanto tempo por um anúncio que não traz cliente. Olhe a oferta, a imagem e o texto deles — estão marcados com 🔥." delay={200} />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-[#111214] dark:text-white">{visible.length} {visible.length === 1 ? "anúncio" : "anúncios"}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato"
                    className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[12.5px] text-[#1a1c1d] outline-none">
                    <option value="all">Todos os formatos</option>
                    {stats.formats.map(([k]) => <option key={k} value={k}>{FORMAT_LABELS[k] ?? k}</option>)}
                  </select>
                  <Segmented value={sort} onChange={setSort} options={[{ value: "oldest", label: "Há mais tempo no ar" }, { value: "newest", label: "Mais recentes" }]} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {visible.map((ad, i) => <AdCard key={ad.id} ad={ad} delay={Math.min(i, 8) * 50} />)}
              </div>
            </>
          )}
        </div>

        {/* Histórico (telas largas; nas menores, as recentes ficam no topo) */}
        <aside className="hidden space-y-3 2xl:block">
          <Panel title={<span className="flex items-center gap-1.5"><MktIcon d={ICONS.history} /> Pesquisas recentes</span>} delay={120}>
            {history.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-[#77767b]">Nenhuma pesquisa ainda.</p>
            ) : (
              <ul className="-mx-2 max-h-[520px] space-y-0.5 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => openHistory(h.id)}
                      className={`w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#f3f3f5] dark:hover:bg-white/5 ${research?.id === h.id ? "bg-[#005cba]/[0.07] dark:bg-[#3d8ef0]/10" : ""}`}>
                      <p className="truncate text-[13px] font-medium text-[#111214] dark:text-white">{h.query}</p>
                      <p className="text-[11px] text-[#77767b]">
                        {h.kind === "ADS_ADVERTISER" ? "empresa" : "palavra"} · {fmtInt(h.itemCount)} anúncios · {fmtWhen(h.createdAt)}
                        {isAdmin && h.costMicro ? ` · ${fmtUsd(h.costMicro)}` : ""}
                      </p>
                      <p className="text-[11px] text-[#77767b]">{h.userName}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="px-1 text-[11px] leading-relaxed text-[#77767b]">
            Os dados vêm da Biblioteca de Anúncios pública da Meta. As imagens ficam disponíveis por alguns dias; depois, use “Biblioteca” para ver o anúncio.
          </p>
        </aside>
      </div>
    </MktPage>
  );
}
