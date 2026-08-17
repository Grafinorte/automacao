import { useEffect, useMemo, useState } from "react";
import { hrApi } from "../api/hr";
import { ApiError } from "../api/client";
import type { Employee, EmployeeDetail, EmployeeStatus } from "../types";
import { EMPLOYEE_STATUS_LABELS } from "../types";
import { Button } from "../components/common/Button";
import { HrSubNav } from "../components/hr/HrSubNav";
import { EmployeeDetailModal, type EmployeeFormValues } from "../components/hr/EmployeeDetailModal";
import { useHrCompany, HR_COMPANIES } from "../context/HrCompanyContext";

const STATUS_BADGE_CLASS: Record<EmployeeStatus, string> = {
  ATIVO: "bg-green-100 text-green-700",
  AFASTADO: "bg-amber-100 text-amber-700",
  DEMITIDO: "bg-gray-100 text-gray-500",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function EmployeesPage() {
  const { company } = useHrCompany();
  const companyInfo = HR_COMPANIES.find((c) => c.id === company);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEmployee, setActiveEmployee] = useState<EmployeeDetail | "new" | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "">("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    hrApi.listEmployees(company).then(setEmployees);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); setDepartmentFilter(""); }, [company]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department))).sort(),
    [employees]
  );

  const filtered = employees.filter(
    (e) =>
      (!departmentFilter || e.department === departmentFilter) &&
      (!statusFilter || e.status === statusFilter)
  );

  async function openEmployee(e: Employee) {
    const detail = await hrApi.getEmployee(e.id);
    setActiveEmployee(detail);
  }

  async function handleSave(values: EmployeeFormValues) {
    const payload = {
      name: values.name,
      cpf: values.cpf || null,
      rg: values.rg || null,
      birthDate: values.birthDate || null,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      position: values.position,
      department: values.department,
      company: values.company || company,
      admissionDate: values.admissionDate,
      terminationDate: values.terminationDate || null,
      status: values.status,
      salary: values.salary,
      notes: values.notes || null,
    };
    if (activeEmployee === "new") {
      await hrApi.createEmployee(payload);
    } else if (activeEmployee) {
      await hrApi.updateEmployee(activeEmployee.id, payload);
    }
    setActiveEmployee(null);
    reload();
  }

  async function handleDelete() {
    if (!activeEmployee || activeEmployee === "new") return;
    try {
      await hrApi.deleteEmployee(activeEmployee.id);
      setActiveEmployee(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível excluir o funcionário");
    }
  }

  return (
    <div className="min-h-full overflow-y-auto p-8">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {companyInfo && (
            <img src={companyInfo.logo} alt={companyInfo.label} className="h-7 w-auto max-w-[100px] object-contain" />
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-[#e0e0e2]">Funcionários</h1>
        </div>
        <Button onClick={() => setActiveEmployee("new")}>+ Novo funcionário</Button>
      </div>
      <p className="mb-4 text-sm text-gray-500">{companyInfo?.label}</p>
      <HrSubNav />

      {error && <div className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">{error}</div>}

      <div className="mb-4 flex gap-2">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Todos os setores</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EmployeeStatus | "")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Todos os status</option>
          {Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:bg-gray-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="font-medium">Cargo</th>
              <th className="font-medium">Setor</th>
              <th className="font-medium">Admissão</th>
              <th className="font-medium">Salário</th>
              <th className="font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.id}
                onClick={() => openEmployee(e)}
                className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                <td>{e.position}</td>
                <td>{e.department}</td>
                <td>{formatDate(e.admissionDate)}</td>
                <td>{formatCurrency(e.salary)}</td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[e.status]}`}>
                    {EMPLOYEE_STATUS_LABELS[e.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Nenhum funcionário cadastrado ainda.</p>
        )}
      </div>

      {activeEmployee && (
        <EmployeeDetailModal
          employee={activeEmployee}
          onClose={() => setActiveEmployee(null)}
          onSave={handleSave}
          onDelete={activeEmployee !== "new" ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
