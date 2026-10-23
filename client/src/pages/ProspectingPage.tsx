import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useProspecting } from "../context/ProspectingContext";
import { useAuth } from "../context/AuthContext";
import { crmApi } from "../api/crm";
import { ApiError } from "../api/client";
import { CrmSubNav } from "../components/crm/CrmSubNav";
import type { ProspectLead, ProspectSearchSummary } from "../types";

const inputCls =
  "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60";
const labelCls = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";
const ghostBtn =
  "rounded-xl border border-[rgba(199,198,202,0.3)] px-3 py-1.5 text-[12px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]";

const SUGGESTIONS: Record<"GRAFINORTE" | "PLUSPACK", string[]> = {
  GRAFINORTE: ["Escolas particulares", "Editoras", "Igrejas", "Agências de publicidade", "Supermercados", "Clínicas"],
  PLUSPACK: ["Sorveterias", "Açaiterias", "Docerias", "Cafeterias", "Restaurantes delivery", "Hamburguerias"],
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtCost(micro?: number) {
  return micro == null ? "—" : `US$ ${(micro / 1_000_000).toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/** Link do WhatsApp (wa.me) — só faz sentido para números do Brasil com DDD */
function waLink(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 ? `https://wa.me/${d}` : null;
}

function isMobile(phone: string) {
  const d = phone.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 && d[2] === "9";
}

function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[#46464a]">
      <span className="text-amber-500">★</span>
      <strong>{rating.toFixed(1)}</strong>
      {count != null && <span className="text-[#77767b]">({count.toLocaleString("pt-BR")})</span>}
    </span>
  );
}

