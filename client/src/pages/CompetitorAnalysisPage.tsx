import { useEffect, useRef, useState } from "react";
import { competitorApi, type CompetitorProfile, type CompetitorReport, type CompetitorInsight } from "../api/competitor";

// ─── Add competitor modal ─────────────────────────────────────────────────────

function AddCompetitorModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [handle, setHandle] = useState("@");
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("grafinorte");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const h = handle.replace("@", "").trim();
    if (!h) { setError("Informe o @ da conta"); return; }
    setLoading(true);
    try {
      await competitorApi.addProfile(h, name || h, niche);
      onAdded(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Adicionar concorrente</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Instagram @handle</p>
            <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@concorrente"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Nome da empresa</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome para identificar"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Competindo com</p>
            <select value={niche} onChange={e => setNiche(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#005cba]">
              <option value="grafinorte">Grafinorte (gráfica)</option>
              <option value="pluspackbr">Pluspack (embalagens)</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg py-2 text-center">{error}</p>}
          <button type="button" onClick={submit} disabled={loading}
            className="w-full py-2.5 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] disabled:opacity-50 transition-colors">
            {loading ? "Adicionando..." : "Adicionar e analisar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Insight display ──────────────────────────────────────────────────────────

function InsightCard({ insight, generatedAt }: { insight: CompetitorInsight; generatedAt: string }) {
  const genDate = new Date(generatedAt);
  const isToday = new Date().toDateString() === genDate.toDateString();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">{insight.competitor}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Analisado {isToday ? "hoje" : genDate.toLocaleDateString("pt-BR")} às {genDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-semibold">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {isToday ? "Análise de hoje" : "Recente"}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-br from-[#005cba]/5 to-purple-500/5 dark:from-[#005cba]/10 dark:to-purple-500/10 rounded-xl p-4 border border-[#005cba]/10">
        <p className="text-xs font-semibold text-[#005cba] uppercase tracking-wider mb-2">Resumo estratégico</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{insight.summary}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-[#111] rounded-xl p-3 border border-gray-100 dark:border-white/5">
          <p className="text-xs text-gray-400 font-medium">Frequência de posts</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{insight.postFrequency}</p>
        </div>
        <div className="bg-white dark:bg-[#111] rounded-xl p-3 border border-gray-100 dark:border-white/5">
          <p className="text-xs text-gray-400 font-medium">Engajamento estimado</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{insight.estimatedEngagement}</p>
        </div>
      </div>

      {/* Content themes */}
      <div className="bg-white dark:bg-[#111] rounded-xl p-4 border border-gray-100 dark:border-white/5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Temas de conteúdo</p>
        <div className="flex flex-wrap gap-2">
          {insight.contentThemes.map((t, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-blue-50 dark:bg-[#005cba]/15 text-[#005cba] dark:text-blue-300 text-xs font-medium">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Top performing */}
      <div className="bg-white dark:bg-[#111] rounded-xl p-4 border border-gray-100 dark:border-white/5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">O que mais engaja neles</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">{insight.topPerformingContent}</p>
      </div>

      {/* Recent highlights */}
      {insight.recentHighlights?.length > 0 && (
        <div className="bg-white dark:bg-[#111] rounded-xl p-4 border border-gray-100 dark:border-white/5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Destaques recentes</p>
          <ul className="space-y-2">
            {insight.recentHighlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">★</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {insight.recommendations?.length > 0 && (
        <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-4 border border-green-200 dark:border-green-500/20">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">
            ✅ Recomendações para nossas contas
          </p>
          <ul className="space-y-2">
            {insight.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-green-800 dark:text-green-300">
                <span className="font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {insight.warnings?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-4 border border-amber-200 dark:border-amber-500/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-3">
            ⚠️ Pontos de atenção
          </p>
          <ul className="space-y-2">
            {insight.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <span className="flex-shrink-0 mt-0.5">•</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CompetitorAnalysisPage() {
  const [profiles, setProfiles] = useState<CompetitorProfile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<CompetitorReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    competitorApi.getProfiles().then(data => {
      setProfiles(data);
      if (data.length > 0 && !selected) setSelected(data[0].id);
    });
  }, [refreshKey]);

  useEffect(() => {
    if (!selected) { setReport(null); return; }
    setLoadingReport(true);
    competitorApi.getReport(selected)
      .then(r => { setReport(r); })
      .catch(() => setReport(null))
      .finally(() => setLoadingReport(false));
  }, [selected, refreshKey]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleAnalyze(id: string) {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      await competitorApi.triggerAnalysis(id);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Erro ao iniciar análise");
      setAnalyzing(false);
      return;
    }

    // Poll every 10s up to 90s waiting for the report to appear
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await competitorApi.getReport(id);
        if (r) {
          clearInterval(pollRef.current!);
          setReport(r);
          setAnalyzing(false);
          setRefreshKey(k => k + 1);
        }
      } catch {
        // report not yet available
      }
      if (attempts >= 9) {
        clearInterval(pollRef.current!);
        setAnalyzing(false);
        setAnalyzeError("A análise demorou mais que o esperado. Aguarde e atualize a página.");
      }
    }, 10_000);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover @${name} da lista de concorrentes?`)) return;
    await competitorApi.deleteProfile(id);
    if (selected === id) setSelected(null);
    setRefreshKey(k => k + 1);
  }

  const selectedProfile = profiles.find(p => p.id === selected);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left sidebar — competitor list */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#111] flex flex-col overflow-hidden">
        <div className="px-4 pt-5 pb-3 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Concorrentes</p>
            <button type="button" onClick={() => setShowAdd(true)}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#005cba] text-white hover:bg-[#0047a0] transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-gray-400">IA analisa diariamente</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {profiles.length === 0 ? (
            <div className="text-center py-8 px-3">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-xs text-gray-400">Adicione concorrentes para monitorar</p>
            </div>
          ) : (
            profiles.map(p => {
              const lastReport = p.reports[0];
              const hasToday = lastReport && new Date(lastReport.generatedAt).toDateString() === new Date().toDateString();
              return (
                <button key={p.id} type="button" onClick={() => setSelected(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${selected === p.id ? "bg-[#005cba] text-white" : "hover:bg-gray-100 dark:hover:bg-white/5"}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${selected === p.id ? "text-white" : "text-gray-900 dark:text-white"}`}>
                        @{p.handle}
                      </p>
                      <p className={`text-xs truncate ${selected === p.id ? "text-blue-200" : "text-gray-400"}`}>
                        {p.niche === "grafinorte" ? "vs Grafinorte" : "vs Pluspack"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className={`w-2 h-2 rounded-full ${hasToday ? "bg-green-400" : "bg-gray-300"}`} title={hasToday ? "Análise de hoje" : "Sem análise hoje"} />
                      <button type="button"
                        onClick={e => { e.stopPropagation(); handleDelete(p.id, p.handle); }}
                        className={`opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-all ${selected === p.id ? "text-blue-200 hover:text-white" : "text-gray-400 hover:text-red-500"}`}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right panel — analysis */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Análise de Concorrentes com IA</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
              Adicione perfis de concorrentes. A IA pesquisa o Instagram deles diariamente e gera insights, estratégias e recomendações para melhorar seu engajamento.
            </p>
            <button type="button" onClick={() => setShowAdd(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Adicionar primeiro concorrente
            </button>
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  @{selectedProfile?.handle}
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">
                  {selectedProfile?.niche === "grafinorte" ? "Concorrente da Grafinorte" : "Concorrente da Pluspack"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRefreshKey(k => k + 1)}
                  className="p-2 rounded-xl border border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>
                <button type="button" onClick={() => handleAnalyze(selected)} disabled={analyzing}
                  className="flex items-center gap-2 px-4 py-2 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] disabled:opacity-60 transition-colors">
                  {analyzing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" style={{pointerEvents:"none"}}>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Analisando (~30s)...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                      </svg>
                      Analisar agora
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Analysis */}
            {analyzing && (
              <div className="bg-[#005cba]/5 dark:bg-[#005cba]/10 border border-[#005cba]/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                <svg className="h-5 w-5 animate-spin text-[#005cba] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p className="text-sm text-[#005cba] font-medium">
                  IA pesquisando o Instagram de @{selectedProfile?.handle}... aguarde ~30 segundos.
                </p>
              </div>
            )}

            {analyzeError && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                <svg className="h-5 w-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{pointerEvents:"none"}}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-sm text-red-700 dark:text-red-400">{analyzeError}</p>
              </div>
            )}

            {loadingReport ? (
              <div className="flex items-center justify-center py-20">
                <svg className="h-7 w-7 animate-spin text-[#005cba]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </div>
            ) : report ? (
              <InsightCard insight={report.analysis} generatedAt={report.generatedAt} />
            ) : (
              <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-white/5">
                <p className="text-3xl mb-3">📊</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nenhuma análise ainda</p>
                <p className="text-xs text-gray-400 mb-4">Clique em "Analisar agora" para gerar o primeiro relatório com IA</p>
                <button type="button" onClick={() => handleAnalyze(selected)}
                  className="px-4 py-2 bg-[#005cba] text-white rounded-xl text-sm font-semibold hover:bg-[#0047a0] transition-colors">
                  Gerar análise
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {showAdd && (
        <AddCompetitorModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setRefreshKey(k => k + 1); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
