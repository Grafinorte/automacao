import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { hrApi } from "../api/hr";
import type { Employee, VacationWithEmployee } from "../types";
import { HrSubNav } from "../components/hr/HrSubNav";
import { useHrCompany, HR_COMPANIES } from "../context/HrCompanyContext";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatCurrencyShort(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const DEPT_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316", "#6366f1",
];

function CustomBarTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 shadow-lg dark:bg-[#1c1e22] dark:border-white/10">
      <p className="text-[12px] font-semibold text-[#030304] dark:text-[#e0e0e2]">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-[#005cba] dark:text-[#60a5fa]">
        {formatter ? formatter(val) : val}
      </p>
    </div>
  );
}

function CustomPieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3 shadow-lg dark:bg-[#1c1e22] dark:border-white/10">
      <p className="text-[12px] font-semibold text-[#030304] dark:text-[#e0e0e2]">{payload[0].name}</p>
      <p className="mt-0.5 text-[13px] font-bold text-[#005cba] dark:text-[#60a5fa]">{payload[0].value} pessoa(s)</p>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, color = "text-[#005cba]",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="glass-card smooth-shadow rounded-2xl p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#005cba]/8 text-[#005cba] dark:bg-[#60a5fa]/10 dark:text-[#60a5fa]">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{label}</p>
      <h2 className={`mt-1 text-[28px] font-bold leading-none tracking-tight ${color}`}>{value}</h2>
      {sub && <p className="mt-2 text-[11px] text-[#77767b]">{sub}</p>}
    </div>
  );
}

