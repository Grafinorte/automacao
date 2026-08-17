import { useEffect, useState } from "react";
import { hrApi } from "../api/hr";
import type { VacationStatus, VacationWithEmployee } from "../types";
import { VACATION_STATUS_LABELS } from "../types";
import { Card } from "../components/common/Card";
import { HrSubNav } from "../components/hr/HrSubNav";
import { useHrCompany, HR_COMPANIES } from "../context/HrCompanyContext";

const STATUS_BADGE_CLASS: Record<VacationStatus, string> = {
  PLANEJADA: "bg-gray-100 text-gray-600",
  EM_ANDAMENTO: "bg-brand/10 text-brand-dark",
  CONCLUIDA: "bg-green-100 text-green-700",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function VacationsPage() {
  const { company } = useHrCompany();
  const companyInfo = HR_COMPANIES.find((c) => c.id === company);
  const [vacations, setVacations] = useState<VacationWithEmployee[]>([]);

  function reload() {
    hrApi.listAllVacations().then(setVacations);
  }

  useEffect(reload, []);

  async function handleStatusChange(id: string, status: VacationStatus) {
    await hrApi.updateVacation(id, { status });
    reload();
  }

  const sorted = vacations
    .filter((v) => v.employee.company === company)
    .slice()
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  return (
    <div className="min-h-full overflow-y-auto p-8">
      <div className="mb-1 flex items-center gap-3">
        {companyInfo && (
          <img src={companyInfo.logo} alt={companyInfo.label} className="h-7 w-auto max-w-[100px] object-contain" />
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-[#e0e0e2]">Férias</h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">{companyInfo?.label}</p>
      <HrSubNav />

      <p className="mb-3 text-xs text-gray-500">
        Para agendar férias de um funcionário, abra o cadastro dele em "Funcionários".
      </p>

      <div className="space-y-2.5">
        {sorted.map((v) => {
          const remaining = daysUntil(v.startDate);
          return (
            <Card key={v.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{v.employee.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[v.status]}`}>
                    {VACATION_STATUS_LABELS[v.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {v.employee.department} · {formatDate(v.startDate)} a {formatDate(v.endDate)}
                  {v.status === "PLANEJADA" && remaining >= 0 && ` · em ${remaining} dia(s)`}
                </p>
              </div>
              <select
                value={v.status}
                onChange={(e) => handleStatusChange(v.id, e.target.value as VacationStatus)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
              >
                {Object.entries(VACATION_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Nenhuma férias registrada ainda.</p>
        )}
      </div>
    </div>
  );
}
