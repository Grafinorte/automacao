import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { researchApi, type KeywordRow, type KeywordsResearch, type ResearchSummary } from "../api/marketingResearch";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  EmptyState, ErrorBox, HeroResearchBar, ICONS, InsightCard, KpiCard, LoadingBlocks, MktHero, MktIcon, MktPage, Panel, Segmented,
  Sparkline, fmtCompact, fmtInt, fmtUsd, tooltipStyle, useChartColors,
} from "../components/marketing/mkt-ui";

const PRESETS = [
  { group: "Grafinorte", items: ["cartão de visita", "panfleto", "adesivo personalizado", "banner", "cardápio", "gráfica londrina"] },
  { group: "Pluspack", items: ["embalagem personalizada", "caixa personalizada", "sacola personalizada", "embalagem para delivery"] },
];

const fmtMonth = (m: string) => new Date(`${m.slice(0, 7)}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Concorrência nos anúncios do Google (0 a 1) → texto. Não é "bom/ruim": só quanta gente disputa a palavra. */
function competitionLabel(c: number | null) {
  if (c == null) return "—";
  return c >= 0.67 ? "Alta" : c >= 0.34 ? "Média" : "Baixa";
}

/** Tendência dos últimos 3 meses contra os 3 anteriores (só quando há histórico) */
function trendDelta(r: KeywordRow) {
  const v = r.trend.map((t) => t.volume);
  if (v.length < 6) return null;
  const last = v.slice(-3).reduce((s, x) => s + x, 0), prev = v.slice(-6, -3).reduce((s, x) => s + x, 0);
  return prev ? (last - prev) / prev : null;
}

function DifficultyBar({ value }: { value: number | null }) {
  const colors = useChartColors();
  if (value == null) return <span className="text-[#77767b]">—</span>;
  return (
    <div className="flex items-center gap-2" title={`Dificuldade para aparecer no Google sem pagar: ${value} de 100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ backgroundColor: colors.track }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: colors.main }} />
      </div>
      <span className="w-6 text-right text-[12px] tabular-nums text-[#46464a]">{value}</span>
    </div>
  );
}

