import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

const DEAL_SELECT = {
  id: true,
  title: true,
  value: true,
  expectedCloseDate: true,
  notes: true,
  nextFollowUp: true,
  lossReason: true,
  company: true,
  order: true,
  stageId: true,
  createdAt: true,
  updatedAt: true,
  contact: { select: { id: true, name: true, company: true } },
  owner: { select: { id: true, name: true, avatarUrl: true } },
  quote: { select: { id: true, number: true } },
} as const;

export function listBoard(ownerId?: string) {
  return prisma.crmStage.findMany({
    orderBy: { order: "asc" },
    include: {
      deals: {
        where: ownerId ? { ownerId } : undefined,
        orderBy: { order: "asc" },
        select: DEAL_SELECT,
      },
    },
  });
}

export function getDeal(id: string) {
  return prisma.deal.findUniqueOrThrow({
    where: { id },
    select: {
      ...DEAL_SELECT,
      createdBy: { select: { id: true, name: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
}

export async function createDeal(data: {
  title: string;
  contactId: string;
  stageId: string;
  value?: number;
  expectedCloseDate?: string | null;
  notes?: string | null;
  nextFollowUp?: string | null;
  lossReason?: string | null;
  company?: string;
  ownerId: string;
  createdById: string;
}) {
  const last = await prisma.deal.findFirst({
    where: { stageId: data.stageId },
    orderBy: { order: "desc" },
  });
  return prisma.deal.create({
    data: {
      title: data.title,
      contactId: data.contactId,
      stageId: data.stageId,
      value: data.value ?? 0,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      notes: data.notes || null,
      nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
      lossReason: data.lossReason || null,
      company: data.company ?? "GRAFINORTE",
      ownerId: data.ownerId,
      createdById: data.createdById,
      order: (last?.order ?? -1) + 1,
    },
    select: DEAL_SELECT,
  });
}

export async function updateDeal(
  id: string,
  data: {
    title?: string;
    contactId?: string;
    value?: number;
    expectedCloseDate?: string | null;
    notes?: string | null;
    ownerId?: string;
    quoteId?: string | null;
    nextFollowUp?: string | null;
    lossReason?: string | null;
    company?: string;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.contactId !== undefined) updateData.contactId = data.contactId;
  if (data.value !== undefined) updateData.value = data.value;
  if (data.expectedCloseDate !== undefined) {
    updateData.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null;
  }
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
  if (data.quoteId !== undefined) updateData.quoteId = data.quoteId || null;
  if (data.nextFollowUp !== undefined) {
    updateData.nextFollowUp = data.nextFollowUp ? new Date(data.nextFollowUp) : null;
  }
  if (data.lossReason !== undefined) updateData.lossReason = data.lossReason || null;
  if (data.company !== undefined) updateData.company = data.company;

  return prisma.deal.update({ where: { id }, data: updateData, select: DEAL_SELECT });
}

export async function deleteDeal(id: string) {
  await prisma.deal.delete({ where: { id } });
}

export function listDealsForExport(ownerId?: string) {
  return prisma.deal.findMany({
    where: ownerId ? { ownerId } : undefined,
    orderBy: [{ stage: { order: "asc" } }, { order: "asc" }],
    select: {
      title: true,
      value: true,
      company: true,
      expectedCloseDate: true,
      nextFollowUp: true,
      lossReason: true,
      createdAt: true,
      stage: { select: { name: true } },
      contact: { select: { name: true, company: true, email: true, phone: true } },
      owner: { select: { name: true } },
    },
  });
}

export async function moveDeal(dealId: string, toStageId: string, toIndex: number) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    throw new HttpError(404, "Negócio não encontrado");
  }

  const fromStageId = deal.stageId;

  await prisma.$transaction(async (tx) => {
    if (fromStageId === toStageId) {
      const siblings = await tx.deal.findMany({
        where: { stageId: fromStageId, id: { not: dealId } },
        orderBy: { order: "asc" },
      });
      siblings.splice(toIndex, 0, deal);
      await Promise.all(
        siblings.map((d, index) => tx.deal.update({ where: { id: d.id }, data: { order: index } }))
      );
    } else {
      const sourceSiblings = await tx.deal.findMany({
        where: { stageId: fromStageId, id: { not: dealId } },
        orderBy: { order: "asc" },
      });
      const destSiblings = await tx.deal.findMany({
        where: { stageId: toStageId },
        orderBy: { order: "asc" },
      });
      destSiblings.splice(toIndex, 0, deal);

      await Promise.all([
        ...sourceSiblings.map((d, index) =>
          tx.deal.update({ where: { id: d.id }, data: { order: index } })
        ),
        ...destSiblings.map((d, index) =>
          tx.deal.update({
            where: { id: d.id },
            data: { order: index, ...(d.id === dealId ? { stageId: toStageId } : {}) },
          })
        ),
      ]);
    }
  });
}
