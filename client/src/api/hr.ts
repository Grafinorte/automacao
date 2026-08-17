import { api } from "./client";
import type {
  Employee,
  EmployeeDetail,
  EmployeeDocument,
  EmployeeStatus,
  SalaryChange,
  Vacation,
  VacationStatus,
  VacationWithEmployee,
} from "../types";

export interface EmployeeInput {
  name: string;
  cpf?: string | null;
  rg?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  position: string;
  department: string;
  company?: string;
  admissionDate: string;
  terminationDate?: string | null;
  status?: EmployeeStatus;
  salary: number;
  notes?: string | null;
}

export interface SalaryChangeInput {
  amount: number;
  effectiveDate: string;
  reason?: string | null;
}

export interface VacationInput {
  startDate: string;
  endDate: string;
  status?: VacationStatus;
  notes?: string | null;
}

export const hrApi = {
  listEmployees: (company?: string) =>
    api.get<Employee[]>(`/hr/employees${company ? `?company=${encodeURIComponent(company)}` : ""}`),
  getEmployee: (id: string) => api.get<EmployeeDetail>(`/hr/employees/${id}`),
  createEmployee: (data: EmployeeInput) => api.post<Employee>("/hr/employees", data),
  updateEmployee: (id: string, data: Partial<EmployeeInput>) =>
    api.patch<Employee>(`/hr/employees/${id}`, data),
  deleteEmployee: (id: string) => api.delete<void>(`/hr/employees/${id}`),

  listSalaryChanges: (employeeId: string) =>
    api.get<SalaryChange[]>(`/hr/employees/${employeeId}/salary-changes`),
  addSalaryChange: (employeeId: string, data: SalaryChangeInput) =>
    api.post<SalaryChange>(`/hr/employees/${employeeId}/salary-changes`, data),
  deleteSalaryChange: (id: string) => api.delete<void>(`/hr/salary-changes/${id}`),

  listAllVacations: () => api.get<VacationWithEmployee[]>("/hr/vacations"),
  listVacationsForEmployee: (employeeId: string) =>
    api.get<Vacation[]>(`/hr/employees/${employeeId}/vacations`),
  addVacation: (employeeId: string, data: VacationInput) =>
    api.post<Vacation>(`/hr/employees/${employeeId}/vacations`, data),
  updateVacation: (id: string, data: Partial<VacationInput>) =>
    api.patch<Vacation>(`/hr/vacations/${id}`, data),
  deleteVacation: (id: string) => api.delete<void>(`/hr/vacations/${id}`),

  listDocuments: (employeeId: string) =>
    api.get<EmployeeDocument[]>(`/hr/employees/${employeeId}/documents`),
  addDocument: (employeeId: string, name: string, fileDataUrl: string) =>
    api.post<EmployeeDocument>(`/hr/employees/${employeeId}/documents`, { name, fileDataUrl }),
  deleteDocument: (id: string) => api.delete<void>(`/hr/documents/${id}`),
};