function Badge({ tone, children }: { tone: "green" | "blue" | "amber" | "gray"; children: React.ReactNode }) {
  const cls = {
    green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    gray: "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]",
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function LeadCard({ lead }: { lead: ProspectLead }) {
  const { addToCrm, setStatus } = useProspecting();
  const [busy, setBusy] = useState(false);
  const added = lead.status === "ADICIONADO";
  const discarded = lead.status === "DESCARTADO";
  const wa = lead.phone ? waLink(lead.phone) : null;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível concluir a ação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`glass-card smooth-shadow flex flex-col rounded-2xl p-5 transition-opacity ${discarded ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-[#030304]">{lead.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {lead.category && <span className="text-[12px] text-[#77767b]">{lead.category}</span>}
            <Stars rating={lead.rating} count={lead.reviewCount} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {added && <Badge tone="green">✓ No CRM{lead.addedByName ? ` · ${lead.addedByName}` : ""}</Badge>}
        {!added && lead.inCrm && <Badge tone="blue">Já é contato do CRM</Badge>}
        {!added && lead.seenBefore && (
          <Badge tone="amber">
            Já prospectado em {new Date(lead.seenBefore.at).toLocaleDateString("pt-BR")} por {lead.seenBefore.by}
            {lead.seenBefore.status === "ADICIONADO" ? " (foi pro CRM)" : ""}
          </Badge>
        )}
        {discarded && <Badge tone="gray">Descartado</Badge>}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-[rgba(0,0,0,0.06)] pt-3 text-[13px] dark:border-white/8">
        <p className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Telefone</span>
          {lead.phone ? (
            <a href={`tel:${lead.phone.replace(/\D/g, "")}`} className="font-mono font-medium text-brand hover:underline">{lead.phone}</a>
          ) : (
            <span className="text-[#77767b]">—</span>
          )}
        </p>
        <p className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Site</span>
          {lead.website ? (
            <a href={lead.website} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
              {lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          ) : (
            <span className="text-[#77767b]">—</span>
          )}
        </p>
        {lead.address && (
          <p className="flex items-start gap-2">
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Endereço</span>
            <span className="text-[#46464a]">{lead.address.replace(/, Brazil$/, "")}</span>
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {added ? (
          lead.dealId && (
            <Link to={`/comercial/deals/${lead.dealId}`} className="rounded-xl bg-green-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-green-700">
              Abrir negócio →
            </Link>
          )
        ) : (
          <button
            disabled={busy || discarded}
            onClick={() => {
              if (lead.inCrm && !confirm(`"${lead.name}" já tem um contato com este telefone no CRM. Criar outro negócio mesmo assim?`)) return;
              void act(() => addToCrm(lead));
            }}
            className={`rounded-xl px-3.5 py-1.5 text-[12px] font-semibold transition-all active:scale-95 disabled:opacity-50 ${
              lead.inCrm ? ghostBtn : "bg-brand text-white hover:bg-brand/90"
            }`}
          >
            {busy ? "Adicionando..." : lead.inCrm ? "Adicionar mesmo assim" : "+ Adicionar ao CRM"}
          </button>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            title={isMobile(lead.phone!) ? "Abrir conversa no WhatsApp" : "Telefone fixo — pode não ter WhatsApp"}
            className={ghostBtn}
          >
            WhatsApp{isMobile(lead.phone!) ? "" : " (fixo)"}
          </a>
        )}
        {lead.mapsUrl && (
          <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className={ghostBtn}>Maps</a>
        )}
        {!added && (
          <button disabled={busy} onClick={() => act(() => setStatus(lead, discarded ? "NOVO" : "DESCARTADO"))} className={`${ghostBtn} ml-auto`}>
            {discarded ? "Restaurar" : "Descartar"}
          </button>
        )}
      </div>
    </div>
  );
}

type Filter = "todos" | "novos" | "crm" | "descartados";

function Results() {
  const { search, exportCsv, clearSearch } = useProspecting();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("todos");
  useEffect(() => setFilter("todos"), [search?.id]);
  if (!search) return null;

  const counts = {
    todos: search.leads.length,
    novos: search.leads.filter((l) => l.status === "NOVO" && !l.inCrm).length,
    crm: search.leads.filter((l) => l.status === "ADICIONADO" || l.inCrm).length,
    descartados: search.leads.filter((l) => l.status === "DESCARTADO").length,
  };
  const leads = search.leads.filter((l) =>
    filter === "novos" ? l.status === "NOVO" && !l.inCrm
    : filter === "crm" ? l.status === "ADICIONADO" || l.inCrm
    : filter === "descartados" ? l.status === "DESCARTADO"
    : true
  );
  const labels: Record<Filter, string> = { todos: "Todas", novos: "Novas", crm: "No CRM", descartados: "Descartadas" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold text-[#030304]">
            {search.segmento} · {search.regiao}
          </p>
          <p className="text-[13px] text-[#77767b]">
            {search.leads.length} empresa(s) · {search.company === "PLUSPACK" ? "Pluspack" : "Grafinorte"} · por {search.user.name} em {fmtDate(search.createdAt)}
            {user?.role === "ADMIN" && search.costMicro != null && ` · custo ${fmtCost(search.costMicro)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className={ghostBtn}>Exportar planilha</button>
          <button onClick={clearSearch} className={ghostBtn}>Fechar</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors ${
              filter === f ? "bg-brand text-white" : "bg-[#f3f3f5] text-[#46464a] hover:bg-[#e9e9ec] dark:bg-[#222426] dark:text-[#a0a0a4]"
            }`}
          >
            {labels[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="glass-card smooth-shadow rounded-2xl py-10 text-center text-[13px] text-[#77767b]">
          {search.leads.length === 0 ? "Nenhuma empresa encontrada. Tente outro segmento ou bairro/cidade." : "Nada neste filtro."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
        </div>
      )}
    </div>
  );
}

function History({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const { search } = useProspecting();
  const isAdmin = user?.role === "ADMIN";
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<ProspectSearchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    crmApi.listProspectSearches(mine).then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [mine, search?.id]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return {
      buscas: rows.length,
      empresas: rows.reduce((s, r) => s + r.resultCount, 0),
      noCrm: rows.reduce((s, r) => s + r.addedCount, 0),
      custo: rows.reduce((s, r) => s + (r.costMicro ?? 0), 0),
    };
  }, [rows]);

  return (
    <div className="glass-card smooth-shadow rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-[#030304]">Histórico de prospecção</p>
          {totals && (
            <p className="mt-0.5 text-[13px] text-[#77767b]">
              {totals.buscas} busca(s) · {totals.empresas} empresas encontradas · {totals.noCrm} levadas ao CRM
              {isAdmin && ` · custo total ${fmtCost(totals.custo)}`}
            </p>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#46464a]">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-brand" />
          Só as minhas
        </label>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {!rows && !error && <p className="py-6 text-center text-[13px] text-[#77767b]">Carregando...</p>}
      {rows && rows.length === 0 && <p className="py-6 text-center text-[13px] text-[#77767b]">Nenhuma busca feita ainda.</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(0,0,0,0.06)] text-[11px] uppercase tracking-wider text-[#77767b] dark:border-white/8">
                <th className="py-2 pr-3 font-semibold">Data</th>
                <th className="py-2 pr-3 font-semibold">Busca</th>
                <th className="py-2 pr-3 font-semibold">Empresa</th>
                <th className="py-2 pr-3 font-semibold">Quem</th>
                <th className="py-2 pr-3 text-right font-semibold">Encontradas</th>
                <th className="py-2 pr-3 text-right font-semibold">No CRM</th>
                {isAdmin && <th className="py-2 pr-3 text-right font-semibold">Custo</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[rgba(0,0,0,0.04)] last:border-0 dark:border-white/5">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-[#77767b]">{fmtDate(r.createdAt)}</td>
                  <td className="py-2.5 pr-3 font-medium text-[#1a1c1d]">{r.segmento} · {r.regiao}</td>
                  <td className="py-2.5 pr-3 text-[#46464a]">{r.company === "PLUSPACK" ? "Pluspack" : "Grafinorte"}</td>
                  <td className="py-2.5 pr-3 text-[#46464a]">{r.user.name}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.resultCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {r.addedCount > 0 ? <span className="font-semibold text-green-600">{r.addedCount}</span> : "0"}
                  </td>
                  {isAdmin && <td className="py-2.5 pr-3 text-right tabular-nums text-[#77767b]">{fmtCost(r.costMicro)}</td>}
                  <td className="py-2.5 text-right">
                    <button onClick={() => onOpen(r.id)} className={ghostBtn}>Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProspectingPage() {
  const {
    segmento, setSegmento,
    regiao, setRegiao,
    company, setCompany,
    loading, error, search,
    runSearch, openSearch,
  } = useProspecting();
  const [tab, setTab] = useState<"buscar" | "historico">("buscar");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await runSearch();
  }

  async function handleOpen(id: string) {
    setTab("buscar");
    await openSearch(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-full overflow-y-auto p-8">
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
        <p className="mt-1 text-[17px] text-[#46464a]">Prospecção de empresas no Google Maps</p>
      </div>

      <CrmSubNav />

      <div className="mb-5 flex gap-2">
        {([["buscar", "Nova busca"], ["historico", "Histórico"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === k ? "bg-brand text-white" : "text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "historico" ? (
        <History onOpen={handleOpen} />
      ) : (
        <>
          <div className="glass-card smooth-shadow mb-6 rounded-2xl p-6">
            <p className="text-[15px] font-semibold text-[#030304]">Buscar empresas reais no Google Maps</p>
            <p className="mb-5 mt-0.5 text-[13px] text-[#77767b]">
              Traz até 20 empresas por busca com telefone, site, endereço e nota no Google. Para achar mais, varie o bairro ou a cidade.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Para qual empresa</label>
                <div className="flex gap-2">
                  {(["GRAFINORTE", "PLUSPACK"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCompany(c)}
                      className={`rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ${
                        company === c
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-[rgba(199,198,202,0.3)] text-[#46464a] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
                      }`}
                    >
                      {c === "GRAFINORTE" ? "Grafinorte" : "Pluspack"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Segmento <span className="text-red-500">*</span></label>
                  <input
                    required
                    placeholder="Ex: sorveterias, escolas particulares, editoras"
                    value={segmento}
                    onChange={(e) => setSegmento(e.target.value)}
                    disabled={loading}
                    className={inputCls}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SUGGESTIONS[company].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSegmento(s)}
                        className="rounded-full bg-[#f3f3f5] px-2.5 py-0.5 text-[11px] text-[#46464a] hover:bg-[#e9e9ec] dark:bg-[#222426] dark:text-[#a0a0a4]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Cidade / região <span className="text-red-500">*</span></label>
                  <input
                    required
                    placeholder="Ex: Manaus AM, Adrianópolis Manaus, Belém PA"
                    value={regiao}
                    onChange={(e) => setRegiao(e.target.value)}
                    disabled={loading}
                    className={inputCls}
                  />
                </div>
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
                {loading ? "Buscando no Google Maps..." : "Buscar empresas"}
              </button>
            </form>
          </div>

          {search && <Results />}
        </>
      )}
    </div>
  );
}
