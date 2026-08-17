import { prisma } from "../../db/prisma";

export function listSalaryChanges(employeeId: string) {
  return prisma.salaryChange.findMany({
    where: { employeeId },
    orderBy: { effectiveDate: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}

export async function createSalaryChange(data: {
  employeeId: string;
  amount: number;
  effectiveDate: string;
  reason?: string | null;
  createdById: string;
}) {
  const [salaryChange] = await prisma.$transaction([
    prisma.salaryChange.create({
      data: {
        employeeId: data.employeeId,
        amount: data.amount,
        effectiveDate: new Date(data.effectiveDate),
        reason: data.reason || null,
        createdById: data.createdById,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.employee.update({
      where: { id: data.employeeId },
      data: { salary: data.amount },
    }),
  ]);
  return salaryChange;
}

export async function deleteSalaryChange(id: string) {
  await prisma.salaryChange.delete({ where: { id } });
}
