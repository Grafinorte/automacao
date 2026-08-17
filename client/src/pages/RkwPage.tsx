import { useEffect, useState } from "react";
import { rkwApi, type RkwData, type RkwMachineRate, type RkwFixedCost, type RkwParameter } from "../api/rkw";

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, prefix = "R$ ") =>
  v == null ? "—" : `${prefix}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ESTAVEL:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    REVISAR:      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    INCONSISTENTE:"bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  const labels: Record<string, string> = { ESTAVEL: "Estável", REVISAR: "Revisar", INCONSISTENTE: "Inconsistente" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    CRITICO:     "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    ACELERANDO:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    CRESCENTE:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    EFICIENTE:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    INSTAVEL:    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  };
  const labels: Record<string, string> = {
    CRITICO: "Crítico", ACELERANDO: "Acelerando", CRESCENTE: "Crescente", EFICIENTE: "Eficiente", INSTAVEL: "Instável",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[priority] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[priority] ?? priority}
    </span>
  );
}

function TrendArrow({ trend }: { trend: string }) {
  return trend === "MELHORANDO"
    ? <span className="text-emerald-500 font-bold">↓ Melhorando</span>
    : <span className="text-red-500 font-bold">↑ Piorando</span>;
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────────

function TabDashboard({ data }: { data: RkwData }) {
  const p = (key: string) => data.parameters.find((x) => x.key === key);

  const cf   = p("custo_fixo_total");
  const pe   = p("ponto_equilibrio");
  const mc   = p("margem_contribuicao");
  const rateio = p("rateio_fixo_por_os");
  const ticket = p("ticket_medio_alvo");
  const mcMeta = p("margem_meta");
  const conv = p("taxa_conversao_meta");
  const sal  = p("salarios_encargos");
  const dep  = p("depreciacao_total");
  const adm  = p("despesas_fixas_adm");

  const kpis = [
    { label: "Custo Fixo Total Mensal", value: fmt(cf?.value), sub: "Base: Jun/2026", color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
    { label: "Ponto de Equilíbrio", value: fmt(pe?.value), sub: "Receita mínima p/ cobrir custos", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
    { label: "Margem de Contribuição Real", value: fmtPct(mc?.value ?? 0), sub: `Meta: ${fmtPct(mcMeta?.value ?? 0)}`, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
    { label: "Rateio Fixo por OS", value: fmt(rateio?.value), sub: "Contribuição mínima por OS", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
    { label: "Ticket Médio Alvo", value: fmt(ticket?.value), sub: "Meta estratégica", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
    { label: "Taxa de Conversão Meta", value: fmtPct(conv?.value ?? 0), sub: "De orçamentos emitidos", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800" },
  ];

  const machinesCrit = data.machineRates.filter((m) => m.status !== "ESTAVEL").length;
  const devCrit = data.deviations.filter((d) => d.priority === "CRITICO").length;

  return (
    <div className="space-y-8">
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl border p-5 ${k.bg}`}>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant dark:text-[#a0a0a4] mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-1 text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Composição de custos */}
      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22] p-6">
        <h3 className="mb-4 text-[14px] font-semibold text-on-surface dark:text-white">Composição do Custo Fixo</h3>
        <div className="space-y-3">
          {[
            { label: "Salários + Encargos", value: sal?.value ?? 0, color: "bg-red-400" },
            { label: "Despesas Fixas Adm.", value: adm?.value ?? 0, color: "bg-amber-400" },
            { label: "Depreciação de Equipamentos", value: dep?.value ?? 0, color: "bg-blue-400" },
          ].map((item) => {
            const total = cf?.value ?? 1;
            const pct = (item.value / total) * 100;
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] text-on-surface dark:text-white">{item.label}</span>
                  <span className="text-[13px] font-semibold text-on-surface dark:text-white">{fmt(item.value)} <span className="text-on-surface-variant dark:text-[#a0a0a4] font-normal">({pct.toFixed(1)}%)</span></span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-container dark:bg-[#2a2c30] overflow-hidden">
                  <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alertas */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`rounded-2xl border p-5 ${machinesCrit > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"}`}>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant dark:text-[#a0a0a4]">Máquinas p/ Revisar</p>
          <p className={`text-3xl font-bold mt-1 ${machinesCrit > 0 ? "text-amber-600" : "text-emerald-600"}`}>{machinesCrit}</p>
          <p className="text-[12px] text-on-surface-variant dark:text-[#a0a0a4] mt-1">de {data.machineRates.length} setores cadastrados</p>
        </div>
        <div className={`rounded-2xl border p-5 ${devCrit > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"}`}>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant dark:text-[#a0a0a4]">Desvios Críticos</p>
          <p className={`text-3xl font-bold mt-1 ${devCrit > 0 ? "text-red-600" : "text-emerald-600"}`}>{devCrit}</p>
          <p className="text-[12px] text-on-surface-variant dark:text-[#a0a0a4] mt-1">setores com custo real acima do previsto</p>
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant dark:text-[#a0a0a4] italic">
        Competência base: Abr-Jun/2026 — Método RKW (Custeio Pleno) — uso interno confidencial
      </p>
    </div>
  );
}

// ─── Tab: Taxa Hora-Máquina ───────────────────────────────────────────────────

function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = parseFloat(draft.replace(",", "."));
    if (isNaN(n)) { setEditing(false); setDraft(String(value)); return; }
    setSaving(true);
    try { await onSave(n); } finally { setSaving(false); setEditing(false); }
  };

  if (!editing) {
    return (
      <button onClick={() => { setEditing(true); setDraft(String(value)); }} className="text-right font-mono text-[13px] hover:text-blue-600 hover:underline cursor-pointer transition-colors">
        {fmt(value)}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        className="w-24 rounded border border-blue-400 px-1.5 py-0.5 text-[12px] font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-[#2a2c30] dark:text-white"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
      />
      <button onClick={handleSave} disabled={saving} className="rounded bg-blue-500 px-1.5 py-0.5 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50">
        {saving ? "…" : "OK"}
      </button>
    </div>
  );
}

const SECTOR_LABELS: Record<string, string> = {
  PRE_IMPRESSAO: "Pré-impressão",
  IMPRESSAO:     "Impressão",
  ACABAMENTO:    "Acabamento",
};

function TabMachineRates({ data, onUpdated }: { data: RkwData; onUpdated: () => void }) {
  const byGroup: Record<string, RkwMachineRate[]> = {};
  for (const m of data.machineRates) {
    if (!byGroup[m.sector]) byGroup[m.sector] = [];
    byGroup[m.sector].push(m);
  }

  const handleUpdate = async (id: string, field: "rateConsolidated" | "bufferPct", value: number) => {
    await rkwApi.updateMachineRate(id, { [field]: value });
    onUpdated();
  };

  const sectorOrder = ["PRE_IMPRESSAO", "IMPRESSAO", "ACABAMENTO"];

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-on-surface-variant dark:text-[#a0a0a4]">
        Taxas calculadas a partir do pós-cálculo real (Abr-Jun/2026). Clique em qualquer valor para editar. O sistema recalcula automaticamente a taxa com buffer.
      </p>
      {sectorOrder.map((sector) => {
        const machines = byGroup[sector];
        if (!machines) return null;
        return (
          <div key={sector} className="rounded-2xl border border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22] overflow-hidden">
            <div className="bg-surface-container dark:bg-[#23252a] px-6 py-3 border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
              <h3 className="text-[13px] font-semibold text-on-surface dark:text-white uppercase tracking-wider">{SECTOR_LABELS[sector] ?? sector}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[rgba(199,198,202,0.2)] dark:border-white/5 text-on-surface-variant dark:text-[#a0a0a4]">
                    <th className="px-4 py-2.5 text-left font-medium">Cód.</th>
                    <th className="px-4 py-2.5 text-left font-medium">Máquina / Setor</th>
                    <th className="px-4 py-2.5 text-right font-medium">Abr/26</th>
                    <th className="px-4 py-2.5 text-right font-medium">Mai/26</th>
                    <th className="px-4 py-2.5 text-right font-medium">Jun/26</th>
                    <th className="px-4 py-2.5 text-right font-medium">Taxa Consolidada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Buffer %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Taxa c/ Buffer</th>
                    <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m, i) => (
                    <tr key={m.id} className={`border-b border-[rgba(199,198,202,0.15)] dark:border-white/5 ${i % 2 === 0 ? "" : "bg-surface-container/40 dark:bg-[#23252a]/40"} hover:bg-blue-50/40 dark:hover:bg-blue-950/10 transition-colors`}>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{m.code}</td>
                      <td className="px-4 py-2.5 font-medium text-on-surface dark:text-white">{m.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{m.rateApril != null ? fmt(m.rateApril) : <span className="text-[#ccc]">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{m.rateMay != null ? fmt(m.rateMay) : <span className="text-[#ccc]">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{m.rateJune != null ? fmt(m.rateJune) : <span className="text-[#ccc]">—</span>}</td>
                      <td className="px-4 py-2.5 text-right">
                        <EditableCell value={m.rateConsolidated} onSave={(v) => handleUpdate(m.id, "rateConsolidated", v)} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <EditableCell value={m.bufferPct} onSave={(v) => handleUpdate(m.id, "bufferPct", v)} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-600 dark:text-blue-400 font-mono text-[13px]">{fmt(m.rateWithBuffer)}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-on-surface-variant dark:text-[#a0a0a4] italic">
        Unidade: R$/hora. Buffer recomendado para setores críticos: +15% a +25%. Atualizar mensalmente após fechamento do pós-cálculo.
      </p>
    </div>
  );
}

// ─── Tab: Custos Fixos ────────────────────────────────────────────────────────

const COST_CAT_LABELS: Record<string, { label: string; color: string }> = {
  estrutura:   { label: "Estrutura",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  gestao:      { label: "Gestão",      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  operacional: { label: "Operacional", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  comercial:   { label: "Comercial",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  logistica:   { label: "Logística",   color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  pessoal:     { label: "Pessoal",     color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

function TabFixedCosts({ data, onUpdated }: { data: RkwData; onUpdated: () => void }) {
  const total = data.fixedCosts.reduce((s, c) => s + c.amount, 0);

  const handleUpdate = async (id: string, amount: number) => {
    await rkwApi.updateFixedCost(id, amount);
    onUpdated();
  };

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-on-surface-variant dark:text-[#a0a0a4]">
        Despesas fixas detalhadas — base de rateio por OS. Clique nos valores para atualizar. O rateio por OS é recalculado automaticamente.
      </p>

      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(199,198,202,0.2)] dark:border-white/5 bg-surface-container dark:bg-[#23252a] text-on-surface-variant dark:text-[#a0a0a4]">
                <th className="px-5 py-3 text-left font-medium">Despesa</th>
                <th className="px-5 py-3 text-center font-medium">Categoria</th>
                <th className="px-5 py-3 text-right font-medium">Valor Mensal</th>
                <th className="px-5 py-3 text-right font-medium">% do Total</th>
                <th className="px-5 py-3 text-right font-medium">Rateio / OS</th>
              </tr>
            </thead>
            <tbody>
              {data.fixedCosts.map((c, i) => {
                const cat = COST_CAT_LABELS[c.category] ?? { label: c.category, color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={c.id} className={`border-b border-[rgba(199,198,202,0.15)] dark:border-white/5 ${i % 2 === 0 ? "" : "bg-surface-container/40 dark:bg-[#23252a]/40"} hover:bg-blue-50/40 dark:hover:bg-blue-950/10 transition-colors`}>
                    <td className="px-5 py-2.5 font-medium text-on-surface dark:text-white">{c.name}</td>
                    <td className="px-5 py-2.5 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat.color}`}>{cat.label}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <EditableCell value={c.amount} onSave={(v) => handleUpdate(c.id, v)} />
                    </td>
                    <td className="px-5 py-2.5 text-right text-on-surface-variant dark:text-[#a0a0a4]">
                      {total > 0 ? fmtPct((c.amount / total) * 100) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{fmt(c.rateioPerOs)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[rgba(199,198,202,0.4)] dark:border-white/10 bg-surface-container dark:bg-[#23252a] font-semibold">
                <td className="px-5 py-3 text-on-surface dark:text-white">TOTAL</td>
                <td />
                <td className="px-5 py-3 text-right text-blue-600 dark:text-blue-400">{fmt(total)}</td>
                <td className="px-5 py-3 text-right text-on-surface-variant dark:text-[#a0a0a4]">100%</td>
                <td className="px-5 py-3 text-right font-mono text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{fmt(data.fixedCosts.reduce((s, c) => s + (c.rateioPerOs ?? 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Desvios Pós-Cálculo ─────────────────────────────────────────────────

function TabDeviations({ data }: { data: RkwData }) {
  const piora = data.deviations.filter((d) => d.trend === "PIORANDO").sort((a, b) => (b.deviationJune ?? 0) - (a.deviationJune ?? 0));
  const melhora = data.deviations.filter((d) => d.trend === "MELHORANDO");

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-on-surface-variant dark:text-[#a0a0a4]">
        Desvio = custo real − custo previsto por setor. Positivo = estouro (custo real maior). Setores críticos devem ter taxa revisada antes de usar no próximo orçamento.
      </p>

      {[
        { title: "Setores com Estouro de Custo", rows: piora, warn: true },
        { title: "Setores com Custo Controlado", rows: melhora, warn: false },
      ].map(({ title, rows, warn }) => (
        <div key={title} className="rounded-2xl border border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22] overflow-hidden">
          <div className={`px-6 py-3 border-b border-[rgba(199,198,202,0.3)] dark:border-white/8 ${warn ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}`}>
            <h3 className={`text-[13px] font-semibold ${warn ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{title}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(199,198,202,0.2)] dark:border-white/5 text-on-surface-variant dark:text-[#a0a0a4]">
                  <th className="px-5 py-2.5 text-left font-medium">Setor</th>
                  <th className="px-5 py-2.5 text-right font-medium">Desvio Abr/26</th>
                  <th className="px-5 py-2.5 text-right font-medium">Desvio Mai/26</th>
                  <th className="px-5 py-2.5 text-right font-medium">Desvio Jun/26</th>
                  <th className="px-5 py-2.5 text-center font-medium">Tendência</th>
                  <th className="px-5 py-2.5 text-center font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => (
                  <tr key={d.id} className={`border-b border-[rgba(199,198,202,0.15)] dark:border-white/5 ${i % 2 === 0 ? "" : "bg-surface-container/40 dark:bg-[#23252a]/40"}`}>
                    <td className="px-5 py-2.5 font-medium text-on-surface dark:text-white">
                      <span className="text-on-surface-variant dark:text-[#a0a0a4] font-mono text-[11px] mr-2">{d.sectorCode}</span>
                      {d.sectorName}
                    </td>
                    {[d.deviationApril, d.deviationMay, d.deviationJune].map((v, j) => (
                      <td key={j} className={`px-5 py-2.5 text-right font-mono text-[12px] ${v == null ? "text-[#ccc]" : v > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {v == null ? "—" : (v > 0 ? "+" : "") + fmt(v)}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-center text-[12px]"><TrendArrow trend={d.trend} /></td>
                    <td className="px-5 py-2.5 text-center"><PriorityBadge priority={d.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 text-[13px] text-amber-800 dark:text-amber-300">
        <strong>Ação recomendada:</strong> Setores 308, 411, 402 e 202 devem ter suas taxas revisadas para cima antes de serem usadas no orçamento. Sugestão: adicionar 15–25% de buffer sobre a taxa consolidada nesses setores até o apontamento ser corrigido.
      </div>
    </div>
  );
}

// ─── Tab: Parâmetros Gerais ───────────────────────────────────────────────────

const PARAM_CAT_LABELS: Record<string, string> = {
  financeiro:   "Financeiro",
  operacional:  "Operacional",
  meta:         "Metas",
};

function TabParameters({ data, onUpdated }: { data: RkwData; onUpdated: () => void }) {
  const groups: Record<string, RkwParameter[]> = {};
  for (const p of data.parameters) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }

  const handleUpdate = async (key: string, value: number) => {
    await rkwApi.updateParameter(key, value);
    onUpdated();
  };

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-on-surface-variant dark:text-[#a0a0a4]">
        Parâmetros gerais do sistema de custeio. Atualizar mensalmente após fechamento do pós-cálculo. Estes valores alimentam automaticamente o cálculo de rateio e o ponto de equilíbrio.
      </p>

      {["financeiro", "operacional", "meta"].map((cat) => {
        const params = groups[cat];
        if (!params) return null;
        return (
          <div key={cat} className="rounded-2xl border border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22] overflow-hidden">
            <div className="bg-surface-container dark:bg-[#23252a] px-6 py-3 border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
              <h3 className="text-[13px] font-semibold text-on-surface dark:text-white uppercase tracking-wider">{PARAM_CAT_LABELS[cat] ?? cat}</h3>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(199,198,202,0.2)] dark:border-white/5 text-on-surface-variant dark:text-[#a0a0a4]">
                  <th className="px-5 py-2.5 text-left font-medium">Parâmetro</th>
                  <th className="px-5 py-2.5 text-right font-medium">Valor Atual</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p, i) => (
                  <tr key={p.id} className={`border-b border-[rgba(199,198,202,0.15)] dark:border-white/5 ${i % 2 === 0 ? "" : "bg-surface-container/40 dark:bg-[#23252a]/40"} hover:bg-blue-50/40 dark:hover:bg-blue-950/10 transition-colors`}>
                    <td className="px-5 py-2.5 text-on-surface dark:text-white">{p.label}</td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[12px] text-on-surface-variant dark:text-[#a0a0a4]">{p.unit}</span>
                        <EditableCell value={p.value} onSave={(v) => handleUpdate(p.key, v)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="text-[11px] text-on-surface-variant dark:text-[#a0a0a4] italic">
        Fonte: Pós-Cálculo Abr-Jun/2026 + Movimentação Financeira. Competência: Jun/2026.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard",  label: "Dashboard" },
  { id: "maquinas",   label: "Taxa Hora-Máquina" },
  { id: "custos",     label: "Custos Fixos" },
  { id: "desvios",    label: "Desvios" },
  { id: "parametros", label: "Parâmetros" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function RkwPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<RkwData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const d = await rkwApi.get();
      setData(d);
    } catch {
      setError("Erro ao carregar dados RKW");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#131416] p-6 pb-12">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-on-surface dark:text-white leading-tight">RKW — Base Gerencial</h1>
            <p className="text-[13px] text-on-surface-variant dark:text-[#a0a0a4]">Custeio Pleno · Acesso restrito a Administradores</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-on-surface-variant dark:text-[#a0a0a4] hover:text-on-surface dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-on-surface-variant dark:text-[#a0a0a4]">
          Carregando base gerencial…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 text-red-700 dark:text-red-400 text-[13px]">
          {error}
        </div>
      )}
      {data && !loading && (
        <>
          {activeTab === "dashboard"  && <TabDashboard data={data} />}
          {activeTab === "maquinas"   && <TabMachineRates data={data} onUpdated={loadData} />}
          {activeTab === "custos"     && <TabFixedCosts data={data} onUpdated={loadData} />}
          {activeTab === "desvios"    && <TabDeviations data={data} />}
          {activeTab === "parametros" && <TabParameters data={data} onUpdated={loadData} />}
        </>
      )}
    </div>
  );
}
