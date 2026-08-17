import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

const DEFAULT_STAGES = [
  { name: "Prospecção",             isClosed: false, isWon: false },
  { name: "Contato",                isClosed: false, isWon: false },
  { name: "Qualificação",           isClosed: false, isWon: false },
  { name: "Aguardando Orçamento",   isClosed: false, isWon: false },
  { name: "Orçamento Enviado",      isClosed: false, isWon: false },
  { name: "Lead Frio",              isClosed: false, isWon: false },
  { name: "Lead Quente",            isClosed: false, isWon: false },
  { name: "Fechado / Em Transporte",isClosed: false, isWon: false },
  { name: "Finalizado / Entregue",  isClosed: true,  isWon: true  },
  { name: "Perdido",                isClosed: true,  isWon: false },
];

export function listStages() {
  return prisma.crmStage.findMany({ orderBy: { order: "asc" } });
}

export async function createStage(name: string) {
  const last = await prisma.crmStage.findFirst({ orderBy: { order: "desc" } });
  return prisma.crmStage.create({
    data: { name, order: (last?.order ?? -1) + 1 },
  });
}

export function renameStage(id: string, name: string) {
  return prisma.crmStage.update({ where: { id }, data: { name } });
}

export async function reorderStages(orderedStageIds: string[]) {
  await prisma.$transaction(
    orderedStageIds.map((id, index) =>
      prisma.crmStage.update({ where: { id }, data: { order: index } })
    )
  );
}

export async function deleteStage(id: string) {
  const dealCount = await prisma.deal.count({ where: { stageId: id } });
  if (dealCount > 0) {
    throw new HttpError(
      400,
      "Não é possível excluir um estágio com negócios. Mova ou exclua os negócios primeiro."
    );
  }
  await prisma.crmStage.delete({ where: { id } });
}

export async function setupDefaultStages(): Promise<{ created: number; skipped: boolean }> {
  const count = await prisma.crmStage.count();
  if (count > 0) return { created: 0, skipped: true };
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const s = DEFAULT_STAGES[i];
    await prisma.crmStage.create({
      data: { name: s.name, order: i, isClosed: s.isClosed, isWon: s.isWon },
    });
  }
  return { created: DEFAULT_STAGES.length, skipped: false };
}
