import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { ContentStatus, MarketingChannel } from "../../generated/prisma/client";

export const CONTENT_STATUSES: ContentStatus[] = [
  "IDEIA",
  "EM_PRODUCAO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "PUBLICADO",
];

const CONTENT_SELECT = {
  id: true,
  title: true,
  type: true,
  channel: true,
  status: true,
  scheduledDate: true,
  notes: true,
  order: true,
  createdAt: true,
  campaign: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export async function listBoard() {
  const items = await prisma.contentItem.findMany({
    select: CONTENT_SELECT,
    orderBy: { order: "asc" },
  });
  return CONTENT_STATUSES.map((status) => ({
    status,
    items: items.filter((item) => item.status === status),
  }));
}

export function getContentItem(id: string) {
  return prisma.contentItem.findUniqueOrThrow({
    where: { id },
    select: { ...CONTENT_SELECT, createdBy: { select: { id: true, name: true } } },
  });
}

export async function createContentItem(data: {
  title: string;
  type: string;
  channel: MarketingChannel;
  status?: ContentStatus;
  scheduledDate?: string | null;
  notes?: string | null;
  campaignId?: string | null;
  assigneeId?: string | null;
  createdById: string;
}) {
  const status = data.status ?? "IDEIA";
  const last = await prisma.contentItem.findFirst({
    where: { status },
    orderBy: { order: "desc" },
  });
  return prisma.contentItem.create({
    data: {
      title: data.title,
      type: data.type,
      channel: data.channel,
      status,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      notes: data.notes || null,
      campaignId: data.campaignId || null,
      assigneeId: data.assigneeId || null,
      createdById: data.createdById,
      order: (last?.order ?? -1) + 1,
    },
    select: CONTENT_SELECT,
  });
}

export function updateContentItem(
  id: string,
  data: {
    title?: string;
    type?: string;
    channel?: MarketingChannel;
    scheduledDate?: string | null;
    notes?: string | null;
    campaignId?: string | null;
    assigneeId?: string | null;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.channel !== undefined) updateData.channel = data.channel;
  if (data.scheduledDate !== undefined) {
    updateData.scheduledDate = data.scheduledDate ? new Date(data.scheduledDate) : null;
  }
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.campaignId !== undefined) updateData.campaignId = data.campaignId || null;
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId || null;

  return prisma.contentItem.update({ where: { id }, data: updateData, select: CONTENT_SELECT });
}

export async function deleteContentItem(id: string) {
  await prisma.contentItem.delete({ where: { id } });
}

export async function moveContentItem(itemId: string, toStatus: ContentStatus, toIndex: number) {
  const item = await prisma.contentItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw new HttpError(404, "Peça de conteúdo não encontrada");
  }

  const fromStatus = item.status;

  await prisma.$transaction(async (tx) => {
    if (fromStatus === toStatus) {
      const siblings = await tx.contentItem.findMany({
        where: { status: fromStatus, id: { not: itemId } },
        orderBy: { order: "asc" },
      });
      siblings.splice(toIndex, 0, item);
      await Promise.all(
        siblings.map((s, index) => tx.contentItem.update({ where: { id: s.id }, data: { order: index } }))
      );
    } else {
      const sourceSiblings = await tx.contentItem.findMany({
        where: { status: fromStatus, id: { not: itemId } },
        orderBy: { order: "asc" },
      });
      const destSiblings = await tx.contentItem.findMany({
        where: { status: toStatus },
        orderBy: { order: "asc" },
      });
      destSiblings.splice(toIndex, 0, item);

      await Promise.all([
        ...sourceSiblings.map((s, index) =>
          tx.contentItem.update({ where: { id: s.id }, data: { order: index } })
        ),
        ...destSiblings.map((s, index) =>
          tx.contentItem.update({
            where: { id: s.id },
            data: { order: index, ...(s.id === itemId ? { status: toStatus } : {}) },
          })
        ),
      ]);
    }
  });
}
