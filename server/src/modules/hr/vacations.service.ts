import { prisma } from "../../db/prisma";
import type { VacationStatus } from "../../generated/prisma/client";

const VACATION_SELECT = {
  id: true,
  startDate: true,
  endDate: true,
  status: true,
  notes: true,
  createdAt: true,
  employee: { select: { id: true, name: true, department: true, company: true } },
} as const;

export function listVacations() {
  return prisma.vacation.findMany({
    select: VACATION_SELECT,
    orderBy: { startDate: "desc" },
  });
}

export function listVacationsForEmployee(employeeId: string) {
  return prisma.vacation.findMany({
    where: { employeeId },
    orderBy: { startDate: "desc" },
  });
}

export function createVacation(data: {
  employeeId: string;
  startDate: string;
  endDate: string;
  status?: VacationStatus;
  notes?: string | null;
}) {
  return prisma.vacation.create({
    data: {
      employeeId: data.employeeId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      status: data.status ?? "PLANEJADA",
      notes: data.notes || null,
    },
    select: VACATION_SELECT,
  });
}

export function updateVacation(
  id: string,
  data: { startDate?: string; endDate?: string; status?: VacationStatus; notes?: string | null }
) {
  const updateData: Record<string, unknown> = {};
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes || null;

  return prisma.vacation.update({ where: { id }, data: updateData, select: VACATION_SELECT });
}

export async function deleteVacation(id: string) {
  await prisma.vacation.delete({ where: { id } });
}
