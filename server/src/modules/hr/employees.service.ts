import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { EmployeeStatus } from "../../generated/prisma/client";

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  cpf: true,
  rg: true,
  birthDate: true,
  email: true,
  phone: true,
  address: true,
  position: true,
  department: true,
  company: true,
  admissionDate: true,
  terminationDate: true,
  status: true,
  salary: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function listEmployees(company?: string) {
  return prisma.employee.findMany({
    where: company ? { company } : undefined,
    select: EMPLOYEE_SELECT,
    orderBy: { name: "asc" },
  });
}

export function getEmployee(id: string) {
  return prisma.employee.findUniqueOrThrow({
    where: { id },
    select: {
      ...EMPLOYEE_SELECT,
      salaryChanges: { orderBy: { effectiveDate: "desc" } },
      vacations: { orderBy: { startDate: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
}

export function createEmployee(data: {
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
  status?: EmployeeStatus;
  salary: number;
  notes?: string | null;
  createdById: string;
}) {
  return prisma.employee.create({
    data: {
      name: data.name,
      cpf: data.cpf || null,
      rg: data.rg || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      position: data.position,
      department: data.department,
      company: data.company ?? "GRAFINORTE",
      admissionDate: new Date(data.admissionDate),
      status: data.status ?? "ATIVO",
      salary: data.salary,
      notes: data.notes || null,
      createdById: data.createdById,
    },
    select: EMPLOYEE_SELECT,
  });
}

export function updateEmployee(
  id: string,
  data: {
    name?: string;
    cpf?: string | null;
    rg?: string | null;
    birthDate?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    position?: string;
    department?: string;
    company?: string;
    admissionDate?: string;
    terminationDate?: string | null;
    status?: EmployeeStatus;
    salary?: number;
    notes?: string | null;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.cpf !== undefined) updateData.cpf = data.cpf || null;
  if (data.rg !== undefined) updateData.rg = data.rg || null;
  if (data.birthDate !== undefined) {
    updateData.birthDate = data.birthDate ? new Date(data.birthDate) : null;
  }
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.address !== undefined) updateData.address = data.address || null;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.company !== undefined) updateData.company = data.company;
  if (data.admissionDate !== undefined) updateData.admissionDate = new Date(data.admissionDate);
  if (data.terminationDate !== undefined) {
    updateData.terminationDate = data.terminationDate ? new Date(data.terminationDate) : null;
  }
  if (data.status !== undefined) updateData.status = data.status;
  if (data.salary !== undefined) updateData.salary = data.salary;
  if (data.notes !== undefined) updateData.notes = data.notes || null;

  return prisma.employee.update({ where: { id }, data: updateData, select: EMPLOYEE_SELECT });
}

export async function deleteEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    throw new HttpError(404, "Funcionário não encontrado");
  }
  await prisma.employee.delete({ where: { id } });
}
