import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { marketingApi } from "../api/marketing";
import type { Campaign, ContentBoardColumn, MarketingChannel } from "../types";
import { CONTENT_STATUS_LABELS, MARKETING_CHANNEL_LABELS } from "../types";
import { MarketingSubNav } from "../components/marketing/MarketingSubNav";

const CHANNEL_COLORS: Record<MarketingChannel, string> = {
  REDES_SOCIAIS: "#005cba",
  EMAIL: "#7c3aed",
  IMPRESSO: "#111111",
  SITE: "#16A34A",
  OUTRO: "#9CA3AF",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function KpiCard({
  icon, label, value, sub, badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  badge?: string;
}) {
  return (
    <div className="glass-card smooth-shadow rounded-2xl p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#005cba]/10 text-[#005cba]">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <h2 className="text-[28px] font-bold leading-none tracking-tight text-[#030304]">{value}</h2>
        {badge && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">{badge}</span>
        )}
      </div>
      {sub && <p className="mt-2 text-[11px] text-[#77767b]">{sub}</p>}
    </div>
  );
}

export function MarketingDashboardPage() {
  const [columns, setColumns] = useState<ContentBoardColumn[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    marketingApi.getContentBoard().then(setColumns);
    marketingApi.listCampaigns().then(setCampaigns);
  }, []);

  const metrics = useMemo(() => {
    if (!columns || !campaigns) return null;

    const allItems = columns.flatMap((c) => c.items);
    const activeCampaigns = campaigns.filter((c) => c.status === "EM_ANDAMENTO").length;

    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const upcoming = allItems
      .filter((item) => item.status !== "PUBLICADO" && item.scheduledDate)
      .filter((item) => {
        const d = new Date(item.scheduledDate!);
        return d >= now && d <= in7Days;
      })
      .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime());

    const publishedThisMonth = allItems.filter((item) => {
      if (item.status !== "PUBLICADO" || !item.scheduledDate) return false;
      const d = new Date(item.scheduledDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const statusBars = columns.map((c) => ({
      status: CONTENT_STATUS_LABELS[c.status],
      quantidade: c.items.length,
    }));

    const channelCounts = new Map<MarketingChannel, number>();
    for (const item of allItems) {
      channelCounts.set(item.channel, (channelCounts.get(item.channel) ?? 0) + 1);
    }
    const channelPie = Array.from(channelCounts.entries()).map(([channel, count]) => ({
      name: MARKETING_CHANNEL_LABELS[channel],
      value: count,
      color: CHANNEL_COLORS[channel],
    }));

    return { activeCampaigns, totalContent: allItems.length, publishedThisMonthCount: publishedThisMonth.length, upcoming: upcoming.slice(0, 5), statusBars, channelPie };
  }, [columns, campaigns]);

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
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Marketing</h1>
          <p className="mt-1 text-[17px] text-[#46464a]">Campanhas, conteúdo e desempenho em tempo real.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 rounded-xl border border-[#c7c6ca] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#1a1c1d] transition-colors hover:bg-[#f3f3f5]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
            Últimos 30 dias
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-[#030304] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-[#1d1d1f] active:scale-[0.98]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nova Campanha
          </button>
        </div>
      </div>

      <MarketingSubNav />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-5 md:grid-cols-4">
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 1 8.835-2.535m0 0A23.74 23.74 0 0 1 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" /></svg>}
          label="Campanhas ativas"
          value={String(metrics.activeCampaigns)}
          sub="em andamento agora"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" /></svg>}
          label="Peças no calendário"
          value={String(metrics.totalContent)}
          sub="total de conteúdos"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
          label="Publicadas este mês"
          value={String(metrics.publishedThisMonthCount)}
          sub="conteúdos publicados"
          badge={metrics.publishedThisMonthCount > 0 ? "Ativo" : undefined}
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
          label="Agendadas (7 dias)"
          value={String(metrics.upcoming.length)}
          sub="próximas peças"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-2">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Peças por status</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Distribuição do calendário editorial</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.statusBars} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill="#005cba" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card smooth-shadow rounded-2xl p-6">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Por canal</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Distribuição de conteúdo</p>
          {metrics.channelPie.length === 0 ? (
            <div className="flex h-44 items-center justify-center">
              <p className="text-center text-[13px] text-[#77767b]">Sem peças cadastradas.</p>
            </div>
          ) : (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.channelPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {metrics.channelPie.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-3">
          <h3 className="mb-1 text-[15px] font-semibold text-[#030304]">Próximas peças agendadas</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Publicações nos próximos 7 dias</p>
          {metrics.upcoming.length === 0 ? (
            <div className="flex h-16 items-center justify-center">
              <p className="text-center text-[13px] text-[#77767b]">Nenhuma peça agendada para os próximos 7 dias.</p>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(0,0,0,0.04)]">
              {metrics.upcoming.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#005cba]/10">
                      <svg className="h-4 w-4 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1c1d]">{item.title}</p>
                      <p className="text-[11px] text-[#77767b]">
                        {item.type} · {MARKETING_CHANNEL_LABELS[item.channel]}
                        {item.campaign && ` · ${item.campaign.name}`}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#f3f3f5] px-3 py-1 text-[11px] font-medium text-[#46464a]">
                    {formatDate(item.scheduledDate!)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