export function HrDashboardPage() {
  const { company } = useHrCompany();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [vacations, setVacations] = useState<VacationWithEmployee[]>([]);

  useEffect(() => {
    setEmployees(null);
    hrApi.listEmployees(company).then(setEmployees);
    hrApi.listAllVacations().then(setVacations);
  }, [company]);

  const companyInfo = HR_COMPANIES.find((c) => c.id === company);

  const metrics = useMemo(() => {
    if (!employees) return null;
    const active = employees.filter((e) => e.status === "ATIVO");
    const totalPayroll = active.reduce((sum, e) => sum + e.salary, 0);
    const avgSalary = active.length > 0 ? totalPayroll / active.length : 0;

    const byDepartment = new Map<string, { count: number; payroll: number }>();
    for (const e of active) {
      const entry = byDepartment.get(e.department) ?? { count: 0, payroll: 0 };
      entry.count += 1;
      entry.payroll += e.salary;
      byDepartment.set(e.department, entry);
    }
    const departmentBars = Array.from(byDepartment.entries()).map(([name, v]) => ({
      name, funcionarios: v.count, folha: v.payroll,
    }));

    const pieData = departmentBars.map((d) => ({ name: d.name, value: d.funcionarios }));

    const now = new Date();
    const currentMonth = now.getMonth();
    const birthdays = active
      .filter((e) => e.birthDate && new Date(e.birthDate).getMonth() === currentMonth)
      .sort((a, b) => new Date(a.birthDate!).getDate() - new Date(b.birthDate!).getDate());

    const admissionAnniversaries = active
      .filter((e) => new Date(e.admissionDate).getMonth() === currentMonth)
      .map((e) => ({ ...e, years: now.getFullYear() - new Date(e.admissionDate).getFullYear() }))
      .filter((e) => e.years > 0)
      .sort((a, b) => new Date(a.admissionDate).getDate() - new Date(b.admissionDate).getDate());

    const vacationsByEmployee = new Map<string, VacationWithEmployee[]>();
    const companyVacations = vacations.filter((v) => v.employee.company === company);
    for (const v of companyVacations) {
      const list = vacationsByEmployee.get(v.employee.id) ?? [];
      list.push(v);
      vacationsByEmployee.set(v.employee.id, list);
    }

    const vacationAlerts = active
      .map((e) => {
        const empVacations = vacationsByEmployee.get(e.id) ?? [];
        const completed = empVacations
          .filter((v) => v.status === "CONCLUIDA")
          .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
        const anchor = completed[0] ? new Date(completed[0].endDate) : new Date(e.admissionDate);
        const deadline = addMonths(anchor, 24);
        const remaining = daysUntil(deadline);
        return { employee: e, deadline, remaining };
      })
      .filter((a) => a.remaining <= 90)
      .sort((a, b) => a.remaining - b.remaining);

    return { activeCount: active.length, totalPayroll, avgSalary, departmentBars, pieData, birthdays, admissionAnniversaries, vacationAlerts };
  }, [employees, vacations, company]);

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
      <div className="mb-6 flex items-center gap-4">
        {companyInfo && (
          <img src={companyInfo.logo} alt={companyInfo.label} className="h-9 w-auto max-w-[140px] object-contain" />
        )}
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#030304] dark:text-[#e0e0e2]">
            Recursos Humanos
          </h1>
          <p className="text-[14px] text-[#46464a] dark:text-[#a0a0a4]">
            {companyInfo?.label} · Gestão de equipe e benefícios
          </p>
        </div>
      </div>

      <HrSubNav />

      {/* SVG gradients definition (hidden) */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0.7} />
          </linearGradient>
        </defs>
      </svg>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
          label="Funcionários ativos"
          value={String(metrics.activeCount)}
          sub="colaboradores em atividade"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.5m-1.5 0h-1.5m-12 0h1.5m-1.5 0H3" /></svg>}
          label="Folha salarial"
          value={formatCurrencyShort(metrics.totalPayroll)}
          sub="total dos funcionários ativos"
          color="text-emerald-600"
        />
        <KpiCard
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185z" /></svg>}
          label="Salário médio"
          value={formatCurrencyShort(metrics.avgSalary)}
          sub="média entre colaboradores ativos"
          color="text-violet-600"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Horizontal bar — funcionários por setor */}
        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-2">
          <h3 className="mb-0.5 text-[15px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Funcionários por setor</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Distribuição por departamento</p>
          {metrics.departmentBars.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-[13px] text-[#77767b]">Sem dados para exibir.</p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.departmentBars} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(0,92,186,0.04)" }} />
                  <Bar dataKey="funcionarios" radius={[0, 8, 8, 0]} maxBarSize={28}>
                    {metrics.departmentBars.map((_, i) => (
                      <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Donut — distribuição por setor */}
        <div className="glass-card smooth-shadow rounded-2xl p-6">
          <h3 className="mb-0.5 text-[15px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Distribuição</h3>
          <p className="mb-4 text-[13px] text-[#77767b]">Headcount por setor</p>
          {metrics.pieData.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-[13px] text-[#77767b]">Sem dados.</p>
            </div>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {metrics.pieData.map((_, i) => (
                        <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {metrics.pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                    <span className="truncate text-[10px] text-[#46464a] dark:text-[#a0a0a4]">{d.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Bar — folha salarial */}
        <div className="glass-card smooth-shadow rounded-2xl p-6 lg:col-span-2">
          <h3 className="mb-0.5 text-[15px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Folha salarial por setor</h3>
          <p className="mb-5 text-[13px] text-[#77767b]">Custo de pessoal por departamento</p>
          {metrics.departmentBars.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-[13px] text-[#77767b]">Sem dados para exibir.</p>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.departmentBars} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={<CustomBarTooltip formatter={formatCurrency} />}
                    cursor={{ fill: "rgba(16,185,129,0.06)" }}
                  />
                  <Bar dataKey="folha" fill="url(#gradGreen)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Alerts + birthdays stacked */}
        <div className="flex flex-col gap-5">
          {/* Férias vencendo */}
          <div className="glass-card smooth-shadow rounded-2xl p-5">
            <h3 className="mb-0.5 text-[14px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Férias vencendo</h3>
            <p className="mb-3 text-[12px] text-[#77767b]">Alertas nos próximos 90 dias</p>
            {metrics.vacationAlerts.length === 0 ? (
              <div className="flex h-16 items-center justify-center">
                <p className="text-center text-[12px] text-[#77767b]">Nenhum alerta.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {metrics.vacationAlerts.map((a) => (
                  <div key={a.employee.id} className="flex items-center justify-between rounded-xl bg-[#f9f9fb] dark:bg-[#111214] px-3 py-2">
                    <span className="text-[12px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2] truncate">{a.employee.name}</span>
                    <span className={`ml-2 flex-shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      a.remaining < 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : a.remaining < 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]"
                    }`}>
                      {a.remaining < 0 ? `vencida há ${-a.remaining}d` : `${a.remaining}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aniversários */}
          <div className="glass-card smooth-shadow rounded-2xl p-5 flex-1">
            <h3 className="mb-0.5 text-[14px] font-semibold text-[#030304] dark:text-[#e0e0e2]">Aniversários do mês</h3>
            <p className="mb-3 text-[12px] text-[#77767b]">Nascimento e admissão</p>
            {metrics.birthdays.length === 0 && metrics.admissionAnniversaries.length === 0 ? (
              <div className="flex h-16 items-center justify-center">
                <p className="text-center text-[12px] text-[#77767b]">Nenhum este mês.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-48 overflow-y-auto">
                {metrics.birthdays.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">Aniversário</p>
                    <div className="space-y-1.5">
                      {metrics.birthdays.map((e) => (
                        <div key={e.id} className="flex items-center justify-between rounded-xl bg-[#f9f9fb] dark:bg-[#111214] px-3 py-2">
                          <span className="text-[12px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2] truncate">{e.name}</span>
                          <span className="ml-2 flex-shrink-0 text-[10px] text-[#77767b]">🎂 {formatDate(e.birthDate!)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {metrics.admissionAnniversaries.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">Tempo de casa</p>
                    <div className="space-y-1.5">
                      {metrics.admissionAnniversaries.map((e) => (
                        <div key={e.id} className="flex items-center justify-between rounded-xl bg-[#f9f9fb] dark:bg-[#111214] px-3 py-2">
                          <span className="text-[12px] font-medium text-[#1a1c1d] dark:text-[#e0e0e2] truncate">{e.name}</span>
                          <span className="ml-2 flex-shrink-0 text-[11px] font-semibold text-[#005cba] dark:text-[#60a5fa]">{e.years}a ⭐</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
