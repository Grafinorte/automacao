import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { crmApi } from "../api/crm";
import type { CrmStage } from "../types";
import { CrmSubNav } from "../components/crm/CrmSubNav";
import { CrmOwnerFilterSelect } from "../components/crm/CrmOwnerFilterSelect";
import { useCrmOwnerFilter } from "../hooks/useCrmOwnerFilter";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

type Metrics = {
  openCount: number; openValue: number; averageTicket: number;
  wonCount: number; wonValue: number; winRate: number | null;
  stageBars: { name: string; valor: number; quantidade: number; color: string }[];
  monthlyTrend: { mes: string; valor: number }[];
  pieData: { name: string; value: number; color: string }[];
};

function generateReport(metrics: Metrics, ownerLabel: string) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const stageRows = metrics.stageBars
    .map((s) => `
      <tr>
        <td>${s.name}</td>
        <td style="text-align:center">${s.quantidade}</td>
        <td style="text-align:right">${fmt(s.valor)}</td>
      </tr>`)
    .join("");

  const monthRows = metrics.monthlyTrend
    .map((m) => `
      <tr>
        <td>${m.mes}</td>
        <td style="text-align:right">${fmt(m.valor)}</td>
      </tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Relatório Comercial – Grafinorte</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #005cba; padding-bottom: 16px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #005cba; }
    .header .meta { text-align: right; color: #555; font-size: 12px; line-height: 1.6; }
    .kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 32px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
    .kpi .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 4px; }
    .kpi .value { font-size: 22px; font-weight: 700; color: #030304; }
    .kpi .sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    h2 { font-size: 14px; font-weight: 600; color: #030304; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
    td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; color: #111; }
    tr:last-child td { border-bottom: none; }
    .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório Comercial</h1>
      <p style="color:#555;margin-top:4px;font-size:12px">Grafinorte Indústria Gráfica</p>
      ${ownerLabel !== "Todos" ? `<p style="color:#005cba;font-size:12px;margin-top:2px">Responsável: ${ownerLabel}</p>` : ""}
    </div>
    <div class="meta">
      <div><strong>Data:</strong> ${dateStr}</div>
      <div><strong>Gerado em:</strong> ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi">
      <div class="label">Negócios em aberto</div>
      <div class="value">${metrics.openCount}</div>
      <div class="sub">negócios ativos</div>
    </div>
    <div class="kpi">
      <div class="label">Valor em pipeline</div>
      <div class="value">${fmt(metrics.openValue)}</div>
      <div class="sub">${metrics.openCount} negócios</div>
    </div>
    <div class="kpi">
      <div class="label">Ticket médio</div>
      <div class="value">${fmt(metrics.averageTicket)}</div>
      <div class="sub">média dos em aberto</div>
    </div>
    <div class="kpi">
      <div class="label">Ganhos este mês</div>
      <div class="value">${fmt(metrics.wonValue)}</div>
      <div class="sub">${metrics.wonCount} negócio(s) fechado(s)</div>
    </div>
  </div>

  <h2>Distribuição por estágio</h2>
  <table>
    <thead><tr><th>Estágio</th><th style="text-align:center">Qtd.</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${stageRows}</tbody>
  </table>

  <h2>Ganhos por mês (últimos 6 meses)</h2>
  <table>
    <thead><tr><th>Mês</th><th style="text-align:right">Valor ganho</th></tr></thead>
    <tbody>${monthRows}</tbody>
  </table>

  ${metrics.winRate !== null ? `<p style="font-size:13px;color:#555">Taxa de conversão: <strong style="color:#16a34a">${metrics.winRate}%</strong> dos negócios fechados são ganhos.</p>` : ""}

  <div class="footer">Grafinorte Indústria Gráfica · Relatório gerado automaticamente pelo sistema</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

const STAGE_COLOR_OPEN = "#005cba";
const STAGE_COLOR_WON = "#16A34A";
const STAGE_COLOR_LOST = "#9CA3AF";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

function KpiCard({
  icon, label, value, sub, badge, badgeColor = "green",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: "green" | "blue" | "amber";
}) {
  const badgeClasses = {
    green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  }[badgeColor];

  return (
    <div className="glass-card smooth-shadow rounded-2xl p-6 hover:shadow-xl transition-shadow duration-300">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#005cba]/10 text-[#005cba]">
          {icon}
        </div>
        {badge && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClasses}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{label}</p>
      <h2 className="mt-1 text-[32px] font-bold leading-none tracking-tight text-[#030304]">{value}</h2>
      {sub && <p className="mt-2 text-[11px] text-[#77767b]">{sub}</p>}
    </div>
  );
}

export function CrmDashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { owner, setOwner, salespeople } = useCrmOwnerFilter();
  const [stages, setStages] = useState<CrmStage[] | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    crmApi.getBoard(owner).then(setStages);
  }, [owner]);

  const metrics = useMemo(() => {
    if (!stages) return null;

    const openDeals = stages.filter((s) => !s.isClosed).flatMap((s) => s.deals);
    const wonStage = stages.find((s) => s.isClosed && s.isWon);
    const lostStage = stages.find((s) => s.isClosed && !s.isWon);
    const wonDeals = wonStage?.deals ?? [];
    const lostDeals = lostStage?.deals ?? [];

    const now = new Date();
    const wonThisMonth = wonDeals.filter((d) => {
      const updated = new Date(d.updatedAt);
      return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear();
    });

    const openValue = openDeals.reduce((sum, d) => sum + d.value, 0);
    const stageBars = stages.map((s) => ({
      name: s.name,
      valor: s.deals.reduce((sum, d) => sum + d.value, 0),
      quantidade: s.deals.length,
      color: s.isClosed ? (s.isWon ? STAGE_COLOR_WON : STAGE_COLOR_LOST) : STAGE_COLOR_OPEN,
    }));

    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      const value = wonDeals
        .filter((deal) => {
          const u = new Date(deal.updatedAt);
          return u.getMonth() === d.getMonth() && u.getFullYear() === d.getFullYear();
        })
        .reduce((sum, deal) => sum + deal.value, 0);
      return { mes: label.replace(".", ""), valor: value };
    });

    const winRate =
      wonDeals.length + lostDeals.length > 0
        ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
        : null;

    return {
      openCount: openDeals.length,
      openValue,
      averageTicket: openDeals.length > 0 ? openValue / openDeals.length : 0,
      wonCount: wonThisMonth.length,
      wonValue: wonThisMonth.reduce((sum, d) => sum + d.value, 0),
      stageBars,
      monthlyTrend,
      winRate,
      pieData: [
        { name: "Ganhos", value: wonDeals.length, color: STAGE_COLOR_WON },
        { name: "Perdidos", value: lostDeals.length, color: STAGE_COLOR_LOST },
      ],
    } satisfies Metrics;
  }, [stages]);

  if (!metrics) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="text-[15px] text-[#46464a]">Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-y-auto p-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
          <p className="mt-1 text-[17px] text-[#46464a]">Acompanhe o desempenho das vendas em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && user && (
            <CrmOwnerFilterSelect owner={owner} onChange={setOwner} salespeople={salespeople} currentUserId={user.id} />
          )}
          {metrics && (
            <button
              onClick={() => {
                setGeneratingReport(true);
                const ownerEntry = salespeople.find((s) => s.id === owner);
                const ownerLabel =
                  owner === "all" ? "Todos" :
                  owner === "me" ? (user?.name ?? "Eu") :
                  (ownerEntry?.name ?? "Vendedor");
                generateReport(metrics, ownerLabel);
                setTimeout(() => setGeneratingReport(false), 1000);
              }}
              disabled={generatingReport}
              className="flex items-center gap-2 rounded-xl border border-[rgba(199,198,202,0.5)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#030304] shadow-sm transition-all hover:bg-[#f5f5f7] active:scale-[0.98] disabled:opacity-60 dark:border-white/10 dark:bg-[#1c1e22] dark:text-[#e0e0e2] dark:hover:bg-[#222426]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              {generatingReport ? "Gerando..." : "Relatório PDF"}
            </button>
          )}
          <Link
            to="/comercial/funil"
            className="flex items-center gap-2 rounded-xl bg-[#030304] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-[#1d1d1f] active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Novo Negócio
          </Link>
        </div>
      </div>

      <CrmSubNav />

      {/* KPI Grid */}
      <div className="mb-6 grid grid-cols-2 gap-5 md:grid-cols-4">
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>}
          label="Negócios em aberto"
          value={String(metrics.openCount)}
          sub="negócios ativos no funil"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.5m-1.5 0h-1.5m-12 0h1.5m-1.5 0H3" /></svg>}
          label="Valor em negociação"
          value={formatCurrencyShort(metrics.openValue)}
          sub={`${metrics.openCount} negócios em pipeline`}
          badge="Ativo"
          badgeColor="blue"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25z" /></svg>}
          label="Ticket médio"
          value={formatCurrencyShort(metrics.averageTicket)}
          sub="média dos negócios em aberto"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
          label="Ganhos este mês"
          value={metrics.wonCount > 0 ? formatCurrencyShort(metrics.wonValue) : "R$ 0"}
          sub={`${metrics.wonCount} negócio(s) fechado(s)`}
          badge={metrics.wonCount > 0 ? `+${metrics.wonCount}` : undefined}
          badgeColor="green"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-2">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Valor por estágio do funil</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Distribuição do pipeline por estágio</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.stageBars} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {metrics.stageBars.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card smooth-shadow rounded-2xl p-6">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Taxa de conversão</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Ganhos vs. perdidos</p>
          {metrics.winRate === null ? (
            <div className="flex h-44 items-center justify-center">
              <p className="text-center text-[13px] text-[#77767b]">Sem negócios fechados ainda.</p>
            </div>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {metrics.pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-center text-[13px] text-[#77767b]">
                <span className="text-[20px] font-bold text-[#030304]">{metrics.winRate}%</span> dos fechamentos são ganhos
              </p>
            </>
          )}
        </div>

        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-3">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Ganhos por mês</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Evolução dos últimos 6 meses</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.monthlyTrend} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="valor" fill={STAGE_COLOR_WON} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
