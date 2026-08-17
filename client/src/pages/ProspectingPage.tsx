import { type FormEvent } from "react";
import { useProspecting } from "../context/ProspectingContext";
import { ApiError } from "../api/client";
import { CrmSubNav } from "../components/crm/CrmSubNav";

function ConfidenceBadge({ text }: { text: string }) {
  const lower = (text ?? "").toLowerCase();
  const isGood = lower.includes("consistente") || lower.includes("verificado");
  const isWarn =
    lower.includes("desatualizado") ||
    lower.includes("inconsistente") ||
    lower.includes("divergente") ||
    lower.includes("ressalva");
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isGood
          ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
          : isWarn
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          : "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]"
      }`}
    >
      {isGood ? "✓ " : isWarn ? "⚠ " : ""}
      {text}
    </span>
  );
}

function PorteBadge({ porte }: { porte: string }) {
  const lower = (porte ?? "").toLowerCase();
  const cls =
    lower === "grande"
      ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400"
      : lower === "média" || lower === "media"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
      : "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {porte}
    </span>
  );
}

const inputCls =
  "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60";

export function ProspectingPage() {
  const {
    segmento, setSegmento,
    regiao, setRegiao,
    quantidade, setQuantidade,
    observacoes, setObservacoes,
    loading, error,
    companies, raw, addedNames, lastSearch,
    runSearch, addContact, exportCsv, clearResults,
  } = useProspecting();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await runSearch();
  }

  async function handleAddContact(company: Parameters<typeof addContact>[0]) {
    try {
      await addContact(company);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível adicionar o contato");
    }
  }

  const hasResults = companies !== null;

  return (
    <div className="min-h-full overflow-y-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
        <p className="mt-1 text-[17px] text-[#46464a]">Prospecção de leads com IA</p>
      </div>

      <CrmSubNav />

      {/* Formulário */}
      <div className="glass-card smooth-shadow mb-6 rounded-2xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-[#030304]">Pesquisa de empresas com IA</p>
            <p className="mt-0.5 text-[13px] text-[#77767b]">
              Validação em Google Maps, Instagram, Facebook e mais. Comece com{" "}
              <strong className="text-[#46464a]">5 empresas</strong> (1–2 min).
            </p>
          </div>
          {hasResults && (
            <button
              onClick={clearResults}
              className="rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
            >
              Nova pesquisa
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
              Segmento <span className="text-brand">*</span>
            </label>
            <input
              required
              placeholder="Ex: gráficas, suplementação nutricional, escritórios de advocacia"
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              disabled={loading}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                Região <span className="text-brand">*</span>
              </label>
              <input
                required
                placeholder="Ex: Apucarana/PR, Grande Maringá"
                value={regiao}
                onChange={(e) => setRegiao(e.target.value)}
                disabled={loading}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                Quantidade (máx. 15)
              </label>
              <input
                required
                type="number"
                min={1}
                max={15}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                disabled={loading}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
              Observações <span className="font-normal normal-case text-[#77767b]">(opcional)</span>
            </label>
            <textarea
              placeholder="Ex: apenas empresas com delivery, foco em pequenos negócios, excluir franquias..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              disabled={loading}
              rows={2}
              className={inputCls}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !segmento.trim() || !regiao.trim()}
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {loading ? "Pesquisando..." : "Pesquisar empresas"}
          </button>
        </form>
      </div>

      {/* Loading sem resultados */}
      {loading && companies !== null && companies.length === 0 && (
        <div className="glass-card smooth-shadow rounded-2xl py-12 text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-[rgba(199,198,202,0.3)] border-t-brand" />
          <p className="text-[15px] font-semibold text-[#030304]">Pesquisando no Google...</p>
          {lastSearch && (
            <p className="mt-1 text-[13px] text-[#77767b]">
              {lastSearch.quantidade} empresa(s) · {lastSearch.segmento} · {lastSearch.regiao}
            </p>
          )}
          <div className="mt-4 space-y-1 text-[13px] text-[#77767b]">
            <p>O Gemini está fazendo buscas reais no Google para cada empresa.</p>
            <p className="font-medium text-[#46464a]">
              Tempo estimado: {lastSearch ? Math.max(30, lastSearch.quantidade * 10) : 60}–
              {lastSearch ? Math.max(60, lastSearch.quantidade * 18) : 120} segundos
            </p>
          </div>
          <p className="mx-auto mt-4 inline-block rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-400">
            Dica: use <strong>5 empresas ou menos</strong> para resultados em ~30 segundos
          </p>
        </div>
      )}

      {/* Sem resultados */}
      {!loading && hasResults && companies!.length === 0 && (
        <div className="glass-card smooth-shadow rounded-2xl py-12 text-center">
          <p className="text-[15px] font-medium text-[#1a1c1d]">Nenhuma empresa encontrada</p>
          <p className="mt-1 text-[13px] text-[#77767b]">
            Tente um segmento ou região diferente.
          </p>
        </div>
      )}

      {/* Resultados */}
      {hasResults && companies!.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#030304]">
                {companies!.length} empresa(s) encontrada(s)
                {loading && (
                  <span className="ml-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(199,198,202,0.3)] border-t-brand align-middle" />
                )}
              </p>
              {lastSearch && (
                <p className="text-[13px] text-[#77767b]">
                  {lastSearch.segmento} · {lastSearch.regiao}
                  {loading && " · buscando mais..."}
                </p>
              )}
            </div>
            {!loading && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Exportar CSV
              </button>
            )}
          </div>

          {companies!.map((c, idx) => {
            const added = addedNames.has(c.nome);
            const isNew = loading && idx === companies!.length - 1;
            return (
              <div
                key={`${c.nome}-${idx}`}
                className={`glass-card smooth-shadow rounded-2xl p-5 transition-all duration-300 ${isNew ? "ring-2 ring-brand/30" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#030304]">{c.nome}</p>
                      {c.porte && <PorteBadge porte={c.porte} />}
                    </div>
                    {c.cidade && <p className="mt-0.5 text-[13px] text-[#77767b]">{c.cidade}</p>}
                  </div>
                  <button
                    disabled={added}
                    onClick={() => handleAddContact(c)}
                    className={`flex-shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 ${
                      added
                        ? "border border-[rgba(199,198,202,0.3)] text-[#77767b]"
                        : "bg-brand text-white hover:bg-brand/90"
                    }`}
                  >
                    {added ? "Adicionado" : "+ Contato"}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[rgba(0,0,0,0.06)] pt-4 dark:border-white/8">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Telefone</p>
                    {c.telefone ? (
                      <a href={`tel:${c.telefone.replace(/\D/g, "")}`} className="font-mono text-sm font-medium text-brand hover:underline">
                        {c.telefone}
                      </a>
                    ) : (
                      <span className="text-[13px] text-[#77767b]">—</span>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Rede social</p>
                    {c.redeSocial ? (
                      c.redeSocial.startsWith("http") ? (
                        <a href={c.redeSocial} target="_blank" rel="noreferrer" className="truncate text-[13px] text-brand hover:underline">
                          {c.redeSocial}
                        </a>
                      ) : (
                        <p className="text-[13px] text-[#46464a]">{c.redeSocial}</p>
                      )
                    ) : (
                      <span className="text-[13px] text-[#77767b]">—</span>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Fontes</p>
                    <p className="text-[13px] text-[#46464a]">{c.fontes || "—"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Confiabilidade</p>
                    {c.confiabilidade ? <ConfidenceBadge text={c.confiabilidade} /> : <span className="text-[13px] text-[#77767b]">—</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback texto bruto */}
      {!loading && raw && (!companies || companies.length === 0) && (
        <div className="glass-card smooth-shadow mt-4 rounded-2xl p-5">
          <pre className="whitespace-pre-wrap font-mono text-xs text-[#46464a]">{raw}</pre>
        </div>
      )}
    </div>
  );
}
