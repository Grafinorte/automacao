import { useRef, useState, type FormEvent } from "react";
import { hrApi } from "../../api/hr";
import { ApiError } from "../../api/client";
import type {
  EmployeeDetail,
  EmployeeDocument,
  EmployeeStatus,
  SalaryChange,
  Vacation,
  VacationStatus,
} from "../../types";
import { EMPLOYEE_STATUS_LABELS, VACATION_STATUS_LABELS } from "../../types";
import { Button } from "../common/Button";

export interface EmployeeFormValues {
  name: string;
  cpf: string;
  rg: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
  position: string;
  department: string;
  company: string;
  admissionDate: string;
  terminationDate: string;
  status: EmployeeStatus;
  salary: number;
  notes: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function EmployeeDetailModal({
  employee,
  onClose,
  onSave,
  onDelete,
}: {
  employee: EmployeeDetail | "new";
  onClose: () => void;
  onSave: (values: EmployeeFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const isNew = employee === "new";
  const [values, setValues] = useState<EmployeeFormValues>(
    isNew
      ? {
          name: "",
          cpf: "",
          rg: "",
          birthDate: "",
          email: "",
          phone: "",
          address: "",
          position: "",
          department: "",
          company: "GRAFINORTE",
          admissionDate: "",
          terminationDate: "",
          status: "ATIVO",
          salary: 0,
          notes: "",
        }
      : {
          name: employee.name,
          cpf: employee.cpf ?? "",
          rg: employee.rg ?? "",
          birthDate: employee.birthDate ? employee.birthDate.slice(0, 10) : "",
          email: employee.email ?? "",
          phone: employee.phone ?? "",
          address: employee.address ?? "",
          position: employee.position,
          department: employee.department,
          company: employee.company ?? "GRAFINORTE",
          admissionDate: employee.admissionDate.slice(0, 10),
          terminationDate: employee.terminationDate ? employee.terminationDate.slice(0, 10) : "",
          status: employee.status,
          salary: employee.salary,
          notes: employee.notes ?? "",
        }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [salaryChanges, setSalaryChanges] = useState<SalaryChange[]>(
    !isNew ? employee.salaryChanges : []
  );
  const [newRaiseAmount, setNewRaiseAmount] = useState("");
  const [newRaiseDate, setNewRaiseDate] = useState("");
  const [newRaiseReason, setNewRaiseReason] = useState("");
  const [savingRaise, setSavingRaise] = useState(false);

  const [vacations, setVacations] = useState<Vacation[]>(!isNew ? employee.vacations : []);
  const [newVacStart, setNewVacStart] = useState("");
  const [newVacEnd, setNewVacEnd] = useState("");
  const [newVacStatus, setNewVacStatus] = useState<VacationStatus>("PLANEJADA");
  const [savingVacation, setSavingVacation] = useState(false);

  const [documents, setDocuments] = useState<EmployeeDocument[]>(!isNew ? employee.documents : []);
  const [newDocName, setNewDocName] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim() || !values.position.trim() || !values.department.trim() || !values.admissionDate) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o funcionário");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRaise() {
    if (isNew || !newRaiseAmount || !newRaiseDate) return;
    setSavingRaise(true);
    try {
      const change = await hrApi.addSalaryChange(employee.id, {
        amount: Number(newRaiseAmount),
        effectiveDate: newRaiseDate,
        reason: newRaiseReason || null,
      });
      setSalaryChanges((prev) => [change, ...prev]);
      setValues((v) => ({ ...v, salary: change.amount }));
      setNewRaiseAmount("");
      setNewRaiseDate("");
      setNewRaiseReason("");
    } finally {
      setSavingRaise(false);
    }
  }

  async function handleAddVacation() {
    if (isNew || !newVacStart || !newVacEnd) return;
    setSavingVacation(true);
    try {
      const vacation = await hrApi.addVacation(employee.id, {
        startDate: newVacStart,
        endDate: newVacEnd,
        status: newVacStatus,
      });
      setVacations((prev) => [vacation, ...prev]);
      setNewVacStart("");
      setNewVacEnd("");
      setNewVacStatus("PLANEJADA");
    } finally {
      setSavingVacation(false);
    }
  }

  async function handleDeleteVacation(id: string) {
    await hrApi.deleteVacation(id);
    setVacations((prev) => prev.filter((v) => v.id !== id));
  }

  async function handleUploadDocument() {
    if (isNew) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file || !newDocName.trim()) return;
    setUploadingDoc(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const doc = await hrApi.addDocument(employee.id, newDocName.trim(), dataUrl);
      setDocuments((prev) => [doc, ...prev]);
      setNewDocName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar o documento");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDeleteDocument(id: string) {
    await hrApi.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? "Novo funcionário" : "Detalhes do funcionário"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                autoFocus
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Cargo</label>
                <input
                  value={values.position}
                  onChange={(e) => setValues((v) => ({ ...v, position: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Setor</label>
                <input
                  value={values.department}
                  onChange={(e) => setValues((v) => ({ ...v, department: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Empresa</label>
                <select
                  value={values.company}
                  onChange={(e) => setValues((v) => ({ ...v, company: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="GRAFINORTE">Grafinorte</option>
                  <option value="TRIBUNA">Tribuna PR</option>
                  <option value="PLUSPACK">PlusPack</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">CPF</label>
                <input
                  value={values.cpf}
                  onChange={(e) => setValues((v) => ({ ...v, cpf: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">RG</label>
                <input
                  value={values.rg}
                  onChange={(e) => setValues((v) => ({ ...v, rg: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nascimento</label>
                <input
                  type="date"
                  value={values.birthDate}
                  onChange={(e) => setValues((v) => ({ ...v, birthDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={values.email}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input
                  value={values.phone}
                  onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Endereço</label>
              <input
                value={values.address}
                onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Admissão</label>
                <input
                  type="date"
                  value={values.admissionDate}
                  onChange={(e) => setValues((v) => ({ ...v, admissionDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={values.status}
                  onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as EmployeeStatus }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  {Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Salário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.salary}
                  onChange={(e) => setValues((v) => ({ ...v, salary: Number(e.target.value) || 0 }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            {values.status === "DEMITIDO" && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Data de desligamento</label>
                <input
                  type="date"
                  value={values.terminationDate}
                  onChange={(e) => setValues((v) => ({ ...v, terminationDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Notas</label>
              <textarea
                value={values.notes}
                onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-brand-dark">{error}</p>}

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              {!isNew && onDelete ? (
                <Button type="button" variant="danger" onClick={onDelete}>
                  Excluir
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !values.name.trim() || !values.position.trim() || !values.department.trim()}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </form>

          {!isNew && (
            <>
              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Histórico salarial</h3>
                <div className="mb-3 grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Novo valor"
                    value={newRaiseAmount}
                    onChange={(e) => setNewRaiseAmount(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <input
                    type="date"
                    value={newRaiseDate}
                    onChange={(e) => setNewRaiseDate(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <input
                    placeholder="Motivo (opcional)"
                    value={newRaiseReason}
                    onChange={(e) => setNewRaiseReason(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <Button
                    type="button"
                    disabled={savingRaise || !newRaiseAmount || !newRaiseDate}
                    onClick={handleAddRaise}
                  >
                    Registrar
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {salaryChanges.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800">{formatCurrency(s.amount)}</span>
                      <span className="text-gray-500">{formatDate(s.effectiveDate)}</span>
                      <span className="text-xs text-gray-400">{s.reason ?? "—"}</span>
                    </div>
                  ))}
                  {salaryChanges.length === 0 && (
                    <p className="py-2 text-center text-sm text-gray-400">Nenhum reajuste registrado ainda.</p>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Férias</h3>
                <div className="mb-3 grid grid-cols-4 gap-2">
                  <input
                    type="date"
                    value={newVacStart}
                    onChange={(e) => setNewVacStart(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <input
                    type="date"
                    value={newVacEnd}
                    onChange={(e) => setNewVacEnd(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <select
                    value={newVacStatus}
                    onChange={(e) => setNewVacStatus(e.target.value as VacationStatus)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  >
                    {Object.entries(VACATION_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    disabled={savingVacation || !newVacStart || !newVacEnd}
                    onClick={handleAddVacation}
                  >
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {vacations.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="text-gray-700">
                        {formatDate(v.startDate)} a {formatDate(v.endDate)}
                      </span>
                      <span className="text-xs text-gray-500">{VACATION_STATUS_LABELS[v.status]}</span>
                      <button
                        onClick={() => handleDeleteVacation(v.id)}
                        className="text-xs text-brand-dark hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {vacations.length === 0 && (
                    <p className="py-2 text-center text-sm text-gray-400">Nenhuma férias registrada ainda.</p>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Documentos</h3>
                <div className="mb-3 flex gap-2">
                  <input
                    placeholder="Nome do documento (ex: RG, Contrato)"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    disabled={uploadingDoc || !newDocName.trim()}
                    onClick={handleUploadDocument}
                  >
                    Enviar
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-gray-800 hover:underline"
                      >
                        {d.name}
                      </a>
                      <span className="text-xs text-gray-400">{formatDate(d.uploadedAt)}</span>
                      <button
                        onClick={() => handleDeleteDocument(d.id)}
                        className="text-xs text-brand-dark hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <p className="py-2 text-center text-sm text-gray-400">Nenhum documento enviado ainda.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