export function MarketingSearchPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const navigate = useNavigate();
  const colors = useChartColors();
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState<KeywordsResearch | null>(null);
  const [history, setHistory] = useState<ResearchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [copied, setCopied] = useState<string | null>(null);

  const loadHistory = () => researchApi.list("keywords").then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  async function run(q: string) {
    if (q.trim().length < 2 || loading) return;
    setQuery(q); setLoading(true); setError(null);
    try {
      setResearch(await researchApi.run<KeywordsResearch["result"]>("KEYWORDS", q));
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível pesquisar agora.");
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(id: string) {
    setLoading(true); setError(null);
    try {
      const r = await researchApi.get<KeywordsResearch["result"]>(id);
      setResearch(r); setQuery(r.query);
    } catch { setError("Não foi possível abrir esta pesquisa."); }
    finally { setLoading(false); }
  }

  function copy(k: string) {
    navigator.clipboard?.writeText(k).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  }

  const rows = useMemo(() => research?.result.rows ?? [], [research]);
  const withVolume = rows.filter((r) => (r.volume ?? 0) > 0);
  const total = withVolume.reduce((s, r) => s + (r.volume ?? 0), 0);
  const cpcs = rows.map((r) => r.cpc).filter((c): c is number => c != null && c > 0);

  const insights = useMemo(() => {
    const list: { emoji: string; title: string; value: string; detail: string }[] = [];
    const top = withVolume[0];
    if (top) list.push({ emoji: "🏆", title: "Mais buscada", value: top.keyword, detail: `${fmtInt(top.volume ?? 0)} buscas por mês no Brasil` });
    // Oportunidade: muita busca com pouca dificuldade para aparecer sem anúncio
    const opp = [...withVolume].filter((r) => r.difficulty != null).sort((a, b) => (b.volume ?? 0) / ((b.difficulty ?? 0) + 10) - (a.volume ?? 0) / ((a.difficulty ?? 0) + 10))[0];
    if (opp && opp !== top) list.push({ emoji: "🎯", title: "Oportunidade", value: opp.keyword, detail: `Boa procura (${fmtCompact(opp.volume)}/mês) e dificuldade ${opp.difficulty}/100 — bom tema para post, página ou anúncio` });
    const rising = rows.map((r) => ({ r, d: trendDelta(r) })).filter((x) => x.d != null && x.d > 0.1).sort((a, b) => (b.d ?? 0) - (a.d ?? 0))[0];
    if (rising) list.push({ emoji: "📈", title: "Em alta", value: rising.r.keyword, detail: `+${Math.round((rising.d ?? 0) * 100)}% nos últimos 3 meses` });
    const cheap = [...withVolume].filter((r) => r.cpc != null && r.cpc > 0).sort((a, b) => (a.cpc ?? 0) - (b.cpc ?? 0))[0];
    if (cheap) list.push({ emoji: "💰", title: "Clique mais barato", value: cheap.keyword, detail: `cerca de US$ ${cheap.cpc?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} por clique no Google Ads` });
    return list;
  }, [rows, withVolume]);

  const chartData = withVolume.slice(0, 12).map((r) => ({ keyword: r.keyword, volume: r.volume ?? 0 }));

  return (
    <MktPage hero={
      <MktHero icon={ICONS.search} eyebrow="Google · Brasil · buscas por mês" title="O que as pessoas buscam no Google"
        subtitle="Quantas vezes por mês cada assunto é pesquisado — para escolher palavras de anúncios, posts e páginas do site.">
        <form onSubmit={(e) => { e.preventDefault(); run(query); }}
          className="flex items-center gap-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur focus-within:ring-white/40">
          <MktIcon d={ICONS.search} className="ml-2 h-4 w-4 flex-shrink-0 text-white/60" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100}
            placeholder="Uma palavra (mostra também as variações) ou várias separadas por vírgula"
            className="mkt-hero-input min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[14px] text-white placeholder-white/45 outline-none" />
          <button type="submit" disabled={loading || query.trim().length < 2}
            className="flex items-center gap-1.5 rounded-xl bg-[#ffffff] px-4 py-2 text-[13px] font-semibold text-[#0d2547] shadow-sm transition-all hover:shadow-[0_0_24px_rgba(125,180,255,0.6)] disabled:opacity-50">
            {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0d2547]/30 border-t-[#0d2547]" /> : <MktIcon d={ICONS.search} className="h-3.5 w-3.5" />}
            Pesquisar
          </button>
        </form>
        <div className="mt-3 space-y-1.5">
          {PRESETS.map((p) => (
            <div key={p.group} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[72px] text-[11.5px] text-white/50">{p.group}:</span>
              {p.items.map((c) => (
                <button key={c} type="button" onClick={() => run(c)}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/20 hover:text-white">{c}</button>
              ))}
            </div>
          ))}
        </div>
        <HeroResearchBar showCost={isAdmin} onOpen={openHistory} current={research}
          history={history.map((h) => ({ id: h.id, query: h.query, detail: `${h.itemCount} palavras · ${h.userName}` }))} />
      </MktHero>
    }>
      {error && <ErrorBox message={error} />}

      <div className="grid gap-5 2xl:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          {loading && <LoadingBlocks />}

          {!loading && !research && (
            <EmptyState icon={ICONS.search} title="Descubra o que seus clientes procuram"
              text={<>Digite um produto, como <b>cartão de visita</b>: aparecem quantas vezes ele é buscado por mês e as variações que o Google sugere (“cartão de visita digital”, “...com QR code”). Use para decidir o que anunciar e sobre o que postar.</>} />
          )}

          {!loading && research && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard icon={ICONS.search} label="Buscas por mês" value={total} format={fmtCompact} accent="blue" hint="Soma das buscas mensais de todas as palavras abaixo, no Brasil" />
                <KpiCard icon={ICONS.layers} label="Palavras analisadas" value={rows.length} accent="violet" delay={60} sub={`${withVolume.length} com buscas`} />
                <KpiCard icon={ICONS.trend} label="Maior volume" value={withVolume[0]?.volume ?? 0} format={fmtCompact} accent="teal" delay={120} sub={withVolume[0]?.keyword} />
                <KpiCard icon={ICONS.coin} label="Clique médio (Google Ads)" value={cpcs.length ? cpcs.reduce((s, c) => s + c, 0) / cpcs.length : null}
                  format={(n) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="amber" delay={180}
                  hint="Quanto se paga, em média, por clique em anúncio do Google nessas palavras (estimativa, em dólar)" />
              </div>

              {insights.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {insights.map((i, n) => <InsightCard key={i.title} {...i} delay={n * 60} />)}
                </div>
              )}

              <Panel title="Buscas por mês" subtitle="Palavras com mais procura no Google, no Brasil" delay={120}
                action={<Segmented value={view} onChange={setView} options={[{ value: "chart", label: "Gráfico" }, { value: "table", label: "Tabela" }]} />}>
                {view === "chart" && chartData.length > 0 ? (
                  <div style={{ height: Math.max(180, chartData.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} stroke={colors.grid} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(Number(v))} />
                        <YAxis type="category" dataKey="keyword" width={190} tick={{ fontSize: 12, fill: colors.axis }} tickLine={false} axisLine={false} />
                        <Tooltip {...tooltipStyle} cursor={{ fill: colors.track }} formatter={(v) => [`${fmtInt(Number(v ?? 0))} buscas/mês`, "Volume"]} />
                        <Bar dataKey="volume" fill={colors.main} radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={900} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="-mx-2 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-[13px]">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-[#77767b]">
                          <th className="px-2 py-2">Palavra</th>
                          <th className="px-2 text-right">Buscas/mês</th>
                          <th className="px-2">Últimos meses</th>
                          <th className="px-2">Concorrência</th>
                          <th className="px-2">Dificuldade</th>
                          <th className="px-2 text-right">Clique</th>
                          <th className="px-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const d = trendDelta(r);
                          return (
                            <tr key={r.keyword} className="group border-t border-[rgba(0,0,0,0.05)] transition-colors hover:bg-[#f9f9fb] dark:border-white/5 dark:hover:bg-white/[0.02]">
                              <td className="px-2 py-2.5">
                                <span className="font-medium text-[#111214] dark:text-white">{r.keyword}</span>
                                {r.isSeed && <span className="ml-1.5 rounded bg-[#005cba]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#005cba] dark:bg-[#3d8ef0]/15 dark:text-[#7fb4f5]">pesquisada</span>}
                              </td>
                              <td className="px-2 text-right font-semibold tabular-nums text-[#111214] dark:text-white" title={r.volume == null ? "Poucas buscas — o Google não tem dados" : undefined}>{r.volume == null ? "—" : fmtInt(r.volume)}</td>
                              <td className="px-2">
                                <div className="flex w-36 items-center gap-2" title={r.trend.map((t) => `${fmtMonth(t.month)}: ${fmtInt(t.volume)}`).join("\n")}>
                                  <div className="w-20">{r.trend.length > 1 ? <Sparkline values={r.trend.map((t) => t.volume)} color={colors.main} height={22} /> : <span className="text-[11px] text-[#77767b]">sem histórico</span>}</div>
                                  {d != null && Math.abs(d) >= 0.05 && <span className={`text-[11px] font-semibold ${d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(Math.round(d * 100))}%</span>}
                                </div>
                              </td>
                              <td className="px-2 text-[12.5px] text-[#46464a]" title="Quantos anunciantes disputam esta palavra no Google Ads">{competitionLabel(r.competition)}</td>
                              <td className="px-2"><DifficultyBar value={r.difficulty} /></td>
                              <td className="px-2 text-right tabular-nums text-[#46464a]">{r.cpc ? `US$ ${r.cpc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                              <td className="px-2">
                                <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                                  <button type="button" onClick={() => copy(r.keyword)} title="Copiar palavra"
                                    className="rounded-lg p-1.5 text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-white/5">
                                    {copied === r.keyword ? <span className="text-[11px] font-semibold text-emerald-600">copiado</span> : <MktIcon d={ICONS.copy} className="h-3.5 w-3.5" />}
                                  </button>
                                  <button type="button" onClick={() => navigate(`/marketing/anuncios?palavra=${encodeURIComponent(r.keyword)}`)} title="Ver anúncios com esta palavra"
                                    className="rounded-lg p-1.5 text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-white/5">
                                    <MktIcon d={ICONS.megaphone} className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {view === "chart" && (
                <Panel title="Todas as palavras" subtitle="Tendência, concorrência nos anúncios e dificuldade para aparecer no Google sem pagar" delay={180}
                  action={<button type="button" onClick={() => setView("table")} className="text-[12px] font-medium text-[#005cba] hover:underline dark:text-[#7fb4f5]">Ver em tabela</button>}>
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {rows.map((r, i) => {
                      const d = trendDelta(r);
                      return (
                        <div key={r.keyword} style={{ "--d": `${Math.min(i, 9) * 40}ms` } as React.CSSProperties}
                          className="mkt-rise group rounded-xl border border-[rgba(0,0,0,0.06)] p-3 transition-all hover:-translate-y-0.5 hover:border-[#005cba]/30 hover:shadow-[0_8px_20px_-8px_rgba(0,92,186,0.3)] dark:border-white/[0.07] dark:hover:border-[#3d8ef0]/40">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-[13px] font-semibold text-[#111214] dark:text-white" title={r.keyword}>{r.keyword}</p>
                            <button type="button" onClick={() => navigate(`/marketing/anuncios?palavra=${encodeURIComponent(r.keyword)}`)} title="Ver anúncios com esta palavra"
                              className="flex-shrink-0 rounded-md p-1 text-[#77767b] opacity-0 transition-opacity hover:bg-[#f3f3f5] group-hover:opacity-100 dark:hover:bg-white/5">
                              <MktIcon d={ICONS.megaphone} className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-1 flex items-end justify-between gap-2">
                            <div>
                              <p className="text-[20px] font-bold tabular-nums leading-tight text-[#111214] dark:text-white">{r.volume == null ? "—" : fmtCompact(r.volume)}</p>
                              <p className="text-[11px] text-[#77767b]">{r.volume == null ? "poucas buscas, sem dados no Google" : `buscas/mês · concorrência ${competitionLabel(r.competition).toLowerCase()}`}</p>
                            </div>
                            {d != null && Math.abs(d) >= 0.05 && <span className={`text-[11px] font-semibold ${d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(Math.round(d * 100))}%</span>}
                          </div>
                          {r.trend.length > 1 && <div className="mt-2" title={r.trend.map((t) => `${fmtMonth(t.month)}: ${fmtInt(t.volume)}`).join("\n")}><Sparkline values={r.trend.map((t) => t.volume)} color={colors.main} height={28} /></div>}
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}
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
                      <p className="text-[11px] text-[#77767b]">{fmtInt(h.itemCount)} palavras · {fmtWhen(h.createdAt)}{isAdmin && h.costMicro ? ` · ${fmtUsd(h.costMicro)}` : ""}</p>
                      <p className="text-[11px] text-[#77767b]">{h.userName}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="px-1 text-[11px] leading-relaxed text-[#77767b]">
            Buscas mensais no Google no Brasil (média recente). O custo por clique é uma estimativa em dólar do Google Ads.
          </p>
        </aside>
      </div>
    </MktPage>
  );
}
